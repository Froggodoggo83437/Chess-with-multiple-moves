import { Chess } from 'chess.js';
import rules from './rules.cjs';
const { CustomTurnRules, chooseMoveForElo } = rules;
self.onmessage = async ({ data }) => {
  const { id, order, allowKingCapture, snapshot, elo } = data;
  try {
    const state = new CustomTurnRules(Chess, order, undefined, { allowKingCapture });
    state.restore(snapshot);
    // The UI can terminate this worker immediately; yielding to browser timers
    // inside the search is unnecessary here and wastes calculation time.
    const move = await chooseMoveForElo(state, elo, state.side, { yieldEvery: Number.MAX_SAFE_INTEGER });
    self.postMessage({ id, move: move ? { from: move.from, to: move.to, promotion: move.promotion } : null });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
