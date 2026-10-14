# Engine strength benchmark

This is an exploratory benchmark, **not Elo calibration**. Results apply to engine commit `d9bf2cf` (rules SHA-256 `f2468326f57cb8f92f390552e6d50616951c78e6c98f45c0b4afe8dae1a1f03d`). No playing rules or engine implementation were changed for this benchmark.

Reference: Stockfish 17.1 WASM, stockfish@17.1.0, one thread and 32 MB hash. Runtime: v24.19.0; CPU: Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz. Protocol parameters, moves, scores, timings, and outcomes are in [results.json](results.json).

## Rapid tactical and reference probes

Each setting had a 150 ms move budget, with the same deterministic seed per position. This caps the normal Expert allowance and does not measure full-budget 3500 play. Ten curated tactics overlap existing regression cases; six additional opening-derived positions probe moves beyond those cases.

| Strength target | Curated goals solved | Stockfish move agreement (standard positions) | Mean reference loss, cp-only cases | Mean move time |
| --- | --- | --- | --- | --- |
| 400 | 5/10 | 2/13 | 311.1 (10 cases) | 126.2 ms |
| 1200 | 9/10 | 7/13 | 53.9 (11 cases) | 134.9 ms |
| 2400 | 9/10 | 7/13 | 53.9 (11 cases) | 135.8 ms |
| 3500 | 9/10 | 7/13 | 53.9 (11 cases) | 137.3 ms |

Stockfish used 30,000 nodes for the starting reference and 10,000 for the chosen continuation. Centipawn loss combines opposite-side scores, clamps negative sampling differences to zero, and excludes mate/terminal cases. Agreement measures identical UCI moves, not correctness: alternative moves may be equally good. These scores are finite-search estimates.

## Full-budget Expert sample

These four cases use the actual 3500 profile, with its normal allowance of up to 12 seconds.

| Position | Move | Goal | Last completed search | Reference loss (cp) | Time |
| --- | --- | --- | --- | --- | --- |
| free-queen | d1d7 | solved | full-search 8 | 0 | 10675 ms |
| knight-fork | d5f6 | solved | full-search 8 | 33 | 3216 ms |
| defend-two-move-rook-attack | b8g8 | solved | full-search 6 | — | 12000 ms |
| reference-italian-center | c4f7 | reference probe | full-search 2 | 303 | 12004 ms |

## Match outcomes

Both sides had a 150 ms per-move allowance. Standard matches used two opening pairs with colors reversed. Stockfish received complete move history after each opening. Custom matches compared 3500 with 1200 using both WWB and WBB orders and swapped colors; Stockfish cannot fairly play these custom rules.

| Match | White | Black | Outcome | Winner | Plies played |
| --- | --- | --- | --- | --- | --- |
| standard-e4-e5-3500-white | 3500 | stockfish | checkmate | stockfish | 46 |
| standard-e4-e5-stockfish-white | stockfish | 3500 | checkmate | stockfish | 25 |
| standard-d4-d5-3500-white | 3500 | stockfish | checkmate | stockfish | 48 |
| standard-d4-d5-stockfish-white | stockfish | 3500 | checkmate | stockfish | 17 |
| custom-wwb-3500-white | 3500 | 1200 | checkmate | 3500 | 8 |
| custom-wwb-1200-white | 1200 | 3500 | checkmate | 1200 | 8 |
| custom-wbb-3500-white | 3500 | 1200 | checkmate | 1200 | 39 |
| custom-wbb-1200-white | 1200 | 3500 | checkmate | 3500 | 30 |

Games stopped at 60 plies are **unfinished**, not draws or losses. Match outcomes use the application’s legal moves and terminal rules, including automatic repetition/50-move draws.

## What this can and cannot establish

- This is a small single-seed sample. There are no confidence bounds or measured Elo estimates. A target label such as 3500 is not an established playing rating.
- The capped matches and tactical runs test rapid decisions. Four full-budget positions cannot establish full-budget match strength.
- Curated cases overlap positions used when developing the engine, so their pass rate is regression evidence, not an independent general-strength estimate. Opening-derived probes and Stockfish comparisons give additional evidence but are still a small sample.
- Different hardware, engine warmup, garbage collection, and wall-clock limits can change completed depth and moves even with the same seed. Stockfish’s node and time limits are documented, not an assertion of equal computational power.
- Custom results mix playing strength and the two-move advantage. Comparisons with this engine’s own 1200 setting are not comparisons with an independent custom-chess engine or a calibrated player pool.

Before changing the slider to claimed actual Elo, run many more held-out games at the intended time control against calibrated opponents, keep standard and custom pools separate, balance colors/turn advantages, and calculate uncertainty.
