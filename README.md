# Custom Turn Chess

Open `custom_turn_chess.html` in a modern browser. The green-and-cream board, outlined vector
pieces, rules engine, and game code are all embedded; no network connection
or build is needed to play. Alternatively, serve this directory with
`python3 -m http.server 8000`.

Captured-piece trays sit above and below the board, labeled White and Black.
They follow board flips and show each side’s captures. A +number indicates the
material lead (pawn 1, knight/bishop 3, rook 5, queen 9); promotions affect the
lead, kings have no point value, and Undo/New Game update the displays.

## Rules

- Every turn-order tile grants one legal chess move. Tiles may repeat a color;
  even a sequence containing only one color is supported.
- **King capture is allowed by default.** Check does not interrupt the scheduled
  sequence, so a player with consecutive moves can capture an exposed opposing
  king. That capture ends the game immediately and is reported as checkmate.
  Normal checkmate still ends the game immediately, and moves must keep the
  moving player’s own king safe. Undo restores a captured king and the exact
  pre-capture position. The AI follows the same rule and treats capture as a win.
- Choose **Standard — no king captures** in the King capture setting to restore
  standard king protection. Changing this setting starts a fresh game.
- **In standard mode, check takes priority over the sequence.** The checked player must respond
  immediately. If their color is already next, the response consumes that tile.
  Otherwise they receive an extra defensive move; the pending tile is left
  untouched and the sequence resumes afterward. Counterchecks use the same rule.
- Checkmate ends the game immediately, even when the attacker has moves left.
  In standard mode kings cannot be captured. Every move must leave the moving
  player's king safe.
- Stalemate is a draw when the player whose move is due has no legal moves and is
  not in check. An opponent with no moves may wait while the other player still
  has a scheduled move, unless standard mode grants them a check response.
- Castling obeys standard occupancy, attack, king/rook movement, and castling-right
  rules. En passant is available only on the immediately following opposing ply;
  an intervening move of either color expires it. A check response can use en
  passant if it legally resolves check.
- Promotion defaults to Queen. Select Rook, Bishop, or Knight before moving the
  pawn to its final rank to underpromote, including when capturing.
- Insufficient material, threefold repetition, and the 50-move rule are automatic
  draws. Repetition includes the next player, castling/en passant rights, and the
  turn-sequence cursor; visually identical boards at different sequence slots
  are not necessarily the same position. Checkmate takes priority over a draw.

## Controls and computer

The board displays file letters along the bottom and rank numbers down the left
edge, with both sets following Flip Board. Choose **Player vs Player (same
device)** to play both colors locally, including consecutive custom turns.
In local PvP the board automatically faces the player whose move is due.
Consecutive same-color moves keep the view; Undo follows the restored turn.
Flip Board remains available for a temporary manual view until the next move.
Mode changes start a fresh game and cancel computer work. Computer-only settings
are hidden in local PvP; promotion, both rules modes, turn editing, Undo, and
victory celebrations remain available. White is Player 1 and Black is Player 2.

Checkmate and king captures trigger a four-second celebration on the board,
with a glowing king badge, expanding ring, confetti, and the winning color.
King captures have a distinct caption. The overlay leaves controls usable,
clears immediately on undo/reset, and does not replay when flipping the board.
Reduced-motion preferences show a static victory badge without moving effects.

New Game and edits to the turn sequence start a fresh game and cancel pending
computer work. Changing your color also starts a fresh game. Flip Board changes
only the view and preserves the game and selected move. Difficulty changes
restart any pending computer search at the selected strength.

Undo takes back exactly one move, restoring captured pieces, promotion, castling
rights, en passant, the sequence, repetition counts, and game results. If this
returns the move to the computer, it stays paused; use **Resume computer** to
continue or Undo again to return to your own earlier decision.

The computer uses the same rules, custom sequence cursor, and check-response
rules as the player. Search maximizes or minimizes according to the actual next
color, including repeated moves by either player. After completing a quick
emergency fallback, custom-turn games get a bounded planning pass covering the
engine's remaining consecutive moves and the human's complete reply block. It
examines every root move and three candidate continuations per node initially. Maximum also attempts a
broader six-candidate pass, with a planning limit of twelve plies (eight at
lower strengths). This selective pass is guidance, not proof of a forced win.
Exhaustive searches then start at the full reply-block horizon instead of
replacing that plan with a shallow search of only the engine's own moves.
Deeper searches can extend up to four extra plies to finish a consecutive-move
run at the search horizon. This helps it see multi-move attacks
and threats from the human's next consecutive moves. The fallback evaluation
accounts for hanging pieces, unfavorable exchanges, development, centralization,
rook activity, bishop pairs, and king safety. Searches first finish an affordable
tactical baseline, then add a bounded capture/check-response search to avoid
stopping in the middle of an exchange. The previous best move is searched first
at the next depth. In king-capture mode, tactical search also considers
checks that can be followed by a king capture on a consecutive move. Forced wins/losses use actual move distance, including custom
moves, to prefer faster wins and delay unavoidable losses.

