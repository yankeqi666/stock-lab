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
    const [news, announcements, finance, moneyFlow, market] = await Promise.all([
      fetchNews(quote),
      fetchAnnouncements(quote),
      fetchFinance(quote),
      fetchMoneyFlowHistory(quote),
      fetchMarketSnapshot()
    ]);
    const extra = { announcements, finance, moneyFlow, market };
    const validation = validateData(quote, metrics, news, extra);
    const payload = {
      quote,
      metrics,
      news,
      announcements,
      finance,
      moneyFlow,
      market,
      validation,
      score: scoreOf(quote, metrics),
      label: labelFor(quote, metrics),
      strategy: strategyCards(metrics),
      backtest: backtest(rows),
      report: buildReport(quote, metrics, news, validation, extra),
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
  const fields = "f57,f58,f43,f44,f45,f46,f47,f48,f60,f116,f162,f170,f62,f184,f127,f128,f129";
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
    mainNetInflow: num(data.f62),
    mainNetInflowPct: num(data.f184),
    industry: data.f127 || data.f128 || data.f129 || "",
    source: "东方财富公开行情接口",
    updatedAt: new Date().toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })
  };
}

async function fetchNews(quote) {
  try {
    const keyword = encodeURIComponent(`${quote.name} ${quote.code}`);
    const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=callback&param=${keyword}`;
    const text = await (await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 StockLab/1.0",
        "referer": "https://www.eastmoney.com/"
      }
    })).text();
    const match = text.match(/callback\((.*)\)$/);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    const list = data?.result?.cmsArticleWebOld || data?.result?.cmsArticle || [];
    return list.slice(0, 8).map((item) => ({
      title: item.title || item.Title || "未命名消息",
      date: item.showTime || item.publishTime || item.date || "",
      source: "东方财富搜索"
    }));
  } catch {
    return [];
  }
}

async function fetchAnnouncements(quote) {
  try {
    const keyword = encodeURIComponent(`${quote.name} ${quote.code} 公告 财报`);
    const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=callback&param=${keyword}`;
    const text = await (await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 StockLab/1.0",
        "referer": "https://www.eastmoney.com/"
      }
    })).text();
    const match = text.match(/callback\((.*)\)$/);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    const list = data?.result?.cmsArticleWebOld || data?.result?.cmsArticle || [];
    return list
      .filter((item) => /公告|财报|年报|季报|中报|业绩|分红|减持|增持|回购|诉讼|处罚/.test(item.title || item.Title || ""))
      .slice(0, 6)
      .map((item) => ({
        title: item.title || item.Title || "未命名公告线索",
        date: item.showTime || item.publishTime || item.date || "",
        source: "东方财富公告/资讯搜索"
      }));
  } catch {
    return [];
  }
}

