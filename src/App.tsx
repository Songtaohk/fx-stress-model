import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import {
  stressArchivedThrough,
  stressAutoUpdatePolicy,
  stressAutoUpdateStartOverrides,
  stressData,
  stressDataLastUpdated,
  stressEconomyLabels,
  stressFxData,
  stressFxYears,
  stressGroupLabels,
  stressLayers,
  stressMetricMeta,
  stressPairGroups,
  stressPairLabels,
  stressYears,
  type StressEconomyKey,
  type StressGroupKey,
  type StressLayerKey,
  type StressMetricKey,
  type StressPairKey,
  type StressValue,
} from "./data/stressModel";
import {
  alignSeries,
  firstNonNullYear,
  formatValue,
  getLayerMetrics,
  lastNonNullYear,
  logSpreadSeries,
  pairDirectionLabel,
  splitRightAxisIndexesAnchoredLeft,
  splitRightAxisIndexes,
  toCsv,
  type ScaleMode,
  type ViewMode,
  zScoreSeries,
} from "./lib/stressUtils";

type Language = "zh" | "en";
type PageKey = "home" | "data" | StressLayerKey;
type ExportKind = "current" | "full";
type PaymentCurrency = "RMB" | "HKD" | "USD";
type PaymentMethod = "alipay_hk" | "alipay_cn" | "zelle";
type ChartWindowStart = "all" | string;

type ChartLine = { name: string; values: StressValue[]; yAxisIndex?: number; unit?: string; smooth?: boolean };
type SourceLink = { label: string; url: string };
type MetricDoc = { meaning: Record<Language, string>; formula: string; sources: SourceLink[]; limitation?: Record<Language, string> };

const layerOrder: StressLayerKey[] = ["external", "monetary", "productivity", "capital", "demographics", "financial"];
const economyOrder: StressEconomyKey[] = ["eu", "gb", "us", "cn", "jp", "tw", "kr", "in"];
const groupOrder: StressGroupKey[] = ["eur", "gbp", "usd", "cny", "jpy", "twd", "krw"];
const chartYears = [...stressYears];

const copy = {
  zh: {
    title: "长期汇率之宏观因素模型",
    subtitle: "用六个长期宏观压力因素观察汇率的中长期定价环境。",
    home: "模型总览",
    data: "数据解释",
    lang: "English",
    single: "单个经济体",
    pair: "两国比较",
    economy: "经济体",
    base: "基准货币",
    pairSelect: "货币对",
    chartScale: "图表口径",
    chartWindow: "显示区间",
    fullRange: "全样本",
    raw: "原始值",
    zscore: "Z-score",
    exportCurrent: "导出当前表格",
    exportFull: "导出完整数据",
    paidExport: "付费导出",
    paymentNotice: "当前仅开放二维码人工确认收款。这是自动收款程序完成前的备用方案。",
    paidCurrent: "导出当前表格：RMB13 / HKD15 / USD2",
    paidFull: "导出完整数据：RMB50 / HKD55 / USD8",
    autoCheckout: "自动付款并下载",
    manualBackup: "二维码人工确认",
    stripeNotice: "推荐使用自动付款。支付成功后系统会自动确认收款，并开放下载。",
    manualNotice: "完成付款后，请填写以下信息并提交“付款确认申请”。作者收到款项后，会尽快把数据通过邮件发回给您。",
    redirecting: "正在前往安全支付页面...",
    checkoutReturned: "支付已完成，系统正在确认收款。",
    submitPaymentRequest: "提交付款确认申请",
    checkDownload: "下载",
    email: "购买者邮箱 / 下载邮箱",
    paymentMethod: "付款方式",
    currency: "付款币种",
    paymentReference: "交易备注/流水号（可选）",
    requestId: "付款编号",
    requestCreated: "邮件撰写窗口已打开。请确认邮件内容并发送，作者收到款项后会尽快把数据通过邮件发回给您。",
    requestPending: "尚未确认到账，请稍后再试。",
    paymentError: "提交或下载失败，请检查信息后重试。",
    emailRequired: "请先填写有效邮箱。付款成功后，这个邮箱会绑定下载申请。",
    apiUnavailable: "自动付款服务暂不可用。请确认已部署后端 API，并已配置 Stripe 与 Supabase 环境变量。",
    close: "关闭",
    omittedTitle: "暂未纳入的因素",
    factorIntro: "每个层级既可以看单个经济体的历史曲线，也可以按货币报价方向做两国比较。比较值一律为 base economy - quote economy。",
    leftAxis: "左",
    rightAxis: "右",
    fxAxis: "汇率",
    indicatorAxis: "指标比较",
    mixedAxis: "其它指标",
    gapTitle: "当前显示数据的缺口说明",
    metricExplanation: "指标含义与公式",
    sourceExplanation: "指标来源",
    versionReadme: "数据来源边界与可比性说明",
    coreMetrics: "核心指标",
  },
  en: {
    title: "Long-term FX Macro Factor Model",
    subtitle: "A six-layer macro factor framework for long-term FX valuation context.",
    home: "Overview",
    data: "Data Interpretation",
    lang: "中文",
    single: "Single economy",
    pair: "Cross-economy comparison",
    economy: "Economy",
    base: "Base currency",
    pairSelect: "FX pair",
    chartScale: "Scale",
    chartWindow: "Window",
    fullRange: "Full sample",
    raw: "Raw values",
    zscore: "Z-score",
    exportCurrent: "Export current table",
    exportFull: "Export full data",
    paidExport: "Paid export",
    paymentNotice: "QR-code manual payment confirmation is currently the only available option. This is the backup flow before automated payment is completed.",
    paidCurrent: "Current table: RMB13 / HKD15 / USD2",
    paidFull: "Full data: RMB50 / HKD55 / USD8",
    autoCheckout: "Pay automatically and download",
    manualBackup: "Manual QR confirmation",
    stripeNotice: "Automatic payment is recommended. After payment succeeds, the system confirms receipt and enables download.",
    manualNotice: "After payment is completed, fill in the information below and submit the payment confirmation request. After the author receives the payment, the data will be sent back by email as soon as possible.",
    redirecting: "Redirecting to secure payment...",
    checkoutReturned: "Payment completed. The system is confirming receipt.",
    submitPaymentRequest: "Submit payment request",
    checkDownload: "Download",
    email: "Buyer / download email",
    paymentMethod: "Payment method",
    currency: "Payment currency",
    paymentReference: "Payment note / transaction id (optional)",
    requestId: "Payment id",
    requestCreated: "The email compose window has opened. Please review and send the email; after the author receives payment, the data will be sent back by email as soon as possible.",
    requestPending: "Payment has not been approved yet. Please try again later.",
    paymentError: "Submission or download failed. Please check the details and try again.",
    emailRequired: "Please enter a valid email first. The paid download request will be linked to this email.",
    apiUnavailable: "Automatic payment service is not available yet. Confirm the backend API is deployed and Stripe/Supabase environment variables are configured.",
    close: "Close",
    omittedTitle: "Factors not yet included",
    factorIntro: "Each layer supports a single-economy history view and a pair-comparison view. Pair values are always base economy minus quote economy.",
    leftAxis: "L",
    rightAxis: "R",
    fxAxis: "FX rate",
    indicatorAxis: "indicator comparison",
    mixedAxis: "other indicators",
    gapTitle: "Current Selection Data Gaps",
    metricExplanation: "Metric Meaning and Formula",
    sourceExplanation: "Metric sources",
    versionReadme: "Data Source Boundaries and Comparability Notes",
    coreMetrics: "Core metrics",
  },
} as const;

const layerDescriptions: Record<StressLayerKey, Record<Language, string>> = {
  external: {
    zh: "外部平衡刻画一国与海外部门之间的资金净流入、净资产位置和外汇储备缓冲。经常账户持续顺差通常代表国内储蓄相对投资更充足；NIIP/GDP 反映长期积累的债权或债务位置；外汇储备/GDP 则衡量面对资本流出和汇率压力时的流动性缓冲。",
    en: "External balance describes net funding flows with the rest of the world, the accumulated external asset position, and reserve buffers. CA/GDP captures the saving-investment balance, NIIP/GDP measures the stock of net external claims or liabilities, and FX reserves/GDP gauges liquidity protection against outflows and FX stress.",
  },
  monetary: {
    zh: "货币条件衡量政策利率、通胀和长期收益率共同形成的实际金融约束。实际政策利率观察短端政策紧缩或宽松程度，CPI 通胀反映购买力压力，10年期名义收益率则代表长期资金价格和期限溢价环境。",
    en: "Monetary conditions measure the real financial constraint created by policy rates, inflation, and long yields. The real policy rate tracks short-end policy tightness, CPI inflation captures purchasing-power pressure, and the 10Y nominal yield represents long-term funding costs and term-premium conditions.",
  },
  productivity: {
    zh: "生产率层级观察长期供给侧竞争力，而不是解释短期汇率波动。单国趋势使用 RTFPNA 2010=1，便于看本经济体自身生产率路径；两国比较使用 CTFP USA=1，更适合衡量跨国技术能级差异；单位劳动力成本代理用于补充观察成本竞争力。",
    en: "Productivity focuses on long-run supply-side competitiveness rather than short-term FX moves. Single-economy trends use RTFPNA 2010=1, pair comparisons use CTFP USA=1 for cross-country technology-level differences, and the ULC proxy adds a cost-competitiveness lens.",
  },
  capital: {
    zh: "资本流动层级观察直接投资和组合投资的跨境净流向。FDI 更接近长期产业资本和企业经营布局，组合投资更敏感于利差、风险偏好和市场流动性；两者方向统一为资产-负债，便于与汇率报价方向一致地做比较。",
    en: "Capital flow tracks cross-border net flows in direct and portfolio investment. FDI is closer to long-term industrial capital and corporate footprint decisions, while portfolio investment is more sensitive to rates, risk appetite, and liquidity. Both are aligned as assets minus liabilities for consistent pair comparisons.",
  },
  demographics: {
    zh: "人口与储蓄层级衡量长期资金供给和人口结构压力。总储蓄率影响经常账户和国内资本供给，老年抚养比影响储蓄倾向、财政压力、资本回报和长期均衡汇率。",
    en: "Demographics and savings measure long-run domestic funding supply and structural population pressure. Gross savings/GDP affects current accounts and domestic capital availability, while old-age dependency influences saving behavior, fiscal pressure, returns on capital, and long-run equilibrium FX.",
  },
  financial: {
    zh: "金融稳定层级观察财政、外债和信贷周期带来的脆弱性。政府债务/GDP 反映财政杠杆，外债/GDP 衡量居民部门对非居民的债务暴露，信贷/GDP缺口用于观察金融周期偏离长期趋势的压力。",
    en: "Financial stability captures vulnerabilities from fiscal leverage, external debt, and the credit cycle. Government debt/GDP measures fiscal leverage, external debt/GDP captures resident debt exposure to non-residents, and the credit-to-GDP gap tracks financial-cycle pressure relative to trend.",
  },
};

const omittedFactors = {
  zh: ["贸易条件与大宗商品价格", "财政赤字与财政冲动", "地缘政治与风险溢价", "资本管制与市场流动性", "REER 与估值锚", "远期利率与通胀预期"],
  en: ["Terms of trade and commodity prices", "Fiscal balance and fiscal impulse", "Geopolitics and risk premia", "Capital controls and market liquidity", "REER and valuation anchors", "Forward rates and inflation expectations"],
};

