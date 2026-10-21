// Writes a game's one-tab page as a static site: `node --experimental-strip-types
// scripts/produce_static_site.ts <game> [--base /<path>/] [--out <dir>]` (`yarn produce_static_site
// <game>`) writes `<out>/` (`dist/` when none is given) under the working directory, a folder any
// static host serves as it is: GitHub Pages at `https://<owner>.github.io/<repo>/` with
// `--base /<repo>/`, a host's root with the `--base` of `/`.
//
// The site's root is the game's folder: its `index.html` is the page, at the site's own address, and
// every file of `games/<game>/` that is not code is at the same path from the root as from the game's
// folder. Core's files that are not code are under `core/`: `core/engine/`, `core/addons/` and
// `core/plugins/`, laid out as in the repo. The code is the page's bundle (`scripts/bundle.ts`),
// minified, its files under `bundle/`: the page's file, which holds every module the game loads while
// it runs, and a file for each worker and each task a worker imports. Each module is built with the
// url its file would have in the site's layout, `.ts` and all, so every url it builds while it runs
// names the module the bundle holds for it, and none is asked of the host.
//
// In a game's own repo, whose `games/` holds that game alone, the game's `README.md` is copied over the
// repo's `README.md`, so the repo's page on GitHub shows the game's README and not the engine's. A
// repo whose `games/` holds other games too, core's own, keeps its README.
//
// A catalogue url is a path from the repo's root (`/games/<game>/assets/…`), so in each of the game's
// `.json` files, those the bundle holds too, a string that is a path from the repo's root to a file
// of the site is written as that file's path on the host: `--base` and its path in the site.
//
// The page is written with the loading screen, `scripts/loading.html` beside this script, just inside
// its `<body>`, so the host's first bytes draw it while the game's code loads; the game's first
// canvas to show takes it off the page.
//
// Left out: every `.ts` file, which is in the bundle if the page runs it, every `.tsx`, the game's
// `dev.html` and `client.html`, every `.md`, `.py`, `.pyc` and `.mjs`, every file or folder whose name
// starts with a dot, and what Vite's `server.fs.deny` keeps out. A game whose folder holds a `core`
// stops the build, and so does a page whose code does not build, with what esbuild said.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { bundler } from './bundle.ts'

export type Site = { root: string; game: string; out: string; base: string }

// What the build wrote: every file of the site, by its path from `out`.
export type Written = { files: string[] }

const FOLDERS = ['engine', 'addons', 'plugins']
const CORE = 'core'
const BUNDLE = 'bundle'
const LEFT_OUT = [/\.tsx?$/, /\.md$/, /\.py$/, /\.pyc$/, /\.mjs$/, /\.pem$/, /\.key$/, /^\./, /^__pycache__$/]
const PAGES_LEFT_OUT = ['dev.html', 'client.html']

const posix = (p: string) => p.split(path.sep).join('/')

// Every file under `dir`, by its path from `root`, following a folder that is a link, and leaving out
// each name `left` names.
function walk(root: string, dir: string, left: (name: string) => boolean): string[] {
  const at = path.join(root, dir)
  if (!existsSync(at)) return []
  return readdirSync(at).sort().flatMap(name => {
    if (left(name)) return []
    const rel = posix(path.join(dir, name))
    return statSync(path.join(root, rel)).isDirectory() ? walk(root, rel, left) : [rel]
  })
}

