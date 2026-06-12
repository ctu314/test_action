import { StockSDK } from 'stock-sdk';

const sdk = new StockSDK();

let container = null;
let onStockSelect = null;
let renderTimer = null;
let dragEl = null;

function storageKey() {
  let id = 'default';
  try {
    const u = JSON.parse(localStorage.getItem('stock_active_user'));
    if (u && u.id) id = u.id;
  } catch {}
  return 'stock_watchlist_' + id;
}

export function initWatchlist(onSelect) {
  container = document.getElementById('watchlist');
  onStockSelect = onSelect;

  container.addEventListener('click', (e) => {
    const item = e.target.closest('.watchlist-item');
    if (!item) return;
    if (e.target.closest('.remove-btn')) {
      const code = item.dataset.code;
      removeStock(code);
      return;
    }
    if (e.target.closest('.drag-handle')) return;
    const code = item.dataset.code;
    const stock = getWatchlist().find(s => s.code === code);
    if (stock) onStockSelect(stock);
  });

  refresh();
  setInterval(refresh, 30000);
}

export function refresh() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(doRender, 50);
}

export function getWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(storageKey())) || [];
  } catch {
    return [];
  }
}

export function addStock(stock) {
  const list = getWatchlist();
  if (list.some(s => s.code === stock.code)) return false;
  list.push({ code: stock.code, market: stock.market, name: stock.name });
  saveWatchlist(list);
  refresh();
  return true;
}

export function removeStock(code) {
  const list = getWatchlist().filter(s => s.code !== code);
  saveWatchlist(list);
  refresh();
  return list;
}

function saveWatchlist(list) {
  localStorage.setItem(storageKey(), JSON.stringify(list));
}

async function doRender() {
  const list = getWatchlist();
  document.getElementById('stock-count').textContent = list.length;

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-hint">搜索并添加自选股</div>';
    return;
  }

  let quotes = [];
  try {
    const aCodes = list.filter(s => s.market === 'sh' || s.market === 'sz').map(s => s.code);
    const usCodes = list.filter(s => s.market === 'us').map(s => s.code);
    const hkCodes = list.filter(s => s.market === 'hk').map(s => s.code);

    const results = await Promise.allSettled([
      aCodes.length ? sdk.getSimpleQuotes(aCodes) : [],
      usCodes.length ? sdk.getUSQuotes(usCodes.map(toUSTicker)) : [],
      hkCodes.length ? sdk.getHKQuotes(hkCodes) : [],
    ]);

    if (results[0].status === 'fulfilled') quotes = quotes.concat(results[0].value);
    if (results[1].status === 'fulfilled') quotes = quotes.concat(results[1].value);
    if (results[2].status === 'fulfilled') quotes = quotes.concat(results[2].value);
  } catch (e) {
  }

  container.innerHTML = list.map((s, i) => {
    const q = quotes.find(q => s.market === 'us'
      ? normalizeUSCode(s.code) === q.code
      : q.code === s.code);
    const price = q && q.price != null ? q.price : null;
    const change = q && q.changePercent != null ? q.changePercent : null;
    const changeCls = change !== null ? (change >= 0 ? 'up' : 'down') : '';
    const arrow = change !== null ? (change >= 0 ? '▲' : '▼') : '';
    return `<div class="watchlist-item" draggable="true" data-code="${s.code}" data-index="${i}">
      <div class="watchlist-info">
        <span class="watchlist-code">${displayCode(s.code)}</span>
        <span class="watchlist-name">${s.name}</span>
        <span class="watchlist-source">${sourceLabel(s)}</span>
      </div>
      <div class="watchlist-price">
        ${price !== null ? `<span class="price">${price.toFixed(2)}</span>` : ''}
        ${change !== null ? `<span class="change ${changeCls}">${arrow} ${Math.abs(change).toFixed(2)}%</span>` : ''}
      </div>
      <button class="remove-btn" title="删除">&times;</button>
      <span class="drag-handle" title="拖拽排序">&#9776;</span>
    </div>`;
  }).join('');

  initDragAndDrop();
}

/* ── 拖拽排序（容器级事件） ── */

function initDragAndDrop() {
  container.addEventListener('dragstart', (e) => {
    const el = e.target.closest('.watchlist-item');
    if (!el) return;
    dragEl = el;
    dragEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  });

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!dragEl) return;
    const target = e.target.closest('.watchlist-item');
    if (!target || target === dragEl) return;
    const rect = target.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (e.clientY < mid) {
      container.insertBefore(dragEl, target);
    } else {
      container.insertBefore(dragEl, target.nextSibling);
    }
  });

  container.addEventListener('dragend', () => {
    if (!dragEl) return;
    dragEl.classList.remove('dragging');
    commitReorder();
    dragEl = null;
  });
}

function commitReorder() {
  const items = [...container.querySelectorAll('.watchlist-item')];
  const list = getWatchlist();
  const newOrder = items.map(el => {
    const idx = parseInt(el.dataset.index, 10);
    return list[idx];
  }).filter(s => s != null);
  if (newOrder.length !== list.length) return;
  saveWatchlist(newOrder);
  items.forEach((el, i) => {
    el.dataset.index = i;
    el.dataset.code = newOrder[i].code;
  });
}

function sourceLabel(stock) {
  const m = stock.market;
  if (m === 'sh') return '上交所';
  if (m === 'sz') return '深交所';
  if (m === 'hk') return '港交所';
  if (m === 'us') {
    const c = stock.code.replace(/^us/, '');
    if (c.endsWith('.oq')) return 'NASDAQ';
    if (c.endsWith('.n')) return 'NYSE';
    if (c.endsWith('.am')) return 'AMEX';
    if (c.startsWith('105.')) return 'NASDAQ';
    if (c.startsWith('106.')) return 'NYSE';
    if (c.startsWith('107.')) return 'AMEX';
    return '美股';
  }
  return m || '';
}

function displayCode(code) {
  return code.replace(/^(sh|sz|us|hk)/, '');
}

function toUSTicker(code) {
  const m = code.match(/^us([a-z]+)\.?(?:oq|n|am)?$/i);
  if (m) return m[1].toUpperCase();
  const m2 = code.match(/^\d+\.([^.]+)/);
  if (m2) return m2[1];
  return code.toUpperCase();
}

function normalizeUSCode(code) {
  const m = code.match(/^us([a-z]+)\.(oq|n|am)$/i);
  if (m) return m[1].toUpperCase() + '.' + m[2].toUpperCase();
  return code.replace(/^us/, '').toUpperCase();
}
