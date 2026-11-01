---
id: gannfan
name: Gann fan
kind: drawing
family: Gann
sources:
  - title: How to Make Profits in Commodities
    author: W. D. Gann
    year: 1942
    url: book
    type: primary
  - title: 45 Years in Wall Street
    author: W. D. Gann
    year: 1949
    url: book
    type: primary
  - title: Gann Lines and Gann Angles
    author: Linn Software
    year: 2020
    url: https://www.linnsoft.com/techind/gann-lines-and-gann-angles
    type: secondary
  - title: Gann fan help pages from several charting programs
    author: several
    year: 2020
    url: book
    type: secondary
confidence: low
---

## Purpose
A set of rays from one pivot at fixed price-to-time slopes (Gann angles), used as dynamic support and resistance, with the 1x1 line as the central trend guide.

## How the author meant it to be used
W. D. Gann taught that price and time are in proportion and that fixed-angle lines drawn from major tops and bottoms act as support and resistance. The 1x1 angle (one unit of price per unit of time, 45 degrees on a properly scaled chart) is the most important: in an uptrend, price above the 1x1 is strong and the line is the major support; a break below it signals a trend change and the next angle down becomes the target. This account comes from secondary descriptions that largely agree. Gann's own method required a chosen chart scale (a fixed number of price units per bar), and he used the same scale on a given chart.

## How you draw it
Two clicks. The first is the pivot where the fan starts (a significant high or low). The second defines the scale: most software makes the line through the second click the 1x1 line, so the price-per-bar scale is derived from the two points (this differs from Gann, who fixed the scale in advance). The other angles are then drawn from the pivot at ratios of that slope and extend to the right. Both points can be dragged: moving the pivot moves the whole fan; moving the second point changes the scale. Gann angles are defined on bars (time units), and the fan should remain attached to its bar and price when the interval changes (the 1x1 slope then becomes price per time of the new bar size, which changes the picture). On a log scale the angles stop being straight in price terms; Gann worked on arithmetic charts and the geometry is only faithful on a linear scale. Weekends and gaps: Gann counted calendar days for cycles but angles on a chart count bars.

## Geometry and levels
Notation: "AxB" is A time units by B price units. 1x1 = 45 degrees. Nine standard angles (the 1x1 and eight others). Each line's slope is price/time = B/A times the base 1x1 slope. The traditional quoted figures are 1x8 = 82.5, 1x4 = 75, 1x3 = 71.25, 1x2 = 63.75, 1x1 = 45, 2x1 = 26.25, 3x1 = 18.75, 4x1 = 15 and 8x1 = 7.5 degrees. These are not the angles of the slopes: on a scale where 1x1 is 45 degrees each ray is at arctan(B/A), that is 1x8 = 82.87 (arctan 8), 1x4 = 75.96 (arctan 4), 1x3 = 71.57 (arctan 3), 1x2 = 63.43 (arctan 2), 1x1 = 45, 2x1 = 26.57, 3x1 = 18.43, 4x1 = 14.04 and 8x1 = 7.13 degrees. Software draws the slope ratios; the quoted figures are names for the lines, not measurements. The upward fan is for a pivot low; the downward fan for a pivot high.

## Standard defaults
Nine lines: 1x8, 1x4, 1x3, 1x2, 1x1, 2x1, 3x1, 4x1, 8x1 (a common reduced set drops 1x8 and 8x1).

## Reading it
Price oscillating between two adjacent angles is common; a break of the 1x1 is the key event. Each angle can act as support or resistance. No rigorous evidence of predictive power is established in the secondary literature.

## Common mistakes and edge cases
- Assuming 45 degrees means a literal screen angle; it depends on the chart's scale (unequal axes make the visual angle differ).
- Using it on a log scale.
- Different "AxB" ordering conventions (time by price or price by time) swap steep and shallow lines.
- Changing interval changes the 1x1 slope unless the scale is fixed in data units.
- Very small second-point distance yields extreme or flat slopes.

## How OpenCandle does it
- Nine rays: 1x8, 1x4, 1x3, 1x2, 1x1, 2x1, 3x1, 4x1 and 8x1.
- The 1x1 angle is set by your second click, so the scale comes from the two points and is not a fixed price per bar.
- Labels use the "1x2" form, not "1/2", so they are not read as half the slope.

## Open questions
- Whether the app derives the scale from the second click or uses a user-set price-per-bar value.
- Whether the angle table uses degrees or slope ratios.
- Gann's own text was not read, so the 1942 and 1949 citations are for the method in general.
- Verification status: only the ChartSchool pages (and web search snippets for the Cypher, Three Drives, Gann angle, Schiff and value-area details) were actually retrieved. Every book citation in the sources list, and the claims attributed to those books, are from memory and unverified.
