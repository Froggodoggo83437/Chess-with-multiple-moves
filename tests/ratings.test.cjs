const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { levelForSetting, ratingNote } = require('../src/rating-labels.cjs');
const reference = require('../src/calibration-data.cjs');
const standard = { setting: 3500, order: ['w', 'b'], allowKingCapture: false, fast: true, rulesHash: reference.rulesSha256 };
test('reference asset covers all settings and matches the tested rules version', () => {
  assert.equal(reference.rulesSha256, crypto.createHash('sha256').update(fs.readFileSync(require.resolve('../src/rules.cjs'))).digest('hex'));
  assert.equal(reference.games, 576); assert.equal(reference.budgetMs, 150);
  assert.deepEqual(reference.rows.map(row => row.target), Array.from({length: 32}, (_, index) => 400 + index * 100));
  assert.deepEqual(reference.rows.map(row => levelForSetting(row.target)), Array.from({length: 32}, (_, index) => index + 1));
});
test('normal thinking and custom rules never inherit standard fast-control ratings', () => {
  assert.match(ratingNote({...standard, fast: false}), /Unrated at normal thinking time/);
  for (const order of [['w','w','b'], ['b','w'], ['w'], ['w','b','w','b']]) {
    const note = ratingNote({...standard, order}); assert.match(note, /Unrated: custom/); assert.ok(!note.includes('1240'));
  }
  assert.match(ratingNote({...standard, allowKingCapture: true}), /Unrated: custom/);
});
test('highest standard fast setting displays measured estimate and outward-rounded uncertainty', () => {
  const note = ratingNote(standard);
  assert.match(note, /about 1240/); assert.match(note, /430 to 1880/);
  assert.match(note, /18 games at 150 ms/); assert.match(note, /not verified human Elo/);
  assert.ok(!note.includes('3500'));
});
test('all-loss and censored results do not fabricate finite point estimates', () => {
  assert.match(ratingNote({...standard, setting: 400}), /No finite rating estimate: all reference games were lost/);
  assert.match(ratingNote({...standard, setting: 900}), /No point estimate: some reference games were unfinished/);
});
test('changed engine version suppresses obsolete reference estimates', () => {
  const note = ratingNote({...standard, rulesHash: 'changed'});
  assert.match(note, /No reference estimate.*this engine version/); assert.ok(!note.includes('1240'));
});
