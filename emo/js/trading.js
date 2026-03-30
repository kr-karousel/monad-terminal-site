function openKuru(side){
  openSwapModal(side||'buy');
}

function openSwapModal(side){
  const modal = document.getElementById('swapModal');
  if(!modal) return;
  switchSwapSide(side||'buy');
  modal.classList.add('open');
  swapUpdateBalances();
}

function closeSwapModal(){
  const modal = document.getElementById('swapModal');
  if(modal) modal.classList.remove('open');
  clearTimeout(swapQuoteTimer);
}

function switchSwapSide(side){
  currentSwapSide = side;
  const isBuy = side === 'buy';

  // Tab buttons
  document.getElementById('swapBuyBtn')?.classList.toggle('active', isBuy);
  document.getElementById('swapSellBtn')?.classList.toggle('active', !isBuy);

  // Title
  const titleEl = document.getElementById('swapModalTitle');
  if(titleEl){
    titleEl.textContent = isBuy ? '▲ BUY EMO' : '▼ SELL EMO';
    titleEl.style.color = isBuy ? 'var(--green)' : 'var(--red)';
  }

  // From/To labels & icons
  document.getElementById('swapFromLabel').textContent = isBuy ? 'You Pay (MON)' : 'You Pay (EMO)';
  document.getElementById('swapToLabel').textContent   = isBuy ? 'You Receive (EMO)' : 'You Receive (MON)';
  document.getElementById('swapFromName').textContent  = isBuy ? 'MON' : 'EMO';
  document.getElementById('swapToName').textContent    = isBuy ? 'EMO' : 'MON';

  // Icons - SVG 인라인 방식
  const isBuyMode = side === 'buy';
  // FROM: BUY=MON, SELL=CHOG
  document.getElementById('svgMonFrom').style.display  = isBuyMode ? 'block' : 'none';
  document.getElementById('svgChogFrom').style.display = isBuyMode ? 'none'  : 'block';
  // TO: BUY=CHOG, SELL=MON
  document.getElementById('svgChogTo').style.display   = isBuyMode ? 'block' : 'none';
  document.getElementById('svgMonTo').style.display    = isBuyMode ? 'none'  : 'block';

  // Execute button
  const execBtn = document.getElementById('btnSwapExec');
  if(execBtn){
    execBtn.textContent = isBuy ? '▲ BUY EMO' : '▼ SELL EMO';
    execBtn.className = 'btn-swap-exec ' + (isBuy ? 'buy' : 'sell');
  }

  // Reset
  const amtIn = document.getElementById('swapAmtIn');
  if(amtIn) amtIn.value = '';
  const amtOut = document.getElementById('swapAmtOut');
  if(amtOut) amtOut.value = '';
  document.getElementById('swapPriceVal').textContent = '—';
  document.getElementById('swapStatusMsg').textContent = '';
  document.getElementById('swapStatusMsg').className = 'swap-status';

  swapUpdateBalances();
}

function setSlippage(val){
  swapSlippage = val;
  document.querySelectorAll('.slip-btn').forEach(b => b.classList.remove('active'));
  const id = val===10?'slip10': val===20?'slip20':'slip30';
  const el = document.getElementById(id);
  if(el) el.classList.add('active');
  swapCalcOut();
}

function swapUpdateBalances(){
  const fromEl = document.getElementById('swapFromBal');
  const toEl   = document.getElementById('swapToBal');
  if(!wallet){ 
    if(fromEl) fromEl.textContent = 'Balance: —';
    if(toEl)   toEl.textContent   = 'Balance: —';
    return;
  }
  const isBuy = currentSwapSide === 'buy';
  if(fromEl) fromEl.textContent = isBuy
    ? `Balance: ${(wallet.monBal||0).toFixed(4)} MON`
    : `Balance: ${(wallet.bal||0).toLocaleString()} EMO`;
  if(toEl) toEl.textContent = isBuy
    ? `Balance: ${(wallet.bal||0).toLocaleString()} EMO`
    : `Balance: ${(wallet.monBal||0).toFixed(4)} MON`;
}

