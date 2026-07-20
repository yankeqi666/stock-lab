const aliases = {
  "贵州茅台": "600519",
  "茅台": "600519",
  "五粮液": "000858",
  "宁德时代": "300750",
  "比亚迪": "002594",
  "东方财富": "300059",
  "招商银行": "600036",
  "平安银行": "000001",
  "科创半导体": "589020",
  "半导体": "589020"
};

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  return handle(url.searchParams.get("code") || "");
}

export async function onRequestPost({ request }) {
  const body = await request.json().catch(() => ({}));
  return handle(body.code || "");
}

async function handle(input) {
  try {
    const quote = await fetchQuote(input);
    const rows = await fetchHistory(quote.code);
    const metrics = calcMetrics(rows);
    const payload = {
      quote,
      metrics,
      score: scoreOf(quote, metrics),
      label: labelFor(quote, metrics),
      strategy: strategyCards(metrics),
      backtest: backtest(rows),
      report: buildReport(quote, metrics),
      updatedAt: new Date().toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })
    };
    return json(payload);
  } catch (error) {
    return json({ error: error.message || "分析失败" }, 500);
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function normalize(value) {
  const raw = String(value || "").trim();
  return aliases[raw] || raw.replace(/[^\dA-Za-z.]/g, "");
}

function secid(code) {
  if (code.includes(".")) return code;
  if (/^[689]/.test(code)) return `1.${code}`;
  return `0.${code}`;
}

async function eastmoney(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 StockLab/1.0",
      "referer": "https://quote.eastmoney.com/"
    }
  });
  if (!response.ok) throw new Error("公开行情接口暂时不可用");
  return response.json();
}

async function fetchQuote(input) {
  const code = normalize(input);
  if (!code) throw new Error("请输入股票代码或名称");
  const fields = "f57,f58,f43,f44,f45,f46,f47,f48,f60,f116,f162,f170";
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(secid(code))}&fields=${fields}`;
  const data = (await eastmoney(url)).data;
  if (!data || data.f43 === "-") throw new Error("没有找到这只股票");
  return {
    code: data.f57 || code,
    name: data.f58 || code,
    price: num(data.f43) / 100,
    changePct: num(data.f170) / 100,
    open: num(data.f46) / 100,
    high: num(data.f44) / 100,
    low: num(data.f45) / 100,
    prevClose: num(data.f60) / 100,
    volume: num(data.f47),
    amount: num(data.f48),
    marketCap: num(data.f116),
    pe: num(data.f162) / 100,
    source: "东方财富公开行情接口",
    updatedAt: new Date().toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })
  };
}

async function fetchHistory(input) {
  const code = normalize(input);
  const fields1 = "f1,f2,f3,f4,f5,f6";
  const fields2 = "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61";
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${encodeURIComponent(secid(code))}&klt=101&fqt=1&beg=0&end=20500101&fields1=${fields1}&fields2=${fields2}`;
  const klines = (await eastmoney(url)).data?.klines || [];
  const rows = klines.map((line) => {
    const [date, open, close, high, low, volume, amount, amplitude, dayPct, change, turnover] = line.split(",");
    return { date, open: num(open), close: num(close), high: num(high), low: num(low), volume: num(volume), amount: num(amount), amplitude: num(amplitude), dayPct: num(dayPct), change: num(change), turnover: num(turnover) };
  }).filter((item) => Number.isFinite(item.close));
  if (!rows.length) throw new Error("历史K线为空");
  return rows;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function avg(values) {
  const list = values.filter(Number.isFinite);
  return list.length ? list.reduce((sum, item) => sum + item, 0) / list.length : null;
}

function ma(rows, size) {
  return avg(rows.slice(-size).map((row) => row.close));
}

function ret(now, old) {
  return Number.isFinite(now) && Number.isFinite(old) && old ? ((now - old) / old) * 100 : null;
}