Use the **Strength level** slider to choose levels 1–32. Easy, Medium, Hard,
and Maximum are shortcuts for levels 3, 9, 17, and 32. Maximum is the default.
These levels describe search effort and deliberate errors; they are not Elo
ratings. Changes preserve the game and restart active computer searches without
resuming a computer paused by Undo.

**Normal — stronger search** preserves the existing thinking budgets (roughly
0.25–12 seconds). Its Elo is unmeasured. **Fast — 150 ms reference budget** uses
the budget from the standard-chess calibration. With White/Black alternating
and king capture forbidden, the game shows the selected profile's provisional
Stockfish-relative estimate and its simultaneous 95% range. For example, the
maximum profile's fast reference estimate is about 1240, with a wide range of
430–1880; this does not establish its normal-budget strength or human Elo.
All-loss samples show upper bounds rather than invented finite estimates;
unfinished samples show ranges without a point estimate. Device speed and
soft-budget overruns can change playing strength.

Custom turns and king-capture games are unrated at both thinking times. They
retain all 32 strength settings and sequence-aware search. Changing thinking
time cancels old calculations, preserves the position, and respects Undo's
pause. The measured numbers are embedded for offline use; a rules-source hash
suppresses obsolete estimates after an engine change. Stockfish is a benchmark
reference, not the browser game's engine.

Higher levels deepen search and reduce the chance and size of deliberate errors.
Maximum never deliberately discards its best calculated move or a known forced
win, but finite search does not guarantee the objectively best move. Forced
moves and immediate mating/king-capture moves return early. Embedded background
workers keep calculation off the UI thread; browsers without workers use the
cooperative fallback. Reset, Undo, setting changes, and mode changes cancel
stale jobs.

The original 400–3500 numbers are retained as internal profile identifiers so
historical benchmark reports remain reproducible. They are not displayed as
Elo claims. Normal-budget behavioral anchors are:

| Level (historical profile ID) | Deliberate error chance | Thinking budget |
| --- | --- | --- |
| 1 (400) | 90% | 0.25 s |
| 5 (800) | 78% | 0.5 s |
| 9 (1200) | 55% | 1 s |
| 13 (1600) | 35% | 1.8 s |
| 17 (2000) | 18% | 3 s |
| 21 (2400) | 8% | 4 s |
| 25 (2800) | 3% | 6.5 s |
| 29 (3200) | 0.8% | 9 s |
| 32 (3500) | 0% | 12 s |

After a new verified calibration, run `npm run ratings:update` and
`npm run build` to refresh the embedded estimates. The update command rejects
unverified or mismatched source/results. Building without a new calibration
still works, but changed rules suppress the old reference estimates.

## Postgame analysis

After checkmate or a king-capture win, press **Analysis**. Browse the move cards
or use the first/previous/next/last buttons (Left/Right/Home/End also work).
An evaluation bar appears beside the board; positive pawn-unit values favor
White, negative values favor Black, and M indicates a mating advantage. The
bar follows board flips. Captured pieces and turn highlights follow the reviewed
position, while the finished game and its Undo history stay intact.

Colored corner badges mark recognized Book moves, Great moves, Excellent moves,
Best moves, Inaccuracies, Mistakes/missed wins, and Blunders. Standard opening
recognition uses a small explicit set of known lines, including 1.e4. It is
disabled for custom schedules; allowing king captures does not disable it when
an alternating game remains a legal standard-chess sequence.

Choose Quick (1 second), Deep (5 seconds, default), or Maximum (15 seconds) per
position. Changing quality cancels and restarts review. The engine status,
completed depth, confidence, and suggested legal continuation are displayed.
Closing, resetting, or undoing cancels work; completed reviews are cached by
quality until the game changes. Live board state and Undo history are preserved.

