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
  pendingCount: $("#pendingCount"),
  marketMood: $("#marketMood"),
  marketGrid: $("#marketGrid"),
  marketNote: $("#marketNote"),
  allocationMood: $("#allocationMood"),
  allocationGrid: $("#allocationGrid"),
  sectorAdvice: $("#sectorAdvice")
};

let currentStock = null;
let currentMetrics = null;
let watchQuotes = {};
let lastEnrichedHoldings = [];
let watchTimer = null;
let marketSnapshot = null;

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
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(secid(code))}&fields=f57,f58,f43,f44,f45,f46,f47,f48,f60,f116,f162,f170,f62,f184,f127,f128,f129`;
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
    mainNetInflow: Number(d.f62),
    mainNetInflowPct: Number(d.f184),
    industry: d.f127 || d.f128 || d.f129 || "",
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

async function fetchMarketSnapshot() {
  const indexes = [
    { code: "1.000001", name: "上证指数" },
    { code: "0.399001", name: "深证成指" },
    { code: "0.399006", name: "创业板指" },
    { code: "1.000688", name: "科创50" }
  ];
  const rows = await Promise.all(indexes.map(async (item) => {
    try {
      const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(item.code)}&fields=f57,f58,f43,f60,f170,f48`;
      const res = await fetch(url);
      const json = await res.json();
      const d = json.data || {};
      return {
        code: d.f57 || item.code,
        name: d.f58 || item.name,
        price: Number(d.f43) / 100,
        changePct: Number(d.f170) / 100,
        amount: Number(d.f48)
      };
    } catch {
      return { ...item, price: NaN, changePct: NaN, amount: NaN };
    }
  }));
  const valid = rows.filter((item) => Number.isFinite(item.changePct));
  const avgChange = average(valid.map((item) => item.changePct));
  const totalAmount = valid.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0);
  const amountLevel = !totalAmount ? "成交额未知" : totalAmount >= 1200000000000 ? "放量活跃" : totalAmount >= 800000000000 ? "量能正常" : "成交偏弱";
  const strong = valid.filter((item) => item.changePct >= 0.5).length;
  const weak = valid.filter((item) => item.changePct <= -0.5).length;
  const redCount = valid.filter((item) => item.changePct > 0).length;
  const blueCount = valid.filter((item) => item.changePct < 0).length;
  let cycle = "震荡市";
  if (strong >= 3 && avgChange >= 0.7 && totalAmount >= 800000000000) cycle = "牛市环境";
  if (weak >= 3 || (avgChange <= -0.7 && blueCount >= redCount)) cycle = "熊市环境";
  const mood = !valid.length ? "数据不足" : cycle;
  const tone = cycle === "牛市环境" ? "good" : cycle === "熊市环境" ? "bad" : "flat";
  const discipline = cycle === "熊市环境"
    ? `熊市或弱市里，第一目标是活下来：重仓先降风险，破线股少幻想，反弹先看修复不看反转。今日${amountLevel}，总成交额约 ${formatWanYi(totalAmount)}。`
    : cycle === "牛市环境"
      ? `牛市或强市里，可以提高观察积极度：强趋势、资金流入、回踩不破线的票优先；但高位放量滞涨仍要减仓复核。今日${amountLevel}，总成交额约 ${formatWanYi(totalAmount)}。`
      : `震荡市里，少做追涨杀跌：围绕 MA20 风险线和60日压力做加减仓判断。今日${amountLevel}，总成交额约 ${formatWanYi(totalAmount)}。`;
  return { indexes: rows, avgChange, totalAmount, amountLevel, redCount, blueCount, cycle, mood, tone, discipline };
}

