const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const result = esbuild.buildSync({
  entryPoints: [path.join(root, 'src/game.js')], bundle: true,
  format: 'iife', target: 'es2022', write: false, legalComments: 'inline'
});
const worker = esbuild.buildSync({ entryPoints: [path.join(root, 'src/engine-worker.js')], bundle: true, format: 'iife', target: 'es2022', write: false, legalComments: 'inline' });
const license = fs.readFileSync(path.join(root, 'node_modules/chess.js/LICENSE'), 'utf8');
const script = `<!-- GAME_SCRIPT_START -->\n<script>\n/* chess.js 1.4.0\n${license}*/\n${result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}\n</script>\n<!-- GAME_SCRIPT_END -->`;
const htmlPath = path.join(root, 'custom_turn_chess.html');
const html = fs.readFileSync(htmlPath, 'utf8').replace(/<script>\s*window\.CHESS_PIECES=[\s\S]*?<\/script>/, () => '<script>\nwindow.CHESS_PIECES=' + JSON.stringify(require('../src/pieces.cjs')) + ';\nwindow.CHESS_WORKER_SOURCE=' + JSON.stringify(worker.outputFiles[0].text).replace(/<\/script/gi, '<\\/script') + ';\n</script>');
if (!html.includes('<!-- GAME_SCRIPT_START -->')) throw Error('Missing game script markers');
fs.writeFileSync(htmlPath, html.replace(/<!-- GAME_SCRIPT_START -->[\s\S]*?<!-- GAME_SCRIPT_END -->/, () => script));
