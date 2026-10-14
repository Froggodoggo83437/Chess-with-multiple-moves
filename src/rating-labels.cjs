const reference = require('./calibration-data.cjs');
const levelForSetting = setting => Math.max(1, Math.min(32, Math.round((Number(setting) - 400) / 100) + 1));
const lowerLabel = value => value === '-infinity' ? 'unbounded below' : String(Math.floor(value / 10) * 10);
const upperLabel = value => value === '+infinity' ? 'unbounded above' : String(Math.ceil(value / 10) * 10);
function ratingNote({ setting, order, allowKingCapture, fast, rulesHash }) {
  const standard = !allowKingCapture && order.length === 2 && order[0] === 'w' && order[1] === 'b';
  if (!standard) return 'Unrated: custom turn orders and king captures have no standard-chess Elo rating. Strength levels control search and deliberate mistakes.';
  if (!fast) return 'Unrated at normal thinking time. Choose Fast to see the standard-chess reference estimate. Maximum can think for up to 12 seconds per move.';
  if (rulesHash !== reference.rulesSha256) return 'No reference estimate is available for this engine version. Fast uses a 150 ms search budget.';
  const row = reference.rows.find(row => row.target === Number(setting));
  if (!row) return 'No reference estimate is available for this strength level.';
  const range = row.simultaneous95.elo;
  let estimate;
  if (row.pointEstimate !== null) estimate = `Stockfish-relative reference estimate: about ${Math.round(row.pointEstimate / 10) * 10}.`;
  else if (row.estimateStatus === 'all-losses') estimate = `No finite rating estimate: all reference games were lost. Upper 95% bound: ${upperLabel(range[1])}.`;
  else if (row.estimateStatus === 'all-wins') estimate = `No finite rating estimate: all reference games were won. Lower 95% bound: ${lowerLabel(range[0])}.`;
  else estimate = 'No point estimate: some reference games were unfinished.';
  return `${estimate} Simultaneous 95% range: ${lowerLabel(range[0])} to ${upperLabel(range[1])}. Provisional, based on 18 games at 150 ms on the test machine; not verified human Elo. Your device can change playing strength.`;
}
module.exports = { levelForSetting, ratingNote };
