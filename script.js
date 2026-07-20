const STORAGE = {
  holdings: "stock_lab_holdings",
  thoughts: "stock_lab_thoughts",
  dark: "stock_lab_dark"
};

const aliases = {
  "贵州茅台": "600519",
  "茅台": "600519",
  "五粮液": "000858",
  "宁德时代": "300750",
  "比亚迪": "002594",
  "东方财富": "300059",
  "招商银行": "600036",
  "平安银行": "000001",
  "半导体": "589020",
  "科创半导体": "589020"
};

const $ = (selector) => document.querySelector(selector);
const on = (element, event, handler) => {
  if (element) element.addEventListener(event, handler);
};
const els = {
  lastUpdate: $("#lastUpdate"),
  refreshBtn: $("#refreshBtn"),
  searchForm: $("#searchForm"),
  stockInput: $("#stockInput"),
  equityValue: $("#equityValue"),
  yieldValue: $("#yieldValue"),
  todayValue: $("#todayValue"),
  profitValue: $("#profitValue"),
  chanceValue: $("#chanceValue"),
  actionStatus: $("#actionStatus"),
  todayAction: $("#todayAction"),
  holdingCount: $("#holdingCount"),
  holdingList: $("#holdingList"),
  costInput: $("#costInput"),
  sharesInput: $("#sharesInput"),
  portfolioInput: $("#portfolioInput"),
  holdingSort: $("#holdingSort"),
  clearSearchBtn: $("#clearSearchBtn"),
  importText: $("#importText"),
  importFile: $("#importFile"),
  importBtn: $("#importBtn"),
  fileImportBtn: $("#fileImportBtn"),
  screenshotFile: $("#screenshotFile"),
  screenshotPreview: $("#screenshotPreview"),
  screenshotBtn: $("#screenshotBtn"),
  screenshotHint: $("#screenshotHint"),
  saveHoldingBtn: $("#saveHoldingBtn"),
  startWatchBtn: $("#startWatchBtn"),
  refreshState: $("#refreshState"),
  briefBtn: $("#briefBtn"),
  briefText: $("#briefText"),
  scorePanel: $("#scorePanel"),
  gauge: $("#gauge"),
  scoreNum: $("#scoreNum"),
  scoreMood: $("#scoreMood"),
  scoreTitle: $("#scoreTitle"),
  scoreChips: $("#scoreChips"),
  scoreText: $("#scoreText"),
  strategyPanel: $("#strategyPanel"),
  strategyGrid: $("#strategyGrid"),
  chartPanel: $("#chartPanel"),
  chartCanvas: $("#chartCanvas"),
  reportPanel: $("#reportPanel"),
  reportLabel: $("#reportLabel"),
  reportBody: $("#reportBody"),
  newsCard: $("#newsCard"),
  newsMood: $("#newsMood"),
  newsSummary: $("#newsSummary"),
  newsList: $("#newsList"),
  darkModeToggle: $("#darkModeToggle"),
  saveSettingsBtn: $("#saveSettingsBtn"),
  clearDataBtn: $("#clearDataBtn"),
  exportDataBtn: $("#exportDataBtn"),
  restoreDataFile: $("#restoreDataFile"),
  restoreDataBtn: $("#restoreDataBtn"),
  thoughtText: $("#thoughtText"),
  saveThoughtBtn: $("#saveThoughtBtn"),
  makeReviewBtn: $("#makeReviewBtn"),
  analyzeThoughtBtn: $("#analyzeThoughtBtn"),
  autoReview: $("#autoReview"),
  thoughtReview: $("#thoughtReview"),
  reviewDate: $("#reviewDate"),
  demoBtn: $("#demoBtn"),
  guideBtn: $("#guideBtn"),
  guidePanel: $("#guidePanel"),
  profitPageText: $("#profitPageText"),
  profitEquity: $("#profitEquity"),
  profitFloating: $("#profitFloating"),
  profitToday: $("#profitToday"),
  portfolioInsight: $("#portfolioInsight"),
  healthPill: $("#healthPill"),
  pendingList: $("#pendingList"),
  pendingCount: $("#pendingCount")
};

let currentStock = null;
let currentMetrics = null;
let watchQuotes = {};
let lastEnrichedHoldings = [];
let watchTimer = null;

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function holdings() {
  return loadJson(STORAGE.holdings, []);
}

function setHoldings(list) {
  saveJson(STORAGE.holdings, list);
  renderHoldings();
  updateAccount();
}

function normalizeCode(value) {
  const raw = value.trim();
  return aliases[raw] || raw.replace(/[^\dA-Za-z.]/g, "");
}

function secid(code) {
  if (code.includes(".")) return code;
  if (/^[689]/.test(code)) return `1.${code}`;
  if (/^[023]/.test(code)) return `0.${code}`;
  return `1.${code}`;
}

function money(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "¥--";
  return `¥${num.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function fixed(value, digits = 2) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(digits) : "--";
}

function percent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  return `${num > 0 ? "+" : ""}${num.toFixed(2)}%`;
}

function cssMove(value) {
  if (value > 0) return "num-red";
  if (value < 0) return "num-green";
  return "";
}

async function fetchQuote(input) {
  const code = normalizeCode(input);
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(secid(code))}&fields=f57,f58,f43,f44,f45,f46,f47,f48,f60,f116,f162,f170`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("行情接口暂时访问失败");
  const json = await res.json();
  const d = json.data;
  if (!d || d.f43 === "-") throw new Error("没有找到这只股票");
  return {
    code: d.f57 || code,
    name: d.f58 || code,
    price: Number(d.f43) / 100,
    changePct: Number(d.f170) / 100,
    open: Number(d.f46) / 100,
    high: Number(d.f44) / 100,
    low: Number(d.f45) / 100,
    prevClose: Number(d.f60) / 100,
    volume: Number(d.f47),
    amount: Number(d.f48),
    marketCap: Number(d.f116),
    pe: Number(d.f162) / 100,
    source: "东方财富公开行情接口",
    updatedAt: new Date().toLocaleString("zh-CN", { hour12: false })
  };
}

async function fetchHistory(input) {
  const code = normalizeCode(input);
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${encodeURIComponent(secid(code))}&klt=101&fqt=1&beg=0&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("历史K线接口暂时访问失败");
  const json = await res.json();
  return (json?.data?.klines || []).map((line) => {
    const [date, open, close, high, low, volume, amount, amp, dayPct, change, turnover] = line.split(",");
    return {
      date,
      open: Number(open),
      close: Number(close),
      high: Number(high),
      low: Number(low),
      volume: Number(volume),
      amount: Number(amount),
      amp: Number(amp),
      dayPct: Number(dayPct),
      change: Number(change),
      turnover: Number(turnover)
    };
  }).filter((item) => Number.isFinite(item.close));
}