function rsi(rows, size = 14) {
  const list = rows.slice(-(size + 1));
  if (list.length < size + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < list.length; i += 1) {
    const diff = list[i].close - list[i - 1].close;
    if (diff >= 0) gain += diff;
    else loss += Math.abs(diff);
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

function drawdown(rows, size = 60) {
  let peak = -Infinity;
  let worst = 0;
  rows.slice(-size).forEach((row) => {
    peak = Math.max(peak, row.close);
    if (peak > 0) worst = Math.min(worst, ((row.close - peak) / peak) * 100);
  });
  return worst;
}

function macd(rows) {
  const closes = rows.map((row) => row.close);
  if (closes.length < 35) return { dif: null, dea: null, bar: null };
  let ema12 = closes[0];
  let ema26 = closes[0];
  let dif = 0;
  let dea = 0;
  closes.slice(1).forEach((close) => {
    ema12 = (ema12 * 11 + close * 2) / 13;
    ema26 = (ema26 * 25 + close * 2) / 27;
    dif = ema12 - ema26;
    dea = (dea * 8 + dif * 2) / 10;
  });
  return { dif, dea, bar: (dif - dea) * 2 };
}

function calcMetrics(rows) {
  const last = rows.at(-1);
  const range = rows.slice(-60);
  const volumeBase = avg(rows.slice(-21, -1).map((row) => row.volume)) || last.volume || 1;
  return {
    date: last.date,
    close: last.close,
    ma5: ma(rows, 5),
    ma10: ma(rows, 10),
    ma20: ma(rows, 20),
    ma60: ma(rows, 60),
    rsi: rsi(rows),
    macd: macd(rows),
    ret5: ret(last.close, rows.at(-6)?.close),
    ret20: ret(last.close, rows.at(-21)?.close),
    ret60: ret(last.close, rows.at(-61)?.close),
    high60: Math.max(...range.map((row) => row.high)),
    low60: Math.min(...range.map((row) => row.low)),
    drawdown60: drawdown(rows),
    volumeRatio: last.volume / volumeBase,
    rows: rows.slice(-120)
  };
}

function trend(metrics) {
  if (metrics.ma5 > metrics.ma10 && metrics.ma10 > metrics.ma20) return "均线多头";
  if (metrics.ma5 < metrics.ma10 && metrics.ma10 < metrics.ma20) return "均线空头";
  return "震荡整理";
}

function scoreOf(quote, metrics) {
  let score = 52;
  if (trend(metrics) === "均线多头") score += 16;
  if (trend(metrics) === "均线空头") score -= 16;
  if ((metrics.ret20 || 0) > 10) score += 8;
  if ((metrics.ret20 || 0) < -10) score -= 8;
  if ((metrics.rsi || 0) > 72) score -= 12;
  if ((metrics.volumeRatio || 0) > 1.8 && quote.changePct > 0) score += 5;
  if ((metrics.volumeRatio || 0) > 1.8 && quote.changePct < 0) score -= 5;
  if (metrics.drawdown60 < -20) score -= 7;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function labelFor(quote, metrics) {
  if ((metrics.rsi || 0) > 72) return "有回调风险";
  if (trend(metrics) === "均线空头") return "需回避";
  if (trend(metrics) === "均线多头" && quote.changePct >= 0) return "继续观察";
  return "可小仓位观察";
}

function strategyCards(metrics) {
  return [
    { name: "已持有观察", price: metrics.ma20, text: "观察能否守住中期纪律线。" },
    { name: "空仓观察", price: metrics.ma10, text: "等回踩后是否缩量企稳。" },
    { name: "风险观察线", price: metrics.ma20, text: "跌破并放量时，复核原始逻辑。" },
    { name: "上方压力观察", price: metrics.high60, text: "靠近60日高点时，看量能是否继续支持。" }
  ];
}

function backtest(rows) {
  let cash = 100000;
  let shares = 0;
  const trades = [];
  const curve = [];
  for (let i = 60; i < rows.length; i += 1) {
    const history = rows.slice(0, i);
    const today = rows[i];
    const ma5 = ma(history, 5);
    const ma20 = ma(history, 20);
    const ma60 = ma(history, 60);
    if (!shares && ma5 > ma20 && ma20 > ma60) {
      shares = cash / today.close;
      cash = 0;
      trades.push({ date: today.date, type: "观察入场", price: today.close });
    } else if (shares && today.close < ma20) {
      cash = shares * today.close;
      shares = 0;
      trades.push({ date: today.date, type: "纪律离场", price: today.close });
    }
    curve.push({ date: today.date, value: cash + shares * today.close });
  }
  const final = curve.at(-1)?.value || 100000;
  let peak = 100000;
  let worst = 0;
  curve.forEach((point) => {
    peak = Math.max(peak, point.value);
    worst = Math.min(worst, ((point.value - peak) / peak) * 100);
  });
  return {
    initial: 100000,
    final,
    returnPct: ((final - 100000) / 100000) * 100,
    maxDrawdownPct: worst,
    tradeCount: trades.length,
    trades: trades.slice(-8),
    note: "示例策略：MA5 > MA20 > MA60 进入观察，跌破 MA20 离场。只用于检验框架，不构成交易建议。"
  };
}

function buildReport(quote, metrics) {
  return {
    summary: `${quote.name} 当前为${trend(metrics)}，近20日涨跌 ${fmtPct(metrics.ret20)}，RSI ${fmt(metrics.rsi, 0)}。`,
    position: `当前仓位建议不是买卖指令：已持有先看 ${fmt(metrics.ma20)} 附近是否守住；空仓先看 ${fmt(metrics.ma10)} / ${fmt(metrics.ma20)} 附近是否出现缩量企稳。`,
    cycle: "仅凭免费行情和K线，产业周期、产能、库存、政策和财务数据不足，暂无法做强结论。",
    technical: `趋势：${trend(metrics)}；支撑观察：${fmt(metrics.ma20)}；压力观察：${fmt(metrics.high60)}；近60日最大回撤 ${fmtPct(metrics.drawdown60)}。`,
    risk: "公开免费接口可能延迟或失败，资金流、龙虎榜、公告原文和财报需要后续接正式数据源交叉验证。",
    sources: ["东方财富公开行情接口", "东方财富历史K线接口"]
  };
}

function fmt(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function fmtPct(value) {
  return Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)}%` : "--";
}
