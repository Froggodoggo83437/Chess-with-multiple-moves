# Custom Turn Chess

Open `custom_turn_chess.html` in a modern browser. The green-and-cream board, outlined vector
pieces, rules engine, and game code are all embedded; no network connection
or build is needed to play. Alternatively, serve this directory with
`python3 -m http.server 8000`.

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
examines every root move and three candidate continuations per node initially. Expert also attempts a
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

Use the **Engine strength** slider to select 400–3500 target Elo in steps of
100. Easy, Medium, and Hard are shortcuts for 600, 1200, and 2000; Expert targets 3500. Expert is the default setting at a 3500 target; other slider
values display as Custom Elo. Strength changes preserve the game and restart
active computer searches without resuming a computer paused by Undo.

The 3500 target is not a promise of measured 3500-Elo play or the objectively
best move in every position. These numbers are
approximate strength labels, not ratings calibrated against
a rated player pool, especially in custom variants. Increasing the setting
raises the number of deepening passes (two to eight) and time budget (roughly 0.25–12
seconds) and reduces the chance of selecting a lower-scoring legal move. At 400, the engine makes a deliberate quality mistake on about 90% of choices
when a sufficiently worse legal candidate is available. Increasing strength
reduces that probability and the permitted score loss; equally good alternatives
are not counted as mistakes. At 3500, deliberate errors are disabled and it
always picks the highest-scoring move from its completed search. A known forced win is never intentionally discarded. Iterative deepening retains the last fully
completed result; complex or very long turn sequences can exceed the search
horizon or time budget. Search-only caches reuse legal move generation and static evaluations across
identical FENs; previous best moves guide ordering. Draw-dependent search scores
are not cached across different histories. The search yields regularly so controls remain usable
and resets, undo, sequence edits, or strength changes can cancel it.

Every 100-point slider step interpolates between the following behavioral
anchors. Error frequency applies only when a genuinely worse legal candidate
is available, and known forced wins are preserved. These are tuning targets,
not measured ratings.

| Strength target | Deliberate error chance | Thinking budget |
| --- | --- | --- |
| 400 | 90% | 0.25 s |
| 800 | 78% | 0.5 s |
| 1200 | 55% | 1 s |
| 1600 | 35% | 1.8 s |
| 2000 | 18% | 3 s |
| 2400 | 8% | 4 s |
| 2800 | 3% | 6.5 s |
| 3200 | 0.8% | 9 s |
| 3500 | 0% | 12 s |

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
`src/pieces.cjs` and embedded by the build script. The pinned chess.js
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

Browser validation uses headless Chromium. Other browsers and physical touch
devices require manual testing; automated coverage cannot prove every possible
chess position or assess playing strength exhaustively.
