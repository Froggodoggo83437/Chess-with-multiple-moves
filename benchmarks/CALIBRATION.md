# Stockfish-relative rating calibration

All 32 settings have 18 games: the earlier 10 games against the 1320 preset (unfinished games continued), plus eight fresh games crossing two held-out openings with both the 1500 and 1800 presets, with colors reversed. Both sides have a requested 150 ms search budget per move. Games run to a rule-defined result or 400 plies; there is no resignation/draw adjudication.

**576 games, 61,680 replay-verified plies:** 52 wins, 101 draws, 417 losses, 6 unfinished. Resolved 125 of the 129 earlier unfinished games.

**These are provisional estimates on a Stockfish-relative fast-control scale. Application/default-budget ratings and human Elo remain unverified.** The reference numbers are Stockfish presets, not independently established player ratings. No game labels or playing logic were changed.

| Printed setting | W/D/L/unfinished | Point estimate | Per-setting 95% range | Simultaneous 95% range |
| --- | --- | --- | --- | --- |
| 400 | 0/0/18/0 | upper bound only | unbounded below to 1326 | unbounded below to 1519 |
| 500 | 0/0/18/0 | upper bound only | unbounded below to 1326 | unbounded below to 1519 |
| 600 | 0/0/18/0 | upper bound only | unbounded below to 1326 | unbounded below to 1519 |
| 700 | 0/0/18/0 | upper bound only | unbounded below to 1326 | unbounded below to 1519 |
| 800 | 0/0/18/0 | upper bound only | unbounded below to 1326 | unbounded below to 1519 |
| 900 | 0/0/17/1 | censored | unbounded below to 1440 | unbounded below to 1624 |
| 1000 | 0/0/18/0 | upper bound only | unbounded below to 1326 | unbounded below to 1519 |
| 1100 | 0/0/17/1 | censored | unbounded below to 1440 | unbounded below to 1624 |
| 1200 | 0/3/15/0 | 1001 | -42 to 1480 | -845 to 1665 |
| 1300 | 0/1/17/0 | 669 | -4634 to 1365 | -9450 to 1553 |
| 1400 | 1/2/15/0 | 1060 | 226 to 1518 | -378 to 1704 |
| 1500 | 1/4/13/0 | 1129 | 465 to 1571 | 22 to 1761 |
| 1600 | 0/6/12/0 | 1060 | 226 to 1518 | -378 to 1704 |
| 1700 | 2/4/12/0 | 1203 | 657 to 1641 | 326 to 1836 |
| 1800 | 0/4/14/0 | 1032 | 109 to 1499 | -580 to 1685 |
| 1900 | 3/6/9/0 | 1312 | 860 to 1765 | 622 to 1971 |
| 2000 | 3/5/10/0 | 1267 | 785 to 1711 | 517 to 1912 |
| 2100 | 1/5/12/0 | 1168 | 572 to 1606 | 195 to 1799 |
| 2200 | 2/4/12/0 | 1149 | 522 to 1589 | 115 to 1780 |
| 2300 | 6/5/7/0 | 1398 | 979 to 1882 | 781 to 2103 |
| 2400 | 3/6/9/0 | 1252 | 757 to 1693 | 476 to 1893 |
| 2500 | 4/2/12/0 | 1282 | 812 to 1729 | 555 to 1931 |
| 2600 | 3/4/11/0 | 1236 | 726 to 1676 | 431 to 1874 |
| 2700 | 4/3/11/0 | 1297 | 837 to 1747 | 590 to 1951 |
| 2800 | 2/2/14/0 | 1129 | 465 to 1571 | 22 to 1761 |
| 2900 | 2/10/6/0 | 1355 | 924 to 1822 | 708 to 2034 |
| 3000 | 2/2/14/0 | 1085 | 321 to 1536 | -217 to 1724 |
| 3100 | 3/4/9/2 | censored | 757 to 1803 | 476 to 2013 |
| 3200 | 3/5/9/1 | censored | 785 to 1747 | 517 to 1951 |
| 3300 | 2/10/6/0 | 1341 | 903 to 1803 | 682 to 2013 |
| 3400 | 1/2/14/1 | censored | 109 to 1571 | -580 to 1761 |
| 3500 | 4/2/12/0 | 1236 | 726 to 1676 | 431 to 1874 |

## Interpretation

Finite point estimates invert 1/(1+10^((opponent-rating)/400)), averaged equally over distinct opening groups; each group averages all its colors and reference opponents. Raw win/draw/loss totals are unweighted. Draws score one-half. No smoothing adds fictional wins or losses. An all-loss sample cannot establish a finite rating; its upper confidence bound is reported instead.

All colors and reference strengths played from the same opening position form one bounded observation. There are nine color-reversed pairs but seven distinct opening groups per setting; the groups receive equal weight. This avoids treating repeated games from the same opening as independent. The relative-entropy concentration bound provides per-setting intervals; the wider simultaneous intervals account for all 32 comparisons. They assume independent opening groups and an expected-score Elo model against the given presets. They do not include systematic errors in the presets or opening selection.

Remaining unfinished games are allowed every score from loss to win when computing bounds. They are neither discarded nor counted as draws. Their observed rating identification ranges are also retained in the JSON. Continuing old games uses their complete history and a declared new random seed; it is not a replay of the original RNG stream.

The lowest labeled reference available is 1320. Results below it require extrapolation and cannot reliably distinguish every low slider label. A stronger/lower calibrated reference pool and many independent opening pairs are needed. Seven distinct opening groups per setting cannot support a narrow ±100 Elo claim. No data are pooled or forced into a monotonic slider curve.

Actual wall-clock move timing (including protocol overhead): engine median 154 ms, 95th percentile 227 ms, maximum 634 ms; reference median 162 ms, 95th percentile 173 ms, maximum 272 ms. The requested 150 ms budget is a soft search limit, not a chess-clock forfeiture rule.

Four benchmark processes share the host. Wall-clock budgets, finite search, and unseeded Stockfish randomness affect depth; elapsed times are retained. The new 1500/1800 tests are fresh opening checks, but both new openings are crossed with both new reference strengths. The 1320 games use different openings, so residual opening/reference effects cannot be fully separated in this sample.

Printed settings outside their simultaneous intervals at this fast control: 1800, 2000, 2100, 2200, 2300, 2400, 2500, 2600, 2700, 2800, 2900, 3000, 3100, 3200, 3300, 3400, 3500. This does not test those settings at their application thinking budgets.

## Next calibration steps

Test the actual application thinking budgets separately, with explicitly matched opponent budgets; never merge different time controls. Add many opening pairs crossed with all reference strengths, repeat fresh hold-out tests after any engine change, and include genuinely weaker calibrated opponents for low settings. Only then consider replacing target labels with measured ranges. Custom turn schedules require a separate scale per schedule.

Raw games: [calibration-games.json](calibration-games.json). Estimates/method: [calibration-estimates.json](calibration-estimates.json). Verification receipt: [calibration-verification.json](calibration-verification.json). Earlier uncontinued sample: [RELATIVE_RATINGS.md](RELATIVE_RATINGS.md).
