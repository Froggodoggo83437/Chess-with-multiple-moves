# Full Stockfish 17.1 analysis asset

This is the unmodified full single-threaded WASM build from pinned npm stockfish@17.1.0, gzip-compressed for transfer. It is loaded only for compatible standard-chess review, not for gameplay or custom turns. Browser fetch integrity verifies the compressed bytes.

Copyright 2025 Chess.com, LLC, and the Stockfish contributors; GNU GPL v3. See COPYING.txt and AUTHORS. Corresponding source, build scripts, and network download instructions are available at [the exact source revision](https://github.com/nmrugg/stockfish.js/tree/602fd7e1a571a2be71f242942db90483731f2a1f). The bundled JavaScript retains its original license header.

Generate/verify this asset with node scripts/prepare-stockfish.cjs after npm ci. Serve application/octet-stream or application/gzip, without treating the file suffix as HTTP Content-Encoding. Standard review falls back to the custom engine if this asset, WebAssembly, or gzip decompression is unavailable.