const metricDocs: Record<StressMetricKey, MetricDoc> = {
  caGdp: { meaning: { zh: "经常账户顺差或逆差占 GDP 的比例，反映储蓄-投资缺口和外部融资需求。", en: "Current-account surplus or deficit as a share of GDP, capturing the saving-investment gap and external funding need." }, formula: "Current account balance / nominal GDP × 100", sources: [{ label: "IMF Balance of Payments", url: "https://data.imf.org/" }, { label: "World Bank", url: "https://data.worldbank.org/" }, { label: "Japan Cabinet Office ESRI National Accounts", url: "https://www.esri.cao.go.jp/en/sna/data/kakuhou/files/1998/12annual_report_e.html" }, { label: "CBC Taiwan BOP Historical Data", url: "https://www.cbc.gov.tw/en/cp-512-2072-33BAE-2.html" }] },
  niipGdp: { meaning: { zh: "一国对外金融资产减去对外金融负债后的净头寸，占 GDP 比例。", en: "Net external financial assets minus liabilities as a share of GDP." }, formula: "Net international investment position / nominal GDP × 100", sources: [{ label: "IMF IIP", url: "https://data.imf.org/" }, { label: "External Wealth of Nations", url: "https://www.brookings.edu/articles/the-external-wealth-of-nations-database/" }] },
  fxReservesGdp: { meaning: { zh: "外汇储备相对经济规模的缓冲能力。", en: "Foreign-exchange reserve buffer relative to economic size." }, formula: "FX reserves / nominal GDP × 100", sources: [{ label: "World Bank", url: "https://data.worldbank.org/" }, { label: "IMF IFS", url: "https://data.imf.org/" }, { label: "CBC Taiwan", url: "https://www.cbc.gov.tw/en/" }] },
  realPolicyRate: { meaning: { zh: "扣除通胀后的政策利率，衡量短端实际货币条件。", en: "Policy rate after inflation, measuring short-end real monetary conditions." }, formula: "Nominal policy rate - headline CPI inflation", sources: [{ label: "FRED", url: "https://fred.stlouisfed.org/" }, { label: "World Bank CPI", url: "https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG" }, { label: "OECD Data", url: "https://data-explorer.oecd.org/" }], limitation: { zh: "Core CPI 理论上更适合，但 CN/IN/TW 缺少一致口径，本版统一使用 headline CPI。", en: "Core CPI is conceptually cleaner, but headline CPI is used for consistency because CN/IN/TW lack aligned core CPI coverage." } },
  realPolicyRateZ: { meaning: { zh: "实际政策利率相对自身历史分布的位置。", en: "Position of real policy rate relative to its own history." }, formula: "(Real policy rate - own-economy mean) / own-economy sample standard deviation", sources: [{ label: "Derived from Real Policy Rate", url: "https://fred.stlouisfed.org/" }] },
  cpiInflation: { meaning: { zh: "居民消费价格同比通胀。", en: "Headline consumer-price inflation." }, formula: "Annual average CPI index YoY inflation, %; recent high-frequency updates use official annual CPI releases or the YoY change in the annual average of monthly CPI index levels.", sources: [{ label: "World Bank CPI", url: "https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG" }, { label: "IMF", url: "https://data.imf.org/" }, { label: "OECD Data", url: "https://data-explorer.oecd.org/" }, { label: "ONS CPI", url: "https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7g7/mm23/data" }, { label: "China NBS CPI", url: "https://www.stats.gov.cn/english/PressRelease/202601/t20260112_1962292.html" }, { label: "Statistics Japan CPI", url: "https://www.stat.go.jp/english/data/cpi/" }, { label: "Korea MODS CPI", url: "https://mods.go.kr/board.es?act=view&bid=11751&list_no=442793&mid=a20109020000" }, { label: "India MoSPI CPI", url: "https://www.mospi.gov.in/consumer-price-index-cpi-and-supply-use-table-sut" }] },
  nominal10yYield: { meaning: { zh: "10年期政府债券名义收益率，衡量长期利率环境。", en: "Nominal 10-year government bond yield, measuring long-end rates." }, formula: "Annual average 10Y government bond yield", sources: [{ label: "FRED", url: "https://fred.stlouisfed.org/" }, { label: "OECD Data", url: "https://data-explorer.oecd.org/" }, { label: "TPEx Taiwan", url: "https://www.tpex.org.tw/en-us/bond/info/quote/yield.html" }] },
  tfpRtfpna: { meaning: { zh: "PWT constant national prices 的全要素生产率，适合看单国长期生产率趋势。", en: "PWT TFP at constant national prices, suited for single-economy productivity trends." }, formula: "PWT rtfpna, 2010 = 1", sources: [{ label: "Penn World Table", url: "https://www.rug.nl/ggdc/productivity/pwt/" }], limitation: { zh: "DE/EA 的 TFP 使用 Germany proxy。", en: "DE/EA TFP uses Germany proxy." } },
  tfpCtfp: { meaning: { zh: "PWT current PPPs 的全要素生产率，适合做跨国技术能级比较。两国比较使用对数差，以表达相对比例差异。", en: "PWT TFP at current PPPs, suited for cross-country level comparison. Pair comparisons use log spread to express relative proportional gaps." }, formula: "Pair comparison = ln(CTFP_base) - ln(CTFP_quote)", sources: [{ label: "Penn World Table", url: "https://www.rug.nl/ggdc/productivity/pwt/" }], limitation: { zh: "DE/EA 的 TFP 使用 Germany proxy。", en: "DE/EA TFP uses Germany proxy." } },
  ulcProxy: { meaning: { zh: "单位劳动力成本代理变量，用于观察成本竞争力。它用 PWT 的劳动报酬占比（labsh）乘以产出价格水平（pl_gdpo）构造，再把各经济体自身序列重基准为 2010=100。两国比较使用对数差，以观察相对成本压力。", en: "Proxy for unit labor cost, used to track cost competitiveness. It is built as PWT labor compensation share (labsh) multiplied by the output-side price level (pl_gdpo), then each economy's own series is rebased to 2010=100. Pair comparisons use log spread to track relative cost pressure." }, formula: "ULC proxy = labsh × pl_gdpo, indexed to 2010 = 100; pair comparison = ln(ULC_base) - ln(ULC_quote)", sources: [{ label: "Penn World Table", url: "https://www.rug.nl/ggdc/productivity/pwt/" }, { label: "OECD ULC", url: "https://data-explorer.oecd.org/" }], limitation: { zh: "这是 proxy，不是官方 ULC；它没有直接使用各国官方工资总额、雇主社保成本、实际产出和工时口径，因此适合作为跨国覆盖较广的长期成本竞争力辅助变量，不适合作为正式 ULC 结论。", en: "This is a proxy, not official ULC; it does not directly use each economy's official compensation, employer social contributions, real output, and hours framework. It is useful as a broad-coverage long-run cost-competitiveness aid, not as an official ULC measure." } },
  fdiGdp: { meaning: { zh: "直接投资金融账户净额占 GDP，方向统一为资产-负债。", en: "FDI financial-account net balance as a share of GDP, aligned as assets minus liabilities." }, formula: "FDI net financial-account balance / GDP × 100", sources: [{ label: "IMF Balance of Payments", url: "https://data.imf.org/" }, { label: "China SAFE BOP", url: "https://www.safe.gov.cn/en/2026/0327/2406.html" }, { label: "Bank of Korea BOP", url: "https://www.bok.or.kr/eng/bbs/E0000634/view.do?depth=400069&menuNo=400069&nttId=10096374&oldMenuNo=400007&programType=newsDataEng&relate=Y" }, { label: "RBI Balance of Payment", url: "https://rbi.org.in/Scripts/SDDS_ViewDetails.aspx?Id=5&IndexTitle=Balance+of+Payment" }, { label: "Japan Cabinet Office ESRI External Transactions", url: "https://www.esri.cao.go.jp/en/sna/data/kakuhou/files/1998/12annual_report_e.html" }, { label: "CBC Taiwan BOP Historical Data", url: "https://www.cbc.gov.tw/en/cp-512-2072-33BAE-2.html" }] },
  portfolioGdp: { meaning: { zh: "组合投资金融账户净额占 GDP，方向统一为资产-负债。", en: "Portfolio financial-account net balance as a share of GDP, aligned as assets minus liabilities." }, formula: "Portfolio net financial-account balance / GDP × 100", sources: [{ label: "IMF Balance of Payments", url: "https://data.imf.org/" }, { label: "China SAFE BOP", url: "https://www.safe.gov.cn/en/2026/0327/2406.html" }, { label: "Bank of Korea BOP", url: "https://www.bok.or.kr/eng/bbs/E0000634/view.do?depth=400069&menuNo=400069&nttId=10096374&oldMenuNo=400007&programType=newsDataEng&relate=Y" }, { label: "RBI Balance of Payment", url: "https://rbi.org.in/Scripts/SDDS_ViewDetails.aspx?Id=5&IndexTitle=Balance+of+Payment" }, { label: "Japan Cabinet Office ESRI External Transactions", url: "https://www.esri.cao.go.jp/en/sna/data/kakuhou/files/1998/12annual_report_e.html" }, { label: "CBC Taiwan BOP Historical Data", url: "https://www.cbc.gov.tw/en/cp-512-2072-33BAE-2.html" }] },
  savingsGdp: { meaning: { zh: "总储蓄占 GDP，反映国内资金供给。", en: "Gross savings as a share of GDP, capturing domestic funding supply." }, formula: "Gross savings / GDP × 100", sources: [{ label: "World Bank", url: "https://data.worldbank.org/" }, { label: "IMF WEO", url: "https://www.imf.org/en/Publications/WEO/weo-database" }, { label: "Japan Cabinet Office ESRI National Accounts", url: "https://www.esri.cao.go.jp/en/sna/data/kakuhou/files/1998/12annual_report_e.html" }, { label: "Taiwan DGBAS", url: "https://eng.stat.gov.tw/" }] },
  oldAgeDependency: { meaning: { zh: "老年人口相对劳动年龄人口的比例，反映人口结构压力。", en: "Older population relative to working-age population, capturing demographic pressure." }, formula: "Population aged 65+ / population aged 15-64 × 100", sources: [{ label: "World Bank", url: "https://data.worldbank.org/" }, { label: "UN Population", url: "https://population.un.org/" }, { label: "Taiwan NDC", url: "https://pop-proj.ndc.gov.tw/main_en/index.aspx" }] },
  govtDebtGdp: { meaning: { zh: "政府总债务占 GDP，反映财政杠杆。", en: "Government gross debt as a share of GDP, capturing fiscal leverage." }, formula: "Gross government debt / GDP × 100", sources: [{ label: "IMF DataMapper", url: "https://www.imf.org/external/datamapper/" }, { label: "IMF WEO", url: "https://www.imf.org/en/Publications/WEO/weo-database" }] },
  externalDebtGdp: { meaning: { zh: "居民对非居民的外债存量占 GDP。", en: "External debt owed by residents to non-residents as a share of GDP." }, formula: "External debt stock / nominal GDP × 100", sources: [{ label: "World Bank QEDS", url: "https://databank.worldbank.org/source/quarterly-external-debt-statistics" }, { label: "Japan MOF External Debt Statistics", url: "https://www.mof.go.jp/english/policy/international_policy/reference/balance_of_payments/notice/e_osirase_03.htm" }, { label: "CBC Taiwan External Debt", url: "https://www.cbc.gov.tw/en/cp-515-30006-89479-2.html" }, { label: "China SAFE External Debt", url: "https://www.safe.gov.cn/en/2026/0327/2408.html" }, { label: "India External Debt Statistics", url: "https://dea.gov.in/reports-external-debt" }] },
  creditGap: { meaning: { zh: "信贷/GDP 相对长期趋势的缺口，衡量金融周期压力。", en: "Credit-to-GDP gap relative to long-run trend, measuring financial-cycle pressure." }, formula: "BIS credit-to-GDP gap, percentage points", sources: [{ label: "BIS Credit-to-GDP gaps", url: "https://www.bis.org/statistics/c_gaps.htm" }], limitation: { zh: "台湾暂无 BIS 口径，保持缺口。", en: "Taiwan has no BIS-aligned series and remains blank." } },
};

