const USERS_KEY = 'stock_users';
const ACTIVE_KEY = 'stock_active_user';
const WATCHLIST_PREFIX = 'stock_watchlist_';

function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; }
  catch { return []; }
}

function getWatchlist(userId) {
  try { return JSON.parse(localStorage.getItem(WATCHLIST_PREFIX + userId)) || []; }
  catch { return []; }
}

function collectExportData(scope) {
  const users = getUsers();
  let activeUser = null;
  try { activeUser = JSON.parse(localStorage.getItem(ACTIVE_KEY)); } catch {}

  const targetUsers = scope === 'current' && activeUser
    ? users.filter(u => u.id === activeUser.id)
    : users;

  const watchlists = {};
  targetUsers.forEach(u => {
    watchlists[u.id] = getWatchlist(u.id);
  });

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    scope,
    activeUserId: activeUser ? activeUser.id : null,
    users: targetUsers,
    watchlists,
  };
}

function toCSV(data) {
  const rows = [['用户名', '股票代码', '股票名称', '市场']];
  data.users.forEach(u => {
    (data.watchlists[u.id] || []).forEach(s => {
      rows.push([u.name, s.code, s.name, s.market]);
    });
  });
  return '\uFEFF' + rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

async function saveFile(content, suggestedName, accept) {
  const blob = typeof content === 'string' ? new Blob([content], { type: 'application/octet-stream' }) : content;
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [{ description: '股票数据', accept }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (e) {
    if (e.name === 'AbortError') return false;
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = suggestedName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (_) {}
    return true;
  }
}

let exporting = false;

export async function exportJSON(scope) {
  if (exporting) return;
  exporting = true;
  try {
    const data = collectExportData(scope);
    return await saveFile(JSON.stringify(data, null, 2), '用户股票数据.json', { 'application/json': ['.json'] });
  } finally {
    exporting = false;
  }
}

export async function exportCSV(scope) {
  if (exporting) return;
  exporting = true;
  try {
    const data = collectExportData(scope);
    return await saveFile(toCSV(data), '用户股票数据.csv', { 'text/csv': ['.csv'] });
  } finally {
    exporting = false;
  }
}

export function importData() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.csv';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) { resolve(false); return; }
      try {
        const text = await file.text();
        if (file.name.endsWith('.json')) {
          importJSON(text);
        } else if (file.name.endsWith('.csv')) {
          importCSV(text);
        }
        resolve(true);
      } catch (e) {
        alert('导入失败: ' + e.message);
        resolve(false);
      }
    };
    input.click();
  });
}

function importJSON(text) {
  const data = JSON.parse(text);
  if (!data.users || !data.watchlists) throw new Error('无效的数据格式');

  const existingUsers = getUsers();
  const nameIndex = {};
  existingUsers.forEach(u => { nameIndex[u.name] = u; });

  const mergedUsers = [...existingUsers];
  const processedNames = new Set();

  data.users.forEach(importedUser => {
    const existing = nameIndex[importedUser.name];
    const userId = existing ? existing.id : importedUser.id;

    if (!existing) {
      mergedUsers.push({ id: importedUser.id, name: importedUser.name, createdAt: importedUser.createdAt });
    }

    const importedStocks = data.watchlists[importedUser.id] || [];
    const existingStocks = existing ? getWatchlist(userId) : [];
    const seen = new Set();
    const mergedStocks = [];

    existingStocks.forEach(s => {
      const key = s.code + '|' + s.market;
      if (!seen.has(key)) { seen.add(key); mergedStocks.push(s); }
    });
    importedStocks.forEach(s => {
      const key = s.code + '|' + s.market;
      if (!seen.has(key)) { seen.add(key); mergedStocks.push(s); }
    });

    localStorage.setItem(WATCHLIST_PREFIX + userId, JSON.stringify(mergedStocks));
    processedNames.add(importedUser.name);
  });

  localStorage.setItem(USERS_KEY, JSON.stringify(mergedUsers));

  if (data.activeUserId) {
    const match = mergedUsers.find(u => u.id === data.activeUserId || (nameIndex[u.name] && nameIndex[u.name].id === data.activeUserId));
    if (match) {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(match));
    }
  }
}

function importCSV(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split('\n');
  if (lines.length < 2) return;

  const groupByUser = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = parseCSVLine(line);
    if (parts.length < 2) continue;
    const [userName, code, name, market] = parts;
    if (!groupByUser[userName]) groupByUser[userName] = [];
    groupByUser[userName].push({ code: code || '', name: name || '', market: market || '' });
  }

  const existingUsers = getUsers();
  const nameIndex = {};
  existingUsers.forEach(u => { nameIndex[u.name] = u; });
  const mergedUsers = [...existingUsers];

  Object.entries(groupByUser).forEach(([userName, stocks]) => {
    const existing = nameIndex[userName];
    const userId = existing ? existing.id : (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    if (!existing) {
      mergedUsers.push({ id: userId, name: userName, createdAt: Date.now() });
    }
    const existingStocks = existing ? getWatchlist(userId) : [];
    const seen = new Set();
    const mergedStocks = [];
    existingStocks.forEach(s => {
      const key = s.code + '|' + s.market;
      if (!seen.has(key)) { seen.add(key); mergedStocks.push(s); }
    });
    stocks.forEach(s => {
      const key = s.code + '|' + s.market;
      if (!seen.has(key)) { seen.add(key); mergedStocks.push(s); }
    });
    localStorage.setItem(WATCHLIST_PREFIX + userId, JSON.stringify(mergedStocks));
  });

  localStorage.setItem(USERS_KEY, JSON.stringify(mergedUsers));
}

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { result.push(cur); cur = ''; }
      else cur += c;
    }
  }
  result.push(cur);
  return result;
}

let dataMenuInitialized = false;

export function initDataMenu() {
  if (dataMenuInitialized) return;
  dataMenuInitialized = true;

  const btn = document.getElementById('data-btn');
  const dd = document.getElementById('data-dropdown');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dd.classList.toggle('show');
  });

  document.addEventListener('click', () => dd.classList.remove('show'));

  dd.addEventListener('click', async (e) => {
    const item = e.target.closest('.dropdown-item');
    if (!item) return;
    const action = item.dataset.action;
    dd.classList.remove('show');

    if (action === 'import') {
      const ok = await importData();
      if (ok) location.reload();
      return;
    }

    const scope = action.endsWith('-all') ? 'all' : 'current';
    if (action.startsWith('export-json')) {
      await exportJSON(scope);
    } else if (action.startsWith('export-csv')) {
      await exportCSV(scope);
    }
  });
}
