---
id: bbars
name: Bollinger bars
kind: indicator
family: chart style
sources:
  - title: Bollinger Bars announcement
    author: John Bollinger
    year: 2024
    url: n/a
    type: primary
confidence: medium
---

## Purpose
Redraws the chart's bars in John Bollinger's style: every bar has the same width, the high-to-low tails are drawn in one colour, and the open-to-close body is coloured by whether the bar closed above or below its open.

## How the author meant it to be used
John Bollinger announced Bollinger Bars in November 2024 as a cleaner way to read price. The aim is to separate the two things a bar tells you. The uniform-width bar shows the full range from low to high, with the same single-colour tails whatever the direction. The body, from open to close, carries the direction: one colour when the close is above the open and another when it is below. Because nothing else varies, the eye picks up direction and range at a glance, and colour is not spent on comparisons with the prior close.

## How you interact with it
Automatic. No inputs. It redraws the chart bars in this style; style rows set the up-body, down-body and tail colours. Each bar's look is known at its close; the developing bar can change body colour while it is open.

## Calculation
Tails: a single colour from the bar's low to its high. Body: from open to close, up colour if Close > Open, down colour if Close < Open. There is no hollow body and no rule involving the prior close. A bar that closes exactly at its open is not covered by the announcement; OpenCandle draws it with no body, all in the tails colour.

## Standard defaults
Blue tails, with a green body for an up bar and a red body for a down bar.

## Reading it
Colour of the body shows the session's direction only (close against open), so a gap does not change it. The tails show how far price travelled beyond the body on each side. Use it as a presentation of price, not a signal.

## Common mistakes and edge cases
- Expecting hollow bodies or colour by the prior close, as in some other candle styles; this style uses neither.
- Reading body colour as the change from the previous bar. It is only close against open.
- Equal open and close: the announcement gives no rule. OpenCandle draws such a bar all in the tails colour.

## How OpenCandle does it
- Follows John Bollinger's 2024 definition: uniform-width bars, one tails colour, and a body coloured by close against open. There is no rule involving the prior close and no hollow body.
- A bar whose close equals its open has no body and is drawn all in the tails colour.
- The style rows are Up body, Down body and Tails, with blue tails, green up bodies and red down bodies by default.

## Open questions
Treatment of a bar whose close equals its open is not specified by the author.