async function fetchNews(stock) {
  try {
    const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=callback&param=${encodeURIComponent(`${stock.name} ${stock.code}`)}`;
    const res = await fetch(url);
    const text = await res.text();
    const match = text.match(/callback\((.*)\)$/);
    if (!match) return [];
    const json = JSON.parse(match[1]);
    const list = json?.result?.cmsArticleWebOld || json?.result?.cmsArticle || [];
    return list.slice(0, 5).map((item) => ({
      title: item.title || item.Title || "未命名消息",
      date: item.showTime || item.publishTime || item.date || ""
    }));
  } catch {
    return [];
  }
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, item) => sum + item, 0) / valid.length : null;
}

function movingAverage(rows, size) {
  return average(rows.slice(-size).map((item) => item.close));
}

function returnRate(now, past) {
  return Number.isFinite(now) && Number.isFinite(past) && past ? ((now - past) / past) * 100 : null;
}

function calcRsi(rows, size = 14) {
  const slice = rows.slice(-(size + 1));
  if (slice.length < size + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < slice.length; i += 1) {
    const diff = slice[i].close - slice[i - 1].close;
    if (diff >= 0) gain += diff;
    else loss += Math.abs(diff);
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

function maxDrawdown(rows, size = 60) {
  let peak = -Infinity;
  let down = 0;
  rows.slice(-size).forEach((item) => {
    peak = Math.max(peak, item.close);
    if (peak > 0) down = Math.min(down, ((item.close - peak) / peak) * 100);
  });
  return down;
}

function calcMetrics(rows) {
  const last = rows.at(-1) || {};
  const range = rows.slice(-60);
  return {
    close: last.close,
    date: last.date,
    ma5: movingAverage(rows, 5),
    ma10: movingAverage(rows, 10),
    ma20: movingAverage(rows, 20),
    ma60: movingAverage(rows, 60),
    rsi: calcRsi(rows),
    ret5: returnRate(last.close, rows.at(-6)?.close),
    ret20: returnRate(last.close, rows.at(-21)?.close),
    ret60: returnRate(last.close, rows.at(-61)?.close),
    high60: Math.max(...range.map((item) => item.high)),
    low60: Math.min(...range.map((item) => item.low)),
    drawdown60: maxDrawdown(rows),
    volumeRatio: rows.at(-1)?.volume / (average(rows.slice(-21, -1).map((item) => item.volume)) || rows.at(-1)?.volume || 1),
    rows: rows.slice(-100)
  };
}

function trend(metrics) {
  if (metrics.ma5 > metrics.ma10 && metrics.ma10 > metrics.ma20) return "均线多头";
  if (metrics.ma5 < metrics.ma10 && metrics.ma10 < metrics.ma20) return "均线空头";
  return "震荡整理";
}

function scoreOf(stock, metrics) {
  let score = 52;
  const state = trend(metrics);
  if (state === "均线多头") score += 16;
  if (state === "均线空头") score -= 16;
  if (metrics.ret20 > 10) score += 8;
  if (metrics.ret20 < -10) score -= 8;
  if (metrics.rsi > 72) score -= 12;
  if (metrics.rsi < 35) score -= 4;
  if (metrics.volumeRatio > 1.8 && stock.changePct > 0) score += 5;
  if (metrics.volumeRatio > 1.8 && stock.changePct < 0) score -= 5;
  if (metrics.drawdown60 < -20) score -= 7;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function mood(score) {
  if (score >= 70) return "乐观";
  if (score >= 55) return "观察";
  if (score >= 40) return "谨慎";
  return "高风险";
}

function conclusionLabel(stock, metrics) {
  const state = trend(metrics);
  if (metrics.rsi > 72) return "有回调风险";
  if (state === "均线多头" && stock.changePct >= 0) return "继续观察";
  if (state === "均线空头") return "需回避";
  return "可小仓位观察";
}

function scoreChips(stock, metrics, score) {
  const list = [];
  if (score >= 70) list.push(["强势观察", "good"]);
  if (metrics.rsi > 72) list.push(["高位过热", "hot"]);
  if (trend(metrics) === "均线多头") list.push(["均线多头", "good"]);
  if (trend(metrics) === "均线空头") list.push(["均线空头", "hot"]);
  if (stock.changePct < 0) list.push(["日内走弱", "hot"]);
  if (metrics.volumeRatio > 1.5) list.push(["放量", "warn"]);
  if (!list.length) list.push(["题材待确认", "warn"]);
  return list;
}

function renderScore(stock, metrics) {
  const score = scoreOf(stock, metrics);
  els.scorePanel.classList.remove("hidden");
  els.gauge.style.setProperty("--score", score);
  els.scoreNum.textContent = score;
  els.scoreMood.textContent = mood(score);
  els.scoreTitle.textContent = `${stock.name} AI 评分卡`;
  els.scoreChips.innerHTML = scoreChips(stock, metrics, score)
    .map(([text, type]) => `<span class="${type}">${text}</span>`)
    .join("");
  els.scoreText.textContent = `${stock.name}（${stock.code}）当前评分 ${score}/100。${trend(metrics)}，近20日 ${percent(metrics.ret20)}，RSI ${fixed(metrics.rsi, 0)}。评分用于复盘排序，不代表未来涨跌。数据来源：${stock.source}、东方财富历史K线。`;
}

function renderStrategy(stock, metrics) {
  els.strategyPanel.classList.remove("hidden");
  const cards = [
    {
      cls: "",
      title: "已持有观察",
      value: `守 MA20 ${fixed(metrics.ma20)}`,
      text: "若价格仍在中期均线上方，先看纪律是否被破坏。"
    },
    {
      cls: "secondary",
      title: "空仓观察",
      value: `等 MA10 ${fixed(metrics.ma10)}`,
      text: "没有持仓时，重点观察回踩后是否缩量企稳。"
    },
    {
      cls: "risk",
      title: "风险观察线",
      value: `跌破 ${fixed(metrics.ma20)}`,
      text: "若跌破并放量，优先复核原始逻辑是否失效。"
    },
    {
      cls: "target",
      title: "上方压力观察",
      value: `${fixed(metrics.high60)}`,
      text: "靠近60日高点时，看量能是否继续支持。"
    }
  ];
  els.strategyGrid.innerHTML = cards.map((card) => `
    <article class="strategy-card ${card.cls}">
      <span>${card.title}</span>
      <strong>${card.value}</strong>
      <p>${card.text}</p>
    </article>
  `).join("");
}

function drawChart(rows) {
  els.chartPanel.classList.remove("hidden");
  const canvas = els.chartCanvas;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const data = rows.slice(-80);
  if (!data.length) return;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, width, height);

  const top = 42;
  const priceHeight = 285;
  const volumeTop = 370;
  const volumeHeight = 92;
  const prices = data.flatMap((item) => [item.high, item.low]);
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const x = (index) => 46 + index * ((width - 72) / Math.max(1, data.length - 1));
  const y = (price) => top + ((max - price) / (max - min || 1)) * priceHeight;

  ctx.strokeStyle = "#263244";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const yy = top + i * (priceHeight / 4);
    ctx.beginPath();
    ctx.moveTo(42, yy);
    ctx.lineTo(width - 22, yy);
    ctx.stroke();
  }

  data.forEach((item, index) => {
    const xx = x(index);
    const color = item.close >= item.open ? "#ef4444" : "#22c55e";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(xx, y(item.high));
    ctx.lineTo(xx, y(item.low));
    ctx.stroke();
    ctx.fillRect(xx - 3, Math.min(y(item.open), y(item.close)), 6, Math.max(2, Math.abs(y(item.open) - y(item.close))));
  });

  function drawMa(size, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    data.forEach((_, index) => {
      const value = movingAverage(data.slice(0, index + 1), size);
      if (!Number.isFinite(value)) return;
      if (!started) {
        ctx.moveTo(x(index), y(value));
        started = true;
      } else {
        ctx.lineTo(x(index), y(value));
      }
    });
    ctx.stroke();
  }

  drawMa(5, "#38bdf8");
  drawMa(10, "#f59e0b");
  drawMa(20, "#8b5cf6");

  const maxVolume = Math.max(...data.map((item) => item.volume));
  data.forEach((item, index) => {
    const barHeight = (item.volume / (maxVolume || 1)) * volumeHeight;
    ctx.fillStyle = item.close >= item.open ? "#ef4444" : "#22c55e";
    ctx.fillRect(x(index) - 3, volumeTop + volumeHeight - barHeight, 6, barHeight);
  });

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "18px Arial";
  ctx.fillText("K线  MA5 / MA10 / MA20", 46, 26);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(`压力 ${fixed(max)}  支撑 ${fixed(min)}`, 46, height - 18);
}

function renderNews(news) {
  if (!els.newsCard || !els.newsMood || !els.newsSummary || !els.newsList) return;
  els.newsCard.classList.remove("hidden");
  const bad = news.some((item) => /减持|亏损|处罚|风险|下滑|诉讼|退市/.test(item.title));
  const good = news.some((item) => /增长|中标|回购|增持|突破|签约|盈利/.test(item.title));
  els.newsMood.textContent = bad && !good ? "偏利空" : good && !bad ? "偏利好" : "中性";
  els.newsSummary.textContent = news.length
    ? `最近抓到 ${news.length} 条公开消息标题，只做事实整理；公告原文仍需自己核对。`
    : "免费公开接口没有取到近期消息，系统不会编造新闻。";
  els.newsList.innerHTML = news.length
    ? news.map((item) => `<li>${item.date ? `${item.date}：` : ""}${item.title}</li>`).join("")
    : "<li>暂无可展示消息。</li>";
}

function renderReport(stock, metrics, news) {
  const label = conclusionLabel(stock, metrics);
  els.reportPanel.classList.remove("hidden");
  els.reportLabel.textContent = label;
  els.reportBody.innerHTML = `
    <section class="report-section">
      <strong>当前仓位建议</strong><br>
      本工具不替你下买卖决定，只给仓位纪律检查：如果已经持有，优先看价格是否守住 ${fixed(metrics.ma20)} 附近；如果仓位已经很重，先避免因为短线波动继续加码；如果没有持仓，先把 ${fixed(metrics.ma10)} / ${fixed(metrics.ma20)} 当观察区。
    </section>
    <section class="report-section">
      <strong>一、周期框架</strong><br>
      约束：仅有行情和K线数据，行业产能、政策、库存数据不足，暂无法完整判断。<br>
      惯性：${trend(metrics)}，近20日 ${percent(metrics.ret20)}，量能约为20日均量的 ${fixed(metrics.volumeRatio, 2)} 倍。<br>
      阶段：${metrics.rsi > 72 ? "短线偏热，追高风险升高。" : "暂未出现极端过热信号。"}
    </section>
    <section class="report-section">
      <strong>二、K线执行框架</strong><br>
      趋势判断：${trend(metrics)}。<br>
      关键位置：支撑 ${fixed(metrics.ma20)} / 压力 ${fixed(metrics.high60)}。<br>
      风险信号：${metrics.drawdown60 < -20 ? `近60日最大回撤 ${percent(metrics.drawdown60)}，波动偏大。` : "暂未看到大幅回撤信号。"}
    </section>
    <section class="report-section">
      <strong>三、交叉验证</strong><br>
      行情：来自东方财富公开行情接口。<br>
      K线：来自东方财富历史K线接口。<br>
      消息：抓取到 ${news.length} 条公开标题，资金流、龙虎榜、财报和公告原文需要接入正式数据源后再确认。
    </section>
    <section class="conclusion-block">
      <strong>标签：${label}</strong><br>
      核心逻辑：先看纪律线，再看量价是否配合，不预测明天涨跌。<br>
      风险提示：公开免费接口可能延迟或失败，实际决策请以交易所公告和券商软件为准。
    </section>
  `;
}

function renderAnalysis(stock, metrics, news) {
  currentStock = stock;
  currentMetrics = metrics;
  renderScore(stock, metrics);
  renderStrategy(stock, metrics);
  drawChart(metrics.rows);
  renderReport(stock, metrics, news);
  renderNews(news);
  els.lastUpdate.textContent = `尾盘纪律检查 · ${stock.updatedAt}`;
  els.costInput.placeholder = `成本价，例如 ${fixed(stock.price)}`;
}

function renderCloudAnalysis(data) {
  currentStock = data.quote;
  currentMetrics = data.metrics;
  const stock = data.quote;
  const metrics = data.metrics;
  els.scorePanel.classList.remove("hidden");
  els.gauge.style.setProperty("--score", data.score);
  els.scoreNum.textContent = data.score;
  els.scoreMood.textContent = data.score >= 70 ? "乐观" : data.score >= 55 ? "观察" : data.score >= 40 ? "谨慎" : "高风险";
  els.scoreTitle.textContent = `${stock.name} AI 评分卡`;
  els.scoreChips.innerHTML = [
    data.label,
    trend(metrics),
    metrics.rsi > 72 ? "高位过热" : "纪律正常",
    metrics.volumeRatio > 1.5 ? "放量" : "量能普通"
  ].map((text) => `<span class="${/风险|过热|回避/.test(text) ? "hot" : /放量|观察/.test(text) ? "warn" : "good"}">${text}</span>`).join("");
  els.scoreText.textContent = `${stock.name}（${stock.code}）当前评分 ${data.score}/100。${data.report.summary} 数据来源：${data.report.sources.join("、")}。`;
  els.strategyPanel.classList.remove("hidden");
  els.strategyGrid.innerHTML = data.strategy.map((card, index) => `
    <article class="strategy-card ${index === 1 ? "secondary" : index === 2 ? "risk" : index === 3 ? "target" : ""}">
      <span>${card.name}</span>
      <strong>${fixed(card.price)}</strong>
      <p>${card.text}</p>
    </article>
  `).join("");
  drawChart(metrics.rows);
  els.reportPanel.classList.remove("hidden");
  els.reportLabel.textContent = data.label;
  els.reportBody.innerHTML = `
    <section class="report-section"><strong>当前仓位建议</strong><br>${data.report.position}</section>
    <section class="report-section"><strong>一、周期框架</strong><br>${data.report.cycle}</section>
    <section class="report-section"><strong>二、K线执行框架</strong><br>${data.report.technical}</section>
    <section class="report-section"><strong>三、资金和估值</strong><br>${data.report.capital || "资金流数据不足。"}<br>市值：${formatWanYi(stock.marketCap)}；市盈率：${fixed(stock.pe, 2)}。</section>
    <section class="report-section"><strong>四、消息和公告</strong><br>${data.report.news || "免费接口未抓到消息。"}${renderNewsLines(data.news)}</section>
    <section class="report-section"><strong>五、数据可靠性</strong><br>${data.report.quality || "未校验。"}${renderValidation(data.validation)}</section>
    <section class="report-section"><strong>六、回测结果</strong><br>示例策略历史收益 ${percent(data.backtest.returnPct)}，最大回撤 ${percent(data.backtest.maxDrawdownPct)}，交易次数 ${data.backtest.tradeCount}。${data.backtest.note}</section>
    <section class="conclusion-block"><strong>标签：${data.label}</strong><br>${data.report.risk}</section>
  `;
  if (els.newsCard) els.newsCard.classList.add("hidden");
  els.lastUpdate.textContent = `尾盘纪律检查 · ${stock.updatedAt || data.updatedAt}`;
  els.costInput.placeholder = `成本价，例如 ${fixed(stock.price)}`;
}

function formatWanYi(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  if (Math.abs(num) >= 100000000) return `${(num / 100000000).toFixed(2)}亿`;
  if (Math.abs(num) >= 10000) return `${(num / 10000).toFixed(2)}万`;
  return num.toFixed(2);
}

function renderNewsLines(news = []) {
  if (!news.length) return "";
  return `<ul>${news.slice(0, 4).map((item) => `<li>${item.date ? `${item.date}：` : ""}${item.title}</li>`).join("")}</ul>`;
}

function renderValidation(validation) {
  if (!validation?.checks?.length) return "";
  return `<ul>${validation.checks.map((item) => `<li>${item.ok ? "通过" : "需复核"}：${item.name}，${item.text}</li>`).join("")}</ul>`;
}

async function analyze(input) {
  const code = normalizeCode(input);
  if (!code) return;
  const submitButton = els.searchForm?.querySelector("button[type='submit']");
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "分析中";
  }
  els.scorePanel.classList.add("hidden");
  els.strategyPanel.classList.add("hidden");
  els.chartPanel.classList.add("hidden");
  els.reportPanel.classList.add("hidden");
  if (els.newsCard) els.newsCard.classList.add("hidden");
  els.lastUpdate.textContent = "正在读取公开行情...";
  try {
    if (location.protocol !== "file:") {
      const cloud = await fetch(`/api/analyze?code=${encodeURIComponent(code)}`);
      if (cloud.ok) {
        const data = await cloud.json();
        if (!data.error && data.quote) {
          renderCloudAnalysis(data);
          return;
        }
      }
    }
    const stock = await fetchQuote(code);
    const rows = await fetchHistory(stock.code);
    const news = await fetchNews(stock);
    renderAnalysis(stock, calcMetrics(rows), news);
  } catch (error) {
    alert(`${error.message}。如果是在 Cloudflare Pages 上遇到跨域限制，可改接 Tushare/聚宽等带 Key 的数据源或加后端代理。`);
    els.lastUpdate.textContent = "尾盘纪律检查 · 数据读取失败";
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "分析";
    }
  }
}

function saveHolding() {
  if (!currentStock) {
    alert("先搜索并分析一只股票，再保存持仓。");
    return;
  }
  const list = holdings().filter((item) => item.code !== currentStock.code);
  list.unshift({
    code: currentStock.code,
    name: currentStock.name,
    cost: Number(els.costInput.value) || currentStock.price,
    shares: Number(els.sharesInput.value) || 0,
    portfolio: Number(els.portfolioInput.value) || 0
  });
  setHoldings(list);
}

function loadDemoPortfolio() {
  const demo = [
    { code: "600519", name: "贵州茅台", cost: 1600, shares: 100, portfolio: 260000 },
    { code: "300059", name: "东方财富", cost: 18.5, shares: 3000, portfolio: 260000 },
    { code: "000001", name: "平安银行", cost: 11.2, shares: 5000, portfolio: 260000 }
  ];
  setHoldings(demo);
  refreshHoldings();
  alert("已载入演示组合。你可以随时在设置里清空本地数据。");
}

function toggleGuide() {
  if (!els.guidePanel) return;
  els.guidePanel.classList.toggle("hidden");
}

function renderHoldings() {
  const sortMode = els.holdingSort?.value || "risk";
  const list = [...holdings()].sort((a, b) => {
    const qa = watchQuotes[a.code];
    const qb = watchQuotes[b.code];
    const pa = qa && a.cost && a.shares ? (qa.price - a.cost) * a.shares : 0;
    const pb = qb && b.cost && b.shares ? (qb.price - b.cost) * b.shares : 0;
    const posa = qa && a.shares && a.portfolio ? (qa.price * a.shares / a.portfolio) : 0;
    const posb = qb && b.shares && b.portfolio ? (qb.price * b.shares / b.portfolio) : 0;
    if (sortMode === "profit") return pa - pb;
    if (sortMode === "position") return posb - posa;
    if (sortMode === "name") return String(a.name).localeCompare(String(b.name), "zh-CN");
    return Math.abs(qb?.changePct || 0) - Math.abs(qa?.changePct || 0);
  });
  els.holdingCount.textContent = `${list.length} 只`;
  if (!list.length) {
    els.holdingList.innerHTML = `
      <div class="holding-row">
        <div>
          <strong>暂无持仓</strong>
          <span>搜索股票后填写成本、股数、账户金额，再点“保存到持仓”。</span>
        </div>
      </div>
    `;
    return;
  }
  els.holdingList.innerHTML = list.map((item) => {
    const quote = watchQuotes[item.code];
    const marketValue = quote && item.shares ? quote.price * item.shares : null;
    const profit = quote && item.cost && item.shares ? (quote.price - item.cost) * item.shares : null;
    const position = marketValue && item.portfolio ? (marketValue / item.portfolio) * 100 : null;
    return `
      <div class="holding-row">
        <button class="watch-main" data-code="${item.code}" type="button">
          <strong>${item.name}</strong>
          <span>${item.code}${quote ? ` · ${fixed(quote.price)} · ${percent(quote.changePct)}` : " · 等待刷新"}</span>
          <em>成本 ${item.cost || "--"} · 股数 ${item.shares || "--"}${Number.isFinite(position) ? ` · 仓位 ${fixed(position, 1)}%` : ""}</em>
          ${Number.isFinite(profit) ? `<b class="${cssMove(profit)}">${profit >= 0 ? "浮盈" : "浮亏"} ${money(Math.abs(profit))}</b>` : ""}
        </button>
        <button data-remove="${item.code}" type="button">删</button>
      </div>
    `;
  }).join("");
}

function importHoldings() {
  const raw = els.importText?.value || "";
  importHoldingsFromText(raw);
}

function splitLine(line) {
  if (line.includes("\t")) return line.split("\t").map((item) => item.trim());
  return line.split(",").map((item) => item.trim().replace(/^"|"$/g, ""));
}

function findColumn(headers, words, fallback) {
  const index = headers.findIndex((header) => words.some((word) => header.includes(word)));
  return index >= 0 ? index : fallback;
}

function parseHoldingText(raw) {
  const rows = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!rows.length) return [];
  const first = splitLine(rows[0]);
  const hasHeader = first.some((item) => /代码|证券|股票|名称|成本|持仓|数量|股份|股数/.test(item));
  const headers = hasHeader ? first : [];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const codeIndex = hasHeader ? findColumn(headers, ["代码", "证券代码", "股票代码"], 0) : 0;
  const nameIndex = hasHeader ? findColumn(headers, ["名称", "证券名称", "股票名称"], 1) : 1;
  const costIndex = hasHeader ? findColumn(headers, ["成本", "成本价", "买入均价", "持仓成本"], 2) : 2;
  const sharesIndex = hasHeader ? findColumn(headers, ["股数", "数量", "持仓", "股份", "可用"], 3) : 3;
  const portfolioIndex = hasHeader ? findColumn(headers, ["账户", "总额", "资产", "权益"], 4) : 4;
  return dataRows.map((line) => {
    const parts = splitLine(line);
    return {
      code: normalizeCode(parts[codeIndex] || ""),
      name: parts[nameIndex] || normalizeCode(parts[codeIndex] || ""),
      cost: Number(String(parts[costIndex] || "").replace(/[^\d.-]/g, "")) || 0,
      shares: Number(String(parts[sharesIndex] || "").replace(/[^\d.-]/g, "")) || 0,
      portfolio: Number(String(parts[portfolioIndex] || "").replace(/[^\d.-]/g, "")) || 0
    };
  }).filter((item) => item.code && item.shares);
}

function importHoldingsFromText(raw) {
  const parsed = parseHoldingText(raw);
  if (!parsed.length) {
    alert("没有识别到持仓。请确认文件里有股票代码、名称、成本价、股数。");
    return;
  }
  const merged = [...parsed, ...holdings()].reduce((map, item) => {
    map.set(item.code, item);
    return map;
  }, new Map());
  setHoldings([...merged.values()]);
  if (els.importText) els.importText.value = "";
  alert(`已导入 ${parsed.length} 条持仓。`);
}

function importHoldingsFromFile() {
  const file = els.importFile?.files?.[0];
  if (!file) {
    els.importFile?.click();
    return;
  }
  const reader = new FileReader();
  reader.onload = () => importHoldingsFromText(String(reader.result || ""));
  reader.onerror = () => alert("文件读取失败，请换成 CSV 或 TXT。");
  reader.readAsText(file, "utf-8");
}

function previewScreenshot() {
  const file = els.screenshotFile?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("请选择图片截图。");
    return;
  }
  const url = URL.createObjectURL(file);
  if (els.screenshotPreview) {
    els.screenshotPreview.src = url;
    els.screenshotPreview.classList.remove("hidden");
  }
  if (els.screenshotHint) {
    els.screenshotHint.textContent = "截图已加载。请确认已遮住姓名、资金账号、身份证、手机号。自动识别需要接 OCR / 视觉模型接口；当前免费版不会把图片上传到服务器。";
  }
}

function explainScreenshotImport() {
  if (!els.screenshotFile?.files?.[0]) {
    els.screenshotFile?.click();
    return;
  }
  alert("截图导入的安全流程是：先遮住账号隐私，再上传截图识别。当前免费版只做本地预览，不上传图片；要自动识别，需要接 OCR 或视觉模型 API。");
}

function renderRiskQueue(items) {
  const riskList = $("#riskList");
  const riskCount = $("#riskCount");
  const riskExposure = $("#riskExposure");
  const disciplineQueue = $("#disciplineQueue");
  if (!riskList || !riskCount) return;
  const rows = [];
  let exposure = 0;
  items.forEach((item) => {
    const quote = item.quote;
    if (!quote || !item.shares) return;
    const marketValue = quote.price * item.shares;
    const position = item.portfolio ? (marketValue / item.portfolio) * 100 : null;
    const floating = item.cost ? (quote.price - item.cost) * item.shares : null;
    if (Number.isFinite(position)) exposure += position;
    if (Number.isFinite(position) && position > 35) {
      rows.push({ level: "hot", title: `${item.name} 仓位偏重`, text: `单只仓位约 ${fixed(position, 1)}%，先确认是否超过家庭账户承受范围。` });
    }
    if (Math.abs(quote.changePct) >= 3) {
      rows.push({ level: "warn", title: `${item.name} 今日波动较大`, text: `今日涨跌 ${percent(quote.changePct)}，先看风险观察线，不凭情绪操作。` });
    }
    if (Number.isFinite(floating) && floating < 0) {
      rows.push({ level: "warn", title: `${item.name} 处于浮亏`, text: `浮亏约 ${money(Math.abs(floating))}，复核买入理由和止损纪律。` });
    }
  });
  if (riskExposure) riskExposure.textContent = items.length ? `${fixed(exposure, 0)}%` : "--";
  if (disciplineQueue) disciplineQueue.textContent = rows.length;
  riskCount.textContent = `${rows.length} 条`;
  riskList.innerHTML = rows.length
    ? rows.slice(0, 6).map((row) => `<div class="risk-row ${row.level}"><strong>${row.title}</strong><span>${row.text}</span></div>`).join("")
    : `<div class="risk-row"><strong>暂无明显风险项</strong><span>没有识别到重仓、剧烈波动或浮亏项。仍需以券商和公告数据为准。</span></div>`;
  if (els.pendingCount) els.pendingCount.textContent = `${rows.length} 条`;
  if (els.pendingList) {
    els.pendingList.innerHTML = rows.length
      ? rows.map((row) => `<div class="risk-row ${row.level}"><strong>${row.title}</strong><span>${row.text}</span></div>`).join("")
      : `<div class="risk-row"><strong>暂无待复核项目</strong><span>刷新持仓后，会把中高风险项目自动放到这里。</span></div>`;
  }
  renderPortfolioInsight(items, rows);
}

function renderPortfolioInsight(items, risks) {
  if (!els.portfolioInsight || !els.healthPill) return;
  if (!items.length) {
    els.healthPill.textContent = "等待数据";
    els.portfolioInsight.textContent = "保存或导入持仓后，这里会汇总今日最需要看的风险。";
    return;
  }
  const high = risks.filter((item) => item.level === "hot").length;
  const warn = risks.filter((item) => item.level === "warn").length;
  const totalPosition = items.reduce((sum, item) => {
    const quote = item.quote;
    if (!quote || !item.shares || !item.portfolio) return sum;
    return sum + quote.price * item.shares / item.portfolio * 100;
  }, 0);
  if (high) {
    els.healthPill.textContent = "需复核";
    els.portfolioInsight.textContent = `今天优先看 ${high} 个高风险项。组合仓位约 ${fixed(totalPosition, 0)}%，先确认是否有重仓、破线或大幅浮亏。`;
  } else if (warn) {
    els.healthPill.textContent = "有提醒";
    els.portfolioInsight.textContent = `今天有 ${warn} 个提醒项。先看波动较大的持仓，再决定是否继续观察。`;
  } else {
    els.healthPill.textContent = "较平稳";
    els.portfolioInsight.textContent = `当前没有明显高风险提示。组合仓位约 ${fixed(totalPosition, 0)}%，继续按原计划复盘。`;
  }
}

async function refreshHoldings() {
  if (els.refreshBtn) {
    els.refreshBtn.disabled = true;
    els.refreshBtn.textContent = "刷新中";
  }
  const list = holdings();
  const enriched = [];
  for (const item of list) {
    try {
      watchQuotes[item.code] = await fetchQuote(item.code);
    } catch {
      // Keep the previous quote when a public endpoint is temporarily unavailable.
    }
    const quote = watchQuotes[item.code];
    let metrics = null;
    try {
      if (quote) metrics = calcMetrics(await fetchHistory(item.code));
    } catch {
      metrics = null;
    }
    enriched.push({ ...item, quote, metrics });
  }
  lastEnrichedHoldings = enriched;
  renderHoldings();
  updateAccount();
  renderRiskQueue(enriched);
  renderHoldingWarnings(enriched);
  updateReviewDate();
  if (els.refreshState) {
    els.refreshState.textContent = `已更新 ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
  }
  if (els.refreshBtn) {
    els.refreshBtn.disabled = false;
    els.refreshBtn.textContent = "刷新";
  }
}

