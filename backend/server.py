import json
import math
import os
import sqlite3
import statistics
import time
import urllib.parse
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "stock_lab.sqlite3"

ALIASES = {
    "贵州茅台": "600519",
    "茅台": "600519",
    "五粮液": "000858",
    "宁德时代": "300750",
    "比亚迪": "002594",
    "东方财富": "300059",
    "招商银行": "600036",
    "平安银行": "000001",
    "科创半导体": "589020",
    "半导体": "589020",
}


def init_db():
    DATA_DIR.mkdir(exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            create table if not exists holdings (
                code text primary key,
                name text not null,
                cost real not null default 0,
                shares real not null default 0,
                portfolio real not null default 0,
                note text not null default '',
                created_at text not null,
                updated_at text not null
            )
            """
        )
        conn.execute(
            """
            create table if not exists snapshots (
                code text not null,
                payload text not null,
                created_at text not null,
                primary key(code, created_at)
            )
            """
        )


def now_text():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def normalize_code(raw):
    value = (raw or "").strip()
    if value in ALIASES:
        return ALIASES[value]
    return "".join(ch for ch in value if ch.isalnum() or ch == ".")


def secid(code):
    if "." in code:
        return code
    if code.startswith(("6", "8", "9")):
        return f"1.{code}"
    return f"0.{code}"


def http_json(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 StockLab/1.0",
            "Referer": "https://quote.eastmoney.com/",
        },
    )
    with urllib.request.urlopen(req, timeout=12) as resp:
        return json.loads(resp.read().decode("utf-8", errors="ignore"))


def fetch_quote(raw):
    code = normalize_code(raw)
    fields = "f57,f58,f43,f44,f45,f46,f47,f48,f60,f116,f162,f170"
    url = f"https://push2.eastmoney.com/api/qt/stock/get?secid={urllib.parse.quote(secid(code))}&fields={fields}"
    data = http_json(url).get("data")
    if not data or data.get("f43") in (None, "-"):
        raise ValueError("没有找到这只股票，或公开行情接口暂时不可用")
    price = safe_number(data.get("f43")) / 100
    prev_close = safe_number(data.get("f60")) / 100
    return {
        "code": data.get("f57") or code,
        "name": data.get("f58") or code,
        "price": price,
        "changePct": safe_number(data.get("f170")) / 100,
        "open": safe_number(data.get("f46")) / 100,
        "high": safe_number(data.get("f44")) / 100,
        "low": safe_number(data.get("f45")) / 100,
        "prevClose": prev_close,
        "volume": safe_number(data.get("f47")),
        "amount": safe_number(data.get("f48")),
        "marketCap": safe_number(data.get("f116")),
        "pe": safe_number(data.get("f162")) / 100,
        "source": "东方财富公开行情接口",
        "updatedAt": now_text(),
    }


def fetch_history(raw):
    code = normalize_code(raw)
    fields1 = "f1,f2,f3,f4,f5,f6"
    fields2 = "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"
    url = (
        "https://push2his.eastmoney.com/api/qt/stock/kline/get"
        f"?secid={urllib.parse.quote(secid(code))}&klt=101&fqt=1&beg=0&end=20500101"
        f"&fields1={fields1}&fields2={fields2}"
    )
    klines = http_json(url).get("data", {}).get("klines", [])
    rows = []
    for line in klines:
        parts = line.split(",")
        if len(parts) < 11:
            continue
        rows.append(
            {
                "date": parts[0],
                "open": safe_number(parts[1]),
                "close": safe_number(parts[2]),
                "high": safe_number(parts[3]),
                "low": safe_number(parts[4]),
                "volume": safe_number(parts[5]),
                "amount": safe_number(parts[6]),
                "amplitude": safe_number(parts[7]),
                "dayPct": safe_number(parts[8]),
                "change": safe_number(parts[9]),
                "turnover": safe_number(parts[10]),
            }
        )
    if not rows:
        raise ValueError("历史K线为空，公开接口暂时不可用")
    return rows


def safe_number(value):
    try:
        if value in (None, "-"):
            return math.nan
        return float(value)
    except (TypeError, ValueError):
        return math.nan


def avg(values):
    clean = [v for v in values if isinstance(v, (int, float)) and math.isfinite(v)]
    return statistics.fmean(clean) if clean else None


def ma(rows, size):
    return avg([row["close"] for row in rows[-size:]])


def pct(now, old):
    if not old or not math.isfinite(old):
        return None
    return (now - old) / old * 100


def rsi(rows, size=14):
    part = rows[-(size + 1) :]
    if len(part) < size + 1:
        return None
    gains = 0
    losses = 0
    for idx in range(1, len(part)):
        diff = part[idx]["close"] - part[idx - 1]["close"]
        if diff >= 0:
            gains += diff
        else:
            losses += abs(diff)
    if losses == 0:
        return 100
    return 100 - 100 / (1 + gains / losses)


def max_drawdown(rows, size=60):
    peak = -math.inf
    worst = 0
    for row in rows[-size:]:
        peak = max(peak, row["close"])
        if peak > 0:
            worst = min(worst, (row["close"] - peak) / peak * 100)
    return worst


def macd(rows):
    closes = [row["close"] for row in rows]
    if len(closes) < 35:
        return {"dif": None, "dea": None, "bar": None}
    ema12 = closes[0]
    ema26 = closes[0]
    dea = 0
    for close in closes[1:]:
        ema12 = ema12 * 11 / 13 + close * 2 / 13
        ema26 = ema26 * 25 / 27 + close * 2 / 27
        dif = ema12 - ema26
        dea = dea * 8 / 10 + dif * 2 / 10
    return {"dif": dif, "dea": dea, "bar": (dif - dea) * 2}


def metrics(rows):
    last = rows[-1]
    range60 = rows[-60:]
    volume_base = avg([row["volume"] for row in rows[-21:-1]]) or last["volume"] or 1
    result = {
        "date": last["date"],
        "close": last["close"],
        "ma5": ma(rows, 5),
        "ma10": ma(rows, 10),
        "ma20": ma(rows, 20),
        "ma60": ma(rows, 60),
        "rsi": rsi(rows),
        "macd": macd(rows),
        "ret5": pct(last["close"], rows[-6]["close"]) if len(rows) > 6 else None,
        "ret20": pct(last["close"], rows[-21]["close"]) if len(rows) > 21 else None,
        "ret60": pct(last["close"], rows[-61]["close"]) if len(rows) > 61 else None,
        "high60": max(row["high"] for row in range60),
        "low60": min(row["low"] for row in range60),
        "drawdown60": max_drawdown(rows),
        "volumeRatio": last["volume"] / volume_base if volume_base else None,
        "rows": rows[-120:],
    }
    return result


def trend(m):
    if m["ma5"] and m["ma10"] and m["ma20"] and m["ma5"] > m["ma10"] > m["ma20"]:
        return "均线多头"
    if m["ma5"] and m["ma10"] and m["ma20"] and m["ma5"] < m["ma10"] < m["ma20"]:
        return "均线空头"
    return "震荡整理"


def score(quote, m):
    value = 52
    state = trend(m)
    if state == "均线多头":
        value += 16
    if state == "均线空头":
        value -= 16
    if (m["ret20"] or 0) > 10:
        value += 8
    if (m["ret20"] or 0) < -10:
        value -= 8
    if (m["rsi"] or 0) > 72:
        value -= 12
    if (m["volumeRatio"] or 0) > 1.8 and quote["changePct"] > 0:
        value += 5
    if (m["volumeRatio"] or 0) > 1.8 and quote["changePct"] < 0:
        value -= 5
    if m["drawdown60"] < -20:
        value -= 7
    return max(0, min(100, round(value)))


def label_for(quote, m):
    if (m["rsi"] or 0) > 72:
        return "有回调风险"
    if trend(m) == "均线空头":
        return "需回避"
    if trend(m) == "均线多头" and quote["changePct"] >= 0:
        return "继续观察"
    return "可小仓位观察"


def risk_cards(m):
    return [
        {"name": "已持有观察", "price": m["ma20"], "text": "观察能否守住中期纪律线。"},
        {"name": "空仓观察", "price": m["ma10"], "text": "等回踩后是否缩量企稳。"},
        {"name": "风险观察线", "price": m["ma20"], "text": "跌破并放量时，复核原始逻辑。"},
        {"name": "上方压力观察", "price": m["high60"], "text": "靠近60日高点时，看量能是否继续支持。"},
    ]


def backtest(rows):
    cash = 100000.0
    shares = 0.0
    trades = []
    curve = []
    for idx in range(60, len(rows)):
        prev = rows[:idx]
        today = rows[idx]
        m5 = ma(prev, 5)
        m20 = ma(prev, 20)
        m60 = ma(prev, 60)
        if shares == 0 and m5 and m20 and m60 and m5 > m20 > m60:
            shares = cash / today["close"]
            trades.append({"date": today["date"], "type": "观察入场", "price": today["close"]})
            cash = 0
        elif shares > 0 and m20 and today["close"] < m20:
            cash = shares * today["close"]
            shares = 0
            trades.append({"date": today["date"], "type": "纪律离场", "price": today["close"]})
        value = cash + shares * today["close"]
        curve.append({"date": today["date"], "value": value})
    final_value = curve[-1]["value"] if curve else 100000
    peak = 100000
    drawdown = 0
    for point in curve:
        peak = max(peak, point["value"])
        drawdown = min(drawdown, (point["value"] - peak) / peak * 100)
    return {
        "initial": 100000,
        "final": final_value,
        "returnPct": (final_value - 100000) / 100000 * 100,
        "maxDrawdownPct": drawdown,
        "tradeCount": len(trades),
        "trades": trades[-8:],
        "note": "示例策略：MA5 > MA20 > MA60 进入观察，跌破 MA20 离场。只用于检验框架，不构成交易建议。",
    }


def analyze_stock(raw):
    quote = fetch_quote(raw)
    rows = fetch_history(quote["code"])
    m = metrics(rows)
    result = {
        "quote": quote,
        "metrics": m,
        "score": score(quote, m),
        "label": label_for(quote, m),
        "strategy": risk_cards(m),
        "backtest": backtest(rows),
        "report": build_report(quote, m),
        "updatedAt": now_text(),
    }
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "insert or replace into snapshots(code, payload, created_at) values(?,?,?)",
            (quote["code"], json.dumps(result, ensure_ascii=False), now_text()),
        )
    return result


def build_report(quote, m):
    return {
        "summary": f"{quote['name']} 当前为{trend(m)}，近20日涨跌 {fmt_pct(m['ret20'])}，RSI {fmt_num(m['rsi'], 0)}。",
        "position": (
            f"当前仓位建议不是买卖指令：已持有先看 {fmt_num(m['ma20'])} 附近是否守住；"
            f"空仓先看 {fmt_num(m['ma10'])} / {fmt_num(m['ma20'])} 附近是否出现缩量企稳。"
        ),
        "cycle": "仅凭免费行情和K线，产业周期、产能、库存、政策和财务数据不足，暂无法做强结论。",
        "technical": (
            f"趋势：{trend(m)}；支撑观察：{fmt_num(m['ma20'])}；"
            f"压力观察：{fmt_num(m['high60'])}；近60日最大回撤 {fmt_pct(m['drawdown60'])}。"
        ),
        "risk": "公开免费接口可能延迟或失败，资金流、龙虎榜、公告原文和财报需要后续接正式数据源交叉验证。",
        "sources": ["东方财富公开行情接口", "东方财富历史K线接口"],
    }


def fmt_num(value, digits=2):
    if value is None or not isinstance(value, (int, float)) or not math.isfinite(value):
        return "--"
    return f"{value:.{digits}f}"


def fmt_pct(value):
    if value is None or not isinstance(value, (int, float)) or not math.isfinite(value):
        return "--"
    return f"{value:+.2f}%"


def read_body(handler):
    length = int(handler.headers.get("content-length", "0"))
    if not length:
        return {}
    return json.loads(handler.rfile.read(length).decode("utf-8"))


def json_response(handler, payload, status=200):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("content-type", "application/json; charset=utf-8")
    handler.send_header("access-control-allow-origin", "*")
    handler.send_header("content-length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class StockLabHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET,POST,DELETE,OPTIONS")
        self.send_header("access-control-allow-headers", "content-type")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_get(parsed)
            return
        self.serve_static(parsed.path)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        try:
            if parsed.path == "/api/analyze":
                body = read_body(self)
                json_response(self, analyze_stock(body.get("code", "")))
            elif parsed.path == "/api/holdings":
                body = read_body(self)
                saved = save_holding(body)
                json_response(self, {"ok": True, "holding": saved})
            else:
                json_response(self, {"error": "接口不存在"}, 404)
        except Exception as exc:
            json_response(self, {"error": str(exc)}, 500)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/holdings":
            code = urllib.parse.parse_qs(parsed.query).get("code", [""])[0]
            with sqlite3.connect(DB_PATH) as conn:
                conn.execute("delete from holdings where code=?", (code,))
            json_response(self, {"ok": True})
            return
        json_response(self, {"error": "接口不存在"}, 404)

    def handle_api_get(self, parsed):
        try:
            query = urllib.parse.parse_qs(parsed.query)
            if parsed.path == "/api/health":
                json_response(self, {"ok": True, "time": now_text()})
            elif parsed.path == "/api/quote":
                json_response(self, fetch_quote(query.get("code", [""])[0]))
            elif parsed.path == "/api/history":
                json_response(self, {"rows": fetch_history(query.get("code", [""])[0])[-240:]})
            elif parsed.path == "/api/analyze":
                json_response(self, analyze_stock(query.get("code", [""])[0]))
            elif parsed.path == "/api/holdings":
                json_response(self, {"holdings": list_holdings()})
            elif parsed.path == "/api/portfolio":
                json_response(self, portfolio_overview())
            else:
                json_response(self, {"error": "接口不存在"}, 404)
        except Exception as exc:
            json_response(self, {"error": str(exc)}, 500)

    def serve_static(self, path):
        if path in ("", "/"):
            file_path = FRONTEND / "index.html"
        else:
            file_path = (FRONTEND / path.lstrip("/")).resolve()
            if FRONTEND not in file_path.parents and file_path != FRONTEND:
                self.send_error(403)
                return
        if not file_path.exists() or not file_path.is_file():
            self.send_error(404)
            return
        content_type = "text/plain; charset=utf-8"
        if file_path.suffix == ".html":
            content_type = "text/html; charset=utf-8"
        elif file_path.suffix == ".css":
            content_type = "text/css; charset=utf-8"
        elif file_path.suffix == ".js":
            content_type = "application/javascript; charset=utf-8"
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        print(f"[{now_text()}] {fmt % args}")


def save_holding(body):
    code = normalize_code(body.get("code", ""))
    name = body.get("name") or code
    saved = {
        "code": code,
        "name": name,
        "cost": float(body.get("cost") or 0),
        "shares": float(body.get("shares") or 0),
        "portfolio": float(body.get("portfolio") or 0),
        "note": body.get("note") or "",
        "updated_at": now_text(),
    }
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            insert into holdings(code,name,cost,shares,portfolio,note,created_at,updated_at)
            values(?,?,?,?,?,?,?,?)
            on conflict(code) do update set
            name=excluded.name,cost=excluded.cost,shares=excluded.shares,
            portfolio=excluded.portfolio,note=excluded.note,updated_at=excluded.updated_at
            """,
            (code, name, saved["cost"], saved["shares"], saved["portfolio"], saved["note"], now_text(), saved["updated_at"]),
        )
    return saved


