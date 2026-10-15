# Upgraded engine search probes

Run `node benchmarks/search-performance.cjs [baseline-ref]` from the repository.
The default baseline is commit `0d61a34`, immediately before this upgrade.
The script uses a temporary copy of the historical engine, preserves game state,
checks move legality, warms up both engines, and alternates their execution order.
Raw results and the upgraded source hash are in `search-performance.json`.

Three trials per position at an equal 600 ms search allowance completed the same
median full-search depth in both versions: 3 for the standard opening, 1 plus a
selective whole-turn plan for WWB's opening, 3 for the two-move rook defense, and
2 for the poisoned-pawn position. This small sample does not establish a broad
strength increase or an Elo rating.

A separate fixed-horizon run for each position produced:

| Position | Completed plies | Previous | Upgraded |
| --- | --- | --- | --- |
| Standard opening | 2 | 59 ms | 60 ms |
| Two consecutive White moves | 3 | 925 ms | 793 ms |
| Defend two-move rook attack | 3 | 449 ms | 481 ms |
| Avoid poisoned pawn | 2 | 401 ms | 244 ms |

Both engines selected the same moves in these fixed-horizon probes. Performance
is position-dependent: two probes improved, while two took slightly longer.
Fixed-horizon timings are individual observations, not statistically established
speedups; device speed and runtime warmup affect them. The upgrade also reduces
Maximum's normal allowance from 12 seconds to 8 seconds, independently of these
fixed-budget probes. A lower allowance can reduce completed depth in some
positions; this report does not prove equal playing strength at those budgets.

Automated regressions additionally verify transposition hits, agreement with
uncached fixed-depth search, repetition and fifty-move draw decisions, custom
consecutive-move attack/defense, cancellation, and immutable live game state.
Historical Stockfish calibration remains unchanged and is hidden in the game
because it measured the previous engine hash. Fresh match calibration is needed
before assigning estimates to this version.
