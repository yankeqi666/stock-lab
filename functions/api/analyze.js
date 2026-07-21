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
  const strongCount = valid.filter((item) => item.changePct >= 0.5).length;
  const weakCount = valid.filter((item) => item.changePct <= -0.5).length;
  const mood = !valid.length
    ? "数据不足"
    : strongCount >= 3
      ? "市场偏强"
      : weakCount >= 3
        ? "市场偏弱"
        : "市场震荡";
  const discipline = mood === "市场偏弱"
    ? "市场背景偏弱时，个股反弹更要看是否放量站稳，重仓不宜把单日上涨当作趋势反转。"
    : mood === "市场偏强"
      ? "市场背景偏强时，个股上涨需要区分是大盘带动还是自身逻辑改善，接近压力位仍要看量能。"
      : mood === "市场震荡"
        ? "市场震荡时，纪律线比情绪更重要，优先处理破线和重仓项。"
        : "指数数据未取到，本轮市场背景判断降级。";
  return {
    indexes: results,
    avgChange,
    mood,
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
      name: "琛屾儏-K绾夸竴鑷存€?,
      ok: priceGap === null || priceGap < 1.5,
      text: priceGap === null ? "鏁版嵁涓嶈冻锛屾殏鏃犳硶鏍￠獙銆? : `琛屾儏浠蜂笌鏈€杩慘绾挎敹鐩樹环鐩稿樊 ${fmtPct(priceGap)}銆俙
    },
    {
      name: "鍘嗗彶K绾挎牱鏈?,
      ok: metrics.rows.length >= 80,
      text: `褰撳墠鍙敤K绾挎牱鏈?${metrics.rows.length} 鏉°€俙
    },
    {
      name: "褰撴棩璧勯噾瀛楁",
      ok: Number.isFinite(quote.mainNetInflow),
      text: Number.isFinite(quote.mainNetInflow) ? `涓诲姏鍑€娴佸叆绾?${fmtMoney(quote.mainNetInflow)}锛屽崰姣?${fmt(quote.mainNetInflowPct, 2)}%銆俙 : "鍏嶈垂鎺ュ彛鏈繑鍥炲綋鏃ヨ祫閲戞祦瀛楁銆?
    },
    {
      name: "鍘嗗彶璧勯噾娴佽鐩?,
      ok: moneyFlow.length >= 3,
      text: moneyFlow.length ? `鎶撳埌 ${moneyFlow.length} 澶╁巻鍙茶祫閲戞祦銆俙 : "鏈姄鍒板巻鍙茶祫閲戞祦锛屽彧鑳界敤褰撴棩璧勯噾瀛楁銆?
    },
    {
      name: "鏂伴椈瑕嗙洊",
      ok: news.length > 0,
      text: news.length ? `鎶撳埌 ${news.length} 鏉¤繎鏈熸秷鎭爣棰樸€俙 : "鏈姄鍒拌繎鏈熸柊闂伙紝涓嶈兘寮鸿鍒ゆ柇娑堟伅闈€?
    },
    {
      name: "鍏憡绾跨储瑕嗙洊",
      ok: announcements.length > 0,
      text: announcements.length ? `鎶撳埌 ${announcements.length} 鏉″叕鍛?璐㈡姤绾跨储銆俙 : "鏈姄鍒板叕鍛婄嚎绱紝鍏憡闈㈠彧鑳芥彁绀虹己澶便€?
    },
    {
      name: "璐㈠姟鎽樿瑕嗙洊",
      ok: !!finance,
      text: finance ? `鎶撳埌鏈€杩戜竴鏈熻储鍔℃憳瑕侊細${finance.reportDate || "鏃ユ湡鏈繑鍥?}銆俙 : "鏈姄鍒拌储鍔℃憳瑕侊紝鐩堝埄璐ㄩ噺涓嶈兘涓嬪己缁撹銆?
    },
    {
      name: "琛屼笟瀛楁瑕嗙洊",
      ok: !!quote.industry,
      text: quote.industry ? `琛屾儏鎺ュ彛杩斿洖琛屼笟/姒傚康瀛楁锛?{quote.industry}銆俙 : "鏈彇鍒拌涓氬瓧娈碉紝琛屼笟鏅皵闇€瑕佸閮ㄦ牳瀵广€?
    },
    {
      name: "甯傚満鑳屾櫙瑕嗙洊",
      ok: hasMarket,
      text: hasMarket ? `鎸囨暟鑳屾櫙锛?{market.mood}锛屽钩鍧囨定璺?${fmtPct(market.avgChange)}銆俙 : "鎸囨暟鑳屾櫙鏈彇鍒帮紝涓嶈兘鍒ゆ柇澶х洏鐜銆?
    }
  ];
  const passed = checks.filter((item) => item.ok).length;
  return {
    score: Math.round(passed / checks.length * 100),
    level: passed >= 8 ? "杈冨彲鐢? : passed >= 6 ? "涓瓑鍙俊" : passed >= 4 ? "闇€澶嶆牳" : "鏁版嵁涓嶈冻",
    checks,
    sources: ["涓滄柟璐㈠瘜鍏紑琛屾儏鎺ュ彛", "涓滄柟璐㈠瘜鍘嗗彶K绾挎帴鍙?, "涓滄柟璐㈠瘜鎼滅储", "涓滄柟璐㈠瘜鏁版嵁涓績", "涓滄柟璐㈠瘜鍘嗗彶璧勯噾娴?, "涓滄柟璐㈠瘜鎸囨暟琛屾儏"]
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
  if (!Number.isFinite(quote.price) || !Number.isFinite(metrics.ma20)) return "浣嶇疆涓嶆槑";
  if (quote.price >= metrics.high60 * 0.97) return "鎺ヨ繎60鏃ュ帇鍔涘尯";
  if (quote.price < metrics.ma20) return "璺岀牬涓湡椋庨櫓绾?;
  if (quote.price > metrics.ma10 && metrics.ma10 > metrics.ma20) return "绔欏湪鐭腑鏈熷潎绾夸笂鏂?;
  return "澶勫湪闇囪崱涓灑";
}