function holdingRisk(item) {
  const quote = item.quote;
  const metrics = item.metrics;
  if (!quote) return { level: "mid", text: "行情读取失败，暂时无法判断。", badge: "待确认" };
  const marketValue = item.shares ? quote.price * item.shares : 0;
  const position = item.portfolio ? (marketValue / item.portfolio) * 100 : null;
  const profitPct = item.cost ? ((quote.price - item.cost) / item.cost) * 100 : null;
  const belowRiskLine = metrics?.ma20 ? quote.price < metrics.ma20 : false;
  let points = 0;
  const reasons = [];
  if (Number.isFinite(position) && position > 35) {
    points += 2;
    reasons.push("单只仓位偏重");
  }
  if (Number.isFinite(profitPct) && profitPct < -8) {
    points += 2;
    reasons.push("距离成本亏损较多");
  } else if (Number.isFinite(profitPct) && profitPct < 0) {
    points += 1;
    reasons.push("当前低于成本价");
  }
  if (Math.abs(quote.changePct) >= 3) {
    points += 1;
    reasons.push("今日波动较大");
  }
  if (belowRiskLine) {
    points += 2;
    reasons.push("跌破 MA20 风险观察线");
  }
  if (metrics?.rsi > 72) {
    points += 1;
    reasons.push("短线偏热");
  }
  if (!reasons.length) reasons.push("暂无明显异常");
  if (points >= 4) return { level: "high", badge: "高风险", text: reasons.join("，") };
  if (points >= 2) return { level: "mid", badge: "中风险", text: reasons.join("，") };
  return { level: "low", badge: "低风险", text: reasons.join("，") };
}

