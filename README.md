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

## Notes

Core CPI 更适合衡量实际政策利率，但 CN/IN/TW 尚缺一致口径的 core CPI，因此本版统一使用 headline CPI。ULC proxy 是 PWT proxy，不是官方 ULC。DE/EA 在 1999 年存在制度断点，TFP/ULC 仍使用 Germany proxy 并在页面中标注。

## Paid export approval

导出按钮现在不是直接下载。默认使用 Stripe Checkout 支付网关自动确认收款；支付宝 HK、支付宝 China 和 Citi Zelle 二维码保留为人工确认备用。

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

自动支付流程：

1. 前端调用 `/api/create-checkout-session` 创建 Stripe Checkout Session。
2. 用户在 Stripe Checkout 完成付款。
3. Stripe 调用 `/api/stripe-webhook`。
4. webhook 验证 Stripe 签名后，把 Supabase 里的导出申请状态改为 `approved`。
5. 用户返回网站后，系统按申请编号调用 `/api/export-download` 下载 CSV。

人工备用流程：

用户提交付款申请后，后台会生成申请编号；管理员核对支付宝 HK、支付宝 China 或 Citi Zelle 到账后，用管理员接口批准：

```bash
curl -X POST https://YOUR_DOMAIN/api/admin-approve \
  -H "content-type: application/json" \
  -H "x-admin-token: YOUR_EXPORT_ADMIN_TOKEN" \
  -d '{"id":"REQUEST_ID"}'
```

批准后，用户在同一个弹窗输入申请编号和邮箱，点击检查即可下载。

## FX v3

`npm run data:fx` stores annual-average FX history in `data/Fx_Stress_Model_Data_v3.json` and updates `src/data/stressModel.ts`. The primary source is World Bank `PA.NUS.FCRF` official annual-average exchange rates. Recent years not yet published by World Bank, plus Taiwan, are filled from FRED observed-rate annual averages. EUR before 1999 is proxied by Deutsche Mark using the official fixed conversion rate `1 EUR = 1.95583 DEM`; from 1999 onward it uses Euro Area/EUR data. All pair rates are derived through USD-per-currency annual averages.

## Source Boundaries and Comparability

Some long historical series combine different official sources across time. These source boundaries are documented because they may affect comparability:

- Japan 1970-1995 uses Cabinet Office ESRI official historical tables for selected CA/Savings/FDI/Portfolio data; 1996 onward uses the WDI/IMF/OECD comparable chain.
- Taiwan 1984-2011 uses CBC historical BOP annual tables; 2012 onward uses the CBC open-data chain.
- DE/EA uses Germany as a proxy before 1999 where Euro Area/EU aggregate history is unavailable.

See `docs/data-readme-v4.md` for source-boundary, adjustment, and data-quality details.
