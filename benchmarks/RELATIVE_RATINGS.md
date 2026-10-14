# Stockfish-relative rating estimates

All 32 settings played 10 games each against Stockfish 17.1 with its UCI strength model set to 1320: five opening pairs, with colors reversed. Both engines had a 150 ms-per-move budget; games were capped at 80 plies. This is a fast-control sample, **not verification of the printed ratings or full-budget play**.

| Printed target | Score / completed games | Unfinished | Smoothed relative estimate | Score interval (simultaneous 95%) | Actual Elo |
| --- | --- | --- | --- | --- | --- |
| 400 | 0/6 | 4 | 874 | 0.0%–77.2% | unverified |
| 500 | 0/9 | 1 | 808 | 0.0%–63.0% | unverified |
| 600 | 0/7 | 3 | 850 | 0.0%–71.5% | unverified |
| 700 | 0/6 | 4 | 874 | 0.0%–77.2% | unverified |
| 800 | 0/8 | 2 | 828 | 0.0%–66.9% | unverified |
| 900 | 0/7 | 3 | 850 | 0.0%–71.5% | unverified |
| 1000 | 0/6 | 4 | 874 | 0.0%–77.2% | unverified |
| 1100 | 0/4 | 6 | 938 | 0.0%–94.6% | unverified |
| 1200 | 0/5 | 5 | 903 | 0.0%–84.6% | unverified |
| 1300 | 0/7 | 3 | 850 | 0.0%–71.5% | unverified |
| 1400 | 1/7 | 3 | 1065 | 0.0%–85.8% | unverified |
| 1500 | 1/5 | 5 | 1129 | 0.0%–100.0% | unverified |
| 1600 | 0/7 | 3 | 850 | 0.0%–71.5% | unverified |
| 1700 | 1/6 | 4 | 1094 | 0.0%–93.9% | unverified |
| 1800 | 0.5/7 | 3 | 982 | 0.0%–78.6% | unverified |
| 1900 | 1/3 | 7 | 1231 | 0.0%–100.0% | unverified |
| 2000 | 1/5 | 5 | 1129 | 0.0%–100.0% | unverified |
| 2100 | 0.5/4 | 6 | 1079 | 0.0%–100.0% | unverified |
| 2200 | 0/8 | 2 | 828 | 0.0%–66.9% | unverified |
| 2300 | 3/5 | 5 | 1378 | 0.0%–100.0% | unverified |
| 2400 | 2.5/8 | 2 | 1200 | 0.0%–98.1% | unverified |
| 2500 | 1/5 | 5 | 1129 | 0.0%–100.0% | unverified |
| 2600 | 1/3 | 7 | 1231 | 0.0%–100.0% | unverified |
| 2700 | 1/5 | 5 | 1129 | 0.0%–100.0% | unverified |
| 2800 | 2.5/8 | 2 | 1200 | 0.0%–98.1% | unverified |
| 2900 | 2/3 | 7 | 1409 | 0.0%–100.0% | unverified |
| 3000 | 1/8 | 2 | 1040 | 0.0%–79.4% | unverified |
| 3100 | 2/6 | 4 | 1218 | 0.0%–100.0% | unverified |
| 3200 | 2/5 | 5 | 1262 | 0.0%–100.0% | unverified |
| 3300 | 2.5/5 | 5 | 1320 | 0.0%–100.0% | unverified |
| 3400 | 1/7 | 3 | 1065 | 0.0%–85.8% | unverified |
| 3500 | 2/6 | 4 | 1218 | 0.0%–100.0% | unverified |

Across 320 games: 27 engine wins, 159 losses, 5 draws, 129 unfinished.

Estimates use 1320 + 400 log10(p/(1-p)), with smoothed p=(score+0.5)/(completed games+1). The 1320 anchor is Stockfish’s model setting, not a real-world player rating. Draws score one-half; unfinished games are unscored. Ten games still give substantial uncertainty; zero/all-win results particularly depend on the smoothing convention.

Score intervals use a bounded-score Hoeffding calculation corrected across all 32 settings, assuming independent scores. Shared opening pairs and unseeded Stockfish randomness limit that interpretation. Unfinished games are censored, not draws; estimates conditional on completed games may be biased. Smoothed numbers are descriptive statistics, not a fitted calibration curve. More opening pairs and independently calibrated opponents are required.

Four benchmark processes ran concurrently. Wall-clock search depth depends on host load; the 150 ms budget does not guarantee an equal node count. No conclusions transfer to the full-budget engine or custom turn orders.

Raw game moves and outcomes: [relative-ratings.json](relative-ratings.json). Previous two-game pilot: [pilot-2-games/RELATIVE_RATINGS.md](pilot-2-games/RELATIVE_RATINGS.md). No game strength labels have been changed.

Replay verification passed for all 320 games and 19,631 plies, including independent chess.js move legality, SAN, positions, checkmate/stalemate, color/opening balance, outcomes, and estimate arithmetic. The game engine source hash matched.
