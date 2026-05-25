# Data README: Source Boundaries And Comparability

Date: 2026-05-24

This README focuses on data series that combine different official sources over
time, the adjustments made to improve comparability, and the remaining quality
risks. It is not a version-change log.

## Core principle

No historical values are interpolated, extrapolated, or filled with unverifiable
proxies. Where a series changes source or methodology across time, the boundary
is recorded and the likely comparability impact is stated.

## Source-boundary table

| Economy / series | Time segment | Source | Adjustment made | Remaining comparability issue |
| --- | --- | --- | --- | --- |
| Japan CA/GDP | 1970-1995 | Japan Cabinet Office ESRI historical national accounts, External Transactions, calendar year | Converted official yen current-account balance to `% of gross domestic expenditure`. | 1995/1996 boundary changes from domestic historical source to WDI/IMF/OECD chain. Level shifts may reflect methodology as well as economics. |
| Japan CA/GDP | 1996 onward | WDI / IMF / OECD comparable chain | Kept original comparable-source values. | More comparable cross-country, but not identical source continuity with 1970-1995. |
| Japan Savings/GDP | 1970-1995 | Japan Cabinet Office ESRI historical national accounts, Gross Domestic Expenditure | Calculated as `(gross domestic expenditure - private final consumption - government final consumption) / gross domestic expenditure`. | This is gross domestic saving by domestic historical table; later WDI/OECD savings may use harmonized national-account presentation. |
| Japan Savings/GDP | 1996 onward | WDI / OECD / World Bank chain | Kept original comparable-source values. | 1995/1996 source boundary may affect the level. |
| Japan FDI net/GDP | 1970-1995 | Japan Cabinet Office ESRI External Transactions, Capital Transactions | Calculated as `direct investment assets - direct investment liabilities`, divided by gross domestic expenditure. Direction aligned to the model's `assets - liabilities` convention. | Historical capital-account categories are not necessarily identical to later BPM presentation. |
| Japan FDI net/GDP | 1996 onward | WDI / IMF BOP chain | Kept original comparable-source values. | 1995/1996 source and BOP-methodology boundary. |
| Japan Portfolio net/GDP | 1970-1995 | Japan Cabinet Office ESRI External Transactions, Capital Transactions | Used securities investment as the historical portfolio concept; calculated as `securities investment assets - securities investment liabilities`, divided by gross domestic expenditure. | Securities investment is the closest official historical equivalent, but category mapping may differ from later portfolio-investment presentation. |
| Japan Portfolio net/GDP | 1996 onward | WDI / IMF BOP chain | Kept original comparable-source values. | 1995/1996 source and BOP-methodology boundary. |
| Taiwan CA/GDP | 1984-2011 | CBC historical Balance of Payments annual tables | CBC USD million current account divided by DGBAS nominal GDP USD. | 2011/2012 boundary changes from CBC historical workbook to CBC open-data chain, though CBC states BOP data from 1984 are converted to BPM6. |
| Taiwan CA/GDP | 2012 onward | CBC open data | Kept existing CBC open-data values. | Mostly same institution, but source delivery/table chain changes. |
| Taiwan FDI net/GDP | 1984-2011 | CBC historical Balance of Payments annual tables | CBC direct investment net divided by DGBAS nominal GDP USD. Direction kept consistent with the model's net financial-account convention. | Earlier values are from historical workbook; post-2012 values from current open-data table. |
| Taiwan FDI net/GDP | 2012 onward | CBC open data | Kept existing CBC open-data values after prior direction correction. | 2011/2012 source-chain boundary. |
| Taiwan Portfolio net/GDP | 1984-2011 | CBC historical Balance of Payments annual tables | CBC portfolio investment net divided by DGBAS nominal GDP USD. Direction kept consistent with the model's net financial-account convention. | 2011/2012 source-chain boundary. |
| Taiwan Portfolio net/GDP | 2012 onward | CBC open data | Kept existing CBC open-data values after prior direction correction. | Early and current tables are from the same institution but may differ in table layout and revision timing. |
| Taiwan External Debt/GDP | 1999 onward | CBC SDDS External Debt | Official external debt USD stock divided by nominal GDP USD. | No pre-1999 backcast. IIP liabilities are not used because they are not the same metric as external debt. |
| DE/EA macro series | Pre-1999 | Germany proxy where Euro Area/EU aggregate does not exist historically | Labelled as `DE/EA`; EUR FX before 1999 converted from Deutsche Mark using `1 EUR = 1.95583 DEM`. | Germany is not the Euro Area. 1999 is an institutional break. |
| DE/EA macro series | 1999 onward | Euro Area / EU aggregate where available | Uses aggregate series for selected variables. | Mixed Germany-proxy and aggregate history should be interpreted as a constructed European comparator. |
| DE/EA TFP and ULC proxy | Full available period | Germany proxy from PWT | No Euro Area PWT aggregate is used. | Productivity comparison reflects Germany bias, not Euro Area aggregate productivity. |
| Korea monetary rates | 1999/2000 onward | Existing aligned official/cross-country sources | No replacement with call rate or 3Y yield. | Earlier Korea monetary history remains blank to avoid introducing proxy metrics. |
| Korea External Debt/GDP | 1998 onward | Existing aligned external-debt source | No backcast. | Earlier values remain blank because no same-definition official stock series was added. |

## Adjustments made to improve comparability

- Converted flow and stock values to `% of GDP` or `% of gross domestic
  expenditure` where the source provided currency amounts.
- Aligned FDI and portfolio flow direction to the model's convention:
  `assets - liabilities`.
- Kept pair comparisons in FX quotation direction:
  `base economy value - quote economy value`.
- Used the official fixed DEM/EUR conversion rate for pre-1999 EUR-related FX.
- Preserved blanks where the only alternatives were proxies or non-identical
  concepts.

## Adjustments deliberately not made

- No interpolation or extrapolation.
- No replacement of external debt with IIP liabilities.
- No replacement of Korea 10Y yield with 3Y yield.
- No replacement of Korea policy rate with call-rate proxy.
- No derived Taiwan credit gap without an approved quarterly credit and GDP
  input.

## How to interpret stitched series

Stitched series are useful for long-run visualization and stress-model context,
but source-boundary years should not be over-interpreted as pure economic
inflection points. In particular:

- Japan around 1995/1996 may contain source-methodology effects.
- Taiwan around 2011/2012 may contain table-chain/revision effects.
- DE/EA around 1999 is an institutional and statistical break.

For regression or formal statistical testing, add boundary dummies or test
results with and without the stitched historical segment.