const dataReadmeCards = [
  {
    title: { zh: "日本 1970-1995", en: "Japan 1970-1995" },
    body: {
      zh: "日本 CA/GDP、Savings/GDP、FDI/GDP、Portfolio/GDP 在 1970-1995 年来自 Japan Cabinet Office ESRI 官方历史国民账户与对外交易表；1996 年后来自 WDI/IMF/OECD 可比口径。已统一转成 GDP 或国内总支出比例，并把 FDI/Portfolio 方向调整为资产-负债。1995/1996 附近可能有来源与方法造成的水平跳变。",
      en: "Japan CA/GDP, Savings/GDP, FDI/GDP, and Portfolio/GDP use Japan Cabinet Office ESRI official historical tables for 1970-1995 and the WDI/IMF/OECD comparable chain from 1996 onward. Values are converted to a GDP or gross-domestic-expenditure ratio, and FDI/Portfolio direction is aligned as assets minus liabilities. The 1995/1996 boundary may include source-methodology level shifts.",
    },
  },
  {
    title: { zh: "台湾 1984-2011", en: "Taiwan 1984-2011" },
    body: {
      zh: "台湾 CA/GDP、FDI/GDP、Portfolio/GDP 在 1984-2011 年来自 CBC 官方历史 BOP 年度表，分母使用 DGBAS 名义 GDP 美元值；2012 年后来自 CBC open-data 链条。CBC 说明 1984 年起的 BOP 时间序列已转换为 BPM6，但 2011/2012 仍是表格链条和修订机制边界。",
      en: "Taiwan CA/GDP, FDI/GDP, and Portfolio/GDP use CBC official historical annual BOP tables for 1984-2011 with DGBAS nominal GDP in USD as denominator; 2012 onward uses the CBC open-data chain. CBC notes that BOP time series from 1984 have been converted to BPM6, but 2011/2012 remains a table-chain and revision boundary.",
    },
  },
  {
    title: { zh: "韩国检查结论", en: "Korea Coverage Check" },
    body: {
      zh: "韩国 CA/FDI/Portfolio/Savings 已覆盖到 1976 年起，满足 1990 年前覆盖目标。韩国实际政策利率、10年期收益率和外债/GDP没有用隔夜拆借、3年国债或 IIP 负债代理替代，避免把非同定义指标混入主表。",
      en: "Korea CA/FDI/Portfolio/Savings already start in 1976, meeting the pre-1990 target. Korea real policy rate, 10Y yield, and external debt/GDP are not replaced by overnight call rate, 3Y government yield, or IIP-liability proxies, to avoid mixing non-identical metrics into the main tables.",
    },
  },
  {
    title: { zh: "DE/EA 与 EUR 历史", en: "DE/EA And EUR History" },
    body: {
      zh: "1999 年前 DE/EA 使用德国代理；1999 年后部分指标切换到欧元区或欧盟整体口径。EUR 1999 年前用德国马克按 1 EUR = 1.95583 DEM 合成。TFP/ULC 仍使用 Germany proxy，不代表欧元区整体生产率。",
      en: "Before 1999, DE/EA uses Germany as proxy; from 1999 onward selected indicators switch to Euro Area or EU aggregates. Pre-1999 EUR FX is synthesized from Deutsche Mark at 1 EUR = 1.95583 DEM. TFP/ULC still use Germany proxy and are not Euro Area aggregate productivity.",
    },
  },
  {
    title: { zh: "未做的处理", en: "What Was Not Done" },
    body: {
      zh: "没有插值、外推或用不可核验代理值补历史缺口。外债不用 IIP 负债替代；台湾 Credit_Gap 因 BIS 无一致口径仍为空；ULC_proxy 是 PWT 构造的成本竞争力代理，不是官方 ULC。",
      en: "No interpolation, extrapolation, or unverifiable proxy values were used. External debt is not replaced by IIP liabilities; Taiwan Credit_Gap remains blank because BIS has no aligned series; ULC_proxy is a PWT-based cost-competitiveness proxy, not official ULC.",
    },
  },
];

const dataDictionaryRows = [
  {
    metric: { zh: "经常账户/GDP", en: "CA/GDP" },
    raw: {
      zh: "WDI/IMF/OECD 的经常账户占 GDP；日本 1970-1995 为 ESRI 对外交易日历年日元表；台湾 1984-2011 为 CBC BOP 美元百万年度表。",
      en: "WDI/IMF/OECD current account as %GDP; Japan 1970-1995 from ESRI external-transactions yen table; Taiwan 1984-2011 from CBC BOP USD mn annual table.",
    },
    formula: {
      zh: "主链条直接采用 %GDP；日本早期 = 经常交易盈余 / 国内总支出 * 100；台湾早期 = CBC 经常账户 USD mn / DGBAS 名义 GDP USD * 100。",
      en: "Main chain is direct %GDP; Japan early = current-transaction surplus / gross domestic expenditure * 100; Taiwan early = CBC current account USD mn / DGBAS nominal GDP USD * 100.",
    },
    quality: {
      zh: "日本 1995/1996、台湾 2011/2012 是来源边界。",
      en: "Japan 1995/1996 and Taiwan 2011/2012 are source boundaries.",
    },
  },
  {
    metric: { zh: "净国际投资头寸/GDP", en: "NIIP/GDP" },
    raw: {
      zh: "IMF IIP、EWN 或各官方 IIP 头寸；台湾为 CBC IIP 美元值。",
      en: "IMF IIP, EWN, or official IIP position series; Taiwan from CBC IIP USD values.",
    },
    formula: {
      zh: "净国际投资头寸 / 名义 GDP * 100。",
      en: "Net international investment position / nominal GDP * 100.",
    },
    quality: {
      zh: "IIP 与外债不同，不能用 IIP 负债替代外债。",
      en: "IIP is not external debt; IIP liabilities are not used as external-debt substitutes.",
    },
  },
  {
    metric: { zh: "外汇储备/GDP", en: "FX reserves/GDP" },
    raw: {
      zh: "World Bank/IMF 储备资产；台湾来自 CBC 外汇储备数据。",
      en: "World Bank/IMF reserve assets; Taiwan from CBC FX reserves.",
    },
    formula: {
      zh: "外汇储备 / 名义 GDP * 100。",
      en: "FX reserves / nominal GDP * 100.",
    },
    quality: {
      zh: "储备定义跨国较可比，但央行持有结构和估值调整会影响数值。",
      en: "Reserve definitions are relatively comparable, but holding structure and valuation effects matter.",
    },
  },
  {
    metric: { zh: "实际政策利率", en: "Real policy rate" },
    raw: {
      zh: "名义政策利率来自央行/OECD/FRED 等高频或月度序列；通胀使用 headline CPI 月度同比年均值。",
      en: "Nominal policy rates from central-bank/OECD/FRED-type high-frequency or monthly series; inflation uses annual/YTD averages of monthly headline CPI YoY rates.",
    },
    formula: {
      zh: "名义政策利率年均值或年内滚动均值 - CPI 月度同比年均值或年内滚动均值。",
      en: "Annual or YTD average nominal policy rate minus annual or YTD average monthly headline CPI YoY inflation.",
    },
    quality: {
      zh: "Core CPI 更理想，但为覆盖 CN/IN/TW，统一使用 headline CPI。",
      en: "Core CPI is cleaner conceptually, but headline CPI is used for CN/IN/TW coverage consistency.",
    },
  },
  {
    metric: { zh: "实际政策利率 Z-score", en: "Real policy rate Z-score" },
    raw: {
      zh: "由实际政策利率派生。",
      en: "Derived from real policy rate.",
    },
    formula: {
      zh: "(RealRate - 本经济体样本均值) / 本经济体样本标准差。",
      en: "(RealRate - own-economy sample mean) / own-economy sample standard deviation.",
    },
    quality: {
      zh: "Z-score 是相对自身历史，不适合解读为绝对利率水平。",
      en: "Z-score is relative to own history and is not an absolute rate level.",
    },
  },
  {
    metric: { zh: "CPI通胀", en: "CPI inflation" },
    raw: {
      zh: "World Bank/IMF/OECD/CBC/DGBAS/FRED 等 CPI；近期年份优先使用月度 CPI 指数。",
      en: "CPI from World Bank/IMF/OECD/CBC/DGBAS/FRED-type sources; recent years prioritize monthly CPI index series.",
    },
    formula: {
      zh: "月度 CPI 指数先计算月度同比，再对当年已公布月份取算术平均；完整历史年度可直接采用官方年度同比。",
      en: "Monthly CPI index values are converted to monthly YoY rates, then averaged across available months in the year; completed historical years may use official annual YoY rates directly.",
    },
    quality: {
      zh: "2026 年为年内滚动值，会随月度 CPI 发布自动更新；各国 CPI 篮子和基期不同，但同比通胀作为宏观变量可比性较高。",
      en: "2026 is a rolling YTD value and updates as monthly CPI is released; CPI baskets and base years differ, but YoY inflation is broadly comparable as a macro variable.",
    },
  },
  {
    metric: { zh: "10年期名义收益率", en: "10Y nominal yield" },
    raw: {
      zh: "FRED/OECD/TPEx 等10年期政府债券收益率；近期年份用月度或日度高频序列。",
      en: "10Y government bond yields from FRED/OECD/TPEx-type sources; recent years use monthly or daily high-frequency series.",
    },
    formula: {
      zh: "日度序列先取每个月最后一个可用观察值，再对当年已公布月末值取算术平均；月度序列直接取当年已公布月份均值。",
      en: "Daily series first take the last available observation in each month, then average available month-end points in the year; monthly series average available monthly points directly.",
    },
    quality: {
      zh: "2026 年为年内滚动值，会随月末收益率更新；韩国和台湾早期缺口未用短期限债券替代。",
      en: "2026 is a rolling YTD value and updates with month-end yields; early Korea and Taiwan gaps are not replaced with shorter-maturity bond proxies.",
    },
  },
  {
    metric: { zh: "TFP RTFPNA", en: "TFP RTFPNA" },
    raw: {
      zh: "Penn World Table rtfpna。",
      en: "Penn World Table rtfpna.",
    },
    formula: {
      zh: "PWT constant national prices, 2010=1；单国趋势使用。",
      en: "PWT constant national prices, 2010=1; used for single-economy trend.",
    },
    quality: {
      zh: "DE/EA 使用 Germany proxy。",
      en: "DE/EA uses Germany proxy.",
    },
  },
  {
    metric: { zh: "TFP CTFP", en: "TFP CTFP" },
    raw: {
      zh: "Penn World Table ctfp。",
      en: "Penn World Table ctfp.",
    },
    formula: {
      zh: "PWT current PPPs, USA=1；两国比较 = ln(base) - ln(quote)。",
      en: "PWT current PPPs, USA=1; pair comparison = ln(base) - ln(quote).",
    },
    quality: {
      zh: "更适合跨国技术能级比较；对数差表达相对比例差异，但仍受 PPP 和 PWT 方法影响。",
      en: "Better for cross-country technology-level comparison; log spread expresses proportional gaps but still depends on PPP and PWT methodology.",
    },
  },
  {
    metric: { zh: "单位劳动力成本代理", en: "ULC proxy" },
    raw: {
      zh: "PWT labsh 与 pl_gdpo。",
      en: "PWT labsh and pl_gdpo.",
    },
    formula: {
      zh: "labsh * pl_gdpo，并把各经济体自身序列重基准为 2010=100；两国比较 = ln(base) - ln(quote)。",
      en: "labsh * pl_gdpo, rebased within each economy to 2010=100; pair comparison = ln(base) - ln(quote).",
    },
    quality: {
      zh: "这是非官方 ULC proxy，不含官方工资总额、社保、工时完整口径。",
      en: "This is not official ULC and does not use full official compensation, social contribution, and hours framework.",
    },
  },
  {
    metric: { zh: "FDI金融账户净额/GDP", en: "FDI net/GDP" },
    raw: {
      zh: "WDI/IMF BOP；日本 1970-1995 为 ESRI 资本交易；台湾 1984-2011 为 CBC BOP；2025 年 CN 使用 SAFE、KR 使用 BOK、IN 使用 RBI 季度 BOP 拼接。",
      en: "WDI/IMF BOP; Japan 1970-1995 from ESRI capital transactions; Taiwan 1984-2011 from CBC BOP; 2025 CN uses SAFE, KR uses BOK, and IN uses stitched RBI quarterly BOP.",
    },
    formula: {
      zh: "统一为资产 - 负债，再除以名义 GDP 或国内总支出 * 100。",
      en: "Aligned as assets - liabilities, then divided by nominal GDP or gross domestic expenditure * 100.",
    },
    quality: {
      zh: "早期资本账户分类可能与后期 BPM 口径不同；印度 2025 为日历年季度拼接值，保留 2025 自动刷新以便后续替换为完整官方年度链条。",
      en: "Early capital-account classifications may differ from later BPM presentation; India 2025 is a calendar-year stitch from quarterly releases and remains refreshable from 2025 until a complete official annual chain is available.",
    },
  },
  {
    metric: { zh: "组合投资金融账户净额/GDP", en: "Portfolio net/GDP" },
    raw: {
      zh: "WDI/IMF BOP；日本早期用 ESRI securities investment；台湾早期用 CBC portfolio investment；2025 年 CN 使用 SAFE、KR 使用 BOK、IN 使用 RBI 季度 BOP 拼接。",
      en: "WDI/IMF BOP; Japan early period uses ESRI securities investment; Taiwan early period uses CBC portfolio investment; 2025 CN uses SAFE, KR uses BOK, and IN uses stitched RBI quarterly BOP.",
    },
    formula: {
      zh: "统一为资产 - 负债，再除以名义 GDP 或国内总支出 * 100。",
      en: "Aligned as assets - liabilities, then divided by nominal GDP or gross domestic expenditure * 100.",
    },
    quality: {
      zh: "日本 securities investment 是最接近的官方历史概念，但与后期 portfolio 口径不完全相同。",
      en: "Japan securities investment is the closest official historical concept but may not be identical to later portfolio definitions.",
    },
  },
  {
    metric: { zh: "总储蓄率", en: "Gross savings/GDP" },
    raw: {
      zh: "WDI/OECD/IMF；日本 1970-1995 由 ESRI 国民账户构造；台湾来自 DGBAS/既有表。",
      en: "WDI/OECD/IMF; Japan 1970-1995 constructed from ESRI national accounts; Taiwan from DGBAS/existing table.",
    },
    formula: {
      zh: "主链条直接采用 %GDP；日本早期 = (国内总支出 - 私人最终消费 - 政府最终消费) / 国内总支出 * 100。",
      en: "Main chain is direct %GDP; Japan early = (gross domestic expenditure - private final consumption - government final consumption) / gross domestic expenditure * 100.",
    },
    quality: {
      zh: "日本早期为国内历史表构造口径，1995/1996 有断点风险。",
      en: "Japan early values are constructed from domestic historical tables; 1995/1996 has boundary risk.",
    },
  },
  {
    metric: { zh: "老年抚养比", en: "Old-age dependency" },
    raw: {
      zh: "World Bank/UN/Taiwan NDC 人口数据。",
      en: "World Bank/UN/Taiwan NDC population data.",
    },
    formula: {
      zh: "65岁及以上人口 / 15-64岁人口 * 100。",
      en: "Population aged 65+ / population aged 15-64 * 100.",
    },
    quality: {
      zh: "人口定义较稳定，但预测值不应与历史实绩混用；本版不外推。",
      en: "Population definitions are relatively stable; projections should not be mixed with history. This version does not extrapolate.",
    },
  },
  {
    metric: { zh: "政府债务/GDP", en: "Government debt/GDP" },
    raw: {
      zh: "IMF WEO/DataMapper 或官方债务表。",
      en: "IMF WEO/DataMapper or official debt tables.",
    },
    formula: {
      zh: "政府总债务 / 名义 GDP * 100。",
      en: "Gross government debt / nominal GDP * 100.",
    },
    quality: {
      zh: "政府层级和总债务定义可能有跨国差异。",
      en: "Government perimeter and gross-debt definitions may differ across countries.",
    },
  },
  {
    metric: { zh: "外债/GDP", en: "External debt/GDP" },
    raw: {
      zh: "World Bank QEDS；中国 2025 使用 SAFE 年末外债；印度 2025 使用印度官方外债报告；台湾使用 CBC SDDS External Debt。",
      en: "World Bank QEDS; China 2025 uses SAFE year-end external debt; India 2025 uses the official India external-debt report; Taiwan uses CBC SDDS External Debt.",
    },
    formula: {
      zh: "外债存量 / 名义 GDP * 100。",
      en: "External debt stock / nominal GDP * 100.",
    },
    quality: {
      zh: "没有用 IIP 负债替代外债；早期缺口保持为空。",
      en: "IIP liabilities are not used as an external-debt substitute; early gaps remain blank.",
    },
  },
  {
    metric: { zh: "信贷/GDP缺口", en: "Credit-to-GDP gap" },
    raw: {
      zh: "BIS credit-to-GDP gap。",
      en: "BIS credit-to-GDP gap.",
    },
    formula: {
      zh: "直接采用 BIS 公布的缺口百分点。",
      en: "Uses BIS published gap in percentage points directly.",
    },
    quality: {
      zh: "台湾没有 BIS 一致口径，因此保持为空。",
      en: "Taiwan has no BIS-aligned series and remains blank.",
    },
  },
];

