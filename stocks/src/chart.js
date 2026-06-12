import * as echarts from 'echarts';
import { StockSDK } from 'stock-sdk';

const sdk = new StockSDK();
const PERIOD_LABEL = { intraday: '分时', daily: '日线', weekly: '周线', monthly: '月线' };

let chart = null;
let stockInfo = null;
let currentPeriod = 'intraday';
let showMode = 'amount';
let statsTimer = null;
let chartTimer = null;
let lastQuote = null;

export function initChart() {
  const dom = document.getElementById('chart-container');
  chart = echarts.init(dom, null, { renderer: 'canvas' });
  chart.setOption(placeholderOption());
  window.addEventListener('resize', () => chart?.resize());

  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPeriod = btn.dataset.period;
      if (stockInfo) fetchAndRender();
    });
  });

  initStatsPanel();
}

export function loadStock(stock) {
  stockInfo = stock;
  document.getElementById('stock-title').textContent =
    `${stock.name} (${displayCode(stock.code)} · ${marketLabel(stock.market)})`;
  if (chartTimer) clearInterval(chartTimer);
  if (statsTimer) clearInterval(statsTimer);
  fetchAndRender();
  fetchQuote();
  startChartRefresh();
  startStatsRefresh();
}

async function fetchAndRender() {
  if (!chart || !stockInfo) return;

  const { code, market } = stockInfo;

  try {
    if (currentPeriod === 'intraday') {
      await renderIntraday(code, market);
    } else {
      await renderKline(code, market);
    }
  } catch (err) {
    console.error('获取数据失败:', err);
    chart.setOption(placeholderOption('数据加载失败'));
  }
}

/* ── 分时（当日实时走势） ── */

async function renderIntraday(code, market) {
  let timeline;

  if (market === 'sh' || market === 'sz') {
    const resp = await sdk.getTodayTimeline(code);
    timeline = resp.data;
  } else if (market === 'us') {
    let rows = await sdk.getUSMinuteKline(toUSApiCode(code), { period: '1' });
    if (!rows || rows.length === 0) {
      const resp = await sdk.getTodayTimeline('us.' + toUSTicker(code));
      rows = resp.data;
    }
    timeline = rows;
  } else if (market === 'hk') {
    const hkCode = code.replace(/^hk/, '');
    const rows = await sdk.getHKMinuteKline(hkCode, { period: '1' });
    timeline = rows;
  } else {
    const resp = await sdk.getTodayTimeline(code);
    timeline = resp.data;
  }

  if (!timeline || timeline.length === 0) {
    chart.setOption(placeholderOption('今日暂无交易数据'));
    return;
  }

  const isATimeline = Array.isArray(timeline) && timeline[0] && 'price' in timeline[0];
  const times = timeline.map(d => isATimeline ? d.time : d.time.slice(11, 16));
  const prices = timeline.map(d => isATimeline ? d.price : d.close);
  const volumes = timeline.map(d => d.volume || 0);
  const avgPrices = isATimeline ? timeline.map(d => d.avgPrice) : null;

  const firstPrice = prices.find(p => p != null && p > 0) || 0;
  const changes = prices.map(p => p != null && firstPrice > 0 ? (p - firstPrice) / firstPrice * 100 : 0);

  const maxVol = Math.max(...volumes, 1);
  const maxPrice = Math.max(...prices.filter(p => p != null));
  const minPrice = Math.min(...prices.filter(p => p != null));
  const pad = (maxPrice - minPrice) * 0.05 || maxPrice * 0.01;

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        crossStyle: { color: '#999' },
        label: {
          backgroundColor: '#0f3460',
          color: '#e0e0e0',
          borderColor: '#2a2a4a',
          borderWidth: 1,
        },
        line: { color: '#4fc3f7', width: 1, type: 'dashed' },
      },
      backgroundColor: 'rgba(22, 33, 62, 0.95)',
      borderColor: '#2a2a4a',
      borderWidth: 1,
      textStyle: { color: '#e0e0e0', fontSize: 13 },
      formatter: function (params) {
        if (!params || params.length === 0) return '';
        const p = params[0];
        const idx = p.dataIndex;
        const t = times[idx] || '';
        const price = prices[idx];
        const vol = volumes[idx];
        const chg = changes[idx];
        const chgColor = chg >= 0 ? '#ef5350' : '#26a69a';
        const arrow = chg >= 0 ? '▲' : '▼';
        return `<div style="font-weight:600;margin-bottom:4px">${t}</div>
          <div>价格: <b>${price != null ? price.toFixed(2) : '--'}</b></div>
          <div>涨跌幅: <b style="color:${chgColor}">${arrow} ${Math.abs(chg).toFixed(2)}%</b></div>
           <div>成交量: <b>${vol != null ? formatVolume(vol, '股') : '--'}</b></div>`;
      },
    },
    grid: [
      { left: '6%', right: '6%', top: '6%', bottom: '38%' },
      { left: '6%', right: '6%', top: '68%', bottom: '10%' },
    ],
    xAxis: [
      {
        type: 'category', data: times, gridIndex: 0,
        axisLine: { lineStyle: { color: '#2a2a4a' } },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      {
        type: 'category', data: times, gridIndex: 1,
        axisLine: { lineStyle: { color: '#2a2a4a' } },
        axisLabel: {
          color: '#a0a0b0', fontSize: 11,
          formatter: function (v) { return v.replace(/^0/, ''); },
          interval: function (_i, v) {
            return v && (v.endsWith(':00') || v.endsWith(':30'));
          },
        },
        splitLine: { show: false },
      },
    ],
    yAxis: [
      {
        gridIndex: 0, scale: true,
        min: minPrice - pad, max: maxPrice + pad,
        splitLine: { lineStyle: { color: '#2a2a4a', type: 'dashed' } },
        axisLabel: { color: '#a0a0b0', fontSize: 11 },
      },
      {
        gridIndex: 1, scale: true,
        splitLine: { show: false },
        axisLabel: { color: '#a0a0b0', fontSize: 10 },
      },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1] },
    ],
    series: [
      {
        name: '价格',
        type: 'line',
        data: prices,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: '#ff9800' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255,152,0,0.3)' },
            { offset: 1, color: 'rgba(255,152,0,0.02)' },
          ]),
        },
        xAxisIndex: 0, yAxisIndex: 0,
      },
      ...(avgPrices ? [{
        name: '均价',
        type: 'line',
        data: avgPrices,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1, color: '#4fc3f7', type: 'dashed' },
        xAxisIndex: 0, yAxisIndex: 0,
      }] : []),
      {
        name: '成交量',
        type: 'bar',
        data: volumes,
        xAxisIndex: 1, yAxisIndex: 1,
        itemStyle: {
          color: function (p) {
            return (changes[p.dataIndex] || 0) >= 0
              ? 'rgba(239,83,80,0.5)' : 'rgba(38,166,154,0.5)';
          },
        },
      },
    ],
  };

  chart.setOption(option, true);
}