function renderHoldingWarnings(items) {
  const warningList = $("#warningList");
  const warningCount = $("#warningCount");
  if (!warningList || !warningCount) return;
  warningCount.textContent = `${items.length} 只`;
  if (!items.length) {
    warningList.innerHTML = `<div class="warning-card"><strong>还没有持仓数据</strong><p>保存或导入持仓后，点击刷新生成预警卡。</p></div>`;
    return;
  }
  warningList.innerHTML = items.map((item) => {
    const quote = item.quote;
    const metrics = item.metrics;
    const risk = holdingRisk(item);
    const marketValue = quote && item.shares ? quote.price * item.shares : null;
    const floating = quote && item.cost && item.shares ? (quote.price - item.cost) * item.shares : null;
    const profitPct = quote && item.cost ? ((quote.price - item.cost) / item.cost) * 100 : null;
    const position = marketValue && item.portfolio ? (marketValue / item.portfolio) * 100 : null;
    const riskLine = metrics?.ma20;
    return `
      <article class="warning-card risk-${risk.level}">
        <div class="warning-head">
          <div>
            <strong>${item.name}</strong>
            <span>${item.code}${quote ? ` · 当前 ${fixed(quote.price)} · 今日 ${percent(quote.changePct)}` : " · 行情待刷新"}</span>
          </div>
          <b class="risk-badge ${risk.level}">${risk.badge}</b>
        </div>
        <div class="warning-metrics">
          <div><span>成本价</span><strong>${item.cost || "--"}</strong></div>
          <div><span>浮盈亏</span><strong class="${cssMove(floating || 0)}">${Number.isFinite(floating) ? `${money(floating)} / ${percent(profitPct)}` : "--"}</strong></div>
          <div><span>仓位占比</span><strong>${Number.isFinite(position) ? `${fixed(position, 1)}%` : "--"}</strong></div>
          <div><span>风险观察线</span><strong>${Number.isFinite(riskLine) ? `MA20 ${fixed(riskLine)}` : "--"}</strong></div>
        </div>
        <p class="warning-note">${risk.text}。先复核原因和仓位，不要凭当天情绪操作。</p>
      </article>
    `;
  }).join("");
}

