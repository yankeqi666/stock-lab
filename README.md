# Stock Lab · 专业量化复盘工作台

Stock Lab 是一个面向普通投资者的股票复盘和量化纪律检查工具。它不是荐股软件，不预测明天涨跌，不替用户下单，只把公开行情、K线、持仓、风险线和回测结果整理成更容易看的工作台。

## 当前已经实现

- 手机优先首页：账户概览、今日动作、当前持仓、底部导航
- 多只持仓：成本、股数、账户金额保存在每个用户自己的浏览器
- 股票搜索：支持常见 A 股代码和部分中文别名
- 行情读取：东方财富公开行情接口
- 历史 K 线：东方财富公开历史 K 线接口
- 技术指标：MA5 / MA10 / MA20 / MA60、RSI、MACD、近5/20/60日涨跌、60日回撤、量能比
- 策略观察位：已持有观察、空仓观察、风险观察线、上方压力观察
- 示例回测：MA5 > MA20 > MA60 进入观察，跌破 MA20 离场
- AI 风格复盘报告：周期框架、K线执行、交叉验证、仓位纪律提示
- 深色 / 浅色模式
- Cloudflare Pages Functions 公共接口：部署后大家都能通过网址使用
- 本地 Python 专业版服务：方便你自己调试和继续升级

## 免费且无需备案的公开使用方式

推荐使用：

- Cloudflare Pages 免费版
- Cloudflare Pages Functions
- Cloudflare 自动分配的 `pages.dev` 域名

这种方式不需要买服务器，不需要数据库，不需要国内备案。

注意：如果只是 Cloudflare 的“Drag and drop files”，只能上传静态网页，不能运行 `/api/analyze` 这种专业接口。要让大家都能用分析接口，建议用 **Import Git repository** 方式部署。

## Cloudflare Pages 部署步骤

1. 把本项目上传到 GitHub 仓库
2. 打开 Cloudflare Pages
3. 选择 `Import an existing Git repository`
4. 选择你的仓库
5. Build command 留空
6. Build output directory 填 `/`
7. 部署完成后访问 Cloudflare 给你的 `pages.dev` 网址

Cloudflare 会自动识别 `functions/api/analyze.js`，网页请求 `/api/analyze?code=600519` 时会由 Cloudflare Functions 处理。

## 本地运行方式

电脑上有 Python 3 即可：

```bash
python backend/server.py
```

打开：

```text
http://127.0.0.1:8787
```

本地版会使用 SQLite 保存持仓数据，数据库文件在：

```text
data/stock_lab.sqlite3
```

## 数据准确性说明

当前数据来自东方财富公开接口，适合个人复盘、学习和 MVP 验证，但不是交易级数据源。

可能存在：

- 数据延迟
- 接口暂时失败
- 字段变化
- 免费接口限制
- 公告、财报、资金流不完整

正式决策请以交易所公告、上市公司公告、券商软件、巨潮资讯网、东方财富正式页面或付费金融数据服务为准。

## 后续可升级方向

- 接入 Tushare Token
- 接入 AkShare 数据源
- 加入 D1 数据库保存公共策略模板
- 增加 ETF / 场外基金专页
- 增加行业轮动和指数温度
- 增加资金流、龙虎榜、公告原文解析
- 增加多策略回测和参数优化
- 增加用户登录和云端持仓同步

## 免责声明

本工具仅基于公开信息做框架化分析和复盘整理，不构成任何投资建议，不保证收益。投资有风险，入市需谨慎。