def list_holdings():
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        return [dict(row) for row in conn.execute("select * from holdings order by updated_at desc")]


def portfolio_overview():
    items = list_holdings()
    enriched = []
    equity = 0
    cost_total = 0
    today = 0
    opportunities = 0
    for item in items:
        quote = None
        try:
            quote = fetch_quote(item["code"])
            market_value = quote["price"] * item["shares"]
            cost_value = item["cost"] * item["shares"]
            floating = market_value - cost_value
            position = market_value / item["portfolio"] * 100 if item["portfolio"] else None
            equity += market_value
            cost_total += cost_value
            today += (quote["price"] - quote["prevClose"]) * item["shares"]
            if abs(quote["changePct"]) >= 3:
                opportunities += 1
        except Exception:
            market_value = None
            cost_value = None
            floating = None
            position = None
        enriched.append({**item, "quote": quote, "marketValue": market_value, "costValue": cost_value, "floating": floating, "positionPct": position})
    return {
        "holdings": enriched,
        "equity": equity,
        "costTotal": cost_total,
        "todayProfit": today,
        "floatingProfit": equity - cost_total if cost_total else None,
        "returnPct": (equity - cost_total) / cost_total * 100 if cost_total else None,
        "opportunities": opportunities,
        "updatedAt": now_text(),
    }


def main():
    init_db()
    port = int(os.environ.get("PORT", "8787"))
    server = ThreadingHTTPServer(("127.0.0.1", port), StockLabHandler)
    print(f"Stock Lab running at http://127.0.0.1:{port}")
    print("按 Ctrl+C 停止服务")
    server.serve_forever()


if __name__ == "__main__":
    main()