function volumeJudgement(quote, metrics) {
  if (!Number.isFinite(metrics.volumeRatio)) return "閲忚兘鏁版嵁涓嶈冻";
  if (metrics.volumeRatio >= 1.8 && quote.changePct > 0) return "鏀鹃噺涓婃定锛岃鏄庣煭绾胯祫閲戞効鎰忔帹锛屼絾鑻ユ帴杩戝帇鍔涗綅涔熷鏄撳啿楂樺洖钀?;
  if (metrics.volumeRatio >= 1.8 && quote.changePct < 0) return "鏀鹃噺涓嬭穼锛岃鏄庡垎姝у拰鎶涘帇閮藉湪鏀惧ぇ锛岄渶瑕佷紭鍏堢湅椋庨櫓绾?;
  if (metrics.volumeRatio <= 0.75) return "缂╅噺锛岃鏄庝富鍔ㄤ氦鏄撴剰鎰夸笉寮猴紝閫傚悎瑙傚療纭锛屼笉閫傚悎寮鸿涓嬬粨璁?;
  return "閲忚兘姝ｅ父锛屾殏鏈舰鎴愬己楠岃瘉";
}

function moneyJudgement(quote, moneyFlow) {
  const latest = moneyFlow.slice(-3).filter((row) => Number.isFinite(row.mainNetInflow));
  const positiveDays = latest.filter((row) => row.mainNetInflow > 0).length;
  const negativeDays = latest.filter((row) => row.mainNetInflow < 0).length;
  if (latest.length >= 3 && positiveDays >= 2) return `杩?鏃ヨ祫閲戞祦鏈?${positiveDays} 澶╁噣娴佸叆锛岀煭绾挎壙鎺ユ瘮绾笅璺屾椂濂斤紝浣嗚繕瑕佺湅鑳藉惁绔欑ǔ鍏抽敭绾裤€俙;
  if (latest.length >= 3 && negativeDays >= 2) return `杩?鏃ヨ祫閲戞祦鏈?${negativeDays} 澶╁噣娴佸嚭锛岃鏄庤祫閲戞€佸害鍋忚皑鎱庯紝鍙嶅脊鏇撮渶瑕佹斁閲忕‘璁ゃ€俙;
  if (Number.isFinite(quote.mainNetInflow)) return quote.mainNetInflow > 0 ? "褰撴棩涓诲姏鍑€娴佸叆涓烘锛屼絾缂哄皯杩炵画鎬ч獙璇併€? : "褰撴棩涓诲姏鍑€娴佸叆涓鸿礋锛岀煭绾胯祫閲戞€佸害鍋忚皑鎱庛€?;
  return "璧勯噾娴佹湭鍙栧埌锛岃祫閲戦潰涓嶈兘浣滀负寮轰緷鎹€?;
}