function renderMarketSnapshot(snapshot) {
  if (!els.marketMood || !els.marketGrid || !els.marketNote) return;
  if (!snapshot) {
    els.marketMood.textContent = "等待刷新";
    els.marketNote.textContent = "市场数据未刷新时，不把个股涨跌解释成趋势。";
    return;
  }
  els.marketMood.textContent = snapshot.mood;
  els.marketMood.className = `pill market-${snapshot.tone || "flat"}`;
  els.marketGrid.className = `market-grid market-${snapshot.tone || "flat"}`;
  els.marketGrid.innerHTML = snapshot.indexes.map((item) => `
    <article>
      <span>${item.name}</span>
      <strong class="${cssMove(item.changePct)}">${Number.isFinite(item.price) ? fixed(item.price) : "--"}</strong>
      <em class="${cssMove(item.changePct)}">${percent(item.changePct)} · 成交额 ${formatWanYi(item.amount)}</em>
    </article>
  `).join("");
  els.marketNote.textContent = `${snapshot.mood}：上涨指数 ${snapshot.redCount || 0} 个，下跌指数 ${snapshot.blueCount || 0} 个，主要指数平均涨跌 ${percent(snapshot.avgChange)}，当日成交额约 ${formatWanYi(snapshot.totalAmount)}。${snapshot.discipline}`;
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

function localExpertConclusion(stock, metrics) {
  const state = trend(metrics);
  const nearPressure = Number.isFinite(metrics.high60) && stock.price >= metrics.high60 * 0.97;
  const broken = Number.isFinite(metrics.ma20) && stock.price < metrics.ma20;
  const hot = metrics.rsi > 72 || nearPressure;
  if (broken) {
    return `核心判断：这只现在先按风险处理，不按机会处理。价格低于 MA20 风险观察线 ${fixed(metrics.ma20)}，如果不能重新站回，原先的持有逻辑要降级。`;
  }
  if (hot) {
    return `核心判断：短线偏热，适合复核，不适合凭当天上涨追。当前位置接近压力或 RSI 偏高，后面要看放量突破是否真实。`;
  }
  if (state === "均线多头" && stock.changePct >= 0) {
    return `核心判断：走势暂时健康，但还没到可以放松纪律的程度。均线结构偏强，下一步看资金和量能能否继续配合。`;
  }
  return `核心判断：当前更像震荡观察，既不是强机会，也不是必须回避。重点看 ${fixed(metrics.ma20)} 是否守住，以及 ${fixed(metrics.high60)} 附近能否突破。`;
}

function localVolumeText(stock, metrics) {
  if (!Number.isFinite(metrics.volumeRatio)) return "量能数据不足，不能确认资金态度。";
  if (metrics.volumeRatio >= 1.8 && stock.changePct > 0) return "放量上涨，说明短线资金愿意推，但如果靠近压力位，也可能出现冲高回落。";
  if (metrics.volumeRatio >= 1.8 && stock.changePct < 0) return "放量下跌，说明抛压扩大，要优先看风险观察线。";
  if (metrics.volumeRatio <= 0.75) return "缩量，说明主动交易意愿不强，适合等待确认。";
  return "量能正常，暂时没有形成强验证。";
}

function renderReport(stock, metrics, news) {
  const label = conclusionLabel(stock, metrics);
  const conclusion = localExpertConclusion(stock, metrics);
  const volumeText = localVolumeText(stock, metrics);
  els.reportPanel.classList.remove("hidden");
  els.reportLabel.textContent = label;
  els.reportBody.innerHTML = `
    <section class="report-section pro-summary">
      <strong>核心判断</strong><br>
      ${conclusion}
    </section>
    <section class="report-section">
      <strong>当前仓位建议</strong><br>
      已持有：先看 ${fixed(metrics.ma20)} 是否守住，跌破并放量就把风险级别上调。空仓：不要追当天大涨，等 ${fixed(metrics.ma10)} / ${fixed(metrics.ma20)} 附近回踩后看缩量企稳。重仓：先控制单只仓位，再谈继续观察。
    </section>
    <section class="report-section">
      <strong>一、周期框架</strong><br>
      行业和财务数据在本地兜底模式下不足，周期判断降级。能确认的是价格惯性：${trend(metrics)}，近20日 ${percent(metrics.ret20)}，近60日 ${percent(metrics.ret60)}。如果只靠价格上涨，没有公告、财报和资金流验证，不能把它当成完整周期机会。
    </section>
    <section class="report-section">
      <strong>二、K线执行框架</strong><br>
      趋势判断：${trend(metrics)}。<br>
      关键位置：支撑 ${fixed(metrics.ma20)} / 压力 ${fixed(metrics.high60)}。<br>
      量价配合：${volumeText}<br>
      反证条件：跌破 ${fixed(metrics.ma20)} 且放量，说明中期纪律被破坏；冲到 ${fixed(metrics.high60)} 附近但量能跟不上，说明上方抛压仍重。
    </section>
    <section class="report-section">
      <strong>三、交叉验证</strong><br>
      行情：来自东方财富公开行情接口。<br>
      K线：来自东方财富历史K线接口。<br>
      消息：抓取到 ${news.length} 条公开标题。资金流、龙虎榜、财报和公告原文在本地兜底模式下不足，因此结论置信度降低。
    </section>
    <section class="conclusion-block">
      <strong>标签：${label}</strong><br>
      核心逻辑：先看纪律线，再看量价是否配合，再看消息和财报是否验证。<br>
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
  if (data.market) {
    marketSnapshot = data.market;
    renderMarketSnapshot(marketSnapshot);
  }
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
    <section class="report-section pro-summary"><strong>专业复盘结论</strong><br>${professionalSummary(data)}</section>
    <section class="report-section"><strong>当前仓位建议</strong><br>${data.report.position}</section>
    <section class="report-section"><strong>建议置信度</strong><br>${stockConfidenceSection(data)}</section>
    <section class="report-section"><strong>市场背景</strong><br>${data.report.market || "指数快照未取到，本次市场背景判断降级。"}</section>
    <section class="report-section"><strong>一、周期框架</strong><br>${data.report.cycle}</section>
    <section class="report-section"><strong>二、K线执行框架</strong><br>${data.report.technical}</section>
    <section class="report-section"><strong>三、资金和估值</strong><br>${data.report.capital || "资金流数据不足。"}${renderMoneyFlowLines(data.moneyFlow)}<br>市值：${formatWanYi(stock.marketCap)}；市盈率：${fixed(stock.pe, 2)}。</section>
    <section class="report-section"><strong>四、财报摘要</strong><br>${data.report.finance || "公开源未取到财务摘要。"}${renderFinanceBox(data.finance)}</section>
    <section class="report-section"><strong>五、消息和公告</strong><br>${data.report.news || "免费接口未抓到消息。"}${renderNewsLines(data.news)}${renderAnnouncementLines(data.announcements)}</section>
    <section class="report-section"><strong>六、数据可靠性</strong><br>${data.report.quality || "未校验。"}${renderValidation(data.validation)}</section>
    <section class="report-section"><strong>七、回测结果</strong><br>示例策略历史收益 ${percent(data.backtest.returnPct)}，最大回撤 ${percent(data.backtest.maxDrawdownPct)}，交易次数 ${data.backtest.tradeCount}。${data.backtest.note}</section>
    <section class="conclusion-block"><strong>标签：${data.label}</strong><br>${data.report.risk}</section>
  `;
  if (els.newsCard) els.newsCard.classList.add("hidden");
  els.lastUpdate.textContent = `尾盘纪律检查 · ${stock.updatedAt || data.updatedAt}`;
  els.costInput.placeholder = `成本价，例如 ${fixed(stock.price)}`;
}

function stockConfidenceSection(data) {
  const stock = data.quote || {};
  const metrics = data.metrics || {};
  const validation = data.validation;
  const evidence = [];
  const missing = [];
  if (Number.isFinite(stock.price)) evidence.push(`读取到当前价 ${fixed(stock.price)}。`);
  if (Number.isFinite(metrics?.ma20)) evidence.push(`可计算 MA20 风险观察线 ${fixed(metrics.ma20)}。`);
  if (Number.isFinite(metrics?.ret20)) evidence.push(`近20日涨跌 ${percent(metrics.ret20)}。`);
  if (Number.isFinite(stock.mainNetInflow)) evidence.push(`有资金流字段：主力净流入约 ${formatWanYi(stock.mainNetInflow)}。`);
  else missing.push("资金流字段");
  if (data.moneyFlow?.length) evidence.push(`有 ${data.moneyFlow.length} 天历史资金流。`);
  else missing.push("历史资金流");
  if (data.finance) evidence.push(`有最近一期财务摘要：${data.finance.reportDate || "日期未返回"}。`);
  else missing.push("财报摘要");
  if (data.announcements?.length) evidence.push(`有 ${data.announcements.length} 条公告/财报线索。`);
  else missing.push("公告线索");
  if (stock.industry) evidence.push(`有行业/概念字段：${stock.industry}。`);
  else missing.push("行业字段");
  if (data.market?.indexes?.some((item) => Number.isFinite(item.changePct))) evidence.push(`有市场背景：${data.market.mood}。`);
  else missing.push("市场背景");
  if (validation?.checks?.length) {
    evidence.push(`数据校验结果：${validation.level}，校验分 ${validation.score}/100。`);
  } else {
    missing.push("多数据源校验");
  }
  missing.push("公告原文逐字核对", "龙虎榜明细", "机构持仓变化");
  const confidence = validation?.score >= 75 ? "高" : validation?.score >= 50 ? "中" : "低";
  return `
    当前建议置信度：${confidence}。<br>
    <b>依据：</b><ul>${evidence.map((item) => `<li>${item}</li>`).join("")}</ul>
    <b>缺失：</b><ul>${missing.slice(0, 5).map((item) => `<li>${item}</li>`).join("")}</ul>
  `;
}

function professionalSummary(data) {
  const stock = data.quote || {};
  const metrics = data.metrics || {};
  const market = data.market || marketSnapshot;
  const price = Number(stock.price);
  const ma20 = Number(metrics.ma20);
  const ma10 = Number(metrics.ma10);
  const high60 = Number(metrics.high60);
  const rsi = Number(metrics.rsi);
  const volumeRatio = Number(metrics.volumeRatio);
  const mainFlow = Number(stock.mainNetInflow);
  const state = trend(metrics);
  const broken = Number.isFinite(price) && Number.isFinite(ma20) && price < ma20;
  const nearPressure = Number.isFinite(price) && Number.isFinite(high60) && price >= high60 * 0.97;
  const hot = Number.isFinite(rsi) && rsi >= 72;
  const strongMoney = Number.isFinite(mainFlow) && mainFlow > 0;
  const weakMoney = Number.isFinite(mainFlow) && mainFlow < 0;
  const marketCycle = market?.cycle || market?.mood || "市场未知";
  let stance = "震荡等待";
  let verdict = "方向不够清楚，先等关键位置给答案。";
  if (broken) {
    stance = marketCycle === "熊市环境" ? "熊市防守" : "偏弱防守";
    verdict = `价格已经低于 MA20 ${fixed(ma20)}，当前重点不是找机会，而是确认风险有没有继续扩大。`;
  } else if (hot && nearPressure) {
    stance = "高位复核";
    verdict = `短线热度偏高，并且靠近60日压力 ${fixed(high60)}，这里更适合复核仓位和兑现纪律，不适合情绪追高。`;
  } else if (state === "均线多头" && strongMoney && marketCycle === "牛市环境") {
    stance = "牛市偏多";
    verdict = `牛市环境叠加个股均线多头和资金流入，属于偏强观察对象；更适合顺势持有或等回踩加仓，不适合在压力位追高。`;
  } else if (state === "均线多头" && strongMoney && marketCycle !== "熊市环境") {
    stance = "偏强观察";
    verdict = `趋势和资金暂时配合，属于可以继续观察强度的状态，但仍要看 ${fixed(high60)} 附近能否有效突破。`;
  } else if (state === "均线多头") {
    stance = "趋势观察";
    verdict = `均线结构偏强，但资金或市场背景验证还不够，不能直接升级成强机会。`;
  } else if (marketCycle === "熊市环境") {
    stance = "熊市谨慎";
    verdict = "市场背景偏弱，个股即使反弹也先按修复看，重仓和破线项优先处理。";
  }
  const evidence = [
    `趋势：${state}，近20日 ${percent(metrics.ret20)}，近60日 ${percent(metrics.ret60)}。`,
    `位置：MA10 ${fixed(ma10)}，MA20 ${fixed(ma20)}，60日压力 ${fixed(high60)}，当前价 ${fixed(price)}。`,
    `量能：${Number.isFinite(volumeRatio) ? `${fixed(volumeRatio, 2)} 倍20日均量` : "未取到"}；RSI ${fixed(rsi, 0)}。`,
    Number.isFinite(mainFlow) ? `资金：当日主力净流入 ${formatWanYi(mainFlow)}，占比 ${fixed(stock.mainNetInflowPct, 2)}%。` : "资金：未取到当日主力资金。",
    market ? `市场：${marketCycle}，主要指数平均 ${percent(market.avgChange)}，成交额约 ${formatWanYi(market.totalAmount)}，${market.amountLevel || "成交额待确认"}。` : "市场：未取到指数背景。"
  ];
  const counter = broken
    ? `反证条件：如果重新站回 MA20 ${fixed(ma20)}，并且量能不萎缩，偏弱判断可以降级为修复观察。`
    : `反证条件：如果跌破 MA20 ${fixed(ma20)} 且放量，原有观察逻辑降级；如果冲到 ${fixed(high60)} 附近但量能跟不上，说明压力仍重。`;
  const action = broken || marketCycle === "熊市环境"
    ? "加减仓倾向：偏减仓/防守。持有者先控制风险和仓位，空仓者等待重新站回风险线后再观察。"
    : nearPressure || hot
      ? "加减仓倾向：偏减仓复核。持有者优先复核是否分批兑现或降低仓位，空仓者不追高。"
      : marketCycle === "牛市环境" && state === "均线多头" && strongMoney
        ? "加减仓倾向：可加仓观察。只在回踩不破 MA10/MA20、资金继续流入时小幅增加，不在急拉后追。"
        : weakMoney
          ? "加减仓倾向：暂不加仓。价格没破线但资金偏谨慎，先观察资金是否连续转正。"
          : "加减仓倾向：继续持有观察。围绕关键线，不因为单日涨跌临时改变计划。";
  return `
    <div class="stance-line"><span>${stance}</span>${verdict}</div>
    <ul>${evidence.map((item) => `<li>${item}</li>`).join("")}</ul>
    <p><b>${counter}</b></p>
    <p><b>${action}</b></p>
  `;
}

function formatWanYi(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  if (Math.abs(num) >= 100000000) return `${(num / 100000000).toFixed(2)}亿`;
  if (Math.abs(num) >= 10000) return `${(num / 10000).toFixed(2)}万`;
  return num.toFixed(2);
}

function inferSector(item) {
  const text = `${item.quote?.industry || ""} ${item.name || ""} ${item.code || ""}`;
  if (/白酒|茅台|五粮液|泸州|酒/.test(text)) return "白酒消费";
  if (/银行|招商|平安|兴业|工商|农业|建设/.test(text)) return "银行金融";
  if (/证券|券商|东方财富|中信证券|华泰/.test(text)) return "券商金融";
  if (/半导体|芯片|科创|集成|设备/.test(text)) return "半导体";
  if (/新能源|电池|锂|光伏|宁德|比亚迪/.test(text)) return "新能源";
  if (/医药|医疗|创新药|恒瑞|迈瑞/.test(text)) return "医药";
  if (/ETF|基金|混合|指数/.test(text)) return "基金ETF";
  return item.quote?.industry || "未分类";
}

function portfolioAllocation(items) {
  let totalValue = 0;
  let portfolioBase = 0;
  const rows = items.map((item) => {
    const value = item.quote && item.shares ? item.quote.price * item.shares : 0;
    totalValue += value;
    portfolioBase = Math.max(portfolioBase, Number(item.portfolio) || 0);
    return { item, value, sector: inferSector(item) };
  });
  const base = portfolioBase || totalValue;
  const totalPosition = base ? totalValue / base * 100 : null;
  const topStock = rows.slice().sort((a, b) => b.value - a.value)[0];
  const topStockPct = topStock && base ? topStock.value / base * 100 : null;
  const sectors = rows.reduce((map, row) => {
    map.set(row.sector, (map.get(row.sector) || 0) + row.value);
    return map;
  }, new Map());
  const sectorRows = [...sectors.entries()]
    .map(([name, value]) => ({ name, value, pct: base ? value / base * 100 : null }))
    .sort((a, b) => b.value - a.value);
  return { totalValue, base, totalPosition, topStock, topStockPct, sectors: sectorRows };
}

function renderAllocation(items) {
  if (!els.allocationMood || !els.allocationGrid || !els.sectorAdvice) return;
  const allocation = portfolioAllocation(items);
  if (!items.length || !allocation.totalValue) {
    els.allocationMood.textContent = "等待持仓";
    els.allocationGrid.innerHTML = `
      <article><span>总仓位</span><strong>--</strong><em>等待数据</em></article>
      <article><span>最大单只</span><strong>--</strong><em>等待数据</em></article>
      <article><span>板块集中</span><strong>--</strong><em>等待数据</em></article>
    `;
    els.sectorAdvice.textContent = "导入或保存持仓后，会给出仓位和板块建议。";
    return;
  }
  const marketCycle = marketSnapshot?.cycle || marketSnapshot?.mood || "市场未知";
  const topSector = allocation.sectors[0];
  const topName = allocation.topStock?.item?.name || "--";
  const totalText = Number.isFinite(allocation.totalPosition) ? `${fixed(allocation.totalPosition, 1)}%` : "--";
  const topStockText = Number.isFinite(allocation.topStockPct) ? `${fixed(allocation.topStockPct, 1)}%` : "--";
  const sectorText = topSector && Number.isFinite(topSector.pct) ? `${fixed(topSector.pct, 1)}%` : "--";
  let mood = "仓位正常";
  if (allocation.totalPosition >= 90 || allocation.topStockPct >= 50 || topSector?.pct >= 65) mood = "集中度高";
  else if (allocation.totalPosition >= 75 || allocation.topStockPct >= 35 || topSector?.pct >= 50) mood = "需要复核";
  els.allocationMood.textContent = mood;
  els.allocationGrid.innerHTML = `
    <article><span>总仓位</span><strong>${totalText}</strong><em>${marketCycle}</em></article>
    <article><span>最大单只</span><strong>${topStockText}</strong><em>${topName}</em></article>
    <article><span>板块集中</span><strong>${sectorText}</strong><em>${topSector?.name || "--"}</em></article>
  `;
  const sectorList = allocation.sectors.slice(0, 4).map((row) => `${row.name} ${fixed(row.pct, 1)}%`).join("，");
  const marketAdvice = marketCycle === "熊市环境"
    ? "熊市环境下，总仓位和单只仓位都要偏保守，优先降低弱趋势和破 MA20 的持仓。"
    : marketCycle === "牛市环境"
      ? "牛市环境下可以保留强趋势仓位，但新增资金优先给回踩不破线、资金流入的板块。"
      : "震荡市里不要让单一板块过重，强弱轮动快，仓位要留余地。";
  const concentrationAdvice = topSector?.pct >= 50
    ? `板块建议：${topSector.name} 暴露偏高，后续不宜继续把新增资金压在同一板块，除非该板块仍是市场主线且个股没有破线。`
    : "板块建议：当前板块集中度没有特别极端，可以继续按强弱排序观察。";
  els.sectorAdvice.innerHTML = `
    <strong>${marketAdvice}</strong>
    <p>${concentrationAdvice}</p>
    <p>当前板块分布：${sectorList || "暂无"}。</p>
  `;
}

function renderNewsLines(news = []) {
  if (!news.length) return "";
  return `<ul>${news.slice(0, 4).map((item) => `<li>${item.date ? `${item.date}：` : ""}${item.title}</li>`).join("")}</ul>`;
}

function renderAnnouncementLines(list = []) {
  if (!list.length) return "<p class=\"muted-text\">公告/财报线索未取到，不能把消息面当成强依据。</p>";
  return `
    <p class="muted-text">公告/财报线索：</p>
    <ul>${list.slice(0, 5).map((item) => `<li>${item.date ? `${item.date}：` : ""}${item.title}</li>`).join("")}</ul>
  `;
}

function renderMoneyFlowLines(list = []) {
  if (!list.length) return "<p class=\"muted-text\">历史资金流未取到，资金连续性暂不能确认。</p>";
  return `
    <p class="muted-text">近几日资金流：</p>
    <ul>${list.slice(-5).map((item) => `<li>${item.date}：主力净流入 ${formatWanYi(item.mainNetInflow)}</li>`).join("")}</ul>
  `;
}

function renderFinanceBox(finance) {
  if (!finance) return "<p class=\"muted-text\">公开源未返回财报摘要，盈利质量判断降级。</p>";
  return `
    <ul>
      <li>报告期：${finance.reportDate || "--"}</li>
      <li>营收：${formatWanYi(finance.revenue)}，同比 ${percent(finance.revenueYoY)}</li>
      <li>归母净利润：${formatWanYi(finance.netProfit)}，同比 ${percent(finance.profitYoY)}</li>
      <li>ROE：${percent(finance.roe)}</li>
    </ul>
  `;
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
  recognizeScreenshotHoldings();
}

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error("OCR 加载失败"));
    script.onerror = () => reject(new Error("OCR 库加载失败，请检查网络"));
    document.head.appendChild(script);
  });
}

