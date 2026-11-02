---
id: pebands
name: P/E bands
kind: indicator
family: fundamentals
sources:
  - title: Market-Based Valuation, price multiples (trailing P/E)
    author: CFA Institute
    year: n/a
    url: https://www.cfainstitute.org/en/membership/professional-development/refresher-readings/market-based-valuation-price-enterprise-value-multiples
    type: secondary
  - title: FASB ASC Topic 260, Earnings Per Share
    author: Financial Accounting Standards Board
    year: n/a
    url: https://asc.fasb.org/topic260
    type: primary
  - title: SEC EDGAR APIs, company facts and submissions
    author: U.S. Securities and Exchange Commission
    year: n/a
    url: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
    type: primary
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
Overlays price levels that correspond to a chosen P/E on the price chart, so you can see where the share price would sit at a typical or a fixed multiple of earnings.

## How the author meant it to be used
A P/E multiple turns earnings into a price: price = multiple x trailing earnings per share (CFA Institute). Comparing today's price with the company's own past multiples shows whether it trades richer or cheaper than usual. Damodaran advises against using the ratio when earnings are negative, so those bars are skipped. Graham's number, sqrt(22.5 x EPS x book value per share), is a ceiling for what a defensive investor would pay; Graham's original used average earnings over three years (The Intelligent Investor, chapter 14).

## How you interact with it
Add it as an overlay on a company chart. Inputs: Mode (Own history or Multiples), Lookback (5 years), Bands (Percentiles 25/75 or plus and minus one standard deviation), three Multiples (15, 20, 25), Graham (off) and Revisions. All lines are thin and dotted and sit behind the candles; only the median carries a price label. The company data is requested when you add it, and then at most once a day while the chart is on screen.

## Calculation
- Own history: for each New York date in the lookback, take the last close and divide by that date's TTM diluted EPS. Dates with zero or negative EPS are skipped. The median, and the 25th and 75th percentiles (or the mean plus and minus one standard deviation), of the P/E values seen up to each bar are multiplied by that bar's TTM EPS to give price levels. It needs valid dates spanning at least one year; a shorter chart shows how many years it has.
- Multiples: each chosen multiple x TTM EPS. When a level falls outside half to twice the bar's close it is not drawn and the data window says Off scale.
- Graham (TTM variant) = sqrt(22.5 x TTM EPS x book value per share), with both positive. Book value per share is equity less any preferred stock, over the share count at the equity date.
- Only information available at each bar is used, so the bands do not look ahead in First filed mode.

## Standard defaults
Own history, 5 years, Percentiles 25/75, multiples 15 / 20 / 25, Graham off, First filed.

## Reading it
Price above the upper band means the stock trades at a higher multiple than it has usually done over the lookback; below the lower band, a lower one. The bands say nothing about whether earnings will hold.

## Common mistakes and edge cases
- Latest filed revisions use corrected earnings that were not known at the time, so the bands look ahead; the choice is yours.
- A recent loss makes TTM EPS zero or negative, so the bands have gaps.
- Splits are put on one basis first; with unknown splits the affected bars are empty.
- Companies with several share classes leave Graham empty.

## How OpenCandle does it
OpenCandle's choices: GAAP diluted EPS, first filed by default, values available from the SEC acceptance time, one tag per value, a multi-class company is a gap, no ratios on total-return prices, causal bands built only from information that existed at each bar, and the TTM variant of Graham's number.