function annualConceptForMetric(metric: string, language: Language) {
  const text: Record<string, Record<Language, string>> = {
    "CA/GDP": {
      zh: "年度流量 / GDP：年度经常账户余额占年度GDP，不是年均值。",
      en: "Annual flow / GDP: annual current-account balance relative to annual GDP; not an annual average.",
    },
    "NIIP/GDP": {
      zh: "存量 / GDP：对外净资产存量占年度GDP，通常是期末或官方存量口径。",
      en: "Stock / GDP: net external asset stock relative to annual GDP, usually period-end or official stock basis.",
    },
    "FX reserves/GDP": {
      zh: "存量 / GDP：外汇储备存量占年度GDP，通常是官方储备存量口径。",
      en: "Stock / GDP: FX reserve stock relative to annual GDP, usually official reserve-stock basis.",
    },
    "Real policy rate": {
      zh: "派生年度/滚动年内值：名义政策利率年均值或年内均值 - CPI月度同比年均值或年内均值。",
      en: "Derived annual / rolling YTD value: annual or YTD average nominal policy rate minus annual or YTD average monthly CPI YoY inflation.",
    },
    "Real policy rate Z-score": {
      zh: "派生年度/滚动年内值：由实际政策利率序列按本经济体样本标准化；当前年会随实际政策利率滚动更新。",
      en: "Derived annual / rolling YTD value: standardized from the economy's real-policy-rate sample; current year updates as real policy rate rolls forward.",
    },
    "CPI inflation": {
      zh: "年度/滚动年内同比：月度CPI指数先算同比，再对当年已公布月份取平均；历史年度也可直接采用官方年度同比。",
      en: "Annual / rolling YTD YoY change: monthly CPI index values are converted to YoY rates and averaged across available months; historical years may also use official annual YoY values.",
    },
    "10Y nominal yield": {
      zh: "年度/滚动年内均值：日度序列取月末值后平均；月度序列直接取已公布月份平均。",
      en: "Annual / rolling YTD average: daily series are sampled at month-end and averaged; monthly series average available monthly points.",
    },
    "TFP RTFPNA": {
      zh: "年度指数：PWT 年度TFP指数，2010=1。",
      en: "Annual index: PWT annual TFP index, 2010=1.",
    },
    "TFP CTFP": {
      zh: "年度跨国水平指标：PWT current PPPs，USA=1；两国比较用对数差。",
      en: "Annual cross-country level metric: PWT current PPPs, USA=1; pair comparison uses log spread.",
    },
    "ULC proxy": {
      zh: "年度代理指数：PWT 年度变量构造，2010=100；两国比较用对数差。",
      en: "Annual proxy index: built from PWT annual variables, 2010=100; pair comparison uses log spread.",
    },
    "FDI net/GDP": {
      zh: "年度流量 / GDP：年度FDI金融账户净额占年度GDP。",
      en: "Annual flow / GDP: annual FDI financial-account net balance relative to annual GDP.",
    },
    "Portfolio net/GDP": {
      zh: "年度流量 / GDP：年度组合投资金融账户净额占年度GDP。",
      en: "Annual flow / GDP: annual portfolio financial-account net balance relative to annual GDP.",
    },
    "Gross savings/GDP": {
      zh: "年度国民账户比率：年度总储蓄占GDP，不是年均价格或利率。",
      en: "Annual national-account ratio: gross savings relative to GDP, not an average price or rate.",
    },
    "Old-age dependency": {
      zh: "年度结构比率：65岁及以上人口 / 15-64岁人口。",
      en: "Annual structural ratio: population aged 65+ relative to population aged 15-64.",
    },
    "Government debt/GDP": {
      zh: "存量 / GDP：政府总债务存量占年度GDP。",
      en: "Stock / GDP: gross government debt stock relative to annual GDP.",
    },
    "External debt/GDP": {
      zh: "存量 / GDP：外债通常使用Q4或官方期末存量，占年度GDP；不是年均外债。",
      en: "Stock / GDP: external debt generally uses Q4 or official period-end stock relative to annual GDP; not average debt over the year.",
    },
    "Credit-to-GDP gap": {
      zh: "年度缺口值：BIS公布的信贷/GDP相对趋势缺口，单位为百分点。",
      en: "Annual gap value: BIS credit-to-GDP gap relative to trend, in percentage points.",
    },
  };
  return text[metric]?.[language] ?? "";
}

const rollingCurrentYearMetrics = new Set<StressMetricKey>([
  "cpiInflation",
  "nominal10yYield",
  "realPolicyRate",
  "realPolicyRateZ",
]);

function lastValueYear(years: readonly string[], values: readonly StressValue[], maxYear?: string | null) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (maxYear && Number(years[index]) > Number(maxYear)) continue;
    if (values[index] !== null && values[index] !== undefined) return years[index] ?? null;
  }
  return null;
}

