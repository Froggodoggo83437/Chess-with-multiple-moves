# Strength benchmark

Run from the repository root:

```sh
npm ci
npm run benchmark
npm run benchmark:verify
npm run benchmark:report
```

The benchmark runs sixteen positions at four targets (150 ms per decision), four
full-budget Expert positions, four standard games against pinned Stockfish 17.1,
and four custom-turn games between 3500 and 1200. Expect a few minutes depending
on hardware. Stockfish is a development-only dependency and is not included in
the browser game. npm verifies package integrity during installation.

`results.json` is updated after each completed case. Its status must be
`completed` before report generation; failures have a nonzero exit code and are
saved as failures, never presented as successful runs. `REPORT.md` summarizes the
completed run. Preserve reports elsewhere before rerunning if you want to compare
versions, since these files are overwritten.

All matches use the application's rules engine. Standard games alternate colors
and forbid king captures. Custom games enable king captures and preserve the
exact order, including consecutive moves. Stockfish is used only for standard
positions/games. Terminal outcomes and ply-limited unfinished games are distinct.

Move quality is assessed through curated goals, reference-move agreement, and
finite-search centipawn loss where both reference scores are numeric. Mate scores
are not converted into fabricated centipawn loss. Benchmark engine source hashes,
versions, hardware, seeds, budgets, and actual latencies are recorded.

This is not a calibrated Elo test. Read the limitations in `REPORT.md` before
interpreting results. In particular, short-budget games do not validate the
full-budget Expert label, and custom-turn self-matchups do not establish an
independent rating.

Verification replays every recorded game, checks tactical goal scoring, and
requires the engine source hash to match. This detects illegal moves, incorrect
terminal outcomes, and reports from a different engine version.

## Every slider setting

```sh
npm run benchmark:all-ratings
npm run benchmark:verify-all-ratings
```

This independently runs the opening reference probe and custom-turn defense at
all 32 settings from 400 to 3500, using the actual profile budgets rather than
rapid caps. Allow several minutes. Results are saved to `ratings-audit.json` and
`RATINGS_AUDIT.md`, preserving the earlier benchmark results. Legality and all
recorded goal/score arithmetic are replay-verified.

**A completed setting audit does not verify its Elo.** Each target records actual
Elo as unverified. The available Stockfish build's UCI strength model ranges from
1320 to 3190 (confirmed from its UCI option declarations); it is not a calibrated
opponent pool covering all requested ratings or arbitrary custom sequences.
Two positions and one seed per setting cannot establish a rating or confidence
interval. Standard calibration needs a declared rating pool and time control;
custom variants need their own pool and rules definitions. Do not relabel audit
passes as verified ratings or repeatedly run it expecting that gap to disappear.

## Stockfish-relative standard-chess sample

```sh
npm run benchmark:relative-ratings
npm run benchmark:verify-relative-ratings
npm run benchmark:strength-model
```

The relative pilot runs all 32 targets against Stockfish's 1320 UCI setting,
with five opening pairs and reversed colors (10 games per target, 320 total),
150 ms per move, and an 80-ply limit. Four benchmark processes run concurrently;
wall-clock search depth is sensitive to host load. Progress is saved after each
game, and the previous two-game pilot is retained in `pilot-2-games/`. Its smoothed point
estimates and broad simultaneous score intervals are in `RELATIVE_RATINGS.md`
and `relative-ratings.json`. Unfinished games are unscored. Ten games per target
provide provisional estimates only; they do not verify rating labels. These
estimates do not apply to full-budget play or custom-turn chess.

The strength-model audit checks 10,000 seeded synthetic selections per setting
(320,000 total), including configured error probabilities and loss limits.
`STRENGTH_MODEL.md` documents the results. This validates selection behavior,
not playing strength. Replay verification checks all match moves and results
against the unchanged engine source hash.

Ply-limited games are censored, not draws. Estimates computed only from completed
games can be biased when completion depends on strength or outcome. The smoothed
numbers are descriptive pilot statistics, not a fitted calibration curve. The
confidence calculation assumes independent game scores; shared openings and
unseeded reference randomness limit that interpretation further. Five opening pairs improve coverage, but this remains a small sample against
one strength preset rather than a calibrated opponent pool.

## Continued games and multiple reference strengths

```sh
npm run benchmark:calibrate
npm run benchmark:verify-calibration
npm run benchmark:calibration-report
npm run benchmark:test-statistics
```

The calibration requires the completed 320-game sample in `relative-ratings.json`
with matching game source. It retains earlier terminal results, continues the
129 earlier unfinished games with their complete histories, and adds eight
fresh games per setting. Two new openings are crossed with Stockfish's 1500 and
1800 presets, with reversed colors: 18 games per setting, 576 total. Games run
until a rule-defined result or 400 plies; there is no evaluation-based
adjudication. Both sides retain the 150 ms move budget. The 1320/1500/1800 numbers
are reference presets on the selected Stockfish-relative scale, not human Elo.

Progress is saved after each game. Resume an interrupted run with
`npm run benchmark:calibrate -- --resume`; do not resume after changing the
engine or previous input. The runner rejects changed source/input hashes.
Continuations use a new recorded random seed rather than pretending to restore
the original generator's state. Four processes share the host. Retain the earlier
input file: verification requires its hash and checks every original move prefix.

Replay verification independently checks moves/positions and terminal rules
with chess.js, color/opening/reference balance, continuation provenance, and
source hashes. It writes `calibration-verification.json`; report generation
requires a matching passed receipt. Outputs are `calibration-games.json`,
`calibration-estimates.json`, and `CALIBRATION.md`.

Estimates weight distinct opening groups equally. All colors and reference
strengths using the same opening are grouped into one bounded observation;
there are nine pairs but seven distinct opening groups per setting. Per-setting
95% and simultaneous 95% score bounds use a relative-entropy concentration
bound, then invert the weighted expected-score Elo formula. The interval model
assumes independent opening groups and valid reference presets; systematic
opening/model/hardware effects are not covered by those statistical intervals.
All-loss samples get upper bounds, never synthetic finite ratings. Unfinished
game scores range from loss to win when computing bounds and are never dropped.
This does not establish human ratings, default/full-budget settings, or custom
turn-order ratings; no game strength labels are changed from this sample.

The 150 ms budget is a requested soft search limit, not a clock-forfeiture rule.
The report includes each side's observed mean, median, 95th-percentile, and
maximum move latency. Finishing an initial search and host contention can exceed
the requested budget. Confidence endpoints are rounded outward; no narrow
certification is implied by a finite point estimate.
