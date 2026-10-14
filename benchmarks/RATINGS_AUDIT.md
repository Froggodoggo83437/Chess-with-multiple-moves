# All-settings audit

All 32 settings were exercised at their actual thinking budgets. **No actual Elo rating is verified.** These are two-position checks, not a rating pool or statistical calibration.

| Target | Opening move | Reference loss (cp) | Custom defense | Total engine time | Actual Elo |
| --- | --- | --- | --- | --- | --- |
| 400 | d1e2 | 123 | goal missed (b8f8) | 502 ms | unverified |
| 500 | d1e2 | 123 | goal missed (b8f8) | 632 ms | unverified |
| 600 | d1e2 | 123 | goal missed (b8b1) | 751 ms | unverified |
| 700 | d1e2 | 123 | goal missed (b8b1) | 876 ms | unverified |
| 800 | d1e2 | 123 | goal missed (b8b1) | 1004 ms | unverified |
| 900 | h2h3 | 262 | goal missed (b8b1) | 1253 ms | unverified |
| 1000 | h2h3 | 262 | goal missed (b8b1) | 1504 ms | unverified |
| 1100 | h2h3 | 262 | goal missed (b8b1) | 1754 ms | unverified |
| 1200 | c1g5 | 331 | goal met (b8g8) | 2005 ms | unverified |
| 1300 | c1g5 | 331 | goal met (b8g8) | 2402 ms | unverified |
| 1400 | c1g5 | 331 | goal met (b8g8) | 2802 ms | unverified |
| 1500 | c1g5 | 331 | goal met (b8g8) | 3205 ms | unverified |
| 1600 | c1g5 | 331 | goal met (b8g8) | 3601 ms | unverified |
| 1700 | c1g5 | 331 | goal met (b8g8) | 4202 ms | unverified |
| 1800 | c1g5 | 331 | goal met (b8g8) | 4806 ms | unverified |
| 1900 | c1g5 | 331 | goal met (b8g8) | 5405 ms | unverified |
| 2000 | c1g5 | 331 | goal met (b8g8) | 6008 ms | unverified |
| 2100 | c1g5 | 331 | goal met (b8g8) | 6501 ms | unverified |
| 2200 | c1g5 | 331 | goal met (b8g8) | 7004 ms | unverified |
| 2300 | c1g5 | 331 | goal met (b8g8) | 7501 ms | unverified |
| 2400 | c1g5 | 331 | goal met (b8g8) | 8005 ms | unverified |
| 2500 | c1g5 | 331 | goal met (b8g8) | 9251 ms | unverified |
| 2600 | c1g5 | 331 | goal met (b8g8) | 10500 ms | unverified |
| 2700 | c1g5 | 331 | goal met (b8g8) | 11755 ms | unverified |
| 2800 | c1g5 | 331 | goal met (b8g8) | 13001 ms | unverified |
| 2900 | c1g5 | 331 | goal met (b8g8) | 14256 ms | unverified |
| 3000 | c1g5 | 331 | goal met (b8g8) | 15501 ms | unverified |
| 3100 | c4f7 | 271 | goal met (b8g8) | 16753 ms | unverified |
| 3200 | c4f7 | 271 | goal met (b8g8) | 18000 ms | unverified |
| 3300 | c4f7 | 271 | goal met (b8g8) | 20003 ms | unverified |
| 3400 | c4f7 | 271 | goal met (b8g8) | 21999 ms | unverified |
| 3500 | c4f7 | 271 | goal met (b8g8) | 24003 ms | unverified |

Stockfish 17.1 used 150,000 nodes for the opening reference and 50,000 for each chosen continuation. Opposite-side numeric scores yield a finite-search centipawn-loss estimate; mate scores are not converted to centipawns. The custom defense uses a curated regression goal, not an independent custom engine.

Every move is replayed for legality. One deterministic seed per setting is used; this does not measure the distribution of lower-strength errors. Search depth and results depend on wall-clock budget and hardware.

Repeatedly running these checks cannot establish actual Elo. Standard ratings require a declared calibrated opponent pool/time control, many balanced held-out games, and uncertainty estimates. Arbitrary turn sequences need a separate rating pool for each rules/time-control definition; Stockfish’s standard-chess rating cannot be transferred to them.

See [raw records](ratings-audit.json) and the earlier [benchmark report](REPORT.md).