function cutoffYearForMetricEconomy(metric: StressMetricKey, economy: StressEconomyKey) {
  const currentYearCap = rollingCurrentYearMetrics.has(metric) ? String(new Date().getFullYear() - 1) : null;
  return lastValueYear(stressYears, stressData[metric][economy], currentYearCap);
}

function cutoffDisplay(year: string | null, language: Language) {
  if (!year) return language === "zh" ? "空" : "Blank";
  return year;
}

function autoUpdateStartSummaryForMetric(metric: StressMetricKey, language: Language) {
  const grouped = new Map<string, string[]>();
  for (const economy of economyOrder) {
    const start = groupedByEconomyStart(metric, economy, language);
    const label = stressEconomyLabels[economy].currency;
    grouped.set(start, [...(grouped.get(start) ?? []), label]);
  }
  const twdStart = groupedByEconomyStart(metric, "tw", language);
  const otherStarts = economyOrder
    .filter((economy) => economy !== "tw")
    .map((economy) => groupedByEconomyStart(metric, economy, language));
  const firstOtherStart = otherStarts[0];
  if (firstOtherStart && otherStarts.every((start) => start === firstOtherStart) && twdStart !== firstOtherStart) {
    return language === "zh" ? `其它货币: ${firstOtherStart}; TWD: ${twdStart}` : `Other currencies: ${firstOtherStart}; TWD: ${twdStart}`;
  }
  return [...grouped.entries()]
    .map(([start, labels]) => labels.length === economyOrder.length ? start : `${labels.join("/")}: ${start}`)
    .join("; ");
}

function groupedByEconomyStart(metric: StressMetricKey, economy: StressEconomyKey, language: Language) {
  const cutoff = cutoffYearForMetricEconomy(metric, economy);
  const override = (stressAutoUpdateStartOverrides as Partial<Record<StressMetricKey, Partial<Record<StressEconomyKey, string>>>>)[metric]?.[economy];
  if (override) return override;
  return cutoff ? String(Number(cutoff) + 1) : language === "zh" ? "待补源" : "Needs source";
}

const cutoffMetrics = Object.keys(stressData) as StressMetricKey[];

function metricName(metric: StressMetricKey, language: Language) {
  if (language === "zh" && metric === "ulcProxy") return "单位劳动力成本（ULC代理指标）";
  return stressMetricMeta[metric][language];
}

function usesLogSpread(metric: StressMetricKey) {
  return metric === "tfpCtfp" || metric === "ulcProxy";
}

function pairMetricName(metric: StressMetricKey, language: Language, mode: ViewMode) {
  const name = metricName(metric, language);
  if (mode === "pair" && usesLogSpread(metric)) {
    return language === "zh" ? `${name}对数差` : `${name} log spread`;
  }
  return name;
}

function pairMetricSeries(metric: StressMetricKey, pair: StressPairKey): StressValue[] {
  const { base, quote } = stressPairLabels[pair];
  if (usesLogSpread(metric)) return logSpreadSeries(stressData[metric][base], stressData[metric][quote]);
  return stressData[metric][base].map((baseValue, index) => {
    const quoteValue = stressData[metric][quote][index];
    if (baseValue === null || quoteValue === null) return null;
    return Number((baseValue - quoteValue).toFixed(4));
  });
}

function chartPairDirectionLabel(pair: StressPairKey, language: Language) {
  const label = pairDirectionLabel(pair);
  return language === "zh" ? label.replace(/\s+/g, "") : label;
}

function chartUnit(metric: StressMetricKey, scaleMode: ScaleMode, isPairComparison = false) {
  if (scaleMode === "zscore" || (isPairComparison && usesLogSpread(metric))) return undefined;
  return stressMetricMeta[metric].unit;
}

function chartLineDisplayName(line: ChartLine) {
  if (!line.unit) return line.name;
  const axisMatch = line.name.match(/(（左）|（右）| \(L\)| \(R\))$/);
  if (!axisMatch) return `${line.name} (${line.unit})`;
  const baseName = line.name.slice(0, -axisMatch[0].length);
  return `${baseName} (${line.unit})${axisMatch[0]}`;
}

function groupedWindowOptions(years: string[]) {
  const firstYear = Number(years[0]);
  const currentYear = Number(years[years.length - 1]);
  const windows: { start: number; end: number }[] = [];
  let end = currentYear;
  while (end - 10 > firstYear) {
    windows.push({ start: end - 10, end });
    end -= 10;
  }
  const remainder = { start: firstYear, end };
  if (windows.length > 0 && remainder.end - remainder.start + 1 < 5) {
    const last = windows[windows.length - 1];
    windows[windows.length - 1] = { start: remainder.start, end: last.end };
  } else {
    windows.push(remainder);
  }
  return windows;
}

function chartWindowIndexes(years: string[], windowStart: ChartWindowStart) {
  if (windowStart === "all") return years.map((_, index) => index);
  const [start, end] = windowStart.split("-").map(Number);
  return years.map((year, index) => ({ year: Number(year), index })).filter(({ year }) => year >= start && year <= end).map(({ index }) => index);
}

function applyChartWindow(years: string[], lines: ChartLine[], windowStart: ChartWindowStart) {
  const indexes = chartWindowIndexes(years, windowStart);
  return {
    years: indexes.map((index) => years[index]),
    lines: lines.map((line) => ({ ...line, values: indexes.map((index) => line.values[index] ?? null) })),
  };
}

function downloadBlob(blob: Blob, fallbackName: string, contentDisposition: string | null) {
  const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
  const filename = filenameMatch?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function readApiPayload(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function axisSuffix(axisIndex: number, language: Language) {
  if (language === "zh") return axisIndex === 1 ? "（右）" : "（左）";
  return axisIndex === 1 ? " (R)" : " (L)";
}

const developedEconomies = new Set<StressEconomyKey>(["eu", "gb", "us", "jp", "kr", "tw"]);

function internalGapYears(years: readonly string[], values: readonly StressValue[]) {
  const first = values.findIndex((value) => value !== null && value !== undefined);
  let last = -1;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== null && values[index] !== undefined) {
      last = index;
      break;
    }
  }
  if (first < 0 || last <= first) return [];
  return years.filter((_, index) => index > first && index < last && (values[index] === null || values[index] === undefined));
}

const specificCoverageNotes: Partial<Record<`${StressEconomyKey}:${StressMetricKey}`, Record<Language, string>>> = {
  "us:externalDebtGdp": {
    zh: "官方 Gross External Debt 口径从 2003Q2/2003 年开始；没有用 IIP 负债、外国持有美债或证券负债替代外债。",
    en: "The official U.S. Gross External Debt series starts in 2003Q2/2003; IIP liabilities, foreign-held Treasuries, or securities liabilities are not used as substitutes.",
  },
  "jp:externalDebtGdp": {
    zh: "外债/GDP从 2003 年开始；未用 IIP 负债替代外债，也不向前外推。",
    en: "External debt/GDP starts in 2003; IIP liabilities are not used as external-debt substitutes and the series is not backcast.",
  },
  "jp:caGdp": {
    zh: "1970-1995 使用 Cabinet Office ESRI 官方历史口径，1996 年后使用 WDI/IMF/OECD 可比口径；1995/1996 附近可能有来源断点。",
    en: "1970-1995 uses Cabinet Office ESRI official historical data; 1996 onward uses the WDI/IMF/OECD comparable chain. The 1995/1996 boundary may contain a source break.",
  },
  "jp:fdiGdp": {
    zh: "1970-1995 使用 ESRI 对外交易历史表并统一为资产-负债方向；1996 年后使用 WDI/IMF/OECD 可比口径。",
    en: "1970-1995 uses ESRI external-transactions historical tables and is aligned as assets minus liabilities; 1996 onward uses the WDI/IMF/OECD comparable chain.",
  },
  "jp:portfolioGdp": {
    zh: "1970-1995 使用 ESRI securities investment 作为最接近的官方历史口径；1996 年后使用 WDI/IMF/OECD portfolio 口径。",
    en: "1970-1995 uses ESRI securities investment as the closest official historical concept; 1996 onward uses the WDI/IMF/OECD portfolio chain.",
  },
  "jp:savingsGdp": {
    zh: "1970-1995 由 ESRI 国民账户历史表构造，1996 年后使用 WDI/IMF/OECD 可比口径；1995/1996 附近可能有水平断点。",
    en: "1970-1995 is constructed from ESRI historical national accounts; 1996 onward uses the WDI/IMF/OECD comparable chain, so the 1995/1996 boundary may contain a level break.",
  },
  "jp:nominal10yYield": {
    zh: "10年期名义收益率当前从 1989 年开始；没有用更短期限利率替代早期缺口。",
    en: "10Y nominal yield currently starts in 1989; shorter-maturity rates are not used to replace earlier gaps.",
  },
  "kr:realPolicyRate": {
    zh: "实际政策利率从 1999 年开始；没有用隔夜拆借利率等代理指标补早期段。",
    en: "Real policy rate starts in 1999; overnight call-rate proxies are not used for earlier years.",
  },
  "kr:nominal10yYield": {
    zh: "10年期名义收益率从 2000 年开始；没有用3年国债收益率替代。",
    en: "10Y nominal yield starts in 2000; 3Y government-bond yields are not used as substitutes.",
  },
  "kr:externalDebtGdp": {
    zh: "外债/GDP从 1998 年开始；未找到同定义、同频率且可直接换算为 GDP 比例的更早官方序列。",
    en: "External debt/GDP starts in 1998; no earlier same-definition official series suitable for direct %GDP conversion has been loaded.",
  },
  "tw:caGdp": {
    zh: "经常账户/GDP在 1984-2011 使用 CBC 官方历史 BOP 年度表，2012 年后使用 CBC open-data 链条；CBC 说明 1984 年起已转换为 BPM6。",
    en: "CA/GDP uses CBC official historical annual BOP tables for 1984-2011 and the CBC open-data chain from 2012 onward; CBC notes the series from 1984 has been converted to BPM6.",
  },
  "tw:fdiGdp": {
    zh: "FDI/GDP在 1984-2011 使用 CBC 官方历史 BOP 年度表并统一为资产-负债方向，2012 年后使用 CBC open-data 链条。",
    en: "FDI/GDP uses CBC official historical annual BOP tables for 1984-2011, aligned as assets minus liabilities, and the CBC open-data chain from 2012 onward.",
  },
  "tw:portfolioGdp": {
    zh: "组合投资/GDP在 1984-2011 使用 CBC 官方历史 BOP 年度表并统一为资产-负债方向，2012 年后使用 CBC open-data 链条。",
    en: "Portfolio/GDP uses CBC official historical annual BOP tables for 1984-2011, aligned as assets minus liabilities, and the CBC open-data chain from 2012 onward.",
  },
  "tw:realPolicyRate": {
    zh: "实际政策利率从 2001 年开始；没有用不可核验的历史政策利率代理补早期段。",
    en: "Real policy rate starts in 2001; unverifiable historical policy-rate proxies are not used for earlier years.",
  },
  "tw:nominal10yYield": {
    zh: "10年期名义收益率从 2006 年开始；来源为 TPEx 可用收益率曲线，早期不使用其它期限代理。",
    en: "10Y nominal yield starts in 2006 from the available TPEx yield-curve source; other maturities are not used as proxies.",
  },
  "tw:externalDebtGdp": {
    zh: "外债/GDP从 1999 年开始，使用 CBC SDDS External Debt 官方序列；没有用 IIP 总负债替代。",
    en: "External debt/GDP starts in 1999 using CBC SDDS External Debt; total IIP liabilities are not used as substitutes.",
  },
  "tw:creditGap": {
    zh: "没有 BIS 一致口径的 Credit-to-GDP gap，因此保持为空。",
    en: "Has no BIS-aligned Credit-to-GDP gap series and remains blank.",
  },
};

