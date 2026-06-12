# 股票行情

支持 A股（沪深）、美股、港股的实时行情查看与 K 线分析。

## 启动方式

```bash
cd C:\opencode\stocks
npm run dev
```

浏览器打开 `http://localhost:3000` 即可使用。

## 构建生产版本

```bash
npm run build
```

产物在 `dist/` 目录。

## 功能

- 搜索股票（代码/名称/拼音模糊匹配）
- 自选股管理（localStorage 持久化，支持多个自选股列表）
- K 线图（日线/周线/月线）+ 分时走势（含均价线）
- 鼠标悬停十字准星显示 OHLC、涨跌幅、成交量
- 实时行情面板（最新价、涨跌额/涨跌幅切换、今开、最高、最低、昨收、成交量、成交额、换手率、市盈率）
- 拖拽排序自选股
- 来源标签（上交所/深交所/NASDAQ/NYSE/AMEX/港交所）
- 用户管理（创建/切换/删除用户，每个用户独立自选股列表）
- 用户数据维护（JSON/CSV 导入导出，支持全部用户/当前用户，默认文件名"用户股票数据"）
- 创建用户时检查重名并提示
- 分时图横轴时间标签（9:00、9:30 …）
- 实时数据自动刷新（30 秒间隔）

## 技术栈

- [Vite](https://vitejs.dev/) — 构建工具
- [stock-sdk](https://www.npmjs.com/package/stock-sdk) — 股票数据（免费，无需 API Key）
- [ECharts](https://echarts.apache.org/) — 图表渲染