Compatible alternating games use **full Stockfish 17.1**, with its full NNUE
network, one thread, and a 64 MiB hash. Played moves and best alternatives are
compared at a common completed depth, rather than mixing scores from different
search depths. The compressed engine asset (about 65 MB) loads locally only when
review starts; serve the repository including `assets/stockfish/`. Fetch integrity
checks the asset. See [its license and exact corresponding source](assets/stockfish/README.md).
Playing the game still works from the self-contained HTML without that asset.

**Custom-turn games always use the variant analyzer**, which restores the order,
sequence cursor, king-capture setting, and forced check responses saved for the
game. It maximizes/minimizes according to the actual player at every node,
searches consecutive move blocks, extends captures/checks, and compares the
played move at the same completed horizon as alternatives. Standard Stockfish
cannot analyze these variants correctly and is never used for them.

Gray badges mean **uncertain**: shallow or unstable estimates are not labeled
inaccuracies or blunders. Grades use estimated winning-chance loss with an
uncertainty allowance; they are not certified Chess.com grades. Exact terminal
wins and single legal choices are identified directly. Custom search remains
weaker than Stockfish and cannot guarantee the best move, particularly for long
turn blocks. Even Maximum is a finite search, not proof of every evaluation.

If Stockfish loading, WASM, or gzip decompression fails, review clearly reports
its custom-engine fallback. Variant review runs in an embedded worker, with a
cooperative fallback when workers are unavailable. No online analysis service
is contacted.

## Development and tests

Requires Node.js and npm. Browser tests also need Chromium (default
`/usr/bin/chromium`; override with `CHROMIUM_PATH`).

```sh
npm ci
npm run build
npm test
npm run test:browser
```

Edit `src/rules.cjs` for variant rules and AI, and `src/game.js` for controls and
rendering. `npm run build` embeds the code and chess.js into the marked game
script in `custom_turn_chess.html`; keep the generated HTML in sync. Styling and markup live in the HTML. Original SVG artwork is defined in
`src/pieces.cjs` and embedded by the build script. `src/engine-worker.js` is
also bundled into the HTML so offline/file play needs no separate worker fetch. The pinned chess.js
license is included in the generated script.

Rules tests exercise standard and king-capture modes, terminal captures and
king restoration, AI capture wins, custom play, mate/check/stalemate, castling,
en passant, all promotions, draws, undo, AI cancellation, and deterministic
randomized games. A differential standard game compares legal move sets and FENs
against chess.js. Browser tests exercise the actual bundled app offline,
controls and AI cancellation, terminal messages, special-move rendering, all
12 images, and geometry at desktop/mobile sizes. They supply initial-position
fixtures only through the test server; there are no production test hooks.
Screenshots go to ignored `test-results/`.

Browser validation uses headless Chromium. Cloud browser policy blocks direct
`file://` navigation, so direct file launch is unverified here; offline worker
calculation is tested after loading the page through the local server. Other browsers and physical touch
devices require manual testing; automated coverage cannot prove every possible
chess position or assess playing strength exhaustively.

## Strength benchmarking

Run `npm run benchmark` followed by `npm run benchmark:report` for the pinned
Stockfish reference, tactical probes, and balanced standard/custom matchups.
See [the benchmark protocol](benchmarks/README.md) and
[the measured results](benchmarks/REPORT.md). Ratings remain uncalibrated targets;
benchmark results distinguish time-limited matches from full-budget tactical
checks and unfinished games from draws.

An additional [all-settings audit](benchmarks/RATINGS_AUDIT.md) exercises all 32
slider settings at their actual budgets. Run `npm run benchmark:all-ratings`
and `npm run benchmark:verify-all-ratings`. Legal operation and finite-search
move quality are recorded separately from actual Elo, which remains unverified.

All 32 strength settings also have a [full-budget audit](benchmarks/RATINGS_AUDIT.md),
a [selection-model audit](benchmarks/STRENGTH_MODEL.md), and a
[Stockfish-relative standard-chess pilot](benchmarks/RELATIVE_RATINGS.md).
The pilot estimates are provisional at 150 ms per move; the historical profile
IDs are not verified Elo ratings. See [benchmark instructions](benchmarks/README.md) for protocols
and replay verification.

The [continued-game calibration](benchmarks/CALIBRATION.md) adds multiple
Stockfish reference strengths, longer games, and estimates with uncertainty
for every setting at the 150 ms benchmark control. These measurements do not
establish ratings at the application's default thinking budgets.
