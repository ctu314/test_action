import './style.css';
import { initSearch } from './search.js';
import { initWatchlist, addStock, getWatchlist, refresh } from './watchlist.js';
import { initChart, loadStock } from './chart.js';
import { getActiveUser, showUserModal, clearActiveUser } from './user.js';
import { initDataMenu } from './data.js';

function handleSelectStock(stock) {
  loadStock(stock);
}

function handleAddStock(stock) {
  const added = addStock(stock);
  if (added) {
    const list = getWatchlist();
    if (list.length === 1) {
      loadStock(stock);
    }
    refresh();
  }
}

function enterApp(user) {
  document.getElementById('user-btn-name').textContent = user.name;
  initSearch(handleAddStock);
  initWatchlist(handleSelectStock);
  initChart();
  initDataMenu();
  const list = getWatchlist();
  if (list.length > 0) {
    loadStock(list[0]);
  }
}

const active = getActiveUser();
if (active) {
  enterApp(active);
} else {
  initChart();
  showUserModal(enterApp);
}

document.getElementById('user-btn').addEventListener('click', () => {
  clearActiveUser();
  showUserModal(enterApp);
});
