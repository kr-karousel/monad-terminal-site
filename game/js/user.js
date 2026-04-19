// Profile page: renders the stored climb record.

(function () {
  const Storage = window.MonadStorage;
  const { TOTAL_SECTORS } = window.MonadLevel;

  const $ = (id) => document.getElementById(id);

  function fmtDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function render() {
    const rec = Storage.loadRecord();

    $('p-name').textContent    = rec.username || 'anon';
    $('p-best').textContent    = rec.bestSector;
    $('p-total').textContent   = TOTAL_SECTORS;
    $('p-cleared').textContent = Object.keys(rec.sectors).length;
    $('p-runs').textContent    = rec.totalRuns || 0;
    $('p-falls').textContent   = rec.totalFalls || 0;
    $('p-since').textContent   = fmtDate(rec.createdAt);

    const grid = $('sector-grid');
    grid.innerHTML = '';
    for (let s = 1; s <= TOTAL_SECTORS; s++) {
      const hit = rec.sectors[s];
      const cell = document.createElement('div');
      cell.className = 'sector-cell ' + (hit ? 'hit' : 'miss');
      cell.innerHTML = `
        <span class="sn">${hit ? '🚩' : '·'} ${s}</span>
        <span class="time">${hit ? fmtDate(hit.firstReachedAt) : 'locked'}</span>
      `;
      grid.appendChild(cell);
    }

    $('rename-input').value = '';
    $('rename-input').placeholder = rec.username || 'new name';
  }

  $('btn-rename').addEventListener('click', () => {
    const v = $('rename-input').value.trim();
    if (!v) return;
    Storage.setUsername(v);
    render();
  });
  $('rename-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('btn-rename').click();
  });

  $('btn-wipe').addEventListener('click', () => {
    if (confirm('Reset your climb record? This cannot be undone.')) {
      Storage.resetRecord();
      render();
    }
  });

  render();
})();