function coverageNotesFor(metric: StressMetricKey, econ: StressEconomyKey, language: Language) {
  const values = stressData[metric][econ];
  const first = firstNonNullYear(stressYears, values);
  const last = lastNonNullYear(stressYears, values);
  const gaps = internalGapYears(stressYears, values);
  const econName = stressEconomyLabels[econ][language];
  const metricLabel = metricName(metric, language);
  const notes: string[] = [];
  if (developedEconomies.has(econ)) {
    if (!first) {
      notes.push(language === "zh"
        ? `${econName}：${metricLabel} 当前没有已载入的官方可比序列。`
        : `${econName}: ${metricLabel} has no loaded official comparable series.`);
    } else if (Number(first) > 1965) {
      notes.push(language === "zh"
        ? `${econName}：${metricLabel} 从 ${first} 年开始，早期年份保持空白，因为没有同定义、可溯源的官方数据。`
        : `${econName}: ${metricLabel} starts in ${first}; earlier years remain blank because no same-definition traceable official data is loaded.`);
    }
    if (gaps.length > 0) {
      const preview = gaps.slice(0, 8).join(", ");
      notes.push(language === "zh"
        ? `${econName}：${metricLabel} 在 ${first}-${last} 区间内仍有 ${gaps.length} 个空值年份（如 ${preview}${gaps.length > 8 ? "..." : ""}），未插值或外推。`
        : `${econName}: ${metricLabel} still has ${gaps.length} blank year(s) inside ${first}-${last} (for example ${preview}${gaps.length > 8 ? "..." : ""}); no interpolation or extrapolation is used.`);
    }
    if (last && Number(last) < Number(stressYears.at(-1))) {
      notes.push(language === "zh"
        ? `${econName}：${metricLabel} 最新真实值截至 ${last} 年，之后年份暂未载入真实数据。`
        : `${econName}: ${metricLabel} runs through ${last}; later years have no loaded observed data yet.`);
    }
  }
  const specific = specificCoverageNotes[`${econ}:${metric}`];
  if (specific) notes.push(language === "zh" ? `${econName}：${specific[language]}` : `${econName}: ${specific[language]}`);
  return [...new Set(notes)];
}

const exportPrices: Record<ExportKind, { rmb: string; hkd: string; usd: string }> = {
  current: { rmb: "RMB13", hkd: "HKD15", usd: "USD2" },
  full: { rmb: "RMB50", hkd: "HKD55", usd: "USD8" },
};

function PaymentQr({ src, title, note, detail }: { src: string; title: string; note: string; detail?: string }) {
  return <div className="paymentCard qrCard"><strong>{title}</strong>{detail && <p>{detail}</p>}<div className="qrBox"><img src={src} alt={title} onError={(event) => { event.currentTarget.style.display = "none"; const fallback = event.currentTarget.nextElementSibling as HTMLElement | null; if (fallback) fallback.style.display = "grid"; }} /><span>{note}</span></div></div>;
}

function Chart({ title, years, lines, dualAxis, leftAxisName, rightAxisName }: { title: string; years: string[]; lines: ChartLine[]; dualAxis?: boolean; leftAxisName?: string; rightAxisName?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      backgroundColor: "transparent",
      color: ["#10d0ae", "#f87171", "#60a5fa", "#c084fc", "#fbbf24", "#94a3b8", "#22d3ee"],
      title: { show: false },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(8, 13, 24, 0.94)",
        borderColor: "#2f455f",
        textStyle: { color: "#e5edf6" },
        valueFormatter: (value: unknown) => (typeof value === "number" ? formatValue(value) : ""),
      },
      legend: { type: "scroll", top: 18, left: "center", width: "82%", textStyle: { color: "#cbd5e1" } },
      grid: { top: 76, right: dualAxis ? 88 : 32, bottom: 42, left: 64 },
      xAxis: { type: "category", data: years, boundaryGap: false, axisLabel: { color: "#94a3b8" }, axisLine: { lineStyle: { color: "#334155" } }, axisTick: { lineStyle: { color: "#334155" } } },
      yAxis: dualAxis ? [
        { type: "value", name: "", scale: true, axisLabel: { color: "#94a3b8" }, axisLine: { lineStyle: { color: "#334155" } }, splitLine: { lineStyle: { color: "#1e293b" } } },
        { type: "value", name: "", scale: true, axisLabel: { color: "#94a3b8" }, axisLine: { lineStyle: { color: "#334155" } }, splitLine: { show: false } },
      ] : [{ type: "value", name: "", scale: true, axisLabel: { color: "#94a3b8" }, axisLine: { lineStyle: { color: "#334155" } }, splitLine: { lineStyle: { color: "#1e293b" } } }],
      series: lines.map((line) => ({
        name: chartLineDisplayName(line),
        type: "line",
        data: line.values,
        yAxisIndex: line.yAxisIndex ?? 0,
        connectNulls: false,
        showSymbol: false,
        smooth: line.smooth ?? true,
        lineStyle: { width: line.yAxisIndex === 1 ? 2.7 : 2 },
      })),
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); chart.dispose(); };
  }, [dualAxis, leftAxisName, lines, rightAxisName, title, years]);
  return <div className="chartFrame"><h3 className="chartTitle">{title}</h3><div ref={ref} className="chart" /></div>;
}

