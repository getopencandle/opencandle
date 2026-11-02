---
id: fundamental
name: Fundamentals
kind: indicator
family: fundamentals
sources:
  - title: SEC EDGAR APIs, company facts and submissions
    author: U.S. Securities and Exchange Commission
    year: n/a
    url: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
    type: primary
  - title: FASB ASC Topic 260, Earnings Per Share
    author: Financial Accounting Standards Board
    year: n/a
    url: https://asc.fasb.org/topic260
    type: primary
  - title: Compliance and Disclosure Interpretations, Non-GAAP Financial Measures (question 102.07, free cash flow)
    author: U.S. Securities and Exchange Commission
    year: n/a
    url: https://www.sec.gov/rules-regulations/staff-guidance/compliance-disclosure-interpretations/non-gaap-financial-measures
    type: primary
  - title: Market-Based Valuation, price multiples (trailing P/E and earnings yield)
    author: CFA Institute
    year: n/a
    url: https://www.cfainstitute.org/en/membership/professional-development/refresher-readings/market-based-valuation-price-enterprise-value-multiples
    type: secondary
  - title: Damodaran Online, valuing companies with negative earnings
    author: Aswath Damodaran
    year: n/a
    url: https://pages.stern.nyu.edu/~adamodar/
    type: secondary
  - title: The Intelligent Investor, chapter 14
    author: Benjamin Graham
    year: 1949
    url: book
    type: primary
confidence: medium
---

## Purpose
Draws a company's reported figures, or a ratio of price to those figures, as a pane under the chart. Each value appears on the bar where it first became public, so the pane shows what a reader could have known at that time.

## How the author meant it to be used
The figures come from the company's own filings with the SEC. Revenue, earnings and cash flow show how a business is doing; ratios such as P/E, P/S and P/B relate price to those figures (CFA Institute). Trailing P/E divides price by the last four quarters of diluted earnings per share, and earnings yield is its inverse. Damodaran notes that a ratio with negative earnings is not meaningful, so it is left empty rather than shown as a negative number. SEC C&DI 102.07 treats free cash flow as a non-GAAP measure: companies define it themselves, so the definition used here is stated below.

## How you interact with it
Add it from the Fundamentals tabs in the sidebar, or from the indicator list. Inputs: Metric (P/E by default), Period (TTM, Quarterly or Annual), Display (Value or YoY %) and Revisions (First filed or Latest filed). Ratios always use TTM, so Period is disabled for them. The first company request happens when you add the indicator or choose Refresh company data in the legend menu; after that the data refreshes at most once a day while the chart is on screen. The data window shows the period end, filing date, form, method and retrieval time of the value under the cursor. Statement figures draw as steps; ratios draw as a line.

## Calculation
- Source: SEC company facts, US GAAP only. A value for each period comes from one tag; the tool never mixes tags inside one calculation.
- A standalone quarter is a reported three-month figure, else the year-to-date figure less the previous one, else (fourth quarter only) the full year less nine months. Per-share figures use the reported quarter or the full year less nine months only.
- TTM is the sum of four standalone quarters in a row. A missing quarter leaves a gap, with the reason in the data window.
- P/E = close / TTM diluted EPS, empty when EPS is zero or negative. Earnings yield = TTM EPS / close. Market cap = close x shares outstanding.
- Free cash flow = operating cash flow less capital expenditure, with no lease principal subtracted. FCF per share divides by shares outstanding. FCF margin and the other margins divide by revenue.
- Splits: figures are put on one split basis before any sum or difference, using Alpaca split events when they are loaded and restatement pairs in the filings otherwise.
- YoY compares a period with the one that ended 358 to 372 days earlier; a zero or negative prior value is shown as not meaningful.

## Standard defaults
P/E, TTM, Value, First filed.

## Reading it
A value is on the bar whose time is after the filing was accepted by the SEC; when the acceptance time is unknown, on the next session after the filing date. Values step forward and are never interpolated. Ratios use each bar's own close.

## Common mistakes and edge cases
- Quarterly figures are often reported only as year-to-date; the fourth quarter is usually not reported on its own.
- Companies restate. First filed keeps the number as first published, which is what was known then; Latest filed shows the corrected number but still places it at the original filing time, so it looks ahead.
- Funds, ETFs, indexes, crypto, forex and demo charts have no company filings and show a reason instead.
- Companies with several share classes have no single share count, so market value ratios are left empty.
- Ratios need split-adjusted or raw prices; total-return prices are refused.

## How OpenCandle does it
OpenCandle's choices where the sources leave room:
- GAAP diluted EPS is the earnings measure.
- First filed is the default revision.
- A value becomes available at the SEC acceptance time, not at the end of the filing day.
- A derived fourth quarter is used only when the fourth quarter is not reported.
- One tag per value.
- Free cash flow is operating cash flow less capital expenditure, with no lease principal. FCF per share uses shares outstanding.
- Companies with several share classes leave share-based ratios empty.
- No ratios on total-return prices.
- Nothing is requested from the SEC when the app starts. Restored charts read the local cache only.