async function swapGetMonBalance(){
  if(!wallet) return;
  try{
    const hex = await window.ethereum.request({method:'eth_getBalance',params:[wallet.addr,'latest']});
    wallet.monBal = parseInt(hex,16)/1e18;
  }catch(e){}
}

function swapCalcOut(){
  clearTimeout(swapQuoteTimer);
  const amtIn = parseFloat(document.getElementById('swapAmtIn')?.value)||0;
  if(amtIn <= 0){
    document.getElementById('swapAmtOut').value = '';
    document.getElementById('swapPriceVal').textContent = '—';
    return;
  }
  // 300ms 디바운스 후 LENS 조회
  swapQuoteTimer = setTimeout(()=> swapCalcOutLens(amtIn), 300);
}

async function swapCalcOutLens(amtIn){
  const isBuy = currentSwapSide === 'buy';
  const amtInWei = BigInt(Math.floor(amtIn * 1e18));

  try{
    // LENS: getAmountOut(address token, uint256 amountIn, bool isBuy)
    // selector: keccak256("getAmountOut(address,uint256,bool)") → 0x4aa4a4fc
    const tokenPadded  = CHOG_CONTRACT.slice(2).padStart(64,'0');
    const amtInPadded  = amtInWei.toString(16).padStart(64,'0');
    const isBuyPadded  = (isBuy ? 1 : 0).toString().padStart(64,'0');
    const callData = '0x4aa4a4fc' + tokenPadded + amtInPadded + isBuyPadded;

    const result = await rpcCallAny('eth_call',[{to: NADFUN_LENS, data: callData},'latest']);

    if(result && result !== '0x' && result.length >= 66){
      const outWei = BigInt('0x' + result.slice(2,66));
      const outAmt = Number(outWei) / 1e18;
      const outAfterSlip = outAmt * (1 - swapSlippage/100);

      document.getElementById('swapAmtOut').value = isBuy
        ? Math.floor(outAfterSlip).toLocaleString()
        : outAfterSlip.toFixed(6);

      // 환율 표시
      if(isBuy){
        const rate = outAmt / amtIn;
        document.getElementById('swapPriceVal').textContent = `1 MON ≈ ${rate.toLocaleString(undefined,{maximumFractionDigits:0})} EMO`;
      } else {
        const rate = outAmt / amtIn;
        document.getElementById('swapPriceVal').textContent = `1 EMO ≈ ${rate.toFixed(6)} MON`;
      }
      return;
    }
  } catch(e){
    console.warn('LENS getAmountOut failed:', e.message);
  }

  // LENS 실패 시 가격 기반 폴백
  const price  = livePrice || 0.000731;
  const monUsd = cachedMonPrice || 2.8;
  let out;
  if(isBuy){
    out = (amtIn * monUsd) / price;
    document.getElementById('swapPriceVal').textContent =
      `1 MON ≈ ${(monUsd/price).toLocaleString(undefined,{maximumFractionDigits:0})} EMO (est.)`;
  } else {
    out = (amtIn * price) / monUsd;
    document.getElementById('swapPriceVal').textContent =
      `1 EMO ≈ ${(price/monUsd).toFixed(6)} MON (est.)`;
  }
  const outAfterSlip = out * (1 - swapSlippage/100);
  document.getElementById('swapAmtOut').value = isBuy
    ? Math.floor(outAfterSlip).toLocaleString()
    : outAfterSlip.toFixed(6);
}

function swapSetMax(){
  if(!wallet) return;
  const isBuy = currentSwapSide === 'buy';
  const inp = document.getElementById('swapAmtIn');
  if(isBuy){
    const monBal = wallet.monBal || 0;
    inp.value = Math.max(0, monBal - 0.01).toFixed(4); // gas 여유
  } else {
    inp.value = wallet.bal || 0;
  }
  swapCalcOut();
}