function App() {
  const [language, setLanguage] = useState<Language>("zh");
  const [page, setPage] = useState<PageKey>("home");
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [scaleMode, setScaleMode] = useState<ScaleMode>("raw");
  const [chartWindowStart, setChartWindowStart] = useState<ChartWindowStart>("all");
  const [economy, setEconomy] = useState<StressEconomyKey>("us");
  const [group, setGroup] = useState<StressGroupKey>("usd");
  const [pair, setPair] = useState<StressPairKey>("usdjpy");
  const [dataLayer, setDataLayer] = useState<StressLayerKey>("external");
  const [exportKind, setExportKind] = useState<ExportKind | null>(null);
  const [paymentEmail, setPaymentEmail] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState<PaymentCurrency>("RMB");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("alipay_hk");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentRequestId, setPaymentRequestId] = useState("");
  const [paymentStatusMessage, setPaymentStatusMessage] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const handledCheckoutReturn = useRef(false);
  const t = copy[language];
  const activeLayer = layerOrder.includes(page as StressLayerKey) ? (page as StressLayerKey) : "external";
  const availablePairs = stressPairGroups[group] as readonly StressPairKey[];

  useEffect(() => { if (!availablePairs.includes(pair)) setPair(availablePairs[0]); }, [availablePairs, pair]);
  useEffect(() => {
    if (chartWindowStart === "all") return;
    const validWindows = new Set(groupedWindowOptions(chartYears).map(({ start, end }) => `${start}-${end}`));
    if (!validWindows.has(chartWindowStart)) setChartWindowStart("all");
  }, [chartWindowStart]);

  const chart = useMemo(() => {
    const metrics = getLayerMetrics(activeLayer, viewMode);
    if (viewMode === "single") {
      const allYears = chartYears;
      const windowIndexes = chartWindowIndexes(allYears, chartWindowStart);
      const rawSeries = metrics.map((metric) => alignSeries(stressYears, stressData[metric][economy], allYears));
      const displaySeries = rawSeries.map((values) => (scaleMode === "zscore" ? zScoreSeries(values) : values));
      const windowedDisplaySeries = displaySeries.map((values) => windowIndexes.map((index) => values[index] ?? null));
      const rightAxisIndexes = splitRightAxisIndexes(windowedDisplaySeries);
      const hasSplitAxis = rightAxisIndexes.size > 0;
      const lines = metrics.map((metric, index) => {
        const values = displaySeries[index];
        const yAxisIndex = rightAxisIndexes.has(index) ? 1 : 0;
        return {
          name: `${metricName(metric, language)}${hasSplitAxis ? axisSuffix(yAxisIndex, language) : ""}`,
          unit: chartUnit(metric, scaleMode),
          values,
          yAxisIndex,
        } satisfies ChartLine;
      });
      const { years, lines: windowedLines } = applyChartWindow(allYears, lines, chartWindowStart);
      return {
        years,
        lines: windowedLines,
        title: `${stressEconomyLabels[economy][language]} · ${stressLayers[activeLayer][language]}`,
        dualAxis: hasSplitAxis,
        leftAxisName: hasSplitAxis ? t.leftAxis : scaleMode === "zscore" ? "Z-score" : "",
        rightAxisName: hasSplitAxis ? t.rightAxis : undefined,
      };
    }
    const alignedFx = alignSeries(stressFxYears, stressFxData[pair], chartYears);
    const metricSeries = metrics.map((metric) => {
      const rawValues = pairMetricSeries(metric, pair);
      const values = alignSeries(stressYears, scaleMode === "zscore" ? zScoreSeries(rawValues) : rawValues, chartYears);
      return { metric, values };
    });
    const windowIndexes = chartWindowIndexes(chartYears, chartWindowStart);
    const windowedFx = windowIndexes.map((index) => alignedFx[index] ?? null);
    const windowedMetricValues = metricSeries.map((series) => windowIndexes.map((index) => series.values[index] ?? null));
    const rightAxisIndexes = scaleMode === "raw"
      ? splitRightAxisIndexesAnchoredLeft([windowedFx, ...windowedMetricValues], 0)
      : new Set<number>(metrics.map((_, index) => index + 1));
    const fxAxisIndex: 0 | 1 = 0;
    const metricLines = metricSeries.map(({ metric, values }, index) => {
      const yAxisIndex = rightAxisIndexes.has(index + 1) ? 1 : 0;
      const directionLabel = chartPairDirectionLabel(pair, language);
      const separator = language === "zh" ? " " : " · ";
      return { name: `${pairMetricName(metric, language, viewMode)}${separator}${directionLabel}${axisSuffix(yAxisIndex, language)}`, unit: chartUnit(metric, scaleMode, true), values, yAxisIndex } satisfies ChartLine;
    });
    const hasRightAxis = metricLines.some((line) => line.yAxisIndex === 1);
    const fxLine: ChartLine = { name: `${stressPairLabels[pair].fx} FX${axisSuffix(fxAxisIndex, language)}`, values: alignedFx, yAxisIndex: fxAxisIndex, smooth: false };
    const allLines = [fxLine, ...metricLines];
    const { years, lines } = applyChartWindow(chartYears, allLines, chartWindowStart);
    return {
      years,
      lines,
      title: `${stressPairLabels[pair].fx} · ${stressLayers[activeLayer][language]} · ${pairDirectionLabel(pair)}`,
      dualAxis: hasRightAxis,
      leftAxisName: hasRightAxis ? t.leftAxis : "",
      rightAxisName: hasRightAxis ? t.rightAxis : undefined,
    };
  }, [activeLayer, chartWindowStart, economy, language, pair, scaleMode, t.leftAxis, t.rightAxis, viewMode]);

  const currentEconomies = useMemo(() => viewMode === "single"
    ? [economy]
    : [stressPairLabels[pair].base, stressPairLabels[pair].quote], [economy, pair, viewMode]);

  const gapNotes = useMemo(() => {
    const notes: string[] = [];
    if (viewMode === "pair") {
      const firstFx = firstNonNullYear(stressFxYears, stressFxData[pair]);
      if (firstFx && firstFx !== "1965") {
        const hasEuro = [stressPairLabels[pair].baseCurrency, stressPairLabels[pair].quoteCurrency].includes("EUR");
        const euroProxyNote = language === "zh"
          ? `${stressPairLabels[pair].fx} 当前从 ${firstFx} 年开始；EUR 在 1999 年前用德国马克按 1 EUR = 1.95583 DEM 合成，因 DE/EA 宏观数据在 1999 年前也使用德国代理。`
          : `${stressPairLabels[pair].fx} currently starts in ${firstFx}; EUR before 1999 is synthesized from Deutsche Mark at 1 EUR = 1.95583 DEM because DE/EA macro data also uses Germany as the pre-1999 proxy.`;
        const nonEuroNote = language === "zh"
          ? `${stressPairLabels[pair].fx} 当前从 ${firstFx} 年开始；相关货币在更早年份暂无可验证官方年均汇率。`
          : `${stressPairLabels[pair].fx} currently starts in ${firstFx}; no verifiable official annual-average FX is available for the relevant currency in earlier years.`;
        notes.push(hasEuro ? euroProxyNote : nonEuroNote);
      }
    }
    const metrics = getLayerMetrics(activeLayer, viewMode);
    for (const metric of metrics) {
      for (const selectedEconomy of currentEconomies) {
        notes.push(...coverageNotesFor(metric, selectedEconomy, language));
      }
    }
    return [...new Set(notes)];
  }, [activeLayer, currentEconomies, language, pair, viewMode]);

  const renderNav = () => <nav className="navTabs" aria-label="site navigation"><button className={page === "home" ? "active" : ""} onClick={() => setPage("home")}>{t.home}</button>{layerOrder.map((layer) => <button key={layer} className={page === layer ? "active" : ""} onClick={() => setPage(layer)}>{stressLayers[layer].order}. {stressLayers[layer][language]}</button>)}<button className={`dataNavButton ${page === "data" ? "active" : ""}`} onClick={() => setPage("data")}>{t.data}</button></nav>;

  const renderHome = () => <main className="panel homeGrid"><section className="introBlock"><p>{t.factorIntro}</p></section><section className="layerGrid">{layerOrder.map((layer) => <button key={layer} className="layerCard" onClick={() => setPage(layer)}><span>{stressLayers[layer].title}</span><strong>{stressLayers[layer][language]}</strong><p>{layerDescriptions[layer][language]}</p><div className="metricList"><b>{t.coreMetrics}</b><div>{getLayerMetrics(layer, "single").map((metric) => <em key={metric}>{pairMetricName(metric, language, "single")}</em>)}</div></div></button>)}</section><section className="noteBlock"><h2>{t.omittedTitle}</h2><div className="pillList">{omittedFactors[language].map((item) => <span key={item}>{item}</span>)}</div></section></main>;

  const renderControls = (showChartWindow = true) => {
    const windowOptions = groupedWindowOptions(chartYears);
    return <div className="controls"><div className="segmented"><button className={viewMode === "single" ? "selected" : ""} onClick={() => setViewMode("single")}>{t.single}</button><button className={viewMode === "pair" ? "selected" : ""} onClick={() => setViewMode("pair")}>{t.pair}</button></div>{viewMode === "single" ? <label>{t.economy}<select value={economy} onChange={(event) => setEconomy(event.target.value as StressEconomyKey)}>{economyOrder.map((item) => <option key={item} value={item}>{stressEconomyLabels[item][language]} ({stressEconomyLabels[item].currency})</option>)}</select></label> : <><label>{t.base}<select value={group} onChange={(event) => setGroup(event.target.value as StressGroupKey)}>{groupOrder.map((item) => <option key={item} value={item}>{stressGroupLabels[item][language]}</option>)}</select></label><label>{t.pairSelect}<select value={pair} onChange={(event) => setPair(event.target.value as StressPairKey)}>{availablePairs.map((item) => <option key={item} value={item}>{stressPairLabels[item].fx}</option>)}</select></label></>}<label>{t.chartScale}<select value={scaleMode} onChange={(event) => setScaleMode(event.target.value as ScaleMode)}><option value="raw">{t.raw}</option><option value="zscore">{t.zscore}</option></select></label>{showChartWindow && <label>{t.chartWindow}<select value={chartWindowStart} onChange={(event) => setChartWindowStart(event.target.value as ChartWindowStart)}><option value="all">{t.fullRange}</option>{windowOptions.map(({ start, end }) => <option key={`${start}-${end}`} value={`${start}-${end}`}>{start}-{end}</option>)}</select></label>}</div>;
  };

  const currentMetrics = getLayerMetrics(activeLayer, viewMode);
  const renderCurrentMetricDocs = () => <section className="metricDocSection compactDocs"><h3>{t.metricExplanation}</h3><div className="metricDocGrid">{currentMetrics.map((metric) => {
    const currentNotes = currentEconomies.flatMap((selectedEconomy) => coverageNotesFor(metric, selectedEconomy, language));
    return <article key={metric} className="metricDocCard"><strong>{pairMetricName(metric, language, viewMode)}</strong><p>{metricDocs[metric].meaning[language]}</p><dl><dt>{language === "zh" ? "公式" : "Formula"}</dt><dd>{metricDocs[metric].formula}</dd>{metricDocs[metric].limitation && <><dt>{language === "zh" ? "局限" : "Limit"}</dt><dd>{metricDocs[metric].limitation[language]}</dd></>}{currentNotes.length > 0 && <><dt>{language === "zh" ? "当前国家数据说明" : "Current selection data note"}</dt><dd><ul>{[...new Set(currentNotes)].map((note) => <li key={note}>{note}</li>)}</ul></dd></>}</dl></article>;
  })}</div></section>;

  const renderGapNotes = () => gapNotes.length > 0 && <div className="gapNotes"><strong>{t.gapTitle}</strong><ul>{gapNotes.map((note) => <li key={note}>{note}</li>)}</ul></div>;

  const renderLayer = () => <main className="panel"><div className="sectionHeader"><div><p className="eyebrow">{stressLayers[activeLayer].title}</p><h2>{stressLayers[activeLayer][language]}</h2><p>{layerDescriptions[activeLayer][language]}</p></div></div>{renderControls()}<Chart title={chart.title} years={chart.years} lines={chart.lines} dualAxis={chart.dualAxis} leftAxisName={chart.leftAxisName} rightAxisName={chart.rightAxisName} />{renderCurrentMetricDocs()}{renderGapNotes()}{activeLayer === "productivity" && <div className="methodCard"><strong>Productivity rule</strong><p>{language === "zh" ? "单国趋势使用 RTFPNA 2010=1；两国比较使用 CTFP USA=1 的对数差，并对 ULC proxy 同样使用对数差。ULC proxy 仅为辅助变量，不是官方 ULC。" : "Single-country trends use RTFPNA 2010=1; pair comparisons use log spread of CTFP USA=1, and ULC proxy also uses log spread. ULC proxy is an auxiliary proxy, not official ULC."}</p></div>}</main>;

  const dataMetrics = getLayerMetrics(dataLayer, viewMode);
  const dataRows = useMemo(() => {
    if (viewMode === "single") return stressYears.map((year, index) => [year, ...dataMetrics.map((metric) => stressData[metric][economy][index] ?? null)]);
    const alignedFx = alignSeries(stressFxYears, stressFxData[pair], chartYears);
    return chartYears.map((year, index) => [year, alignedFx[index], ...dataMetrics.map((metric) => alignSeries(stressYears, pairMetricSeries(metric, pair), chartYears)[index])]);
  }, [dataMetrics, economy, pair, viewMode]);

  const requestExport = (kind: ExportKind) => { setExportKind(kind); setPaymentEmail(""); setPaymentReference(""); setPaymentStatusMessage(""); setPaymentError(""); setPaymentRequestId(""); };
  const exportSelection = { viewMode, economy, pair, dataLayer };
  const hasValidPaymentEmail = () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paymentEmail.trim());
  const startAutomaticCheckout = async () => {
    if (!exportKind) return;
    if (!hasValidPaymentEmail()) {
      setPaymentError(t.emailRequired);
      return;
    }
    setPaymentLoading(true);
    setPaymentError("");
    setPaymentStatusMessage(t.redirecting);
    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: exportKind, email: paymentEmail, currency: paymentCurrency, selection: exportSelection }),
      });
      const payload = await readApiPayload(response);
      if (!response.ok) throw new Error(payload.error ?? t.apiUnavailable);
      if (!payload.url) throw new Error(t.apiUnavailable);
      window.location.href = payload.url;
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : t.paymentError);
      setPaymentStatusMessage("");
      setPaymentLoading(false);
    }
  };
  const submitPaymentRequest = () => {
    if (!exportKind) return;
    if (!hasValidPaymentEmail()) {
      setPaymentError(t.emailRequired);
      return;
    }
    setPaymentError("");
    const methodLabel = paymentMethod === "alipay_hk" ? "AlipayHK" : paymentMethod === "alipay_cn" ? "支付宝 China" : "Citi Zelle";
    const exportLabel = exportKind === "current" ? t.exportCurrent : t.exportFull;
    const subject = language === "zh"
      ? `付款确认申请 - ${exportLabel}`
      : `Payment confirmation request - ${exportLabel}`;
    const body = language === "zh"
      ? [
        "作者您好，",
        "",
        "我已完成付款，请确认后将数据发送至以下购买者邮箱。",
        "",
        `购买者邮箱 / 下载邮箱：${paymentEmail.trim()}`,
        `导出内容：${exportLabel}`,
        `付款币种：${paymentCurrency}`,
        `付款方式：${methodLabel}`,
        `付款编号：${paymentRequestId.trim() || "未填写"}`,
        `交易备注/流水号：${paymentReference.trim() || "未填写"}`,
        "",
        "谢谢。",
      ].join("\n")
      : [
        "Hello,",
        "",
        "I have completed the payment. Please confirm receipt and send the data to the buyer/download email below.",
        "",
        `Buyer / download email: ${paymentEmail.trim()}`,
        `Export item: ${exportLabel}`,
        `Payment currency: ${paymentCurrency}`,
        `Payment method: ${methodLabel}`,
        `Payment id: ${paymentRequestId.trim() || "Not provided"}`,
        `Payment note / transaction id: ${paymentReference.trim() || "Not provided"}`,
        "",
        "Thank you.",
      ].join("\n");
    const mailto = `mailto:songtaozhang@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}&reply-to=${encodeURIComponent(paymentEmail.trim())}`;
    window.location.href = mailto;
    setPaymentStatusMessage(t.requestCreated);
  };
  const checkApprovedDownload = async () => {
    if (!hasValidPaymentEmail()) {
      setPaymentError(t.emailRequired);
      return;
    }
    setPaymentLoading(true);
    setPaymentError("");
    setPaymentStatusMessage("");
    try {
      const params = new URLSearchParams({ id: paymentRequestId.trim(), email: paymentEmail.trim().toLowerCase() });
      const response = await fetch(`/api/export-download?${params.toString()}`);
      if (response.status === 202) {
        const payload = await readApiPayload(response);
        setPaymentStatusMessage(payload.error ?? t.requestPending);
        return;
      }
      if (!response.ok) {
        const payload = await readApiPayload(response);
        throw new Error(payload.error ?? t.apiUnavailable);
      }
      const blob = await response.blob();
      downloadBlob(blob, "fx-stress-model-paid-export.csv", response.headers.get("content-disposition"));
      setExportKind(null);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : t.paymentError);
    } finally {
      setPaymentLoading(false);
    }
  };

  useEffect(() => {
    if (handledCheckoutReturn.current) return;
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get("export_request");
    const email = params.get("export_email");
    const kind = params.get("export_kind") === "full" ? "full" : "current";
    if (params.get("checkout") !== "success" || !requestId || !email) return;
    handledCheckoutReturn.current = true;
    setExportKind(kind);
    setPaymentRequestId(requestId);
    setPaymentEmail(email);
    setPaymentStatusMessage(t.checkoutReturned);
    window.history.replaceState({}, "", window.location.pathname);
    window.setTimeout(() => {
      const query = new URLSearchParams({ id: requestId, email: email.trim().toLowerCase() });
      fetch(`/api/export-download?${query.toString()}`)
        .then(async (response) => {
          if (!response.ok) return;
          const blob = await response.blob();
          downloadBlob(blob, "fx-stress-model-paid-export.csv", response.headers.get("content-disposition"));
          setExportKind(null);
        })
        .catch(() => undefined);
    }, 1400);
  }, [t.checkoutReturned]);

  const renderSourceDocs = () => <section className="metricDocSection"><h3>{t.sourceExplanation}</h3><div className="metricDocGrid">{(Object.keys(metricDocs) as StressMetricKey[]).map((metric) => <article key={metric} className="metricDocCard sourceCard"><strong>{metricName(metric, language)}</strong><div className="sourceLinks">{metricDocs[metric].sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}</a>)}</div></article>)}<article className="metricDocCard sourceCard"><strong>FX</strong><div className="sourceLinks"><a href="https://data.worldbank.org/indicator/PA.NUS.FCRF" target="_blank" rel="noreferrer">World Bank official exchange rate</a><a href="https://fred.stlouisfed.org/" target="_blank" rel="noreferrer">FRED exchange rates</a><a href="https://economy-finance.ec.europa.eu/euro/eu-countries-and-euro/germany-and-euro_en" target="_blank" rel="noreferrer">EUR/DEM conversion</a></div></article></div></section>;

  const renderDataReadme = () => <section className="readmeSection"><h3>{t.versionReadme}</h3><div className="readmeGrid">{dataReadmeCards.map((card) => <article key={card.title.en} className="readmeCard"><strong>{card.title[language]}</strong><p>{card.body[language]}</p></article>)}</div></section>;

  const renderCutoffTable = () => <section className="readmeSection"><h3>{language === "zh" ? "历史存档截止年份与自动更新起点" : "Archived Historical Cutoff Years And Auto-Update Start"}</h3><p>{language === "zh" ? "表格中的年份均为“历史存档截止年份”：在已确定数据真实性后，作为历史数据存档，不再自动更新。自动更新脚本只尝试刷新该截止年份之后的官方公开数据；少数标记为可修订的近期拼接值会从该年份继续刷新。如果发现新的官方值，会写入数据库，并同步更新本表与页脚的“最新更新”月份。" : "All years in this table are archived historical cutoff years: the latest verified year archived as historical data and no longer auto-updated. Refresh scripts only attempt official public data after each cutoff year; a small number of provisional stitched recent values remain refreshable from that same year. When a new official value is found, the local database, this table, and the footer update month are updated together."}</p><p>{language === "zh" ? `FX：${stressArchivedThrough.fx}年及以前已经作为历史汇率数据存档，不再自动更新；自动更新起点为${stressAutoUpdatePolicy.fx.autoRefreshFrom}年。` : `FX: values through ${stressArchivedThrough.fx} are archived historical exchange-rate data and are no longer auto-updated; automatic refresh starts from ${stressAutoUpdatePolicy.fx.autoRefreshFrom}.`}</p><p>{language === "zh" ? "CPI、10年期名义收益率、实际政策利率和实际政策利率Z-score 的当前年数据是滚动年内均值，不计入“历史存档截止年份”；它们会随月度CPI、月末10年收益率和政策利率发布而更新。" : "Current-year CPI, 10Y nominal yield, real policy rate, and real-policy-rate Z-score are rolling YTD averages and are not counted as archived historical cutoff years; they update as monthly CPI, month-end 10Y yields, and policy rates are released."}</p><div className="tableWrap dataCutoffTable"><table><thead><tr>{[language === "zh" ? "指标" : "Indicator", ...economyOrder.map((economy) => stressEconomyLabels[economy][language]), language === "zh" ? "自动更新起始年份" : "Auto-update start year"].map((head) => <th key={head}>{head}</th>)}</tr></thead><tbody><tr><td>FX</td>{economyOrder.map((economy) => <td key={`fx-${economy}`}>{stressArchivedThrough.fx}</td>)}<td>{stressAutoUpdatePolicy.fx.autoRefreshFrom}</td></tr>{cutoffMetrics.map((metric) => <tr key={metric}><td>{metricName(metric, language)}</td>{economyOrder.map((economy) => <td key={`${metric}-${economy}`}>{cutoffDisplay(cutoffYearForMetricEconomy(metric, economy), language)}</td>)}<td>{autoUpdateStartSummaryForMetric(metric, language)}</td></tr>)}</tbody></table></div></section>;

  const renderDataDictionary = () => <section className="readmeSection"><h3>{language === "zh" ? "指标级数据字典：Raw Data 来源、年度口径、转换公式、质量提示" : "Metric-Level Data Dictionary: Raw Data Source, Annual Convention, Transformation Formula, and Quality Note"}</h3><div className="tableWrap dataDictionaryTable"><table><thead><tr>{[language === "zh" ? "指标" : "Metric", language === "zh" ? "Raw data 来源/单位" : "Raw data source / unit", language === "zh" ? "年度数据口径" : "Annual data convention", language === "zh" ? "从 raw data 到指标的公式" : "Formula from raw data to metric", language === "zh" ? "可比性/质量提示" : "Comparability / quality note"].map((head) => <th key={head}>{head}</th>)}</tr></thead><tbody>{dataDictionaryRows.map((row) => <tr key={row.metric.en}><td>{row.metric[language]}</td><td>{row.raw[language]}</td><td>{annualConceptForMetric(row.metric.en, language)}</td><td>{row.formula[language]}</td><td>{row.quality[language]}</td></tr>)}</tbody></table></div></section>;

  const renderData = () => <main className="panel"><div className="sectionHeader"><div><p className="eyebrow">Data</p><h2>{t.data}</h2><p>{language === "zh" ? "本页说明每个指标的 raw data 来源、从 raw data 到指标的公式、不同时间段来源边界和潜在可比性影响，并提供可导出的原始与比较数据。" : "This page documents each metric's raw data source, the formula used to transform raw data into dashboard indicators, source boundaries across time, potential comparability issues, and exportable raw/comparison data."}</p></div><div className="buttonStack"><button onClick={() => requestExport("current")}>{t.exportCurrent}</button><button onClick={() => requestExport("full")}>{t.exportFull}</button></div></div>{renderDataReadme()}{renderCutoffTable()}{renderDataDictionary()}{renderSourceDocs()}{renderControls(false)}<label className="inlineSelect">{language === "zh" ? "层级" : "Layer"}<select value={dataLayer} onChange={(event) => setDataLayer(event.target.value as StressLayerKey)}>{layerOrder.map((layer) => <option key={layer} value={layer}>{stressLayers[layer][language]}</option>)}</select></label><div className="tableWrap"><table><thead><tr>{(viewMode === "single" ? [language === "zh" ? "年份" : "Year", ...dataMetrics.map((metric) => pairMetricName(metric, language, viewMode))] : [language === "zh" ? "年份" : "Year", stressPairLabels[pair].fx, ...dataMetrics.map((metric) => pairMetricName(metric, language, viewMode))]).map((head) => <th key={head}>{head}</th>)}</tr></thead><tbody>{dataRows.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={`${row[0]}-${index}`}>{typeof cell === "number" ? formatValue(cell) : cell}</td>)}</tr>)}</tbody></table></div></main>;

  const renderPaymentModal = () => exportKind && <div className="modalBackdrop" role="dialog" aria-modal="true" aria-label={t.paidExport}><div className="paymentModal"><div className="modalHeader"><div><p className="eyebrow">{t.paidExport}</p><h2>{exportKind === "current" ? t.exportCurrent : t.exportFull}</h2><p>{t.paymentNotice}</p></div><button className="iconButton" onClick={() => setExportKind(null)} aria-label={t.close}>×</button></div><div className="priceStrip"><span>{exportPrices[exportKind].rmb}</span><span>{exportPrices[exportKind].hkd}</span><span>{exportPrices[exportKind].usd}</span></div><section className="paymentSection manualSection"><h3 className="manualTitle">{t.manualBackup}</h3><div className="paymentGrid"><PaymentQr title="AlipayHK" src="/payments/alipay-hk.png" note={language === "zh" ? "扫码付款" : "Scan to pay"} /><PaymentQr title="支付宝 China" src="/payments/alipay-cn.png" note={language === "zh" ? "扫码付款" : "Scan to pay"} /><PaymentQr title="Citi Zelle" src="/payments/zelle.png" note={language === "zh" ? "扫码付款" : "Scan to pay"} detail={language === "zh" ? "Zelle 收款邮箱：songtaozhang@gmail.com" : "Zelle recipient: songtaozhang@gmail.com"} /></div><p className="manualNotice">{t.manualNotice}</p><div className="paymentForm manualPaymentForm"><label>{t.email}<input type="email" name="buyer-download-email" autoComplete="off" value={paymentEmail} onChange={(event) => setPaymentEmail(event.target.value)} placeholder="buyer@example.com" /></label><label>{t.currency}<select value={paymentCurrency} onChange={(event) => setPaymentCurrency(event.target.value as PaymentCurrency)}><option value="RMB">RMB</option><option value="HKD">HKD</option><option value="USD">USD</option></select></label><label>{t.paymentMethod}<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}><option value="alipay_hk">AlipayHK</option><option value="alipay_cn">支付宝 China</option><option value="zelle">Citi Zelle</option></select></label><label>{t.paymentReference}<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder={language === "zh" ? "例如付款人姓名或交易尾号" : "payer name or transaction suffix"} /></label><label className="requestIdField">{t.requestId}<input value={paymentRequestId} onChange={(event) => setPaymentRequestId(event.target.value)} placeholder={language === "zh" ? "例如付款编号、交易尾号或转账时间" : "payment id, transaction suffix, or transfer time"} /></label><div className="formAction"><button onClick={submitPaymentRequest} disabled={paymentLoading}>{t.submitPaymentRequest}</button></div></div></section>{paymentStatusMessage && <div className="statusMessage">{paymentStatusMessage}</div>}{paymentError && <div className="errorMessage">{paymentError}</div>}<div className="modalActions"><button onClick={() => setExportKind(null)}>{t.close}</button></div></div></div>;

  return <div className="appShell"><header className="siteHeader"><div><p className="eyebrow">FX STRESS MODEL</p><h1>{t.title}</h1><p>{t.subtitle}</p></div><div className="headerActions"><button onClick={() => setLanguage(language === "zh" ? "en" : "zh")}>{t.lang}</button><a href="mailto:songtaozhang@gmail.com">songtaozhang@gmail.com</a></div></header>{renderNav()}{page === "home" ? renderHome() : page === "data" ? renderData() : renderLayer()}{renderPaymentModal()}<footer>{language === "zh" ? `版权所有，最新更新于 ${stressDataLastUpdated}` : `Copyright, last updated ${stressDataLastUpdated}`}</footer></div>;
}

export default App;