/* ── K线（日/周/月） ── */

async function renderKline(code, market) {
  let data;

  if (market === 'sh' || market === 'sz') {
    data = await sdk.getHistoryKline(code, { period: currentPeriod });
  } else if (market === 'us') {
    data = await sdk.getUSHistoryKline(toUSApiCode(code), { period: currentPeriod });
  } else if (market === 'hk') {
    const hkCode = code.replace(/^hk/, '');
    data = await sdk.getHKHistoryKline(hkCode, { period: currentPeriod });
  } else {
    data = await sdk.getHistoryKline(code, { period: currentPeriod });
  }

  if (!data || data.length === 0) {
    chart.setOption(placeholderOption('暂无数据'));
    return;
  }

  const dates = data.map(d => d.date);
  const ohlc = data.map(d => [d.open, d.close, d.low, d.high]);
  const volumes = data.map(d => d.volume || 0);
  const changes = data.map(d => d.changePercent || 0);

  const maxVol = Math.max(...volumes, 1);

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        crossStyle: { color: '#999' },
        label: {
          backgroundColor: '#0f3460', color: '#e0e0e0',
          borderColor: '#2a2a4a', borderWidth: 1,
        },
        line: { color: '#4fc3f7', width: 1, type: 'dashed' },
      },
      backgroundColor: 'rgba(22, 33, 62, 0.95)',
      borderColor: '#2a2a4a', borderWidth: 1,
      textStyle: { color: '#e0e0e0', fontSize: 13 },
      formatter: function (params) {
        if (!params || params.length === 0) return '';
        const candle = params.find(p => p.seriesName === 'K线');
        const vol = params.find(p => p.seriesName === '成交量');
        if (!candle) return '';
        const d = candle.data;
        const idx = candle.dataIndex;
        const o = d[0], c = d[1], l = d[2], h = d[3];
        const change = changes[idx];
        const isUp = c >= o;
        const color = isUp ? '#ef5350' : '#26a69a';
        const arrow = isUp ? '▲' : '▼';
        const changeStr = change != null ? `${arrow} ${Math.abs(change).toFixed(2)}%` : '--';
        const volStr = vol && vol.data != null ? formatVolume(vol.data, '手') : '--';
        const label = PERIOD_LABEL[currentPeriod] || '';
        return `<div style="font-size:14px;font-weight:600;margin-bottom:6px;border-bottom:1px solid #2a2a4a;padding-bottom:4px">
          ${candle.axisValueLabel || ''} <span style="font-weight:400;font-size:12px;color:#a0a0b0">${label}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;font-size:13px">
          <div>开盘: <b>${o.toFixed(2)}</b></div>
          <div>最高: <b>${h.toFixed(2)}</b></div>
          <div>收盘: <b style="color:${color}">${c.toFixed(2)}</b></div>
          <div>最低: <b>${l.toFixed(2)}</b></div>
          <div>涨跌幅: <b style="color:${color}">${changeStr}</b></div>
          <div>成交量: <b>${volStr}</b></div>
        </div>`;
      },
    },
    grid: [
      { left: '6%', right: '6%', top: '6%', bottom: '38%' },
      { left: '6%', right: '6%', top: '68%', bottom: '10%' },
    ],
    xAxis: [
      {
        type: 'category', data: dates, gridIndex: 0,
        axisLine: { onZero: false, lineStyle: { color: '#2a2a4a' } },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      {
        type: 'category', data: dates, gridIndex: 1,
        axisLine: { lineStyle: { color: '#2a2a4a' } },
        axisLabel: {
          color: '#a0a0b0', fontSize: 11, rotate: 30,
          interval: Math.max(0, Math.floor(dates.length / 8) - 1),
        },
        splitLine: { show: false },
      },
    ],
    yAxis: [
      {
        gridIndex: 0, scale: true,
        splitLine: { lineStyle: { color: '#2a2a4a', type: 'dashed' } },
        axisLabel: { color: '#a0a0b0', fontSize: 11 },
      },
      {
        gridIndex: 1, scale: true,
        splitLine: { show: false },
        axisLabel: { show: true, color: '#a0a0b0', fontSize: 10 },
      },
    ],
    dataZoom: [
      {
        type: 'inside', xAxisIndex: [0, 1],
        start: Math.max(0, 100 - Math.floor(60 / dates.length * 100)), end: 100,
      },
      {
        type: 'slider', xAxisIndex: [0, 1],
        bottom: '2%', height: 18,
        borderColor: '#2a2a4a', backgroundColor: '#16213e',
        fillerColor: 'rgba(79, 195, 247, 0.15)',
        handleStyle: { color: '#4fc3f7' },
        textStyle: { color: '#a0a0b0', fontSize: 10 },
        labelFormatter: '',
        start: Math.max(0, 100 - Math.floor(60 / dates.length * 100)), end: 100,
      },
    ],
    series: [
      {
        name: 'K线', type: 'candlestick', data: ohlc,
        xAxisIndex: 0, yAxisIndex: 0,
        itemStyle: {
          color: '#ef5350', color0: '#26a69a',
          borderColor: '#ef5350', borderColor0: '#26a69a',
        },
      },
      {
        name: '成交量', type: 'bar', data: volumes,
        xAxisIndex: 1, yAxisIndex: 1,
        itemStyle: {
          color: function (p) {
            return changes[p.dataIndex] >= 0 ? 'rgba(239,83,80,0.5)' : 'rgba(38,166,154,0.5)';
          },
        },
      },
    ],
  };

  chart.setOption(option, true);
}

