// ═══════════════════════════════════════
//  CEX TRADE FEED — Binance + OKX
//  MON-USDT 실시간 체결 WebSocket
//  MON_ALERT_BIG(100K) 이상 거래만 알림
// ═══════════════════════════════════════

var _binanceWs  = null;
var _okxWs      = null;

function initCexFeed(){
  _connectBinance();
  _connectOkx();
}

// ── Binance ─────────────────────────────
function _connectBinance(){
  try{
    _binanceWs = new WebSocket('wss://stream.binance.com:9443/ws/monusdt@trade');

    _binanceWs.onopen = () => console.log('[CEX] Binance 연결됨');

    _binanceWs.onmessage = e => {
      try{
        const msg = JSON.parse(e.data);
        if(msg.e !== 'trade') return;
        const price     = parseFloat(msg.p);
        const monAmount = parseFloat(msg.q);       // MON 수량
        const usdValue  = price * monAmount;
        const isBuy     = !msg.m;                  // m=true: maker=seller → SELL
        if(monAmount < MON_ALERT_BIG) return;
        _handleCexTrade('Binance', isBuy, price, monAmount, usdValue);
      }catch(err){}
    };

    _binanceWs.onclose = () => {
      console.log('[CEX] Binance 재연결 5s...');
      setTimeout(_connectBinance, 5000);
    };
    _binanceWs.onerror = () => {};
  }catch(e){ setTimeout(_connectBinance, 10000); }
}

// ── OKX ─────────────────────────────────
function _connectOkx(){
  try{
    _okxWs = new WebSocket('wss://ws.okx.com/ws/v5/public');

    _okxWs.onopen = () => {
      console.log('[CEX] OKX 연결됨');
      _okxWs.send(JSON.stringify({
        op: 'subscribe',
        args: [{ channel: 'trades', instId: 'MON-USDT' }]
      }));
    };

    _okxWs.onmessage = e => {
      try{
        const msg = JSON.parse(e.data);
        if(!msg.data || !Array.isArray(msg.data)) return;
        msg.data.forEach(trade => {
          const price     = parseFloat(trade.px);
          const monAmount = parseFloat(trade.sz);  // MON 수량
          const usdValue  = price * monAmount;
          const isBuy     = trade.side === 'buy';
          if(monAmount < MON_ALERT_BIG) return;
          _handleCexTrade('OKX', isBuy, price, monAmount, usdValue);
        });
      }catch(err){}
    };

    _okxWs.onclose = () => {
      console.log('[CEX] OKX 재연결 5s...');
      setTimeout(_connectOkx, 5000);
    };
    _okxWs.onerror = () => {};
  }catch(e){ setTimeout(_connectOkx, 10000); }
}

// ── 공통 핸들러 ──────────────────────────
function _handleCexTrade(exchange, isBuy, price, monAmount, usdValue){
  // 라이브 가격 업데이트 (DEX 가격과 1% 이상 차이날 때만 덮어씀)
  if(price > 0){
    const diff = livePrice > 0 ? Math.abs(price - livePrice) / livePrice : 1;
    if(diff > 0.01 || livePrice === 0){
      livePrice      = price;
      cachedMonPrice = price;
      updatePriceDisplay(price);
    }
    // 차트 데이터 추가
    if(typeof trades !== 'undefined'){
      trades.push({ time: Math.floor(Date.now()/1000), price, mcap: 0, usd: usdValue, isBuy, mon: monAmount });
      if(trades.length > MAX_TRADES) trades.shift();
      if(typeof drawChart === 'function') drawChart();
    }
  }

  // 플로팅 알림 (exchange 태그 포함)
  showTradeFloat(isBuy, usdValue, monAmount, exchange);

  // 채팅 메시지
  if(typeof renderMsg === 'function'){
    const side  = isBuy ? 'buy' : 'sell';
    const label = isBuy ? '🟢 BUY' : '🔴 SELL';
    renderMsg({
      type   : 'trade',
      side,
      addr   : exchange,
      addrFull: '',
      txHash : '',
      bal    : 0,
      amount : monAmount,
      price,
      mon    : monAmount,
      usd    : usdValue,
      time   : typeof nowTime === 'function' ? nowTime() : '',
      source : exchange
    });
  }
}
