// The repo's home page, `localhost:5173/`: every game in `games/`, one a line, each with a link to
// every page in its folder, `index`, `client` and `dev` first, each in a column of its own that is
// left empty for a game without it, and the rest after by name, read off the
// folder each time it is asked for, so it is never behind it. Beside `dev`, each scene its manager
// (`<game>.scene.json`) names, in its order, a link to `dev.html?scene=<scene>`, which enters it. A
// game whose server runs on node under `yarn serve` says so, with its port (`serve.ts`). With no
// games, it says how to make one.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import type { Running } from './servers.ts'

const FIRST = ['index', 'client', 'dev']
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The scenes the manager of game `name` names, in its order; none for a game whose manager is missing
// or is not JSON.
function scenes(dir: string, name: string): string[] {
  try {
    return Object.keys(JSON.parse(readFileSync(path.join(dir, name, `${name}.scene.json`), 'utf8')).prefabs?.scenemanager?.scenes ?? {})
  } catch {
    return []
  }
}

// Every game under `root` with a page, its pages by name, without `.html`, and its scenes.
export function games(root: string): { name: string; pages: string[]; scenes: string[] }[] {
  const dir = path.join(root, 'games')
  let folders: string[]
  try {
    folders = readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort()
  } catch {
    return []
  }
  const rank = (p: string) => (FIRST.includes(p) ? FIRST.indexOf(p) : FIRST.length)
  return folders
    .map(name => ({
      name,
      pages: readdirSync(path.join(dir, name)).filter(f => f.endsWith('.html')).map(f => f.slice(0, -'.html'.length))
        .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)),
      scenes: scenes(dir, name),
    }))
    .filter(g => g.pages.length)
}

export function page(root: string, running: Running[]): string {
  const list = games(root)
  const rows = list.map(g => {
    const link = (p: string) => `<a href="/games/${escape(g.name)}/${escape(p)}.html">${escape(p)}</a>`
    // `dev`, and after it each scene, entered by `dev.html?scene=<scene>`.
    const dev = () => link('dev') + (g.scenes.length
      ? ` <span class="scenes">(${g.scenes.map(s => `<a href="/games/${escape(g.name)}/dev.html?scene=${escape(encodeURIComponent(s))}">${escape(s)}</a>`).join(', ')})</span>`
      : '')
    // `index`, `client` and `dev` each in a column of its own, empty where the game has no such page.
    const slots = FIRST.map(p => `<span class="slot">${g.pages.includes(p) ? (p === 'dev' ? dev() : link(p)) : ''}</span>`).join('')
    const on = running.find(r => r.game === g.name)
    const rest = g.pages.filter(p => !FIRST.includes(p)).map(link).join('') + (on ? `<span class="on">● server on ${on.port}</span>` : '')
    return `<li><span class="name">${escape(g.name)}</span>${slots}<span class="rest">${rest}</span></li>`
  })
  return [
    '<!doctype html>',
    '<html>',
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '    <title>Patchwork</title>',
    '    <style>',
    '      body { margin: 0; padding: 32px 16px; background: #0b0b0e; color: #d8d8de; font: 15px/1.5 ui-monospace, Menlo, monospace }',
    '      h1 { margin: 0 0 20px; font-size: 15px; font-weight: normal; color: #8a8a94 }',
    // One grid for every game, so each column is as wide as its widest cell: a `dev` with its scenes
    // pushes `client` along on every line, not only its own.
    '      ul { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: minmax(16ch, max-content) repeat(3, minmax(6ch, max-content)) 1fr; gap: 0 20px }',
    '      li { display: contents }',
    '      li > span { padding: 2px 0 }',
    '      .name { color: #fff }',
    '      .scenes { color: #8a8a94 }',
    '      .rest { display: flex; flex-wrap: wrap; gap: 0 20px }',
    '      a { color: #7aa7e8; text-decoration: none }',
    '      a:hover { text-decoration: underline }',
    '      .on { color: #6fcf7f }',
    '      code { color: #fff }',
    '    </style>',
    '  </head>',
    '  <body>',
    '    <h1>Patchwork</h1>',
    list.length ? `    <ul>\n${rows.map(r => `      ${r}`).join('\n')}\n    </ul>` : '    <p>No games yet: <code>yarn new-game &lt;name&gt;</code></p>',
    '  </body>',
    '</html>',
    '',
  ].join('\n')
}

// The home page at `/`, the games whose servers run asked of `running` each time.
export function home(running: () => Running[] = () => []): Plugin {
  return {
    name: 'home',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/') return next()
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.setHeader('cache-control', 'no-cache')
        res.end(page(path.resolve(server.config.root), running()))
      })
    },
  }
}
