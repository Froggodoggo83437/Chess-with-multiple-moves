const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),src=path.join(path.dirname(require.resolve('stockfish/package.json')),'src');
const name=fs.readdirSync(src).find(name=>/^stockfish-17\.1-single-.*\.js$/.test(name));
if(!name)throw Error('Pinned full single-threaded Stockfish build missing');
const base=name.slice(0,-3),directory=path.join(root,'assets/stockfish');fs.mkdirSync(directory,{recursive:true});
const raw=Buffer.concat(Array.from({length:6},(_,index)=>fs.readFileSync(path.join(src,base+`-part-${index}.wasm`))));
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const wasmSha256=digest(raw),manifestFile=path.join(directory,'manifest.json'),binaryFile=path.join(directory,'stockfish-17.1.wasm.gz');
let manifest=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile)):null;
if(!manifest||manifest.wasmSha256!==wasmSha256||!fs.existsSync(binaryFile)||digest(fs.readFileSync(binaryFile))!==manifest.gzipSha256){
 const compressed=zlib.gzipSync(raw,{level:9});fs.writeFileSync(binaryFile,compressed);
 manifest={version:'17.1.0',build:name,wasmSha256,gzipSha256:digest(compressed),integrity:'sha256-'+crypto.createHash('sha256').update(compressed).digest('base64'),bytes:compressed.length,source:'https://github.com/nmrugg/stockfish.js/tree/602fd7e1a571a2be71f242942db90483731f2a1f'};
 fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
}
fs.copyFileSync(path.join(src,'../Copying.txt'),path.join(directory,'COPYING.txt'));
fs.copyFileSync(path.join(src,'../AUTHORS'),path.join(directory,'AUTHORS'));
fs.writeFileSync(path.join(directory,'README.md'),`# Full Stockfish 17.1 analysis asset\n\nThis is the unmodified full single-threaded WASM build from pinned npm stockfish@17.1.0, gzip-compressed for transfer. It is loaded only for compatible standard-chess review, not for gameplay or custom turns. Browser fetch integrity verifies the compressed bytes.\n\nCopyright 2025 Chess.com, LLC, and the Stockfish contributors; GNU GPL v3. See COPYING.txt and AUTHORS. Corresponding source, build scripts, and network download instructions are available at [the exact source revision](${manifest.source}). The bundled JavaScript retains its original license header.\n\nGenerate/verify this asset with node scripts/prepare-stockfish.cjs after npm ci. Serve application/octet-stream or application/gzip, without treating the file suffix as HTTP Content-Encoding. Standard review falls back to the custom engine if this asset, WebAssembly, or gzip decompression is unavailable.\n`);
module.exports={source:fs.readFileSync(path.join(src,name),'utf8'),asset:{path:'assets/stockfish/stockfish-17.1.wasm.gz',integrity:manifest.integrity,version:manifest.version}};