function financeJudgement(finance) {
  if (!finance) return "璐㈠姟鎽樿鏈彇鍒帮紝涓嶈兘璇勪环鐩堝埄璐ㄩ噺锛屽彧鑳芥妸璐㈠姟闈㈠垪涓虹己澶遍」銆?;
  const profitDown = Number.isFinite(finance.profitYoY) && finance.profitYoY < 0;
  const revenueDown = Number.isFinite(finance.revenueYoY) && finance.revenueYoY < 0;
  const roeGood = Number.isFinite(finance.roe) && finance.roe >= 10;
  if (profitDown && revenueDown) return `鏈€杩戜竴鏈熻惀鏀跺悓姣?${fmtPct(finance.revenueYoY)}銆佸噣鍒╂鼎鍚屾瘮 ${fmtPct(finance.profitYoY)}锛岀粡钀ョ鍋忓急锛屾妧鏈弽寮逛笉鑳芥浛浠ｅ熀鏈潰淇銆俙;
  if (profitDown) return `鏈€杩戜竴鏈熷噣鍒╂鼎鍚屾瘮 ${fmtPct(finance.profitYoY)}锛岀泩鍒╂湁鍘嬪姏锛岄渶瑕佺敤鍚庣画璐㈡姤楠岃瘉鏀瑰杽銆俙;
  if (roeGood) return `鏈€杩戜竴鏈?ROE ${fmtPct(finance.roe)}锛岀泩鍒╄兘鍔涚嚎绱㈠皻鍙紝浣嗕粛瑕佺粨鍚堜及鍊煎拰瓒嬪娍銆俙;
  return `鏈€杩戜竴鏈熻储鍔℃憳瑕佸凡鍙栧埌锛氳惀鏀?${fmtMoney(finance.revenue)}銆佸綊姣嶅噣鍒╂鼎 ${fmtMoney(finance.netProfit)}锛岄渶瑕佺户缁湅鍚屾瘮鍜岀幇閲戞祦璐ㄩ噺銆俙;
}

function newsJudgement(news, announcements) {
  const titles = [...news, ...announcements].map((item) => item.title || "");
  if (!titles.length) return "杩戞湡鏂伴椈鍜屽叕鍛婄嚎绱㈣緝灏戯紝娑堟伅闈笉鑳戒綔涓烘牳蹇冨垽鏂€?;
  const bad = titles.filter((title) => /鍑忔寔|浜忔崯|澶勭綒|椋庨櫓|璇夎|涓嬫粦|閫€甯倈闂|绔嬫/.test(title)).length;
  const good = titles.filter((title) => /澧為暱|鍥炶喘|澧炴寔|涓爣|绛剧害|鐩堝埄|绐佺牬|鍒嗙孩/.test(title)).length;
  if (bad > good) return `娑堟伅绾跨储閲屽亸璐熼潰鐨勫叧閿瘝鏇村锛?{bad} 鏉★級锛岄渶瑕佸厛鏍稿鍏憡鍘熸枃锛屼笉鑳藉彧鐪嬩环鏍煎弽寮广€俙;
  if (good > bad) return `娑堟伅绾跨储閲屽亸姝ｉ潰鐨勫叧閿瘝鏇村锛?{good} 鏉★級锛屼絾浠嶉渶纭鏄惁宸茬粡琚偂浠锋彁鍓嶅弽鏄犮€俙;
  return `鎶撳埌 ${titles.length} 鏉℃柊闂?鍏憡绾跨储锛屾儏缁笉鏄庢樉鍋忎竴杈癸紝閲嶇偣鍥炲埌浠锋牸銆侀噺鑳藉拰璐㈡姤楠岃瘉銆俙;
}

function expertConclusion(quote, metrics, extra) {
  const market = extra.market;
  const position = pricePosition(quote, metrics);
  const state = trend(metrics);
  const hot = metrics.rsi > 72 || quote.price >= metrics.high60 * 0.97;
  const broken = quote.price < metrics.ma20;
  const strong = state === "鍧囩嚎澶氬ご" && quote.changePct >= 0 && !hot;
  if (broken) return `鏍稿績鍒ゆ柇锛氳繖鍙幇鍦ㄤ笉鏄€滄壘鏈轰細鈥濈殑鐘舵€侊紝鑰屾槸鍏堢‘璁ら闄╂湁娌℃湁鎵╁ぇ銆備环鏍煎凡缁忎綆浜?MA20 椋庨櫓瑙傚療绾?${fmt(metrics.ma20)}锛屽鏋滀笉鑳介噸鏂扮珯鍥炲幓锛屽師鏉ョ殑鎸佹湁閫昏緫瑕侀檷绾с€俙;
  if (hot) return `鏍稿績鍒ゆ柇锛氱煭绾跨儹搴﹀亸楂橈紝閫傚悎澶嶆牳鑰屼笉鏄啿鍔ㄨ拷銆傚綋鍓嶄綅缃负${position}锛孯SI ${fmt(metrics.rsi, 0)}锛屾帴涓嬫潵瑕佺湅鏀鹃噺绐佺牬鏄惁鐪熷疄锛岃繕鏄珮浣嶅垎姝с€俙;
  if (strong) return `鏍稿績鍒ゆ柇锛氳蛋鍔挎殏鏃跺浜庤緝鍋ュ悍鐨勮瀵熺姸鎬併€傚潎绾跨粨鏋勪负${state}锛屼环鏍煎湪鍏抽敭鍧囩嚎涓婃柟锛屼絾浠嶉渶瑕佽祫閲戞祦鍜屽競鍦鸿儗鏅户缁厤鍚堛€俙;
  if (market?.mood === "甯傚満鍋忓急") return `鏍稿績鍒ゆ柇锛氫釜鑲℃殏鏈畬鍏ㄨ蛋鍧忥紝浣嗗競鍦鸿儗鏅亸寮憋紝浠撲綅鍔ㄤ綔瑕佷繚瀹堬紝浼樺厛鐪嬮闄╃嚎鍜岄噺鑳界‘璁ゃ€俙;
  return `鏍稿績鍒ゆ柇锛氬綋鍓嶆洿鍍忛渿鑽¤瀵燂紝涓嶆槸寮轰拱鐐逛篃涓嶆槸蹇呴』鍥為伩鐐广€傚叧閿湪浜庡悗闈㈣兘鍚︾珯绋?${fmt(metrics.ma20)} 骞剁獊鐮?${fmt(metrics.high60)}銆俙;
}