export async function produceStaticSite({ root, game, out, base }: Site): Promise<Written> {
  if (!/^[a-z][a-z0-9_]*$/.test(game)) throw new Error(`${JSON.stringify(game)} is not a game's name`)
  if (!base.startsWith('/') || !base.endsWith('/')) throw new Error(`--base ${base} must start and end with /`)
  const home = `games/${game}`
  if (!existsSync(path.join(root, home, 'index.html'))) throw new Error(`there is no ${home}/index.html`)
  for (const own of [CORE, BUNDLE]) if (existsSync(path.join(root, home, own))) throw new Error(`${home}/${own} is there, and the site keeps its ${own === CORE ? "core's files" : 'bundle'} in ${own}/`)
  const outDir = path.resolve(root, out)
  for (const f of [...FOLDERS, 'games', 'node_modules']) {
    const held = path.join(root, f)
    if (outDir === root || outDir === held || outDir.startsWith(held + path.sep)) throw new Error(`--out ${out} is the repo or a folder of it the site is made from`)
  }

  // A file of the repo's path in the site: the game's from the site's root, the rest under `core/`.
  const inSite = (rel: string) => (rel.startsWith(`${home}/`) ? rel.slice(home.length + 1) : `${CORE}/${rel}`)

  const left = (name: string) => LEFT_OUT.some(r => r.test(name))
  const copied = [
    ...FOLDERS.flatMap(f => walk(root, f, left)),
    ...walk(root, home, name => left(name) || PAGES_LEFT_OUT.includes(name) || name === 'index.html'),
  ]
  const held = new Set(copied)

  // A string of a `.json` file that is a path from the repo's root to a file of the site, written as
  // that file's path on the host.
  const rebase = (v: unknown): unknown =>
    typeof v === 'string' ? (v.startsWith('/') && !v.startsWith('//') && held.has(v.slice(1)) ? base + inSite(v.slice(1)) : v)
      : Array.isArray(v) ? v.map(rebase)
      : v !== null && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rebase(x)]))
      : v
  const json = (text: string) => (text.includes('"/') ? JSON.stringify(rebase(JSON.parse(text)), null, 2) + '\n' : text)

  const page = `${home}/index.html`
  const b = bundler({ root, page, url: r => base + inSite(r), out: `${base}${BUNDLE}/`, minify: true, json: (_r, text) => json(text) })
  const built = await b.build().finally(() => b.dispose())

  const BODY = /<body\b[^>]*>/
  if (!BODY.test(built.html)) throw new Error(`${page} has no <body>, where the loading screen goes`)
  const loading = readFileSync(new URL('./loading.html', import.meta.url), 'utf8')

  rmSync(outDir, { recursive: true, force: true })
  const written: string[] = []
  const write = (at: string, data: string | Uint8Array) => {
    mkdirSync(path.dirname(path.join(outDir, at)), { recursive: true })
    writeFileSync(path.join(outDir, at), data)
    written.push(at)
  }

  write('index.html', built.html.replace(BODY, body => `${body}\n${loading}`))
  for (const [f, bytes] of built.files) write(`${BUNDLE}/${f}`, bytes)
  for (const rel of copied) {
    if (rel.endsWith('.json')) {
      write(inSite(rel), json(readFileSync(path.join(root, rel), 'utf8')))
      continue
    }
    mkdirSync(path.dirname(path.join(outDir, inSite(rel))), { recursive: true })
    copyFileSync(path.join(root, rel), path.join(outDir, inSite(rel)))
    written.push(inSite(rel))
  }

  // The game's own repo shows the game's README.
  const games = readdirSync(path.join(root, 'games')).filter(n => statSync(path.join(root, 'games', n)).isDirectory())
  const readme = path.join(root, home, 'README.md')
  if (games.length === 1 && existsSync(readme)) copyFileSync(readme, path.join(root, 'README.md'))

  return { files: written.sort() }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ options: { base: { type: 'string', default: '/' }, out: { type: 'string', default: 'dist' } }, allowPositionals: true })
    const game = positionals[0] ?? ''
    const { files } = await produceStaticSite({ root: process.cwd(), game, out: values.out, base: values.base })
    console.log(`${files.length} files in ${values.out}/, the game's page at ${values.out}/index.html, served at ${values.base}`)
  } catch (e) {
    const errors = (e as { errors?: { text: string; location?: { file: string; line: number } }[] }).errors
    console.error(errors ? errors.map(x => `${x.location ? `${x.location.file}:${x.location.line}: ` : ''}${x.text}`).join('\n') : (e as Error).message)
    process.exit(1)
  }
}