function updateAccount() {
  const list = holdings();
  let costTotal = 0;
  let valueTotal = 0;
  let todayProfit = 0;
  let chanceCount = 0;
  list.forEach((item) => {
    const quote = watchQuotes[item.code];
    if (item.cost && item.shares) costTotal += item.cost * item.shares;
    if (quote && item.shares) {
      valueTotal += quote.price * item.shares;
      todayProfit += (quote.price - quote.prevClose) * item.shares;
      if (Math.abs(quote.changePct) >= 3) chanceCount += 1;
    }
  });
  const floatingProfit = valueTotal - costTotal;
  els.equityValue.textContent = valueTotal ? money(valueTotal) : "¥--";
  els.todayValue.textContent = valueTotal ? money(todayProfit) : "¥--";
  els.todayValue.className = cssMove(todayProfit);
  els.profitValue.textContent = valueTotal ? money(floatingProfit) : "¥--";
  els.profitValue.className = cssMove(floatingProfit);
  els.yieldValue.textContent = costTotal ? `收益率 ${percent((floatingProfit / costTotal) * 100)}` : "收益率 --";
  els.chanceValue.textContent = `${chanceCount}/${list.length}`;
  els.profitPageText.textContent = valueTotal
    ? `当前权益 ${money(valueTotal)}，浮动盈亏 ${money(floatingProfit)}，今日 ${money(todayProfit)}。这里只做复盘统计，不替你下单。`
    : "保存持仓并刷新后，这里会汇总收益和风险。";
  if (els.profitEquity) els.profitEquity.textContent = valueTotal ? money(valueTotal) : "¥--";
  if (els.profitFloating) {
    els.profitFloating.textContent = valueTotal ? money(floatingProfit) : "¥--";
    els.profitFloating.className = cssMove(floatingProfit);
  }
  if (els.profitToday) {
    els.profitToday.textContent = valueTotal ? money(todayProfit) : "¥--";
    els.profitToday.className = cssMove(todayProfit);
  }
  renderTodayAction(chanceCount, list.length);
}

