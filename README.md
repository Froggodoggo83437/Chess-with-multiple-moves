# Custom Turn Chess

Open `custom_turn_chess.html` in a modern browser. The wooden board, realistic
piece images, rules engine, and game code are all embedded; no network connection
or build is needed to play. Alternatively, serve this directory with
`python3 -m http.server 8000`.

## Rules

- Every turn-order tile grants one legal chess move. Tiles may repeat a color;
  even a sequence containing only one color is supported.
- **Check takes priority over the sequence.** The checked player must respond
  immediately. If their color is already next, the response consumes that tile.
  Otherwise they receive an extra defensive move; the pending tile is left
  untouched and the sequence resumes afterward. Counterchecks use the same rule.
- Checkmate ends the game immediately, even when the attacker has moves left.
  Kings are never captured. Every move must leave the moving player's king safe.
- Stalemate is a draw when the player whose move is due has no legal moves and is
  not in check. An opponent with no moves may wait while the other player still
  has a scheduled move, unless they are checked.
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

New Game and edits to the turn sequence start a fresh game and cancel pending
computer work. Changing your color also starts a fresh game. Flip Board changes
only the view and preserves the game and selected move. Difficulty changes
restart any pending computer search at the selected strength.

Undo takes back exactly one move, restoring captured pieces, promotion, castling
rights, en passant, the sequence, repetition counts, and game results. If this
returns the move to the computer, it stays paused; use **Resume computer** to
continue or Undo again to return to your own earlier decision.

The computer uses the same rules and results as the player. Easy, Medium, and
Hard search up to one, two, and three plies respectively. Iterative deepening
keeps the last completed search result within a roughly 2.5-second budget;
complex positions may finish at a shallower depth. The search yields regularly
so reset, undo, color/order edits, and difficulty changes can cancel it. This is
a small playable opponent, not a tournament-strength engine.

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
script in `custom_turn_chess.html`; keep the generated HTML in sync. Styling,
markup, and original embedded piece images live in the HTML. The pinned chess.js
license is included in the generated script.

Rules tests exercise standard and custom play, mate/check/stalemate, castling,
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
