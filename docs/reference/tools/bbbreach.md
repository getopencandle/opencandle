---
id: bbbreach
name: Bollinger Bands breach
kind: indicator
family: signals
sources:
  - title: Bollinger Band Rules
    author: John Bollinger
    year: n/a
    url: https://www.bollingerbands.com/bollinger-band-rules
    type: primary
  - title: Bollinger on Bollinger Bands
    author: John Bollinger
    year: 2001
    url: book
    type: primary
  - title: ChartSchool, Bollinger Bands
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/bollinger-bands
    type: secondary
  - title: TA-Lib BBANDS source, ta_BBANDS.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_BBANDS.c
    type: secondary
confidence: high
---

## Purpose
Marks the bars where price closes outside a Bollinger Band. It is a marker layer on top of the bands, not a trade signal by itself.

## How the author meant it to be used
Bollinger's rules page states that band tags are "tags, not signals" (rule 6) and that closes outside the bands are "initially continuation signals, not reversal signals" (rule 8), noting this is the basis of many volatility breakout systems. In trends price can walk up the upper band or down the lower band (rule 7). For reversals, Bollinger compares price action with indicator action, using indicators from different families (a momentum tool with a volume tool, not two momentum tools; rule 4), and uses the bands to define patterns such as M tops and W bottoms (rule 5). A breach is information about strength or short-term volatility, read in context. Rule 22 adds that the bands do not give continuous advice; they help find setups.

## How you interact with it
Automatic. You pick the length and the width in standard deviations; the markers follow from the bands. Nothing is placed or anchored. A breach on the live bar is provisional until the bar closes.

## Calculation
Middle band = simple moving average of close over N. Bands = middle plus or minus k times the standard deviation of close over the same N bars. Bollinger's rule 12 says the average is simple because the standard deviation calculation uses a simple average, for logical consistency; ChartSchool says the same. The TA-Lib reference code computes the variance as the mean of squares minus the square of the mean over N, which is the population form (divide by N, not N-1). Bollinger's own pages do not say whether the divisor is N or N-1; the population form is what TA-Lib and conventional implementations use. Exponential bands exist (rule 13) but need exponential weighting in both the middle band and the deviation. A breach up is close > upper; a breach down is close < lower. The test uses close, not the wick, so it is known only at the bar close. The first N-1 bars have no bands and no breach.

## Standard defaults
20 periods, 2 standard deviations, simple average (rule 9, described as defaults only; other markets may need other values). Rule 11: raise the multiplier as the average lengthens (2.1 at 50 periods) and lower it as it shortens (1.9 at 10). ChartSchool repeats the 50 and 10 period suggestions. Rule 14 says to make no statistical assumptions from the standard deviation; in practice about 90 percent, not 95 percent, of data sits inside the default bands.

## Reading it
Close above upper in a rising market: strength, trend continuation more often than reversal. Close outside after a squeeze (low BandWidth, rule 19): a possible start of a move. Reversal evidence is a breach followed by failure to follow through, plus a confirming indicator or pattern from a different family.

## Common mistakes and edge cases
- Treating every breach as a sell or buy (rule 6).
- Using sample standard deviation (N-1): bands come out slightly wider than the population form.
- Counting a wick poke as a breach.
- Marking the unfinished bar, which can appear and disappear (repaint).
- Zero standard deviation (flat prices) gives bands equal to the middle; equality should not count as a breach.
- Using a different average type for the middle band than for the deviation.

## How OpenCandle does it
- Bands use the close, a simple average and the population standard deviation. A breach needs a close strictly outside the band (equal does not count).
- First close outside only is on by default, so a run of closes outside marks only the first. Re-entry markers are optional and off by default; a re-entry is a close back at or inside the bands after a close outside.
- Each mark reads only its own bar and the bar before, so a mark on a closed bar never changes. A mark on the live bar can appear and disappear until the bar closes.
- The signal plots are 1 on the bar where the condition is met and 0 otherwise; alerts, the legend and the data window read them.
- Defaults are length 20 and 2 standard deviations. A window with a missing close gives no value.

## Open questions
Unverified: the population versus sample choice in Bollinger's own text. Whether OpenCandle tests close or high/low should be confirmed against the implementation.