function placeholderOption(msg) {
  return {
    backgroundColor: 'transparent',
    title: {
      text: msg || '请选择左侧自选股查看走势',
      left: 'center', top: 'center',
      textStyle: { color: '#a0a0b0', fontSize: 16, fontWeight: 400 },
    },
    xAxis: { show: false },
    yAxis: { show: false },
    series: [],
  };
}

/* ── 实时行情面板 ── */

function initStatsPanel() {
  document.getElementById('stats-panel').addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-btn');
    if (!btn) return;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    showMode = btn.dataset.mode;
    if (lastQuote) renderStatsPanel(lastQuote);
  });
}

async function fetchQuote() {
  if (!stockInfo) return;
  const { code, market } = stockInfo;
  try {
    let quote;
    if (market === 'sh' || market === 'sz') {
      const arr = await sdk.getSimpleQuotes([code]);
      quote = arr[0];
    } else if (market === 'us') {
      const arr = await sdk.getUSQuotes([toUSTicker(code)]);
      quote = arr[0];
    } else if (market === 'hk') {
      const hkCode = code.replace(/^hk/, '');
      const arr = await sdk.getHKQuotes([hkCode]);
      quote = arr[0];
    }
    if (quote) { lastQuote = quote; renderStatsPanel(quote); }
  } catch (e) {
  }
}

function startChartRefresh() {
  chartTimer = setInterval(fetchAndRender, 30000);
}

function startStatsRefresh() {
  if (statsTimer) clearInterval(statsTimer);
  statsTimer = setInterval(fetchQuote, 30000);
}

