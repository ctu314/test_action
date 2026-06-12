import { StockSDK, generateSearchExternalLinks } from 'stock-sdk';

const sdk = new StockSDK();

export function initSearch(onSelectStock) {
  const input = document.getElementById('search-input');
  const dropdown = document.getElementById('search-dropdown');

  let timer;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) {
      dropdown.classList.remove('show');
      return;
    }
    timer = setTimeout(() => performSearch(q, dropdown, onSelectStock), 300);
  });

  input.addEventListener('focus', () => {
    if (dropdown.children.length > 0) {
      dropdown.classList.add('show');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) {
      dropdown.classList.remove('show');
    }
  });
}

async function performSearch(q, dropdown, onSelectStock) {
  try {
    const results = await sdk.search(q);
    renderDropdown(results, dropdown, onSelectStock);
    if (results.length > 0) {
      dropdown.classList.add('show');
    } else {
      dropdown.classList.remove('show');
    }
  } catch (err) {
    console.error('搜索失败:', err);
  }
}

function renderDropdown(results, dropdown, onSelectStock) {
  dropdown.innerHTML = results.map(r => {
    const label = getMarketLabel(r.market);
    return `<div class="search-result-item" data-code="${r.code}" data-market="${r.market}" data-name="${r.name}">
      <span class="result-code">${r.code}</span>
      <span class="result-name">${r.name}</span>
      <span class="result-market">${label}</span>
    </div>`;
  }).join('');

  dropdown.querySelectorAll('.search-result-item').forEach(el => {
    el.addEventListener('click', () => {
      const stock = {
        code: el.dataset.code,
        market: el.dataset.market,
        name: el.dataset.name,
      };
      onSelectStock(stock);
      dropdown.classList.remove('show');
      document.getElementById('search-input').value = '';
    });
  });
}

function getMarketLabel(market) {
  const map = { sh: '沪市', sz: '深市', us: '美股', hk: '港股' };
  return map[market] || market || '其他';
}
