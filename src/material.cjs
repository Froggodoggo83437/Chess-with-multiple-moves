const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const ORDER = ['p', 'n', 'b', 'r', 'q', 'k'];
function materialSummary(state) {
  const captured = { w: [], b: [] }, totals = { w: 0, b: 0 };
  for (const move of state.history) if (move.captured) captured[move.color].push(move.captured);
  for (const color of ['w', 'b']) captured[color].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  for (const row of state.game.board()) for (const piece of row) if (piece) totals[piece.color] += VALUES[piece.type];
  return { captured, totals, lead: { w: Math.max(0, totals.w - totals.b), b: Math.max(0, totals.b - totals.w) } };
}
module.exports = { materialSummary };