function parseOcrHoldings(text) {
  const normalized = text
    .replace(/[，｜|]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/([0-9]{6})/g, "\n$1")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows = [];
  normalized.forEach((line) => {
    const code = (line.match(/\b[03658]\d{5}\b/) || [])[0];
    if (!code) return;
    const nums = line.match(/\d+(?:\.\d+)?/g) || [];
    const cleaned = line.replace(code, "").replace(/[0-9.,%+\-¥￥]/g, " ").replace(/\s+/g, " ").trim();
    const name = cleaned.split(" ").find((part) => /[\u4e00-\u9fa5A-Za-z]{2,}/.test(part)) || code;
    const numeric = nums.map(Number).filter((num) => Number.isFinite(num) && String(num).length <= 12);
    const cost = numeric.find((num) => num > 0 && num < 10000 && Math.abs(num - Number(code)) > 1) || 0;
    const shares = numeric.find((num) => num >= 100 && Number.isInteger(num / 100)) || 0;
    if (shares) rows.push({ code, name, cost, shares, portfolio: 0 });
  });
  return rows;
}

async function recognizeScreenshotHoldings() {
  const file = els.screenshotFile?.files?.[0];
  if (!file) {
    els.screenshotFile?.click();
    return;
  }
  if (els.screenshotHint) els.screenshotHint.textContent = "正在本地识别截图，第一次加载 OCR 会慢一些...";
  try {
    const Tesseract = await loadTesseract();
    const result = await Tesseract.recognize(file, "chi_sim+eng");
    const text = result?.data?.text || "";
    const parsed = parseOcrHoldings(text);
    if (!parsed.length) {
      if (els.screenshotHint) els.screenshotHint.textContent = "没有识别出持仓。请换更清晰截图，或用 CSV/手动粘贴。";
      return;
    }
    const merged = [...parsed, ...holdings()].reduce((map, item) => {
      map.set(item.code, item);
      return map;
    }, new Map());
    setHoldings([...merged.values()]);
    if (els.screenshotHint) {
      els.screenshotHint.textContent = `识别到 ${parsed.length} 条持仓，已导入。请人工核对成本价和股数，OCR 可能识别错数字。`;
    }
    refreshHoldings();
  } catch (error) {
    if (els.screenshotHint) els.screenshotHint.textContent = `${error.message || "OCR 识别失败"}。可改用 CSV 或手动粘贴。`;
  }
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
    if (Number.isFinite(position)) exposure += position;
    const risk = holdingRisk(item);
    if (risk.level === "low") return;
    const plan = holdingPlan(item, risk);
    rows.push({
      level: risk.level === "high" ? "hot" : "warn",
      title: `${item.name}：${plan.label}`,
      text: plan.text
    });
  });
  if (riskExposure) riskExposure.textContent = items.length ? `${fixed(exposure, 0)}%` : "--";
  if (disciplineQueue) disciplineQueue.textContent = rows.length;
  riskCount.textContent = `${rows.length} 条`;
  riskList.innerHTML = rows.length
    ? rows.slice(0, 6).map((row) => `<div class="risk-row ${row.level}"><strong>${row.title}</strong><span>${row.text}</span></div>`).join("")
    : `<div class="risk-row"><strong>暂无需要优先处理的持仓</strong><span>没有识别到需要立刻降风险的组合矛盾。继续按计划观察，不代表没有风险。</span></div>`;
  if (els.pendingCount) els.pendingCount.textContent = `${rows.length} 条`;
  if (els.pendingList) {
    els.pendingList.innerHTML = rows.length
      ? rows.map((row) => `<div class="risk-row ${row.level}"><strong>${row.title}</strong><span>${row.text}</span></div>`).join("")
      : `<div class="risk-row"><strong>暂无待复核项目</strong><span>刷新持仓后，会把真正需要优先处理的持仓放到这里。</span></div>`;
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
    els.portfolioInsight.textContent = `今天优先看 ${high} 个高风险项。组合仓位约 ${fixed(totalPosition, 0)}%，先确认是否有重仓、破线或大幅浮亏。${marketSnapshot ? `市场背景：${marketSnapshot.mood}。` : ""}`;
  } else if (warn) {
    els.healthPill.textContent = "有提醒";
    els.portfolioInsight.textContent = `今天有 ${warn} 个提醒项。先看波动较大的持仓，再决定是否继续观察。${marketSnapshot ? `市场背景：${marketSnapshot.mood}。` : ""}`;
  } else {
    els.healthPill.textContent = "较平稳";
    els.portfolioInsight.textContent = `当前没有明显高风险提示。组合仓位约 ${fixed(totalPosition, 0)}%，继续按原计划复盘。${marketSnapshot ? `市场背景：${marketSnapshot.mood}。` : ""}`;
  }
}

