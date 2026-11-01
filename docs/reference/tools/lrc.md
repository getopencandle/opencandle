---
id: lrc
name: Linear regression channel
kind: indicator
family: regression channel
sources:
  - title: Linear regression (TA-Lib LINEARREG, ta_LINEARREG.c)
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_LINEARREG.c
    type: secondary
confidence: low
---

## Purpose
Shows a least-squares trend line over the last N bars with parallel bands at a multiple of the dispersion around it.

## How the author meant it to be used
No single author; the standard deviation channel around a regression line is textbook, and Gilbert Raff's regression channel (using the maximum deviation instead) is a related tool. Use: the centre line is the fair trend, the bands mark stretched price; a trend break is price closing outside a band. OpenCandle's design says the channel is refitted on each new bar.

## How you interact with it
Automatic overlay (not user-anchored): it is always the latest N bars. Inputs: count, upper and lower deviation multiples, source. Because it refits, the whole line and bands move with each new bar; older bars are not frozen. Only the latest N bars carry values.

## Calculation
Fit y = b + m x over the last N source values. Residual standard deviation s = sqrt(mean of squared residuals) (OpenCandle uses divisor n, population). Upper = line + k_u x s; lower = line - k_l x s.

## Standard defaults
Count 100, deviation 2 and 2 (OpenCandle). Practitioners vary the count widely.

## Reading it
Slope = trend; touches of bands = extremes. The channel is a description of the past window and can swing when the window slides.

## Common mistakes and edge cases
- Population vs sample standard deviation (n vs n - 2 for regression) changes width.
- Using price standard deviation instead of residual deviation.
- Repainting: the whole channel changes each bar by design.
- Fewer than N bars loaded fits what exists.

## How OpenCandle does it
- Always fits the latest Count bars, so the whole channel repaints on each new bar and older bars are blank.
- Band width uses the population divisor n. Platforms that use n - 1 draw bands slightly wider (about 0.5 percent at 100 bars).

## Open questions
No primary source defines the standard deviation channel. Sources differ on the residual divisor.