function renderTodayAction(chanceCount, total) {
  if (!total) {
    els.actionStatus.textContent = "等待持仓";
    els.todayAction.innerHTML = `
      <strong>先添加持仓，再做纪律检查。</strong>
      <ul>
        <li>填成本和股数后，系统会算浮盈亏和仓位。</li>
        <li>刷新后可以点持仓进入个股评分卡。</li>
      </ul>
    `;
    return;
  }
  if (chanceCount > 0) {
    els.actionStatus.textContent = "有波动";
    els.todayAction.innerHTML = `
      <strong>有 ${chanceCount} 只持仓波动超过 3%，先复核纪律。</strong>
      <ul>
        <li>看是否跌破风险观察线，而不是凭感觉追涨杀跌。</li>
        <li>看仓位是否已经过重，避免单只股票影响全家账户。</li>
      </ul>
    `;
    return;
  }
  els.actionStatus.textContent = "纪律正常";
  els.todayAction.innerHTML = `
    <strong>本轮没有足够质量的新增交易，保持观察。</strong>
    <ul>
      <li>先看强制纪律队列，再看候选是否仍在计划价附近。</li>
      <li>如果现金低于下限，优先复核仓位，而不是继续加仓。</li>
    </ul>
  `;
}

function startWatch() {
  refreshHoldings();
  clearInterval(watchTimer);
  watchTimer = setInterval(refreshHoldings, 30000);
  if (els.startWatchBtn) els.startWatchBtn.textContent = "盯盘中";
}