function buildReport(quote, metrics, news = [], validation = null, extra = {}) {
  const announcements = extra.announcements || [];
  const finance = extra.finance || null;
  const moneyFlow = extra.moneyFlow || [];
  const market = extra.market || null;
  const recentFlow = moneyFlow.slice(-3).map((row) => `${row.date} ${fmtMoney(row.mainNetInflow)}`).join("锛?);
  const marketText = market?.indexes?.some((item) => Number.isFinite(item.changePct))
    ? `${market.mood}锛屼富瑕佹寚鏁板钩鍧囨定璺?${fmtPct(market.avgChange)}銆?{market.discipline}`
    : "鎸囨暟蹇収鏈彇鍒帮紝鏈甯傚満鑳屾櫙鍒ゆ柇闄嶇骇銆?;
  const capitalText = [
    Number.isFinite(quote.mainNetInflow)
      ? `褰撴棩涓诲姏鍑€娴佸叆绾?${fmtMoney(quote.mainNetInflow)}锛屽崰姣?${fmt(quote.mainNetInflowPct, 2)}%銆俙
      : "鍏嶈垂鎺ュ彛鏈繑鍥炲綋鏃ヨ祫閲戞祦銆?,
    recentFlow ? `杩戝嚑鏃ヨ祫閲戞祦锛?{recentFlow}銆俙 : "鍘嗗彶璧勯噾娴佹湭鍙栧埌锛屼笉鑳界‘璁よ祫閲戣繛缁€с€?,
    moneyJudgement(quote, moneyFlow)
  ].join("");
  const financeText = financeJudgement(finance);
  const newsText = newsJudgement(news, announcements);
  const qualityText = validation
    ? `鏁版嵁鍙潬鎬э細${validation.level}锛堟牎楠屽垎 ${validation.score}/100锛夈€俙
    : "鏁版嵁鍙潬鎬э細鏈牎楠屻€?;
  const positionText = pricePosition(quote, metrics);
  const volumeText = volumeJudgement(quote, metrics);
  const conclusion = expertConclusion(quote, metrics, extra);
  const invalidation = quote.price < metrics.ma20
    ? `鑻ュ悗缁粛鏃犳硶绔欏洖 ${fmt(metrics.ma20)}锛屽苟涓旇祫閲戠户缁祦鍑猴紝搴旀妸瀹冧粠鈥滄寔鏈夎瀵熲€濋檷涓衡€滈闄╁鐞嗏€濄€俙
    : `鑻ヨ穼鐮?${fmt(metrics.ma20)} 涓旀斁閲忥紝璇存槑涓湡绾緥琚牬鍧忥紱鑻ュ啿鍒?${fmt(metrics.high60)} 闄勮繎浣嗛噺鑳借窡涓嶄笂锛岃鏄庝笂鏂规姏鍘嬩粛閲嶃€俙;
  return {
    summary: `${conclusion} 甯傚満鑳屾櫙锛?{marketText}`,
    position: `浠撲綅绾緥锛氬鏋滃凡缁忔寔鏈夛紝鍏堟妸 MA20 ${fmt(metrics.ma20)} 褰撻闄╄瀵熺嚎锛屾妸 ${fmt(metrics.high60)} 褰撲笂鏂瑰帇鍔涜瀵燂紱濡傛灉杩欏彧鍦ㄨ处鎴烽噷瓒呰繃 35%锛屼换浣曞姞浠撻兘瑕佸厛璁╀綅浜庘€滄帶鍒堕泦涓害鈥濄€傚鏋滅┖浠擄紝涓嶈拷褰撳ぉ澶ф定锛屼紭鍏堢瓑鍥炶俯 ${fmt(metrics.ma10)} / ${fmt(metrics.ma20)} 鍚庣湅缂╅噺浼佺ǔ銆俙,
    market: marketText,
    cycle: `鍛ㄦ湡妗嗘灦锛?{quote.industry ? `琛屼笟/姒傚康瀛楁锛?{quote.industry}銆俙 : "琛屼笟瀛楁鏈繑鍥烇紝琛屼笟鍛ㄦ湡鍙兘闄嶇骇鍒ゆ柇銆?} 鐩墠鑳界‘璁ょ殑鏄競鍦轰环鏍煎拰鍏紑璐㈠姟绾跨储锛屼笉鑳芥妸琛屼笟鍛ㄦ湡璁叉垚纭畾缁撹銆?{financeText}`,
    technical: `K绾挎墽琛岋細瓒嬪娍涓?${trend(metrics)}锛屽綋鍓嶄綅缃細${positionText}銆傝繎5鏃?${fmtPct(metrics.ret5)}锛岃繎20鏃?${fmtPct(metrics.ret20)}锛岃繎60鏃?${fmtPct(metrics.ret60)}锛?0鏃ユ渶澶у洖鎾?${fmtPct(metrics.drawdown60)}銆傞噺浠峰垽鏂細${volumeText} 鍙嶈瘉鏉′欢锛?{invalidation}`,
    capital: capitalText,
    finance: financeText,
    news: `${news.length ? `鏂伴椈 ${news.length} 鏉°€俙 : "鏂伴椈杈冨皯銆?}${announcements.length ? `鍏憡/璐㈡姤绾跨储 ${announcements.length} 鏉°€俙 : "鍏憡绾跨储杈冨皯銆?}${newsText}`,
    announcements: announcements.length ? announcements.map((item) => `${item.date ? `${item.date}锛歚 : ""}${item.title}`).join("锛?) : "鏈姄鍒板叕鍛?璐㈡姤绾跨储銆?,
    quality: qualityText,
    risk: `${conclusion} 鏉′欢鍖栬鍒掞細绗竴锛岀湅 ${fmt(metrics.ma20)} 鏄惁瀹堜綇锛涚浜岋紝鐪?${fmt(metrics.high60)} 闄勮繎鏄惁鏀鹃噺鏈夋晥绐佺牬锛涚涓夛紝鐪嬭祫閲戞祦鏄惁杩炵画锛岃€屼笉鏄彧鐪嬩竴澶┿€傚厤璐ｅ０鏄庯細浠呭仛鍏紑淇℃伅鏁寸悊鍜屽鐩橈紝涓嶆瀯鎴愭姇璧勫缓璁紝涓嶄繚璇佹敹鐩娿€俙,
    sources: validation?.sources || ["涓滄柟璐㈠瘜鍏紑琛屾儏鎺ュ彛", "涓滄柟璐㈠瘜鍘嗗彶K绾挎帴鍙?]
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