async function fetchFinance(quote) {
  try {
    const filter = encodeURIComponent(`(SECURITY_CODE="${quote.code}")`);
    const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_LICO_FN_CPD&columns=ALL&filter=${filter}&pageNumber=1&pageSize=1&sortColumns=REPORT_DATE&sortTypes=-1&source=WEB&client=WEB`;
    const data = await eastmoney(url);
    const row = data?.result?.data?.[0];
    if (!row) return null;
    return {
      reportDate: row.REPORT_DATE || row.REPORTDATE || row.DATE || "",
      revenue: num(row.TOTAL_OPERATE_INCOME || row.OPERATE_INCOME || row.BASIC_EPS),
      netProfit: num(row.PARENT_NETPROFIT || row.NETPROFIT || row.DEDUCT_PARENT_NETPROFIT),
      revenueYoY: num(row.TOTAL_OPERATE_INCOME_YOY || row.OPERATE_INCOME_YOY),
      profitYoY: num(row.PARENT_NETPROFIT_YOY || row.NETPROFIT_YOY),
      roe: num(row.WEIGHTAVG_ROE || row.ROE),
      source: "东方财富数据中心财务摘要"
    };
  } catch {
    return null;
  }
}

async function fetchMoneyFlowHistory(quote) {
  try {
    const fields1 = "f1,f2,f3,f7";
    const fields2 = "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63";
    const url = `https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?secid=${encodeURIComponent(secid(quote.code))}&lmt=8&klt=101&fields1=${fields1}&fields2=${fields2}`;
    const rows = (await eastmoney(url)).data?.klines || [];
    return rows.map((line) => {
      const parts = line.split(",");
      return {
        date: parts[0],
        mainNetInflow: num(parts[1]),
        smallNetInflow: num(parts[5]),
        source: "东方财富历史资金流"
      };
    }).filter((item) => item.date);
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
  const results = await Promise.all(indexes.map(async (item) => {
    try {
      const fields = "f57,f58,f43,f44,f45,f46,f60,f170,f47,f48";
      const data = (await eastmoney(`https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(item.code)}&fields=${fields}`)).data;
      return {
        code: data?.f57 || item.code,
        name: data?.f58 || item.name,
        price: num(data?.f43) / 100,
        changePct: num(data?.f170) / 100,
        amount: num(data?.f48),
        source: "东方财富指数行情"
      };
    } catch {
      return { ...item, price: NaN, changePct: NaN, amount: NaN, source: "东方财富指数行情" };
    }
  }));
  const valid = results.filter((item) => Number.isFinite(item.changePct));
  const avgChange = avg(valid.map((item) => item.changePct));
  const totalAmount = valid.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0);
  const amountLevel = !totalAmount ? "成交额未知" : totalAmount >= 1200000000000 ? "放量活跃" : totalAmount >= 800000000000 ? "量能正常" : "成交偏弱";
  const strongCount = valid.filter((item) => item.changePct >= 0.5).length;
  const weakCount = valid.filter((item) => item.changePct <= -0.5).length;
  const redCount = valid.filter((item) => item.changePct > 0).length;
  const blueCount = valid.filter((item) => item.changePct < 0).length;
  let cycle = "震荡市";
  if (strongCount >= 3 && avgChange >= 0.7 && totalAmount >= 800000000000) cycle = "牛市环境";
  if (weakCount >= 3 || (avgChange <= -0.7 && blueCount >= redCount)) cycle = "熊市环境";
  const mood = valid.length ? cycle : "数据不足";
  const tone = cycle === "牛市环境" ? "good" : cycle === "熊市环境" ? "bad" : "flat";
  const discipline = cycle === "熊市环境"
    ? `熊市或弱市里，第一目标是活下来：重仓先降风险，破线股少幻想，反弹先看修复不看反转。今日${amountLevel}，总成交额约 ${fmtMoney(totalAmount)}。`
    : cycle === "牛市环境"
      ? `牛市或强市里，可以提高观察积极度：强趋势、资金流入、回踩不破线的票优先；但高位放量滞涨仍要减仓复核。今日${amountLevel}，总成交额约 ${fmtMoney(totalAmount)}。`
      : `震荡市里，少做追涨杀跌：围绕 MA20 风险线和60日压力做加减仓判断。今日${amountLevel}，总成交额约 ${fmtMoney(totalAmount)}。`;
  return {
    indexes: results,
    avgChange,
    totalAmount,
    amountLevel,
    redCount,
    blueCount,
    cycle,
    mood,
    tone,
    discipline,
    source: "东方财富指数行情",
    updatedAt: new Date().toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })
  };
}

function validateData(quote, metrics, news, extra = {}) {
  const announcements = extra.announcements || [];
  const finance = extra.finance || null;
  const moneyFlow = extra.moneyFlow || [];
  const market = extra.market || null;
  const hasMarket = !!market?.indexes?.some((item) => Number.isFinite(item.changePct));
  const priceGap = Number.isFinite(quote.price) && Number.isFinite(metrics.close)
    ? Math.abs(quote.price - metrics.close) / Math.max(quote.price, 0.01) * 100
    : null;
  const checks = [
    {
      name: "行情-K线一致性",
      ok: priceGap === null || priceGap < 1.5,
      text: priceGap === null ? "数据不足，暂时无法校验。" : `行情价与最近K线收盘价相差 ${fmtPct(priceGap)}。`
    },
    {
      name: "历史K线样本",
      ok: metrics.rows.length >= 80,
      text: `当前可用K线样本 ${metrics.rows.length} 条。`
    },
    {
      name: "当日资金字段",
      ok: Number.isFinite(quote.mainNetInflow),
      text: Number.isFinite(quote.mainNetInflow) ? `主力净流入约 ${fmtMoney(quote.mainNetInflow)}，占比 ${fmt(quote.mainNetInflowPct, 2)}%。` : "免费接口未返回当日资金流字段。"
    },
    {
      name: "历史资金流覆盖",
      ok: moneyFlow.length >= 3,
      text: moneyFlow.length ? `抓到 ${moneyFlow.length} 天历史资金流。` : "未抓到历史资金流，只能使用当日资金字段。"
    },
    {
      name: "新闻覆盖",
      ok: news.length > 0,
      text: news.length ? `抓到 ${news.length} 条近期消息标题。` : "未抓到近期新闻，不能强行判断消息面。"
    },
    {
      name: "公告线索覆盖",
      ok: announcements.length > 0,
      text: announcements.length ? `抓到 ${announcements.length} 条公告/财报线索。` : "未抓到公告线索，公告面只能提示缺失。"
    },
    {
      name: "财务摘要覆盖",
      ok: !!finance,
      text: finance ? `抓到最近一期财务摘要：${finance.reportDate || "日期未返回"}。` : "未抓到财务摘要，盈利质量不能下强结论。"
    },
    {
      name: "行业字段覆盖",
      ok: !!quote.industry,
      text: quote.industry ? `行情接口返回行业/概念字段：${quote.industry}。` : "未取到行业字段，行业景气需要外部核对。"
    },
    {
      name: "市场背景覆盖",
      ok: hasMarket,
      text: hasMarket ? `指数背景：${market.mood}，主要指数平均涨跌 ${fmtPct(market.avgChange)}。` : "指数背景未取到，不能判断大盘环境。"
    }
  ];
  const passed = checks.filter((item) => item.ok).length;
  return {
    score: Math.round(passed / checks.length * 100),
    level: passed >= 8 ? "较可用" : passed >= 6 ? "中等可信" : passed >= 4 ? "需复核" : "数据不足",
    checks,
    sources: ["东方财富公开行情接口", "东方财富历史K线接口", "东方财富搜索", "东方财富数据中心", "东方财富历史资金流", "东方财富指数行情"]
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

function pricePosition(quote, metrics) {
  if (!Number.isFinite(quote.price) || !Number.isFinite(metrics.ma20)) return "位置不明";
  if (quote.price >= metrics.high60 * 0.97) return "接近60日压力区";
  if (quote.price < metrics.ma20) return "跌破中期风险线";
  if (quote.price > metrics.ma10 && metrics.ma10 > metrics.ma20) return "站在短中期均线上方";
  return "处在震荡中枢";
}

function volumeJudgement(quote, metrics) {
  if (!Number.isFinite(metrics.volumeRatio)) return "量能数据不足";
  if (metrics.volumeRatio >= 1.8 && quote.changePct > 0) return "放量上涨，说明短线资金愿意推，但如果接近压力位，也容易冲高回落。";
  if (metrics.volumeRatio >= 1.8 && quote.changePct < 0) return "放量下跌，说明分歧和抛压都在放大，需要优先看风险线。";
  if (metrics.volumeRatio <= 0.75) return "缩量，说明主动交易意愿不强，适合观察确认，不适合强行下结论。";
  return "量能正常，暂未形成强验证。";
}

function moneyJudgement(quote, moneyFlow) {
  const latest = moneyFlow.slice(-3).filter((row) => Number.isFinite(row.mainNetInflow));
  const positiveDays = latest.filter((row) => row.mainNetInflow > 0).length;
  const negativeDays = latest.filter((row) => row.mainNetInflow < 0).length;
  if (latest.length >= 3 && positiveDays >= 2) return `近3日资金流有 ${positiveDays} 天净流入，短线承接比纯下跌时好，但还要看能否站稳关键线。`;
  if (latest.length >= 3 && negativeDays >= 2) return `近3日资金流有 ${negativeDays} 天净流出，说明资金态度偏谨慎，反弹更需要放量确认。`;
  if (Number.isFinite(quote.mainNetInflow)) return quote.mainNetInflow > 0 ? "当日主力净流入为正，但缺少连续性验证。" : "当日主力净流入为负，短线资金态度偏谨慎。";
  return "资金流未取到，资金面不能作为强依据。";
}

function financeJudgement(finance) {
  if (!finance) return "财务摘要未取到，不能评价盈利质量，只能把财务面列为缺失项。";
  const profitDown = Number.isFinite(finance.profitYoY) && finance.profitYoY < 0;
  const revenueDown = Number.isFinite(finance.revenueYoY) && finance.revenueYoY < 0;
  const roeGood = Number.isFinite(finance.roe) && finance.roe >= 10;
  if (profitDown && revenueDown) return `最近一期营收同比 ${fmtPct(finance.revenueYoY)}、净利润同比 ${fmtPct(finance.profitYoY)}，经营端偏弱，技术反弹不能替代基本面修复。`;
  if (profitDown) return `最近一期净利润同比 ${fmtPct(finance.profitYoY)}，盈利有压力，需要用后续财报验证改善。`;
  if (roeGood) return `最近一期 ROE ${fmtPct(finance.roe)}，盈利能力线索尚可，但仍要结合估值和趋势。`;
  return `最近一期财务摘要已取到：营收 ${fmtMoney(finance.revenue)}、归母净利润 ${fmtMoney(finance.netProfit)}，需要继续看同比和现金流质量。`;
}

function newsJudgement(news, announcements) {
  const titles = [...news, ...announcements].map((item) => item.title || "");
  if (!titles.length) return "近期新闻和公告线索较少，消息面不能作为核心判断。";
  const bad = titles.filter((title) => /减持|亏损|处罚|风险|诉讼|下滑|退市|问询|立案/.test(title)).length;
  const good = titles.filter((title) => /增长|回购|增持|中标|签约|盈利|突破|分红/.test(title)).length;
  if (bad > good) return `消息线索里偏负面的关键词更多（${bad} 条），需要先核对公告原文，不能只看价格反弹。`;
  if (good > bad) return `消息线索里偏正面的关键词更多（${good} 条），但仍需确认是否已经被股价提前反映。`;
  return `抓到 ${titles.length} 条新闻/公告线索，情绪不明显偏一边，重点回到价格、量能和财报验证。`;
}

function expertConclusion(quote, metrics, extra) {
  const market = extra.market;
  const position = pricePosition(quote, metrics);
  const state = trend(metrics);
  const hot = metrics.rsi > 72 || quote.price >= metrics.high60 * 0.97;
  const broken = quote.price < metrics.ma20;
  const strong = state === "均线多头" && quote.changePct >= 0 && !hot;
  if (broken) return `核心判断：这只现在不是“找机会”的状态，而是先确认风险有没有扩大。价格已经低于 MA20 风险观察线 ${fmt(metrics.ma20)}，如果不能重新站回去，原来的持有逻辑要降级。`;
  if (hot) return `核心判断：短线热度偏高，适合复核而不是冲动追。当前位置为${position}，RSI ${fmt(metrics.rsi, 0)}，接下来要看放量突破是否真实，还是高位分歧。`;
  if (strong) return `核心判断：走势暂时处于较健康的观察状态。均线结构为${state}，价格在关键均线上方，但仍需要资金流和市场背景继续配合。`;
  if (market?.mood === "市场偏弱") return `核心判断：个股暂未完全走坏，但市场背景偏弱，仓位动作要保守，优先看风险线和量能确认。`;
  return `核心判断：当前更像震荡观察，不是强买点，也不是必须回避点。关键在于后面能否站稳 ${fmt(metrics.ma20)} 并突破 ${fmt(metrics.high60)}。`;
}

function buildReport(quote, metrics, news = [], validation = null, extra = {}) {
  const announcements = extra.announcements || [];
  const finance = extra.finance || null;
  const moneyFlow = extra.moneyFlow || [];
  const market = extra.market || null;
  const recentFlow = moneyFlow.slice(-3).map((row) => `${row.date} ${fmtMoney(row.mainNetInflow)}`).join("；");
  const marketText = market?.indexes?.some((item) => Number.isFinite(item.changePct))
    ? `${market.mood}，主要指数平均涨跌 ${fmtPct(market.avgChange)}。${market.discipline}`
    : "指数快照未取到，本次市场背景判断降级。";
  const capitalText = [
    Number.isFinite(quote.mainNetInflow)
      ? `当日主力净流入约 ${fmtMoney(quote.mainNetInflow)}，占比 ${fmt(quote.mainNetInflowPct, 2)}%。`
      : "免费接口未返回当日资金流。",
    recentFlow ? `近几日资金流：${recentFlow}。` : "历史资金流未取到，不能确认资金连续性。",
    moneyJudgement(quote, moneyFlow)
  ].join(" ");
  const financeText = financeJudgement(finance);
  const newsText = newsJudgement(news, announcements);
  const qualityText = validation
    ? `数据可靠性：${validation.level}（校验分 ${validation.score}/100）。`
    : "数据可靠性：未校验。";
  const positionText = pricePosition(quote, metrics);
  const volumeText = volumeJudgement(quote, metrics);
  const conclusion = expertConclusion(quote, metrics, extra);
  const invalidation = quote.price < metrics.ma20
    ? `若后续仍无法站回 ${fmt(metrics.ma20)}，并且资金继续流出，应把它从“持有观察”降为“风险处理”。`
    : `若跌破 ${fmt(metrics.ma20)} 且放量，说明中期纪律被破坏；若冲到 ${fmt(metrics.high60)} 附近但量能跟不上，说明上方压力仍重。`;
  return {
    summary: `${conclusion} 市场背景：${marketText}`,
    position: `仓位纪律：如果已经持有，先把 MA20 ${fmt(metrics.ma20)} 当风险观察线，把 ${fmt(metrics.high60)} 当上方压力观察；如果这只在账户里超过 35%，任何加仓都要先让位于“控制集中度”。如果空仓，不追当天大涨，优先等回踩 ${fmt(metrics.ma10)} / ${fmt(metrics.ma20)} 后看缩量企稳。`,
    market: marketText,
    cycle: `周期框架：${quote.industry ? `行业/概念字段：${quote.industry}。` : "行业字段未返回，行业周期只能降级判断。"} 目前能确认的是市场价格和公开财务线索，不能把行业周期讲成确定结论。${financeText}`,
    technical: `K线执行：趋势为 ${trend(metrics)}，当前位置：${positionText}。近5日 ${fmtPct(metrics.ret5)}，近20日 ${fmtPct(metrics.ret20)}，近60日 ${fmtPct(metrics.ret60)}，60日最大回撤 ${fmtPct(metrics.drawdown60)}。量价判断：${volumeText} 反证条件：${invalidation}`,
    capital: capitalText,
    finance: financeText,
    news: `${news.length ? `新闻 ${news.length} 条。` : "新闻较少。"}${announcements.length ? `公告/财报线索 ${announcements.length} 条。` : "公告线索较少。"}${newsText}`,
    announcements: announcements.length ? announcements.map((item) => `${item.date ? `${item.date}：` : ""}${item.title}`).join("；") : "未抓到公告/财报线索。",
    quality: qualityText,
    risk: `${conclusion} 条件化规划：第一，看 ${fmt(metrics.ma20)} 是否守住；第二，看 ${fmt(metrics.high60)} 附近是否放量有效突破；第三，看资金流是否连续，而不是只看一天。免责声明：仅做公开信息整理和复盘，不构成投资建议，不保证收益。`,
    sources: validation?.sources || ["东方财富公开行情接口", "东方财富历史K线接口"]
  };
}

function fmtMoney(value) {
  if (!Number.isFinite(value)) return "--";
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (abs >= 10000) return `${(value / 10000).toFixed(2)}万`;
  return value.toFixed(2);
}

function fmt(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function fmtPct(value) {
  return Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)}%` : "--";
}





