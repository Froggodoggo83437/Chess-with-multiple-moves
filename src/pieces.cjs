// Original vector artwork inspired by the flat, outlined pieces in the reference.
// Shared view boxes and baseline keep every piece centered at all board sizes.
const shapes = {
  p: '<circle cx="50" cy="25" r="12"/><path d="M41 37h18l-4 13c1 10 6 18 14 25H31c8-7 13-15 14-25z"/><path d="M30 75h40l5 10H25z"/><path d="M35 59h30M32 75h36" fill="none"/>',
  r: '<path d="M26 13h12v12h9V13h8v12h9V13h11v24H26z"/><path d="M32 37h37v9H32zM37 46h27l-2 22 9 9H30l9-9zM28 77h45l4 9H24z"/><path d="M39 67h23" fill="none"/>',
  n: '<path d="M29 76c-2-16 1-25 15-35l-17 5-8-8 17-21 1-9 11 6 12-3c8 8 16 20 18 31 2 13-4 24-8 34z"/><path d="M28 76h43l6 10H23z"/><path d="M46 18c13 9 17 18 15 31-1 11-9 16-13 23M27 35l12-6" fill="none"/><circle cx="43" cy="25" r="2.6" fill="__STROKE__" stroke="none"/>',
  b: '<circle cx="50" cy="13" r="5"/><path d="M50 19c-4 4-19 17-19 27 0 10 8 15 19 15s19-5 19-15c0-10-15-23-19-27z"/><path d="M56 29l-13 19" fill="none" stroke-width="4"/><path d="M40 60h20l-3 7 11 10H32l11-10zM29 77h42l5 9H24z"/><path d="M38 60h24" fill="none"/>',
  q: '<path d="M29 30l13 18 8-24 9 24 13-18-6 31H35z"/><circle cx="26" cy="26" r="5"/><circle cx="50" cy="20" r="5"/><circle cx="75" cy="26" r="5"/><path d="M34 61h33v8H34zM39 69h23l8 9H31zM28 78h45l4 9H24z"/><path d="M38 53h27" fill="none"/>',
  k: '<path d="M46 10h8v8h9v8h-9v12h-8V26h-9v-8h9z"/><path d="M50 40c-9-15-26-13-26-1 0 9 8 20 13 24h26c5-4 13-15 13-24 0-12-17-14-26 1z"/><path d="M35 62h30v8H35zM40 70h20l10 9H30zM28 79h44l5 8H23z"/><path d="M50 40v19" fill="none"/>'
};
const pieces = {};
for (const color of ['w', 'b']) for (const [type, shape] of Object.entries(shapes)) {
  const fill = color === 'w' ? '#f9f9f6' : '#555650';
  const stroke = color === 'w' ? '#77786f' : '#373832';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="${fill}" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${shape.replaceAll('__STROKE__', stroke)}</g></svg>`;
  pieces[color + type] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
module.exports = pieces;
