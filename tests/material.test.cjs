const test = require('node:test'), assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const { CustomTurnRules: Rules } = require('../src/rules.cjs');
const { materialSummary } = require('../src/material.cjs');
test('captures are credited to the capturer and undo restores the material lead', () => {
 const state = new Rules(Chess, ['w','b']);
 for(const san of ['e4','d5','exd5']) { const game = state.positionFor(state.side); const move = game.move(san); assert.ok(state.play(move)); }
 assert.deepEqual(materialSummary(state).captured, {w:['p'],b:[]});assert.deepEqual(materialSummary(state).lead,{w:1,b:0});
 const reply=state.positionFor('b').move('Qxd5');assert.ok(state.play(reply));
 assert.deepEqual(materialSummary(state).captured,{w:['p'],b:['p']});assert.deepEqual(materialSummary(state).lead,{w:0,b:0});
 state.undo();assert.equal(materialSummary(state).lead.w,1);state.undo();assert.deepEqual(materialSummary(state).captured,{w:[],b:[]});
});
test('en passant records the removed pawn and changes material by one point', () => {
 const state=new Rules(Chess,['b','w'],'4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1');
 assert.ok(state.play({from:'d4',to:'e3'}));assert.deepEqual(materialSummary(state).captured.b,['p']);assert.equal(materialSummary(state).lead.b,1);
});
test('promotion and recapture count actual board material and the promoted piece', () => {
 const state=new Rules(Chess,['w','b'],'1r5k/P7/8/8/8/8/8/7K w - - 0 1');
 assert.ok(state.play({from:'a7',to:'a8',promotion:'q'}));assert.equal(materialSummary(state).lead.w,4);
 assert.ok(state.play({from:'b8',to:'a8'}));assert.deepEqual(materialSummary(state).captured.b,['q']);assert.equal(materialSummary(state).lead.b,5);
 state.undo();assert.equal(materialSummary(state).lead.w,4);assert.deepEqual(materialSummary(state).captured.b,[]);
});
test('king captures appear in the tray without assigning material points', () => {
 const state=new Rules(Chess,['w','w','b'],'7k/7p/8/8/8/8/8/R6K w - - 0 1',{allowKingCapture:true});
 assert.ok(state.play({from:'a1',to:'a8'}));assert.ok(state.play({from:'a8',to:'h8'}));
 assert.deepEqual(materialSummary(state).captured.w,['k']);assert.equal(materialSummary(state).lead.w,4);
 state.undo();assert.deepEqual(materialSummary(state).captured.w,[]);assert.equal(materialSummary(state).lead.w,4);
});
