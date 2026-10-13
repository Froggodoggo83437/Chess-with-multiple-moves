import rules from './rules.cjs';
const { chooseMoveForElo } = rules;
export function createEngineClient() {
  let worker = null, url = null, pending = null, generation = 0;
  function dispose() {
    worker?.terminate();
    worker = null;
    if (url) URL.revokeObjectURL(url);
    url = null;
  }
  return {
    cancel() {
      generation++;
      if (pending) { pending.resolve(null); pending = null; }
      dispose();
    },
    async choose(state, elo) {
      const id = ++generation;
      if (!worker && typeof Worker !== 'undefined') {
        try {
          url = URL.createObjectURL(new Blob([window.CHESS_WORKER_SOURCE], { type: 'application/javascript' }));
          worker = new Worker(url);
          worker.onmessage = ({ data }) => {
            if (!pending || data.id !== pending.id) return;
            const job = pending;
            pending = null;
            if (data.error) job.reject(new Error(data.error));
            else job.resolve(data.move);
          };
          worker.onerror = event => {
            const job = pending;
            pending = null;
            dispose();
            job?.reject(new Error(event.message || 'Engine worker failed'));
          };
        } catch {
          dispose();
        }
      }
      // Keep standalone play usable in browsers that cannot create blob workers.
      if (!worker) return chooseMoveForElo(state.clone(), elo, state.side, { isCancelled: () => id !== generation });
      return new Promise((resolve, reject) => {
        pending = { id, resolve, reject };
        worker.postMessage({ id, elo, order: state.order, allowKingCapture: state.allowKingCapture, snapshot: state.snapshot() });
      });
    }
  };
}