function makeBrief() {
  refreshHoldings();
  const list = holdings();
  const risky = list.filter((item) => Math.abs(watchQuotes[item.code]?.changePct || 0) >= 3);
  if (!els.briefText) return;
  els.briefText.classList.remove("hidden");
  els.briefText.textContent = list.length
    ? `今日复盘：共 ${list.length} 只持仓，${risky.length} 只波动超过 3%。先看风险观察线，再看是否仍符合原计划。本工具不建议买卖，只帮你整理。`
    : "还没有持仓，先添加股票。";
  setTimeout(makeCloseReview, 500);
}

function updateReviewDate() {
  if (!els.reviewDate) return;
  const now = new Date();
  els.reviewDate.textContent = now.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function makeCloseReview() {
  const items = lastEnrichedHoldings.length
    ? lastEnrichedHoldings
    : holdings().map((item) => ({ ...item, quote: watchQuotes[item.code], metrics: null }));
  if (!items.length) {
    if (els.autoReview) {
      els.autoReview.innerHTML = "还没有持仓。先保存或导入持仓，再生成收盘复盘。";
    }
    return;
  }
  const risks = items.map((item) => ({ item, risk: holdingRisk(item) }));
  const high = risks.filter((row) => row.risk.level === "high");
  const mid = risks.filter((row) => row.risk.level === "mid");
  const totalValue = items.reduce((sum, item) => {
    const quote = item.quote;
    return sum + (quote && item.shares ? quote.price * item.shares : 0);
  }, 0);
  const todayProfit = items.reduce((sum, item) => {
    const quote = item.quote;
    return sum + (quote && item.shares ? (quote.price - quote.prevClose) * item.shares : 0);
  }, 0);
  const topRisks = [...high, ...mid].slice(0, 4);
  const tomorrow = topRisks.length
    ? topRisks.map(({ item, risk }) => `<li>${item.name}：${risk.text}</li>`).join("")
    : "<li>没有明显高风险项，继续按原计划观察。</li>";
  if (els.autoReview) {
    els.autoReview.innerHTML = `
      <strong>今日组合状态</strong>
      当前持仓 ${items.length} 只，估算市值 ${money(totalValue)}，今日盈亏 ${money(todayProfit)}。
      高风险 ${high.length} 只，中风险 ${mid.length} 只。
      <strong>明日优先观察</strong>
      <ul>${tomorrow}</ul>
      <strong>纪律提醒</strong>
      今天复盘重点不是预测明天涨跌，而是确认：仓位是否过重、是否跌破风险观察线、原买入理由是否还成立。
    `;
  }
}

function analyzeThoughts() {
  const text = (els.thoughtText?.value || "").trim();
  if (!els.thoughtReview) return;
  if (!text) {
    els.thoughtReview.classList.remove("hidden");
    els.thoughtReview.innerHTML = "你还没有写总结。可以先写：今天为什么持有、哪里可能看错、明天重点看什么。";
    return;
  }
  const checks = [
    { ok: /成本|买入|持仓|仓位/.test(text), good: "提到了成本/仓位。", bad: "没有提到成本或仓位，建议补上。" },
    { ok: /风险|止损|破位|观察线|MA20|亏损/.test(text), good: "提到了风险或观察线。", bad: "没有写风险线，容易变成情绪化复盘。" },
    { ok: /明天|下次|计划|如果|等待|复核/.test(text), good: "有下一步计划。", bad: "没有下一步条件，建议写清楚什么情况继续观察。" },
    { ok: !/肯定|必涨|稳赢|梭哈|满仓|一定/.test(text), good: "没有明显绝对化词语。", bad: "出现绝对化/冲动词，建议改成条件句。" }
  ];
  els.thoughtReview.classList.remove("hidden");
  els.thoughtReview.innerHTML = `
    <strong>你的总结纪律检查</strong>
    <ul>${checks.map((item) => `<li>${item.ok ? item.good : item.bad}</li>`).join("")}</ul>
    <strong>建议改写方向</strong>
    用“如果...就复核...”替代“肯定会...”。先写风险，再写期待。
  `;
}

function loadSettings() {
  els.darkModeToggle.checked = localStorage.getItem(STORAGE.dark) === "1";
  document.body.classList.toggle("dark", els.darkModeToggle.checked);
  if (els.thoughtText) els.thoughtText.value = localStorage.getItem(STORAGE.thoughts) || "";
}

function saveSettings() {
  localStorage.setItem(STORAGE.dark, els.darkModeToggle.checked ? "1" : "0");
  document.body.classList.toggle("dark", els.darkModeToggle.checked);
  alert("已保存。");
}

function saveThoughts() {
  localStorage.setItem(STORAGE.thoughts, els.thoughtText?.value || "");
  alert("复盘笔记已保存。");
}

function exportData() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    holdings: holdings(),
    thoughts: localStorage.getItem(STORAGE.thoughts) || "",
    dark: localStorage.getItem(STORAGE.dark) || "0"
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stock-lab-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function restoreData() {
  const file = els.restoreDataFile?.files?.[0];
  if (!file) {
    els.restoreDataFile?.click();
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || "{}"));
      if (Array.isArray(data.holdings)) setHoldings(data.holdings);
      if (typeof data.thoughts === "string") localStorage.setItem(STORAGE.thoughts, data.thoughts);
      if (typeof data.dark === "string") localStorage.setItem(STORAGE.dark, data.dark);
      loadSettings();
      alert("本地备份已恢复。");
    } catch {
      alert("备份文件格式不对。");
    }
  };
  reader.readAsText(file, "utf-8");
}

