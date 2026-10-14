// Decoration only: never changes game state or intercepts board/control input.
export function createCelebration(container, pieces) {
  let celebratedResult = null;
  let layer = null;
  let timer = null;
  function clear() {
    clearTimeout(timer);
    timer = null;
    layer?.remove();
    layer = null;
  }
  function sync(result) {
    if (result?.type !== 'checkmate') {
      clear();
      celebratedResult = null;
      return;
    }
    // Flipping the board or re-rendering a finished game must not replay it.
    if (result === celebratedResult) return;
    clear();
    celebratedResult = result;
    layer = document.createElement('div');
    layer.className = 'victory-layer';
    layer.setAttribute('aria-hidden', 'true');
    const ring = document.createElement('div');
    ring.className = 'victory-ring';
    layer.append(ring);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const colors = ['#ffe08a', '#f8f5d7', '#95c66b', '#65cfe5'];
      for (let index = 0; index < 36; index++) {
        const particle = document.createElement('i');
        particle.className = 'victory-confetti';
        const angle = index * Math.PI * 2 / 36;
        const distance = 100 + Math.random() * 140;
        particle.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
        particle.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
        particle.style.setProperty('--spin', `${180 + Math.random() * 540}deg`);
        particle.style.setProperty('--delay', `${Math.random() * 120}ms`);
        particle.style.backgroundColor = colors[index % colors.length];
        layer.append(particle);
      }
    }
    const card = document.createElement('div');
    card.className = 'victory-card';
    const emblem = document.createElement('div');
    emblem.className = 'victory-emblem';
    const king = document.createElement('img');
    king.src = pieces[result.winner + 'k'];
    king.alt = '';
    emblem.append(king);
    const title = document.createElement('div');
    title.className = 'victory-title';
    title.textContent = 'CHECKMATE';
    const winner = document.createElement('div');
    winner.className = 'victory-winner';
    winner.textContent = `${result.winner === 'w' ? 'White' : 'Black'} wins`;
    const detail = document.createElement('div');
    detail.className = 'victory-detail';
    detail.textContent = result.reason === 'king-capture' ? 'KING CAPTURED · GAME OVER' : 'THE KING HAS NO ESCAPE';
    card.append(emblem, title, winner, detail);
    layer.append(card);
    container.append(layer);
    timer = setTimeout(clear, 4000);
  }
  sync.dismiss = clear;
  return sync;
}
