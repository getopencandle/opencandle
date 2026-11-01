---
id: bbtrend
name: BBTrend
kind: indicator
family: volatility bands
sources:
  - title: BBTrend formula from a forum post attributed to John Bollinger
    author: John Bollinger
    year: 2024
    url: https://www.edgerater.com/edgetalk/viewtopic.php?p=483
    type: primary
  - title: Open-source implementations of BBTrend
    author: various
    year: n/a
    url: n/a
    type: secondary
confidence: low
---

## Purpose
Measures trend direction and strength by comparing the spacing of a short and a long Bollinger Band set: the bands move apart in a trend, and the indicator is positive or negative accordingly.

## How the author meant it to be used
Bollinger introduced BBTrend more recently than his book (around 2024, per a forum post). Published summaries say values above zero indicate an upward trend and below zero a downward one, with larger magnitude meaning stronger trend. Detailed trading rules from the author are not widely published.

## How you interact with it
Automatic. Inputs: short length (20), long length (50), standard deviation (2), source. One histogram in its own pane. OpenCandle colours it in four ways: positive and rising, positive and falling, negative and falling, negative and rising. Known at the bar's close.

## Calculation
BBTrend = (|short lower - long lower| - |short upper - long upper|) / short middle x 100, from Bollinger Bands of 20 and 50 periods with 2 standard deviations. Sources differ on which middle band is the divisor; OpenCandle uses the short set's middle band. Some implementations omit the x 100.

## Standard defaults
20, 50, 2.

## Reading it
Above zero uptrend, below downtrend. When the lower bands are further apart than the upper bands, the value is positive (price trending up).

## Common mistakes and edge cases
- Swapping upper and lower, which flips the sign.
- Using the long middle band as the divisor.
- Omitting absolute values.
- Short length larger than the long length.

## How OpenCandle does it
- The divisor is the middle band of the short set, and the result is multiplied by 100.
- The bands use a simple average and the population standard deviation. A zero short middle band gives no value.
- Four colours show positive rising, positive falling, negative falling and negative rising; a value of exactly 0 is uncoloured. Defaults are 20, 50 and 2 standard deviations.

## Open questions
Which middle band is the divisor and whether x 100 is applied rest on published summaries, not a primary document. Entry rules (if any) from the author are unknown.