function bindEvents() {
  on(els.searchForm, "submit", (event) => {
    event.preventDefault();
    analyze(els.stockInput.value);
  });
  on(els.refreshBtn, "click", refreshHoldings);
  on($("#quickRefreshBtn"), "click", refreshHoldings);
  on(els.saveHoldingBtn, "click", saveHolding);
  on(els.demoBtn, "click", loadDemoPortfolio);
  on(els.guideBtn, "click", toggleGuide);
  on(els.importBtn, "click", importHoldings);
  on(els.fileImportBtn, "click", importHoldingsFromFile);
  on(els.importFile, "change", importHoldingsFromFile);
  on(els.screenshotFile, "change", previewScreenshot);
  on(els.screenshotBtn, "click", explainScreenshotImport);
  on(els.startWatchBtn, "click", startWatch);
  on(els.briefBtn, "click", makeBrief);
  on(els.saveSettingsBtn, "click", saveSettings);
  on(els.saveThoughtBtn, "click", saveThoughts);
  on(els.makeReviewBtn, "click", makeCloseReview);
  on(els.analyzeThoughtBtn, "click", analyzeThoughts);
  on(els.exportDataBtn, "click", exportData);
  on(els.restoreDataBtn, "click", restoreData);
  on(els.restoreDataFile, "change", restoreData);
  on(els.holdingSort, "change", renderHoldings);
  on(els.clearSearchBtn, "click", () => {
    els.stockInput.value = "";
    els.stockInput.focus();
  });
  on(els.clearDataBtn, "click", () => {
    if (!confirm("确定清空本地持仓和设置吗？")) return;
    Object.values(STORAGE).forEach((key) => localStorage.removeItem(key));
    watchQuotes = {};
    loadSettings();
    setHoldings([]);
  });
  on(els.holdingList, "click", (event) => {
    const removeCode = event.target.dataset.remove;
    if (removeCode) {
      setHoldings(holdings().filter((item) => item.code !== removeCode));
      return;
    }
    const main = event.target.closest(".watch-main");
    if (main) analyze(main.dataset.code);
  });
  document.querySelectorAll(".market-tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".market-tabs button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    });
  });
  document.querySelectorAll(".hot-searches button").forEach((button) => {
    button.addEventListener("click", () => {
      els.stockInput.value = button.dataset.code;
      analyze(button.dataset.code);
    });
  });
  document.querySelectorAll("[data-focus]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.focus);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => target.focus(), 350);
    });
  });
  document.querySelectorAll(".bottom-tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".bottom-tabs button").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(button.dataset.tab).classList.add("active");
    });
  });
}

bindEvents();
loadSettings();
renderHoldings();
updateAccount();
