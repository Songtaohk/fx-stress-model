# Asia v4 data extension audit

Date: 2026-05-24

This note records the v4 extension for Japan, Taiwan, and Korea.

## What changed

### Japan

Japan CA/GDP, Savings/GDP, FDI net/GDP, and Portfolio net/GDP are now extended
from 1970 through 1995 using official Japan Cabinet Office ESRI historical
national accounts tables.

The post-1996 values remain the WDI / IMF / OECD comparable-source chain. The
site labels this as a methodology boundary:

- 1970-1995: Japan official historical national-accounts / external-transactions
  source.
- 1996 onward: WDI / IMF / OECD comparable chain.

Formulas:

- `CA_GDP = Surplus of the nation on current transactions / Gross domestic expenditure * 100`
- `Savings_GDP = (Gross domestic expenditure - private final consumption - government final consumption) / Gross domestic expenditure * 100`
- `FDI_GDP = (Direct investment assets - Direct investment liabilities) / Gross domestic expenditure * 100`
- `Portfolio_GDP = (Securities investment assets - Securities investment liabilities) / Gross domestic expenditure * 100`

External debt/GDP remains 2003 onward. It was not backcast and IIP liabilities
were not used as an external-debt substitute.

### Taiwan

Taiwan CA/GDP, FDI net/GDP, and Portfolio net/GDP are now extended from 1984
through 2011 using CBC official historical Balance of Payments annual tables.

The post-2012 values remain the existing CBC open-data chain.

Formulas:

- `CA_GDP = CBC current account USD mn / DGBAS nominal GDP USD * 100`
- `FDI_GDP = CBC direct investment net USD mn / DGBAS nominal GDP USD * 100`
- `Portfolio_GDP = CBC portfolio investment net USD mn / DGBAS nominal GDP USD * 100`

CBC states that the BOP time series from 1984 have been converted to BPM6.

### Korea

Korea's CA/GDP, FDI net/GDP, Portfolio net/GDP, Savings/GDP, CPI, FX reserves,
old-age dependency, and credit-gap series already cover at least the 1990 target
or earlier in the current dataset.

The following Korea series are not backfilled:

- Real policy rate starts in 1999.
- 10Y nominal yield starts in 2000.
- External debt/GDP starts in 1998.

Reason: replacing these with overnight call rates, 3Y government bond yields, or
non-identical external-debt proxies would mix proxy metrics into the main
definition. They remain explicit data gaps unless a same-definition official
series is approved.

## Artifacts

- `Fx_Stress_Model_Data_v4.xlsx`
- `data/Fx_Stress_Model_Data_v4.json`
- `scripts/apply_v4_asia_extension.py`

The v4 workbook includes:

- `V4_Asia_Extension_Log`
- `KR_TW_Coverage_Check_v4`
- regenerated `Coverage_Summary`

No interpolation, extrapolation, or unverifiable proxy substitution was used.
