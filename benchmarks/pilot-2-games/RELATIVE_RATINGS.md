# Stockfish-relative rating pilot

All 32 settings played one color-reversed pair against Stockfish 17.1 with its UCI strength model set to 1320. Both engines had a 150 ms-per-move budget; games were capped at 80 plies. This is a fast-control pilot, **not verification of the printed ratings or full-budget play**.

| Printed target | Score / completed games | Unfinished | Smoothed relative estimate | Actual Elo |
| --- | --- | --- | --- | --- |
| 400 | 0/2 | 0 | 1040 | unverified |
| 500 | 0/0 | 2 | not estimated | unverified |
| 600 | 0/1 | 1 | 1129 | unverified |
| 700 | 0/1 | 1 | 1129 | unverified |
| 800 | 0/1 | 1 | 1129 | unverified |
| 900 | 0/2 | 0 | 1040 | unverified |
| 1000 | 0/2 | 0 | 1040 | unverified |
| 1100 | 0/1 | 1 | 1129 | unverified |
| 1200 | 0/2 | 0 | 1040 | unverified |
| 1300 | 0/2 | 0 | 1040 | unverified |
| 1400 | 0/1 | 1 | 1129 | unverified |
| 1500 | 0/1 | 1 | 1129 | unverified |
| 1600 | 0/1 | 1 | 1129 | unverified |
| 1700 | 0/1 | 1 | 1129 | unverified |
| 1800 | 0/1 | 1 | 1129 | unverified |
| 1900 | 0/1 | 1 | 1129 | unverified |
| 2000 | 0/1 | 1 | 1129 | unverified |
| 2100 | 1/2 | 0 | 1320 | unverified |
| 2200 | 0/1 | 1 | 1129 | unverified |
| 2300 | 0/1 | 1 | 1129 | unverified |
| 2400 | 0/1 | 1 | 1129 | unverified |
| 2500 | 1/2 | 0 | 1320 | unverified |
| 2600 | 0/2 | 0 | 1040 | unverified |
| 2700 | 0/0 | 2 | not estimated | unverified |
| 2800 | 1/2 | 0 | 1320 | unverified |
| 2900 | 1/1 | 1 | 1511 | unverified |
| 3000 | 1/1 | 1 | 1511 | unverified |
| 3100 | 0/2 | 0 | 1040 | unverified |
| 3200 | 0/1 | 1 | 1129 | unverified |
| 3300 | 0/2 | 0 | 1040 | unverified |
| 3400 | 0/1 | 1 | 1129 | unverified |
| 3500 | 2/2 | 0 | 1600 | unverified |

Estimates use 1320 + 400 log10(p/(1-p)), with smoothed p=(score+0.5)/(completed games+1). The 1320 anchor is Stockfish’s model setting, not a real-world player rating. Draws score one-half; unfinished games are unscored. Two games are insufficient for calibration; zero/all-win results particularly depend on the smoothing convention.

The stored simultaneous bounded-score confidence intervals are broad (typically 0–1 here); there is no finite certified Elo interval. More held-out opening pairs and independently calibrated opponents are required. Stockfish internal randomness and wall-clock search depth are not deterministic.

Raw game moves and outcomes: [relative-ratings.json](relative-ratings.json). This standard-chess scale does not transfer to custom turns. No game strength labels have been changed based on this pilot.

Across all 64 games: 7 engine wins, 35 losses, no draws, and 22 unfinished games. All 3,732 recorded plies, final positions, outcomes, and estimate calculations passed replay verification.

Unfinished games are censored, not draws; estimates conditional on completed games may be biased. The smoothed numbers are descriptive pilot statistics, not a fitted calibration curve. One opening pair and two games per target cannot establish reliable ratings. All printed targets remain unverified.