async function refreshHoldings() {
  if (els.refreshBtn) {
    els.refreshBtn.disabled = true;
    els.refreshBtn.textContent = "刷新中";
  }
  try {
    marketSnapshot = await fetchMarketSnapshot();
    renderMarketSnapshot(marketSnapshot);
  } catch {
    renderMarketSnapshot(marketSnapshot);
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
  renderAllocation(enriched);
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
  if (!quote) return { level: "mid", text: "行情读取失败，暂时无法判断。", badge: "待确认", facts: {} };
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
  const facts = { position, profitPct, belowRiskLine, dayChange: quote.changePct, rsi: metrics?.rsi, ma20: metrics?.ma20, high60: metrics?.high60, ma10: metrics?.ma10 };
  if (points >= 4) return { level: "high", badge: "高风险", text: reasons.join("，"), facts };
  if (points >= 2) return { level: "mid", badge: "中风险", text: reasons.join("，"), facts };
  return { level: "low", badge: "低风险", text: reasons.join("，"), facts };
}

function holdingPlan(item, risk) {
  const quote = item.quote;
  const metrics = item.metrics;
  if (!quote) {
    return {
      label: "先等数据",
      text: "行情没有读到，不要凭旧价格做判断，先刷新或换数据源核对。"
    };
  }
  const marketValue = item.shares ? quote.price * item.shares : 0;
  const position = item.portfolio ? (marketValue / item.portfolio) * 100 : null;
  const profitPct = item.cost ? ((quote.price - item.cost) / item.cost) * 100 : null;
  const aboveMa20 = metrics?.ma20 ? quote.price >= metrics.ma20 : null;
  const nearPressure = metrics?.high60 ? quote.price >= metrics.high60 * 0.97 : false;
  const strongRebound = quote.changePct >= 4;
  const heavy = Number.isFinite(position) && position >= 50;
  const loss = Number.isFinite(profitPct) && profitPct < 0;
  const deepLoss = Number.isFinite(profitPct) && profitPct <= -8;
  const marketCycle = marketSnapshot?.cycle || marketSnapshot?.mood || "市场未知";
  const bull = marketCycle === "牛市环境";
  const bear = marketCycle === "熊市环境";
  const flat = marketCycle === "震荡市" || marketCycle === "市场震荡";
  const strongTrend = trend(metrics || {}) === "均线多头" && aboveMa20 === true;
  const weakTrend = trend(metrics || {}) === "均线空头" || aboveMa20 === false;
  const moneyIn = Number.isFinite(quote.mainNetInflow) && quote.mainNetInflow > 0;
  const moneyOut = Number.isFinite(quote.mainNetInflow) && quote.mainNetInflow < 0;

  if (heavy && loss && strongRebound) {
    return {
      label: "减仓降风险",
      text: `市场状态：${marketCycle}。这只的核心矛盾是重仓浮亏：仓位 ${fixed(position, 1)}%，今日反弹 ${percent(quote.changePct)}，但仍相对成本 ${percent(profitPct)}。我的判断是借反弹修正仓位，而不是继续加。若靠近成本价、MA20 或60日压力位，优先把单只仓位降到自己能承受的范围；只有重新站稳风险线且资金持续流入，才把它从“风险处理”改回“持有观察”。`
    };
  }

  if (bear && weakTrend) {
    return {
      label: "防守回避",
      text: `市场状态：${marketCycle}，这只又处于弱趋势或跌破风险线。我的判断是先防守：不加仓，不摊平，优先看能否重新站回 MA20 ${metrics?.ma20 ? fixed(metrics.ma20) : "--"}。如果放量下跌或资金继续流出，应该把仓位往下压。`
    };
  }

  if (bull && strongTrend && moneyIn && !heavy && !nearPressure && !deepLoss) {
    return {
      label: "可加仓观察",
      text: `市场状态：${marketCycle}，个股趋势为均线多头，资金流入为正，且仓位没有过重。我的判断是可以列入加仓观察，但不是追高：优先等回踩 MA10 ${metrics?.ma10 ? fixed(metrics.ma10) : "--"} 或 MA20 ${metrics?.ma20 ? fixed(metrics.ma20) : "--"} 不破，再考虑小幅增加；如果追到60日压力 ${metrics?.high60 ? fixed(metrics.high60) : "--"} 附近，反而要谨慎。`
    };
  }

  if (flat && nearPressure) {
    return {
      label: "压力位减仓",
      text: `市场状态：${marketCycle}，不是单边牛市；个股接近60日压力 ${metrics?.high60 ? fixed(metrics.high60) : "--"}。我的判断是偏兑现而不是追买：持有者可复核是否降低一部分仓位，空仓者等突破后回踩确认，不在压力区情绪进场。`
    };
  }

  if (heavy && strongRebound) {
    return {
      label: "减仓复核",
      text: `市场状态：${marketCycle}。今天涨幅 ${percent(quote.changePct)}，但单只仓位约 ${fixed(position, 1)}%，组合风险集中。我的判断是上涨先用于复核仓位，不用于继续加码；若冲高到压力位 ${metrics?.high60 ? fixed(metrics.high60) : "--"} 附近但量能没有继续放大，应考虑降低集中度。`
    };
  }

  if (heavy && loss) {
    return {
      label: "减仓降风险",
      text: `市场状态：${marketCycle}。这只同时满足重仓和浮亏，问题优先级高于普通波动。我的判断是先降低账户对这一只的依赖，不要继续摊平；只有重新站稳 MA20 且资金转为连续流入，才恢复为持有观察。`
    };
  }

  if (risk.level === "high") {
    return {
      label: "防守处理",
      text: `市场状态：${marketCycle}。这只已经进入高风险队列。我的判断是先做减法：暂停新增投入，检查 ${metrics?.ma20 ? fixed(metrics.ma20) : "MA20"} 这条风险观察线是否有效；若仓位超计划，先降回计划内，再谈继续持有。`
    };
  }
  if (Number.isFinite(profitPct) && profitPct <= -8) {
    return {
      label: "暂停补仓",
      text: `当前距离成本 ${percent(profitPct)}，已经不是小波动。规划上先暂停补仓，把买入理由重新写一遍：如果理由只剩“亏了不想卖”，那就是风险；如果基本面和技术线都还支持，再考虑继续观察。`
    };
  }
  if (Number.isFinite(position) && position > 35) {
    return {
      label: "控制仓位",
      text: `市场状态：${marketCycle}。单只仓位 ${fixed(position, 1)}% 偏重。我的判断是：牛市里也不能让一只股票决定全家账户，后续以降低集中度为主，不再把新增资金继续集中到这一只。`
    };
  }
  if (Number.isFinite(profitPct) && profitPct >= 12 && nearPressure) {
    return {
      label: "分批兑现复核",
      text: "已有较明显浮盈且接近上方压力区，建议把分批兑现计划拿出来复核，而不是只盯着还能不能继续涨。"
    };
  }
  if (aboveMa20 === false) {
    return {
      label: "防守回避",
      text: `市场状态：${marketCycle}。价格在 MA20 风险观察线下方，说明中期纪律已经受损。我的判断是不加仓，先等重新站回 ${metrics?.ma20 ? fixed(metrics.ma20) : "--"}；若市场同时偏弱，应该降低仓位暴露。`
    };
  }
  if (bull && strongTrend && !moneyOut && !heavy) {
    return {
      label: "继续持有偏多",
      text: `市场状态：${marketCycle}，个股趋势未破坏。我的判断是继续持有偏多，但加仓要等回踩确认，不追日内拉升；若跌破 MA20 ${metrics?.ma20 ? fixed(metrics.ma20) : "--"}，立刻降级为风险观察。`
    };
  }
  if (metrics?.ma10 && quote.price > metrics.ma10 * 1.08) {
    return {
      label: "等待回踩",
      text: `市场状态：${marketCycle}。短线离 MA10 偏远，空仓不要追，已持有看量能和回踩承接；如果牛市环境继续放量，可以保留观察，但加仓仍等回踩。`
    };
  }
  return {
    label: "继续持有观察",
    text: `市场状态：${marketCycle}。当前没有明显破坏纪律的信号。我的判断是继续持有观察：盯成本价 ${item.cost || "--"}、风险线 ${metrics?.ma20 ? fixed(metrics.ma20) : "--"}、压力位 ${metrics?.high60 ? fixed(metrics.high60) : "--"} 和仓位 ${Number.isFinite(position) ? `${fixed(position, 1)}%` : "--"}。`
  };
}

function recommendationEvidence(item, risk, plan) {
  const quote = item.quote;
  const metrics = item.metrics;
  const evidence = [];
  const missing = [];
  let score = 45;
  if (!quote) {
    return {
      confidence: "低",
      score: 20,
      evidence: ["没有读取到最新行情。"],
      missing: ["行情数据", "历史K线", "资金流", "公告和财报"]
    };
  }
  const marketValue = item.shares ? quote.price * item.shares : null;
  const position = marketValue && item.portfolio ? (marketValue / item.portfolio) * 100 : null;
  const profitPct = item.cost ? ((quote.price - item.cost) / item.cost) * 100 : null;
  if (Number.isFinite(position)) {
    evidence.push(`单只仓位约 ${fixed(position, 1)}%。`);
    score += 10;
    if (position > 35) evidence.push("仓位超过 35% 警戒线，组合风险集中。");
  } else {
    missing.push("账户总额，无法准确判断仓位轻重");
  }
  if (Number.isFinite(profitPct)) {
    evidence.push(`当前相对成本 ${percent(profitPct)}。`);
    score += 10;
  } else {
    missing.push("成本价，无法判断浮盈浮亏压力");
  }
  if (Number.isFinite(quote.changePct)) {
    evidence.push(`今日涨跌 ${percent(quote.changePct)}。`);
    score += 8;
  }
  if (metrics?.ma20) {
    evidence.push(`MA20 风险观察线 ${fixed(metrics.ma20)}，当前价 ${fixed(quote.price)}。`);
    score += 12;
  } else {
    missing.push("MA20 风险观察线");
  }
  if (metrics?.high60) {
    evidence.push(`60日压力参考 ${fixed(metrics.high60)}。`);
    score += 6;
  }
  if (Number.isFinite(quote.mainNetInflow)) {
    evidence.push(`主力净流入约 ${formatWanYi(quote.mainNetInflow)}。`);
    score += 8;
  } else {
    missing.push("资金流细项");
  }
  missing.push("最新公告原文", "财报细项", "行业景气数据");
  if (risk.level === "high") score += 8;
  if (/借反弹|降风险|暂停|控制/.test(plan.label)) score += 6;
  score = Math.max(0, Math.min(92, Math.round(score - Math.min(missing.length, 5) * 4)));
  const confidence = score >= 75 ? "高" : score >= 55 ? "中" : "低";
  return { confidence, score, evidence, missing };
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
    const plan = holdingPlan(item, risk);
    const explain = recommendationEvidence(item, risk, plan);
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
        <div class="plan-box">
          <span>当前建议</span>
          <strong>${plan.label}</strong>
          <p>${plan.text}</p>
        </div>
        <div class="evidence-box">
          <strong>建议置信度：${explain.confidence}（${explain.score}/100）</strong>
          <span>主要依据</span>
          <ul>${explain.evidence.slice(0, 5).map((text) => `<li>${text}</li>`).join("")}</ul>
          <span>缺失数据</span>
          <ul>${explain.missing.slice(0, 5).map((text) => `<li>${text}</li>`).join("")}</ul>
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
  if (!lastEnrichedHoldings.length) {
    renderAllocation(list.map((item) => ({ ...item, quote: watchQuotes[item.code], metrics: null })));
  }
}

function renderTodayAction(chanceCount, total) {
  const marketLine = marketSnapshot ? `<li>市场背景：${marketSnapshot.mood}。${marketSnapshot.discipline}</li>` : "";
  if (!total) {
    els.actionStatus.textContent = "等待持仓";
    els.todayAction.innerHTML = `
      <strong>先添加持仓，再做纪律检查。</strong>
      <ul>
        <li>填成本和股数后，系统会算浮盈亏和仓位。</li>
        <li>刷新后可以点持仓进入个股评分卡。</li>
        ${marketLine}
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
        ${marketLine}
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
      ${marketLine}
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
  const positionRows = items.map((item) => {
    const quote = item.quote;
    const value = quote && item.shares ? quote.price * item.shares : 0;
    const position = item.portfolio ? value / item.portfolio * 100 : (totalValue ? value / totalValue * 100 : null);
    return { item, value, position };
  }).filter((row) => Number.isFinite(row.position)).sort((a, b) => b.position - a.position);
  const topPosition = positionRows[0];
  const concentrationText = topPosition && topPosition.position >= 50
    ? `组合集中度偏高：${topPosition.item.name} 单只仓位约 ${fixed(topPosition.position, 1)}%。这类情况优先处理“单只股票影响全家账户”的问题，不要先纠结当天涨跌。`
    : topPosition && topPosition.position >= 35
      ? `组合有集中度提醒：${topPosition.item.name} 单只仓位约 ${fixed(topPosition.position, 1)}%，需要确认是否超过原计划。`
      : "组合集中度暂未显示明显过重，但仍需看每只股票的风险观察线。";
  const marketText = marketSnapshot
    ? `市场背景：${marketSnapshot.mood}，主要指数平均涨跌 ${percent(marketSnapshot.avgChange)}。${marketSnapshot.discipline}`
    : "市场背景：指数快照未取到，本轮市场层判断降级。";
  const topRisks = [...high, ...mid].slice(0, 4);
  const tomorrow = topRisks.length
    ? topRisks.map(({ item, risk }) => {
      const plan = holdingPlan(item, risk);
      return `<li>${item.name}：${plan.label}。${plan.text}</li>`;
    }).join("")
    : "<li>没有明显高风险项，继续按原计划观察。</li>";
  const portfolioPlan = high.length
    ? "组合建议：先处理高风险持仓，暂停新增交易，把资金暴露降到自己睡得着的范围。"
    : mid.length
      ? "组合建议：今天不急着扩大仓位，先复核中风险持仓的成本、风险线和仓位。"
      : "组合建议：组合暂时平稳，可以继续按计划观察，但不要因为平稳就随意加仓。";
  const planEvidence = risks.slice(0, 5).map(({ item, risk }) => {
    const plan = holdingPlan(item, risk);
    const explain = recommendationEvidence(item, risk, plan);
    return `<li>${item.name}：${plan.label}，置信度${explain.confidence}；依据：${explain.evidence.slice(0, 2).join(" ")}</li>`;
  }).join("");
  if (els.autoReview) {
    els.autoReview.innerHTML = `
      <strong>今日组合状态</strong>
      当前持仓 ${items.length} 只，估算市值 ${money(totalValue)}，今日盈亏 ${money(todayProfit)}。
      高风险 ${high.length} 只，中风险 ${mid.length} 只。
      <strong>市场和仓位背景</strong>
      ${marketText}<br>${concentrationText}
      <strong>当前规划建议</strong>
      ${portfolioPlan}
      <ul>${planEvidence}</ul>
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
fetchMarketSnapshot()
  .then((snapshot) => {
    marketSnapshot = snapshot;
    renderMarketSnapshot(snapshot);
    renderTodayAction(0, holdings().length);
  })
  .catch(() => renderMarketSnapshot(null));

