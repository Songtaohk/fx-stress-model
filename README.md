# 长期汇率之宏观因素模型

一个独立的 Vite + React 静态网站，用六个长期宏观因素观察汇率中长期定价环境。

English title: Long-term FX Macro Factor Model.

## Run

```bash
npm install
npm run dev
```

本地地址：

```text
http://127.0.0.1:5173/
```

## Data

第一版使用 `FX_Stress_Model_Data_v2.xlsx` 生成的静态数据常量，不进行推测、插值或外推。空值在图表中保持断点。

主要公式：

- Real Policy Rate = Policy Rate Nominal - CPI Inflation
- Real Policy Rate Z = (RealRate - own-economy mean) / own-economy standard deviation
- Pair Spread = base economy value - quote economy value
- 单国生产率趋势使用 RTFPNA 2010=1
- 两国生产率比较使用 CTFP USA=1 的对数差：ln(CTFP_base) - ln(CTFP_quote)
- 两国 ULC proxy 比较使用对数差：ln(ULC_base) - ln(ULC_quote)

## Automatic Ingestion Rules

自动更新不是直接覆盖整库，而是先经过 `scripts/ingestionPolicy.mjs` 的入库规则层：

- 每个“指标-经济体”先计算历史存档截止年份；该年份及以前的数据锁定，不由自动任务改写。
- 自动更新起点 = 历史存档截止年份 + 1；少数仍属可修订拼接值的项目可用显式 override 保持继续刷新。
- 高频指标（CPI、10年期名义收益率、实际政策利率、实际政策利率 Z-score）按月度或月末观测值生成年度或年内滚动均值；已完成年份至少需要 10 个有效月度/月末观测值才允许入库。
- 年度官方指标至少需要一个可核验的年度官方值才允许入库。
- 缺口不插值、不外推、不用非官方代理补齐。
- GitHub Actions 每天自动运行一次，也可以在 Actions 页面手动 Run workflow。每次有新增数据写入后，会同步更新数据常量、入库日志和网页页脚的最新更新日期。

自动更新脚本：

```bash
npm run data:refresh
```

相关日志：

- `data/recent-update-log.json`
- `data/ingestion-policy-log.json`
- `data/fx-ingestion-log.json`

## Notes

Core CPI 更适合衡量实际政策利率，但 CN/IN/TW 尚缺一致口径的 core CPI，因此本版统一使用 headline CPI。ULC proxy 是 PWT proxy，不是官方 ULC。DE/EA 在 1999 年存在制度断点，TFP/ULC 仍使用 Germany proxy 并在页面中标注。

## Paid export approval

导出按钮现在不是直接下载。当前前端只展示支付宝 HK、支付宝 China 和 Citi Zelle 二维码人工确认方式；自动支付网关相关代码保留在 `api/` 和 `docs/payment-restore-notes.md`，以后可以快速恢复。

需要在 Vercel 环境变量中配置：

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
EXPORT_ADMIN_TOKEN
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SITE_URL
```

先在 Supabase SQL Editor 执行 `docs/supabase-paid-exports.sql` 建表。

未来恢复自动支付时的流程：

1. 前端调用 `/api/create-checkout-session` 创建 Stripe Checkout Session。
2. 用户在 Stripe Checkout 完成付款。
3. Stripe 调用 `/api/stripe-webhook`。
4. webhook 验证 Stripe 签名后，把 Supabase 里的导出申请状态改为 `approved`。
5. 用户返回网站后，系统按申请编号调用 `/api/export-download` 下载 CSV。

当前人工确认流程：

1. 用户扫码付款。
2. 用户填写购买者邮箱、币种、付款方式、交易备注或付款编号。
3. 点击“提交付款确认申请”后，网站打开邮件撰写窗口，收件人为 `songtaozhang@gmail.com`。
4. 作者核对到账后，通过邮件把数据资料发回购买者邮箱。

## FX v3

`npm run data:fx` stores annual-average FX history in `data/Fx_Stress_Model_Data_v3.json` and updates `src/data/stressModel.ts`. The primary source is World Bank `PA.NUS.FCRF` official annual-average exchange rates. Recent years not yet published by World Bank, plus Taiwan, are filled from FRED observed-rate annual averages. EUR before 1999 is proxied by Deutsche Mark using the official fixed conversion rate `1 EUR = 1.95583 DEM`; from 1999 onward it uses Euro Area/EUR data. All pair rates are derived through USD-per-currency annual averages.

## Source Boundaries and Comparability

Some long historical series combine different official sources across time. These source boundaries are documented because they may affect comparability:

- Japan 1970-1995 uses Cabinet Office ESRI official historical tables for selected CA/Savings/FDI/Portfolio data; 1996 onward uses the WDI/IMF/OECD comparable chain.
- Taiwan 1984-2011 uses CBC historical BOP annual tables; 2012 onward uses the CBC open-data chain.
- DE/EA uses Germany as a proxy before 1999 where Euro Area/EU aggregate history is unavailable.

See `docs/data-readme-v4.md` for source-boundary, adjustment, and data-quality details.