function renderStatsPanel(quote) {
  const panel = document.getElementById('stats-panel');
  if (!quote) {
    panel.innerHTML = '<div class="stats-placeholder">加载中...</div>';
    return;
  }

  const price = quote.price;
  const change = quote.change;
  const changePct = quote.changePercent;
  const isUp = change >= 0;
  const color = isUp ? 'var(--up-color)' : 'var(--down-color)';
  const arrow = isUp ? '▲' : '▼';

  const open = quote.open ?? '--';
  const high = quote.high ?? '--';
  const low = quote.low ?? '--';
  const prevClose = quote.prevClose ?? '--';
  const volume = quote.volume != null ? formatVolume(quote.volume, '手') : '--';
  const amount = quote.amount != null ? formatAmountWan(quote.amount) : '--';
  const turnover = quote.turnoverRate != null ? quote.turnoverRate.toFixed(2) + '%' : '--';
  const pe = quote.pe != null ? quote.pe.toFixed(2) : '--';

  const modeLabel = showMode === 'amount' ? '涨跌额' : '涨跌幅';
  const modeVal = showMode === 'amount'
    ? `${arrow} ${Math.abs(change).toFixed(2)}`
    : `${arrow} ${Math.abs(changePct).toFixed(2)}%`;
  const otherLabel = showMode === 'amount' ? '涨跌幅' : '涨跌额';
  const otherVal = showMode === 'amount'
    ? `${isUp ? '+' : ''}${changePct.toFixed(2)}%`
    : `${isUp ? '+' : ''}${change.toFixed(2)}`;

  panel.innerHTML = `<div class="stats-header">
    <span>实时行情</span>
    <div class="stats-toggle">
      <button class="mode-btn ${showMode === 'amount' ? 'active' : ''}" data-mode="amount">涨跌额</button>
      <button class="mode-btn ${showMode === 'percent' ? 'active' : ''}" data-mode="percent">涨跌幅</button>
    </div>
  </div>
  <div class="stats-price" style="color:${color}">${price.toFixed(2)}</div>
  <div class="stats-mode-row" style="color:${color}">
    <span class="stats-mode-val">${modeVal}</span>
    <span class="stats-mode-other">${otherLabel}: ${otherVal}</span>
  </div>
  <div class="stats-divider"></div>
  <div class="stats-grid">
    <div class="stats-row"><span class="stats-label">今开</span><span class="stats-val">${fmt(open)}</span></div>
    <div class="stats-row"><span class="stats-label">最高</span><span class="stats-val">${fmt(high)}</span></div>
    <div class="stats-row"><span class="stats-label">最低</span><span class="stats-val">${fmt(low)}</span></div>
    <div class="stats-row"><span class="stats-label">昨收</span><span class="stats-val">${fmt(prevClose)}</span></div>
    <div class="stats-row"><span class="stats-label">成交量</span><span class="stats-val">${volume}</span></div>
    <div class="stats-row"><span class="stats-label">成交额</span><span class="stats-val">${amount}</span></div>
    <div class="stats-row"><span class="stats-label">换手率</span><span class="stats-val">${turnover}</span></div>
    <div class="stats-row"><span class="stats-label">市盈率</span><span class="stats-val">${pe}</span></div>
  </div>`;
}

function fmt(v) {
  if (v === '--' || v == null) return '--';
  if (typeof v === 'number') return v.toFixed(2);
  return v;
}

function formatVolume(v, unit) {
  if (v == null) return '--';
  const a = Math.abs(v);
  if (a >= 100000000) return (v / 100000000).toFixed(2) + '亿' + unit;
  if (a >= 10000) return (v / 10000).toFixed(2) + '万' + unit;
  return v.toFixed(0) + unit;
}

function formatAmountWan(v) {
  if (v == null) return '--';
  const a = Math.abs(v);
  if (a >= 10000) return (v / 10000).toFixed(2) + '亿';
  if (a >= 1) return v.toFixed(2) + '万';
  return (v * 10000).toFixed(2) + '元';
}

function toUSApiCode(code) {
  const m = code.match(/^us([a-z]+)\.(oq|n|am)$/i);
  if (m) {
    const prefix = { oq: '105', n: '106', am: '107' }[m[2]];
    return prefix + '.' + m[1].toUpperCase();
  }
  return code.replace(/^us/, '');
}

function toUSTicker(code) {
  const m = code.match(/^us([a-z]+)\.?(?:oq|n|am)?$/i);
  if (m) return m[1].toUpperCase();
  const m2 = code.match(/^\d+\.([^.]+)/);
  if (m2) return m2[1];
  return code.toUpperCase();
}

function displayCode(code) {
  return code.replace(/^(sh|sz|us|hk)/, '');
}

function marketLabel(market) {
  const map = { sh: '沪市', sz: '深市', us: '美股', hk: '港股' };
  return map[market] || market || '其他';
}
