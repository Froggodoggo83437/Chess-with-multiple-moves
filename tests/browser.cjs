const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root,'custom_turn_chess.html'),'utf8');
// Fixtures exercise the actual bundled UI. Only its initial state is replaced;
// production ships no position-loading or test-only hooks.
const fixtures = {
  blackmate: ['8/8/8/8/8/5kq1/8/7K b - - 0 1', ['b','b','w']],
  capture: ['7k/7p/8/8/8/8/8/R6K w - - 0 1', ['w','w','b']],
  mate: ['7k/8/5KQ1/8/8/8/8/8 w - - 0 1', ['w','w','b']],
  check: ['7k/7p/8/8/8/8/8/R6K w - - 0 1', ['w','w','b']],
  promotion: ['1r5k/P7/8/8/8/8/8/7K w - - 0 1', ['w','b']],
  castle: ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['w','w','b']],
  ep: ['4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1', ['b','w']],
  standard: [null, ['w','b']],
  stalemate: ['7k/5K2/6Q1/8/8/8/8/8 b - - 0 1', ['b','w']]
};
let count=0;
(async()=>{
  const server=http.createServer((req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname.slice(1);
    let body=html;
    if(fixtures[name]) {
      const [fen,order]=fixtures[name];
      body=body.replace('var order = ["w", "w", "b"];',`var order = ${JSON.stringify(order)};`);
      const source = 'state = new CustomTurnRules(Chess, order, void 0, { allowKingCapture: $("kingCapture").value === "allowed" });';
      assert.ok(body.includes(source), 'Fixture initialization must match the actual bundle');
      body=body.replace(source,`state = new CustomTurnRules(Chess, order, ${JSON.stringify(fen||undefined)}, { allowKingCapture: $("kingCapture").value === "allowed" });`);
    }
    res.writeHead(200,{'Content-Type':'text/html'});res.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();const errors=[];const remote=[];
  let workers=0;page.on('worker',()=>workers++);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1')&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))remote.push(r.url());});
  const goto=async(name='')=>{await page.goto(`http://127.0.0.1:${server.address().port}/${name}`);await page.waitForFunction(()=>document.querySelectorAll('#board button').length===64);await page.selectOption('#depth','1');};
  const square=s=>page.locator(`[data-square="${s}"]`);
  const move=async(from,to)=>{await square(from).click();await square(to).click();};
  const text=id=>page.locator('#'+id).innerText();
  const waitHistory=n=>page.waitForFunction(n=>document.querySelector('#history').textContent.includes(`${n}.`),n);
  async function check(name,fn){await fn();console.log('PASS:',name);count++;}
  try {
    await check('standalone offline initialization and all twelve embedded piece images',async()=>{
      await goto();assert.equal(await page.locator('#board img').count(),32);
      assert.equal(await text('status'),'White to move (you)');
      const assets=await page.evaluate(async()=>Promise.all(Object.values(window.CHESS_PIECES).map(src=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth>0&&image.naturalHeight>0);image.onerror=()=>resolve(false);image.src=src;}))));
      assert.equal(assets.length,12);assert.ok(assets.every(Boolean));assert.deepEqual(remote,[]);
    });
    await check('consecutive moves, AI reply, exact undo pause, and explicit resume',async()=>{
      await move('e2','e4');assert.equal(await text('status'),'White to move (you)');
      await move('d2','d4');await waitHistory(3);await page.waitForFunction(()=>document.querySelector('#status').textContent==='White to move (you)');
      await page.click('#undo');assert.ok(!(await text('history')).includes('3.'));assert.ok((await text('status')).includes('paused'));
      await page.waitForTimeout(500);assert.ok(!(await text('history')).includes('3.'));
      await page.click('#resumeAI');await waitHistory(3);
    });
    await check('reset cancels a queued AI move without ghost pieces',async()=>{
      await page.click('#newGame');await move('e2','e4');await move('d2','d4');await page.click('#newGame');
      await page.waitForTimeout(500);assert.equal(await text('history'),'No moves yet.');assert.equal(await page.locator('#board img').count(),32);
    });
    await check('hard search yields so reset cancels running computation',async()=>{
      await page.selectOption('#depth','3');await move('e2','e4');await move('d2','d4');
      await page.waitForTimeout(350);await page.click('#newGame');await page.waitForTimeout(500);
      assert.equal(await text('history'),'No moves yet.');assert.equal(await text('status'),'White to move (you)');
    });
    await check('presets, color, order edits, minimum order, and cancellation',async()=>{
      await page.click('#preset3');assert.equal(await page.locator('#turns button').count(),4);
      await page.click('#preset1');assert.equal(await page.locator('#turns button').count(),2);
      await page.click('#addWhite');await page.click('#addBlack');assert.equal(await page.locator('#turns button').count(),4);
      for(let i=0;i<3;i++)await page.click('#remove');assert.ok(await page.locator('#remove').isDisabled());assert.equal(await page.locator('#turns button').count(),1);
      await page.click('#preset2');await page.selectOption('#side','b');await page.click('#preset2');
      assert.ok((await text('status')).startsWith('Black to move'));assert.ok((await page.locator('#turns button').first().getAttribute('title')).includes('Black'));
      await page.selectOption('#side','w');await page.click('#preset2');
      await page.locator('#turns button').last().click();assert.equal(await text('history'),'No moves yet.');
      await page.click('#preset2');
    });
    await check('flip keeps selection and legal highlights and stable board colors',async()=>{
      await square('e2').click();assert.equal(await page.evaluate(()=>document.activeElement.dataset.square),'e2');assert.ok(await square('e4').evaluate(e=>e.classList.contains('legal')));
      assert.ok(await square('a1').evaluate(e=>e.classList.contains('dark')));
      await page.click('#flip');assert.equal(await page.locator('#board button').first().getAttribute('data-square'),'h1');
      assert.ok(await square('e2').evaluate(e=>e.classList.contains('selected')));
      await square('e4').click();assert.ok((await text('history')).includes('e4'));await page.click('#flip');
    });
    await check('pieces remain centered and contained on desktop and narrow mobile screens',async()=>{
      for(const width of [1200,390,280]) {
        await page.setViewportSize({width,height:900});
        const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth, squares:[...document.querySelectorAll('#board button')].map(b=>{const r=b.getBoundingClientRect(),i=b.querySelector('img')?.getBoundingClientRect();return {w:r.width,h:r.height,inside:!i||(i.left>=r.left&&i.right<=r.right+.01&&i.top>=r.top&&i.bottom<=r.bottom+.01),centered:!i||(Math.abs((i.left+i.right-r.left-r.right)/2)<1&&Math.abs((i.top+i.bottom-r.top-r.bottom)/2)<1)};})}));
        assert.equal(geometry.overflow,false,`overflow at ${width}`);assert.ok(geometry.squares.every(s=>s.inside&&s.centered&&Math.abs(s.w-s.h)<1));
      }
      await page.setViewportSize({width:1200,height:900});
    });
    await check('mate message persists, king capture cannot occur, and undo reopens game',async()=>{
      await goto('mate');await move('g6','g7');assert.equal(await text('status'),'Checkmate — White wins!');
      await move('g7','h8');assert.equal(await page.locator('#board img').count(),3);assert.ok(!(await text('history')).includes('2.'));
      await page.waitForTimeout(400);assert.equal(await text('status'),'Checkmate — White wins!');await page.click('#undo');assert.ok(!(await text('status')).includes('Checkmate'));
    });
    await check('check highlights king and grants AI defense between White slots',async()=>{
      await goto('check');await page.selectOption('#kingCapture','standard');await move('a1','a8');assert.ok((await text('status')).includes('in check!'));assert.ok(await square('h8').evaluate(e=>e.classList.contains('in-check')));
      await waitHistory(2);assert.equal(await text('status'),'White to move (you)');assert.equal(await page.locator('#board .in-check').count(),0);
    });
    await check('promotion selector supports underpromotion and updates piece sprite',async()=>{
      await goto('promotion');await page.selectOption('#promotion','n');await move('a7','b8');
      assert.ok((await square('b8').getAttribute('aria-label')).includes('White knight'));assert.equal(await square('a7').locator('img').count(),0);
      await page.click('#undo');assert.ok((await square('a7').getAttribute('aria-label')).includes('pawn'));
    });
    await check('castling renders king and rook on separate correct squares and undo restores',async()=>{
      await goto('castle');await move('e1','g1');assert.ok((await square('g1').getAttribute('aria-label')).includes('king'));assert.ok((await square('f1').getAttribute('aria-label')).includes('rook'));assert.equal(await square('h1').locator('img').count(),0);
      await page.click('#undo');assert.ok((await square('h1').getAttribute('aria-label')).includes('rook'));
    });
    await check('en passant capture highlight and removal use the captured pawn’s square',async()=>{
      await goto('ep');await page.selectOption('#side','b');await square('d4').click();assert.ok(await square('e3').evaluate(e=>e.classList.contains('capture')));
      await square('e3').click();assert.equal(await square('e4').locator('img').count(),0);assert.ok((await square('e3').getAttribute('aria-label')).includes('Black pawn'));
      await page.click('#undo');assert.ok((await square('e4').getAttribute('aria-label')).includes('White pawn'));
    });
    await check('king capture wins, blocks further moves, and undo restores the king',async()=>{
      await goto('capture');assert.equal(await page.locator('#kingCapture').inputValue(),'allowed');
      await move('a1','a8');assert.ok((await text('status')).startsWith('White to move'));assert.ok(await square('h8').evaluate(e=>e.classList.contains('in-check')));
      await square('a8').click();assert.ok(await square('h8').evaluate(e=>e.classList.contains('capture')));await square('h8').click();
      assert.equal(await text('status'),'Checkmate — White wins! King captured.');assert.equal(await page.locator('#board img').count(),3);
      await page.waitForTimeout(400);assert.equal(await text('status'),'Checkmate — White wins! King captured.');
      await page.click('#undo');assert.ok((await square('h8').getAttribute('aria-label')).includes('Black king'));assert.ok((await text('status')).startsWith('White to move'));
      await page.selectOption('#kingCapture','standard');assert.equal(await text('history'),'No moves yet.');
    });
    await check('reference board colors and vector pieces are embedded',async()=>{
      await goto();assert.equal(await square('a8').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(238, 238, 210)');assert.equal(await square('a1').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(118, 150, 86)');
      assert.ok(await page.locator('#board img').first().evaluate(e=>e.src.startsWith('data:image/svg+xml')));
    });
    await check('stalemate displays a persistent draw without starting AI',async()=>{
      await goto('stalemate');assert.equal(await text('status'),'Draw — stalemate.');await page.waitForTimeout(400);assert.equal(await text('history'),'No moves yet.');
    });
    await check('rank and file labels follow board orientation',async()=>{
      await goto();assert.equal(await page.locator('.rank-coord').allTextContents().then(a=>a.join('')),'87654321');
      assert.equal(await page.locator('.file-coord').allTextContents().then(a=>a.join('')),'abcdefgh');
      await page.click('#flip');assert.equal(await page.locator('.rank-coord').allTextContents().then(a=>a.join('')),'12345678');
      assert.equal(await page.locator('.file-coord').allTextContents().then(a=>a.join('')),'hgfedcba');
      assert.equal(await square('h1').locator('.rank-coord').innerText(),'1');
    });
    await check('local PvP plays both colors in the custom sequence without AI',async()=>{
      await goto();const count=workers;await page.selectOption('#mode','pvp');assert.ok(await page.locator('#computerSettings').isHidden());
      await move('e2','e4');await move('d2','d4');assert.ok((await text('status')).includes('Black to move (Player 2)'));
      await move('e7','e5');assert.ok((await text('status')).includes('White to move (Player 1)'));
      await page.waitForTimeout(300);assert.equal(workers,count);assert.ok(!(await text('history')).includes('4.'));
      await page.click('#undo');assert.ok((await text('status')).includes('Black to move'));assert.ok(await page.locator('#resumeAI').isHidden());
      await move('c7','c5');await page.click('#preset1');assert.equal(await text('history'),'No moves yet.');
      await move('e2','e4');await move('e7','e5');assert.ok((await text('history')).includes('2. Black'));
    });
    await check('switching to PvP terminates queued or running worker search',async()=>{
      await goto();await page.selectOption('#depth','4');await move('e2','e4');await move('d2','d4');
      await page.waitForTimeout(100);await page.selectOption('#mode','pvp');await page.waitForTimeout(400);
      assert.equal(await text('history'),'No moves yet.');assert.equal(await page.locator('#board img').count(),32);
      await page.selectOption('#mode','computer');assert.ok(await page.locator('#computerSettings').isVisible());
    });
    await check('PvP king capture celebrates and undo restores the king',async()=>{
      await goto('capture');await page.selectOption('#mode','pvp');await move('a1','a8');await move('a8','h8');
      assert.equal(await text('status'),'Checkmate — White wins! King captured.');await page.click('#undo');
      assert.ok((await square('h8').getAttribute('aria-label')).includes('Black king'));
    });
    await check('embedded engine worker calculates offline after the page loads',async()=>{
      const local=await browser.newPage();const context=local.context();
      let localWorker=false;local.on('worker',()=>localWorker=true);local.on('pageerror',error=>errors.push(error.message));
      try {
        await local.goto(`http://127.0.0.1:${server.address().port}/`);
        await context.setOffline(true);
        await local.waitForFunction(()=>document.querySelectorAll('#board button').length===64);
        await local.selectOption('#depth','1');
        for(const [from,to] of [['e2','e4'],['d2','d4']]){await local.locator(`[data-square="${from}"]`).click();await local.locator(`[data-square="${to}"]`).click();}
        await local.waitForFunction(()=>document.querySelector('#history').textContent.includes('3. Black'));
        assert.ok(localWorker);assert.equal(await local.locator('.rank-coord').count(),8);
      } finally {await context.close();}
    });
    await check('worker-unavailable fallback still plays legal computer moves',async()=>{
      const local=await browser.newPage();local.on('pageerror',error=>errors.push(error.message));
      try {
        await local.addInitScript(()=>{window.Worker=undefined;});
        await local.goto(`http://127.0.0.1:${server.address().port}/`);
        await local.selectOption('#depth','1');
        for(const [from,to] of [['e2','e4'],['d2','d4']]){await local.locator(`[data-square="${from}"]`).click();await local.locator(`[data-square="${to}"]`).click();}
        await local.waitForFunction(()=>document.querySelector('#history').textContent.includes('3. Black'));
        assert.equal(await local.locator('#board button').count(),64);
      } finally {await local.context().close();}
    });
    assert.ok(workers>0,'Computer moves should use an embedded worker');
    await check('Expert 3500 target is the default strength',async()=>{
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(()=>document.querySelectorAll('#board button').length===64);
      assert.equal(await page.locator('#elo').inputValue(),'3500');
      assert.equal(await page.locator('#depth').inputValue(),'4');
      assert.equal(await text('eloValue'),'3500');
      assert.equal(await page.locator('#elo').getAttribute('max'),'3500');
    });
    await check('Elo slider and presets stay synchronized and preserve the current game',async()=>{
      await goto();await move('e2','e4');const history=await text('history');
      await page.locator('#elo').fill('1700');assert.equal(await text('eloValue'),'1700');assert.equal(await page.locator('#depth').inputValue(),'custom');
      assert.equal(await text('history'),history);assert.equal(await page.locator('#elo').getAttribute('aria-valuetext'),'1700 target Elo');
      await page.selectOption('#depth','3');assert.equal(await page.locator('#elo').inputValue(),'2000');
      await page.selectOption('#depth','1');assert.equal(await page.locator('#elo').inputValue(),'600');
      await page.selectOption('#depth','4');assert.equal(await text('eloValue'),'3500');assert.equal(await page.locator('#elo').inputValue(),'3500');assert.equal(await text('history'),history);
      await page.selectOption('#depth','1');await move('d2','d4');await page.locator('#elo').fill('400');await waitHistory(3);
      assert.equal(await page.locator('#elo').inputValue(),'400');await page.click('#undo');assert.ok((await text('status')).includes('paused'));
      await page.locator('#elo').fill('1200');await page.waitForTimeout(400);assert.ok(!(await text('history')).includes('3.'));
    });
    await check('checkmate celebration displays winner, preserves controls, and plays once',async()=>{
      await goto('mate');await move('g6','g7');
      assert.equal(await page.locator('.victory-title').innerText(),'CHECKMATE');
      assert.equal(await page.locator('.victory-winner').innerText(),'White wins');
      assert.equal(await page.locator('.victory-detail').innerText(),'THE KING HAS NO ESCAPE');
      assert.equal(await page.locator('.victory-confetti').count(),36);
      await page.evaluate(()=>window.testCelebration=document.querySelector('.victory-layer'));
      await page.click('#flip');assert.ok(await page.evaluate(()=>window.testCelebration===document.querySelector('.victory-layer')));
      await page.waitForTimeout(650);fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
      await page.screenshot({path:path.join(root,'test-results/checkmate.png'),fullPage:true});
      await page.waitForFunction(()=>!document.querySelector('.victory-layer'));
      await page.click('#flip');assert.equal(await page.locator('.victory-layer').count(),0);
      assert.equal(await text('status'),'Checkmate — White wins!');
      await page.click('#undo');assert.equal(await page.locator('.victory-layer').count(),0);
      await move('g6','g7');assert.equal(await page.locator('.victory-layer').count(),1);
      await page.click('#newGame');assert.equal(await page.locator('.victory-layer').count(),0);
    });
    await check('computer checkmate celebrates the Black winner',async()=>{
      await goto('blackmate');await page.waitForSelector('.victory-layer');
      assert.equal(await page.locator('.victory-winner').innerText(),'Black wins');
      await page.click('#undo');assert.equal(await page.locator('.victory-layer').count(),0);
    });
    await check('king capture celebrates with reduced motion and undo clears it',async()=>{
      await page.emulateMedia({reducedMotion:'reduce'});await goto('capture');await move('a1','a8');await move('a8','h8');
      assert.equal(await page.locator('.victory-detail').innerText(),'KING CAPTURED · GAME OVER');
      assert.equal(await page.locator('.victory-confetti').count(),0);
      assert.equal(await page.locator('.victory-card').evaluate(e=>getComputedStyle(e).animationName),'none');
      await page.click('#undo');assert.equal(await page.locator('.victory-layer').count(),0);
      await page.emulateMedia({reducedMotion:'no-preference'});
      await goto('stalemate');assert.equal(await page.locator('.victory-layer').count(),0);
    });
    assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
    fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await goto();await page.screenshot({path:path.join(root,'test-results/board.png'),fullPage:true});
    console.log(`${count} browser checks passed; no browser errors or external requests.`);
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
