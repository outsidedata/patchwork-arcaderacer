// Serves the repo root over http so the experiment can load the demo's textures and three from
// node_modules (a page opened as a file cannot). Then open:
//
//   node experiments/terrain-warp/serve.mjs
//   http://localhost:5180/experiments/terrain-warp/
import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const root = normalize(join(new URL('.', import.meta.url).pathname, '../..'))
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' }
const PORT = 5180

createServer((req, res) => {
  let path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)))
  if (!path.startsWith(root)) { res.writeHead(403).end(); return }
  try {
    if (statSync(path).isDirectory()) path = join(path, 'index.html')
    statSync(path)
  } catch { res.writeHead(404).end('not found'); return }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
  createReadStream(path).pipe(res)
}).listen(PORT, () => console.log(`http://localhost:${PORT}/experiments/terrain-warp/`))