// ──────────────────────────────────────────────────────
// 실제 스왑 실행 (nad.fun 라우터 직접 호출)
// nad.fun은 Uniswap V2 호환 swapExactETHForTokens / swapExactTokensForETH
// ──────────────────────────────────────────────────────
async function execNativeSwap(){
  const amtIn = parseFloat(document.getElementById('swapAmtIn')?.value)||0;
  if(amtIn <= 0){ swapSetStatus('Please enter an amount.','err'); return; }

  const provider = window.ethereum;
  if(!provider || !wallet){ swapSetStatus('Please connect your wallet.','err'); return; }

  // ── 체인 확인 및 전환 ──────────────────────────────
  try{
    const currentChain = await provider.request({method:'eth_chainId'});
    if(currentChain.toLowerCase() !== MONAD_CHAIN_ID.toLowerCase()){
      swapSetStatus('🔄 Switching to Monad network...','');
      try{
        await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:MONAD_CHAIN_ID}]});
      } catch(sw){
        if(sw.code===4902||sw.code===-32603){
          await provider.request({method:'wallet_addEthereumChain',params:[{
            chainId:MONAD_CHAIN_ID,
            chainName:'Monad',
            nativeCurrency:{name:'MON',symbol:'MON',decimals:18},
            rpcUrls:['https://rpc.monad.xyz'],
            blockExplorerUrls:['https://explorer.monad.xyz']
          }]});
        } else if(sw.code===4001){
          swapSetStatus('❌ Network switch cancelled.','err'); return;
        } else {
          swapSetStatus('❌ Failed to switch to Monad.','err'); return;
        }
      }
      const confirmedChain = await provider.request({method:'eth_chainId'});
      if(confirmedChain.toLowerCase() !== MONAD_CHAIN_ID.toLowerCase()){
        swapSetStatus('❌ Please switch to Monad network in your wallet.','err'); return;
      }
    }
  } catch(chainErr){ console.warn('chain check:', chainErr.message); }

  const execBtn = document.getElementById('btnSwapExec');
  if(execBtn){ execBtn.disabled = true; execBtn.textContent = 'Processing...'; }

  try{
    const isBuy = currentSwapSide === 'buy';
    const deadline = BigInt(Math.floor(Date.now()/1000) + 1200);

    // ── ABI 인코딩 헬퍼 ──────────────────────────────
    // struct는 tuple로 인코딩: 함수 selector(4) + tuple 오프셋(32) + 필드들
    function encodeUint256(val){
      return BigInt(val).toString(16).padStart(64,'0');
    }
    function encodeAddress(addr){
      return addr.slice(2).toLowerCase().padStart(64,'0');
    }

    if(isBuy){
      // ── BUY: MON(native) → EMO ──────────────────
      // function buy((uint256 amountOutMin, address token, address to, uint256 deadline)) payable
      // selector = keccak256("buy((uint256,address,address,uint256))") 앞 4바이트
      // 실제 Capricorn Router buy selector: 0x6df9e92b
      swapSetStatus('Sending BUY transaction...','');

      const amtOutMin = parseFloat(document.getElementById('swapAmtOut')?.value?.replace(/,/g,'')||'0')||0;
      // slippage 적용 (0.5% 추가 여유)
      const amtOutMinWei = BigInt(Math.floor(amtOutMin * 0.90 * 1e18));
      const monWei = BigInt(Math.floor(amtIn * 1e18));

      // struct tuple ABI 인코딩:
      // - tuple 자체가 인라인(not dynamic) → 오프셋 없이 바로 필드 나열
      // buy((uint256,address,address,uint256))
      // 0x00: amountOutMin (uint256)
      // 0x20: token (address → uint256로 패딩)
      // 0x40: to (address)
      // 0x60: deadline (uint256)
      const data = '0x6df9e92b'
        + encodeUint256(amtOutMinWei)          // amountOutMin
        + encodeAddress(CHOG_CONTRACT)          // token
        + encodeAddress(wallet.addr)            // to
        + encodeUint256(deadline);              // deadline

      console.log('BUY data:', data);
      console.log('value:', '0x'+monWei.toString(16));

      const txHash = await provider.request({method:'eth_sendTransaction', params:[{
        from:  wallet.addr,
        to:    NADFUN_ROUTER,
        value: '0x'+monWei.toString(16),
        data,
        gas:   '0x' + (350000).toString(16)
      }]});

      swapSetStatus(`✅ BUY sent! TX: ${txHash.slice(0,14)}...`, 'ok');
      console.log('BUY TX:', txHash);

    } else {
      // ── SELL: EMO → MON(native) ─────────────────
      // function sell((uint256 amountIn, uint256 amountOutMin, address token, address to, uint256 deadline))
      // selector: 0x5de3085d
      const amtInWei  = BigInt(Math.floor(amtIn * 1e18));
      const amtOutMin = parseFloat(document.getElementById('swapAmtOut')?.value?.replace(/,/g,'')||'0')||0;
      const amtOutMinWei = BigInt(Math.floor(amtOutMin * 0.90 * 1e18));

      // Step 1: EMO approve → Router
      swapSetStatus('Step 1/2: Approving EMO...','');
      const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
      const approveData = '0x095ea7b3'
        + encodeAddress(NADFUN_ROUTER)
        + encodeUint256(maxUint256);

      const approveTx = await provider.request({method:'eth_sendTransaction', params:[{
        from: wallet.addr,
        to:   CHOG_CONTRACT,
        data: approveData,
        gas:  '0x' + (80000).toString(16)
      }]});
      console.log('Approve TX:', approveTx);

      // approve 컨펌 대기 (2초)
      swapSetStatus('Step 2/2: Sending SELL...','');
      await new Promise(r => setTimeout(r, 2000));

      // sell((uint256,uint256,address,address,uint256))
      // 0x00: amountIn
      // 0x20: amountOutMin
      // 0x40: token
      // 0x60: to
      // 0x80: deadline
      const data = '0x5de3085d'
        + encodeUint256(amtInWei)              // amountIn
        + encodeUint256(amtOutMinWei)          // amountOutMin
        + encodeAddress(CHOG_CONTRACT)          // token
        + encodeAddress(wallet.addr)            // to
        + encodeUint256(deadline);              // deadline

      console.log('SELL data:', data);

      const txHash = await provider.request({method:'eth_sendTransaction', params:[{
        from: wallet.addr,
        to:   NADFUN_ROUTER,
        data,
        gas:  '0x' + (350000).toString(16)
      }]});

      swapSetStatus(`✅ SELL sent! TX: ${txHash.slice(0,14)}...`, 'ok');
      console.log('SELL TX:', txHash);
    }

    // 잔고 갱신
    setTimeout(async ()=>{
      await swapGetMonBalance();
      swapUpdateBalances();
      // EMO 잔고도 갱신
      const padded = wallet.addr.slice(2).padStart(64,'0');
      const balHex = await rpcCallAny('eth_call',[{to:CHOG_CONTRACT, data:'0x70a08231'+padded},'latest']);
      if(balHex && balHex !== '0x'){
        wallet.bal = Math.floor(Number(BigInt('0x'+(balHex.replace('0x','')||'0'))/BigInt('1000000000000000'))/1000);
        updateWalletDisplay();
      }
    }, 3000);

  } catch(e){
    console.error('swap error:', e);
    if(e.code===4001){
      swapSetStatus('❌ Transaction cancelled.','err');
    } else if(e.message?.includes('execution reverted')){
      swapSetStatus('❌ Reverted — check slippage or try Nad.fun directly.','err');
    } else {
      swapSetStatus(`❌ Error: ${e.message?.slice(0,60)||'Unknown error'}`, 'err');
    }
  } finally {
    if(execBtn){
      execBtn.disabled = false;
      execBtn.textContent = currentSwapSide==='buy' ? '▲ BUY EMO' : '▼ SELL EMO';
    }
  }
}

function swapSetStatus(msg, type){
  const el = document.getElementById('swapStatusMsg');
  if(!el) return;
  el.textContent = msg;
  el.className = 'swap-status' + (type ? ' '+type : '');
}

// ── HOLDER MODAL ─────────────────────────────────────
var holderCurrentTab = 'holders';
var holderCache = null;
var holderCacheTime = 0;

