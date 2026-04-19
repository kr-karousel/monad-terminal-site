// Local progress storage for Monad Climb.
// Keyed by `monad-climb:v1` to make it easy to bump schema later.

const STORAGE_KEY = 'monad-climb:v1';

const DEFAULT_RECORD = {
  username: '',
  bestSector: 0,
  sectors: {},   // sectorNum -> { firstReachedAt, lastReachedAt, count }
  totalRuns: 0,
  totalFalls: 0,
  createdAt: null,
};

function loadRecord() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_RECORD, createdAt: Date.now() };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_RECORD, ...parsed, sectors: parsed.sectors || {} };
  } catch (e) {
    return { ...DEFAULT_RECORD, createdAt: Date.now() };
  }
}

function saveRecord(rec) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
  } catch (e) { /* quota, private mode — silently ignore */ }
}

function setUsername(name) {
  const rec = loadRecord();
  rec.username = (name || '').trim().slice(0, 18) || 'anon';
  saveRecord(rec);
  return rec;
}

function markSectorReached(sectorNum) {
  const rec = loadRecord();
  const now = Date.now();
  const s = rec.sectors[sectorNum] || { firstReachedAt: now, count: 0 };
  s.lastReachedAt = now;
  s.count += 1;
  rec.sectors[sectorNum] = s;
  if (sectorNum > rec.bestSector) rec.bestSector = sectorNum;
  saveRecord(rec);
  return rec;
}

function incrementRuns() {
  const rec = loadRecord();
  rec.totalRuns += 1;
  saveRecord(rec);
  return rec;
}

function incrementFalls() {
  const rec = loadRecord();
  rec.totalFalls += 1;
  saveRecord(rec);
  return rec;
}

function resetRecord() {
  localStorage.removeItem(STORAGE_KEY);
}

window.MonadStorage = {
  loadRecord,
  saveRecord,
  setUsername,
  markSectorReached,
  incrementRuns,
  incrementFalls,
  resetRecord,
};
