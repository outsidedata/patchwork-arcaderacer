// Writes a game's one-tab page as a static site: `node --experimental-strip-types
// scripts/produce_static_site.ts <game> [--base /<path>/] [--out <dir>]` (`yarn produce_static_site
// <game>`) writes `<out>/` (`dist/` when none is given) under the working directory, a folder any
// static host serves as it is: GitHub Pages at `https://<owner>.github.io/<repo>/` with
// `--base /<repo>/`, a host's root with the `--base` of `/`.
//
// The site's root is the game's folder: its `index.html` is the page, at the site's own address, and
// every file of `games/<game>/` is at the same path from the root as from the game's folder. Core is
// under `core/`: `core/engine/`, `core/addons/` and `core/plugins/`, laid out as in the repo, so a url
// one of them builds from its own place (`../plugins/<name>/…` from the engine, `../../plugins/…` from
// the scenemanager addon) still finds its file, and a url built from the page's folder (a row's
// `<kind>.client.ts`, a scene's `<scene>.sim.ts`, the game's own `plugins/<name>/`) finds the game's.
// Each `.ts` file is compiled to a `.js` file at its path, and `.ts` in every url a file builds while
// it runs is written `.js`: a static host sends a `.ts` file as video, and a browser runs no module
// of that type. Each import is written as a path from the file that makes it: a name of
// `package.json`'s `imports` (`#engine/…`) to its folder, and a package of `dependencies` to
// `core/vendor/`, where every one the site imports is bundled once, the code two of them share in
// chunks of its own, so `three` and `three/addons/…` are one three. A `.json` file imported is a
// `.json.js` module beside it that exports it. No import map resolves anything: a worker has none.
//
// In a game's own repo, whose `games/` holds that game alone, the game's `README.md` is copied over the
// repo's `README.md`, so the repo's page on GitHub shows the game's README and not the engine's. A
// repo whose `games/` holds other games too, core's own, keeps its README.
//
// A catalogue url is a path from the repo's root (`/games/<game>/assets/…`), so in each of the game's
// `.json` files a string that is a path from the repo's root to a file of the site is written as
// that file's path on the host: `--base` and its path in the site.
//
// The page is written with the loading screen, `scripts/loading.html` beside this script, just inside
// its `<body>`, so the host's first bytes draw it while the game's modules load; the game's first
// canvas to show takes it off the page.
//
// Beside the page, `looks.json` lists the kinds with a look the site holds, each `<kind>.client.ts`
// of the game's folder, which a page's client reads before it imports any row's look
// (`engine/browser.ts`), so no row asks the host for a look that is not there.
//
// Left out: every test (`.test.ts`, `.test.tsx`, `.harness.ts`), every `.tsx`, every `.route.ts`, the
// game's `<game>.server.ts`, `dev.html` and `client.html`, every `.ts` file in the game's `assets/`,
// which is a script that makes its art and data and that the game never reads, every `.md`, `.py`,
// `.pyc` and `.mjs`, every file or folder whose name starts with a dot, what Vite's `server.fs.deny`
// keeps out, and a `.ts` file that imports a package that is not one of `dependencies`, a tool of the
// tests or of node, and every `.ts` file that imports such a tool, at any remove. A file of the site that imports a file the site does not hold stops the build,
// naming both, and so does a game whose folder holds a `core`.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { build, transform } from 'esbuild'
import { init, parse } from 'es-module-lexer'
import { looks } from '#engine/browser.ts'

export type Site = { root: string; game: string; out: string; base: string }

// What the build wrote: every file of the site, by its path from `out`.
export type Written = { files: string[] }

const FOLDERS = ['engine', 'addons', 'plugins']
const CORE = 'core'
const LEFT_OUT = [/\.test\.tsx?$/, /\.harness\.ts$/, /\.tsx$/, /\.route\.ts$/, /\.md$/, /\.py$/, /\.pyc$/, /\.mjs$/, /\.pem$/, /\.key$/, /^\./, /^__pycache__$/]
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

// The package a bare import names: `three` of `three/addons/…`, `@a/b` of `@a/b/c`.
const packageOf = (spec: string) => spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/')
const bare = (spec: string) => !spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('#') && !spec.startsWith('node:')

// The path from the folder `fromDir` to `to`, both paths of the site, as an import writes it.
function relative(fromDir: string, to: string) {
  const r = path.posix.relative(fromDir, to)
  return r.startsWith('.') ? r : `./${r}`
}

// `.ts` written `.js` in every string of a module that names a `.ts` file: before a quote, a
// backtick, or a url's `?` or `#`.
const runTime = (code: string) => code.replace(/\.ts(?=[`'"?#])/g, '.js')

export async function produceStaticSite({ root, game, out, base }: Site): Promise<Written> {
  if (!/^[a-z][a-z0-9_]*$/.test(game)) throw new Error(`${JSON.stringify(game)} is not a game's name`)
  if (!base.startsWith('/') || !base.endsWith('/')) throw new Error(`--base ${base} must start and end with /`)
  const home = `games/${game}`
  if (!existsSync(path.join(root, home, 'index.html'))) throw new Error(`there is no ${home}/index.html`)
  if (existsSync(path.join(root, home, CORE))) throw new Error(`${home}/${CORE} is there, and the site keeps core's files in ${CORE}/`)
  const outDir = path.resolve(root, out)
  for (const f of [...FOLDERS, 'games', 'node_modules']) {
    const held = path.join(root, f)
    if (outDir === root || outDir === held || outDir.startsWith(held + path.sep)) throw new Error(`--out ${out} is the repo or a folder of it the site is made from`)
  }

  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { imports?: Record<string, string>; dependencies?: Record<string, string> }
  const dependencies = new Set(Object.keys(pkg.dependencies ?? {}))
  const aliases = Object.entries(pkg.imports ?? {}).map(([from, to]) => [from.replace(/\*$/, ''), path.posix.normalize(to.replace(/\*$/, ''))] as const)
  const tsconfigPath = path.join(root, 'tsconfig.json')
  const tsconfigRaw = existsSync(tsconfigPath) ? readFileSync(tsconfigPath, 'utf8') : '{}'

  // A file of the repo's path in the site: the game's from the site's root, the rest under `core/`.
  const inSite = (rel: string) => (rel.startsWith(`${home}/`) ? rel.slice(home.length + 1) : `${CORE}/${rel}`)

  const left = (name: string) => LEFT_OUT.some(r => r.test(name))
  const files = [
    ...FOLDERS.flatMap(f => walk(root, f, left)),
    ...walk(root, home, name => left(name) || PAGES_LEFT_OUT.includes(name) || name === `${game}.server.ts` || name === 'index.html')
      .filter(f => !(f.startsWith(`${home}/assets/`) && f.endsWith('.ts'))),
  ]

  await init
  // Each `.ts` file compiled, with its imports, by its path in the repo; a file importing a package
  // outside `dependencies` is left out.
  type Module = { rel: string; code: string; imports: ReturnType<typeof parse>[0] }
  const compile = async (rel: string, source: string, loader: 'ts' | 'js'): Promise<Module> => {
    const { code } = await transform(source, { loader, format: 'esm', tsconfigRaw, sourcefile: rel })
    return { rel, code, imports: parse(code, rel)[0] }
  }
  const modules: Module[] = []
  const tools: string[] = []
  for (const rel of files.filter(f => f.endsWith('.ts'))) {
    const m = await compile(rel, readFileSync(path.join(root, rel), 'utf8'), 'ts')
    if (m.imports.some(i => i.n !== undefined && bare(i.n) && !dependencies.has(packageOf(i.n)))) tools.push(rel)
    else modules.push(m)
  }
  // The file of the repo a name a file imports is, by the bundler's resolution: the name as written,
  // its `.ts` file, or its folder's `index.ts`; undefined for a package or node's own.
  const resolved = (spec: string, from: string): string | undefined => {
    if (bare(spec) || spec.startsWith('node:')) return undefined
    const alias = aliases.find(([a]) => spec.startsWith(a))
    const written = alias ? path.posix.join(alias[1], spec.slice(alias[0].length)) : path.posix.join(path.posix.dirname(from), spec)
    return [written, `${written}.ts`, `${written}/index.ts`].find(f => files.includes(f)) ?? written
  }
  // A file that imports a tool is a tool too: it runs where that tool runs, and never in a page.
  for (let moved = true; moved;) {
    moved = false
    for (const m of [...modules]) {
      if (!m.imports.some(i => i.n !== undefined && tools.includes(resolved(i.n, m.rel) ?? ''))) continue
      tools.push(m.rel)
      modules.splice(modules.indexOf(m), 1)
      moved = true
    }
  }
  const copied = files.filter(f => !f.endsWith('.ts'))

  // The page's module scripts, compiled as a module at `games/<game>/index.html`.
  const page = readFileSync(path.join(root, home, 'index.html'), 'utf8')
  const BODY = /<body\b[^>]*>/
  if (!BODY.test(page)) throw new Error(`${home}/index.html has no <body>, where the loading screen goes`)
  const loading = readFileSync(new URL('./loading.html', import.meta.url), 'utf8')
  const SCRIPT = /(<script\b[^>]*\btype=["']module["'][^>]*>)([\s\S]*?)(<\/script>)/g
  const pageModules = await Promise.all([...page.matchAll(SCRIPT)].map(s => compile(`${home}/index.html`, s[2], 'js')))

  // Every file of the repo the site holds, by its path in the repo, a `.ts` file by its `.js` one.
  const held = new Set<string>([...modules.map(m => m.rel.replace(/\.ts$/, '.js')), ...copied, `${home}/index.html`])

  // What a static import names, as a path of the site, or undefined for node's own.
  const vendored = new Set<string>()
  const jsonModules = new Set<string>()
  const named = (spec: string, from: string): string | undefined => {
    if (spec.startsWith('node:')) return undefined
    if (bare(spec)) {
      if (!dependencies.has(packageOf(spec))) throw new Error(`${from} imports ${spec}, which is not a package of dependencies`)
      vendored.add(spec)
      return `${CORE}/vendor/${spec}.js`
    }
    const at = resolved(spec, from)!
    if (at.endsWith('.ts')) {
      const js = at.replace(/\.ts$/, '.js')
      if (!held.has(js)) throw new Error(`${from} imports ${spec}, and the site holds no ${at}${tools.includes(at) ? ': it imports a package outside dependencies' : ''}`)
      return inSite(js)
    }
    if (!held.has(at)) throw new Error(`${from} imports ${spec}, and the site holds no ${at}`)
    if (at.endsWith('.json')) {
      jsonModules.add(at)
      return `${inSite(at)}.js`
    }
    return inSite(at)
  }

  // A module's code with every import it names written as a path from its place in the site, and
  // `.ts` in its strings written `.js`.
  const rewrite = (m: Module) => {
    let code = m.code
    const dir = path.posix.dirname(inSite(m.rel))
    for (const i of [...m.imports].sort((a, b) => b.s - a.s)) {
      if (i.d === -2 || i.n === undefined) continue
      const to = named(i.n, m.rel)
      if (to === undefined) continue
      const spec = relative(dir, to)
      if (i.d > -1) {
        if (to.endsWith('.json.js')) throw new Error(`${m.rel} imports ${i.n} while it runs, and a .json file is imported only by a static import`)
        code = code.slice(0, i.s) + JSON.stringify(spec) + code.slice(i.e)
        continue
      }
      // The import's own `with { type: 'json' }` goes: what it names is a module now.
      const tail = i.a > -1 ? code.slice(i.e + 1, i.se).replace(/\s*(with|assert)\s*\{[^}]*\}/, '') : code.slice(i.e + 1, i.se)
      code = code.slice(0, i.s) + spec + code.slice(i.e, i.e + 1) + tail + code.slice(i.se)
    }
    return runTime(code)
  }

  rmSync(outDir, { recursive: true, force: true })
  const written: string[] = []
  const write = (at: string, text: string) => {
    mkdirSync(path.dirname(path.join(outDir, at)), { recursive: true })
    writeFileSync(path.join(outDir, at), text)
    written.push(at)
  }

  for (const m of modules) write(inSite(m.rel.replace(/\.ts$/, '.js')), rewrite(m))
  write('looks.json', JSON.stringify(looks(modules.filter(m => path.posix.dirname(m.rel) === home).map(m => path.posix.basename(m.rel)))) + '\n')
  let n = 0
  write('index.html', page.replace(SCRIPT, (_, open, _code, close) => `${open}\n${rewrite(pageModules[n++])}${close}`).replace(BODY, body => `${body}\n${loading}`))

  // A string of a `.json` file that is a path from the repo's root to a file of the site, written as
  // that file's path on the host.
  const rebase = (v: unknown): unknown =>
    typeof v === 'string' ? (v.startsWith('/') && !v.startsWith('//') && held.has(v.slice(1)) ? base + inSite(v.slice(1)) : v)
      : Array.isArray(v) ? v.map(rebase)
      : v !== null && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rebase(x)]))
      : v
  for (const rel of copied) {
    if (!rel.endsWith('.json')) {
      mkdirSync(path.dirname(path.join(outDir, inSite(rel))), { recursive: true })
      copyFileSync(path.join(root, rel), path.join(outDir, inSite(rel)))
      written.push(inSite(rel))
      continue
    }
    const text = readFileSync(path.join(root, rel), 'utf8')
    const json = text.includes('"/') ? JSON.stringify(rebase(JSON.parse(text)), null, 2) + '\n' : text
    write(inSite(rel), json)
    if (jsonModules.has(rel)) write(`${inSite(rel)}.js`, `export default ${json.trim()}\n`)
  }

  const vendor = [...vendored].sort()
  if (vendor.length) {
    await build({
      entryPoints: vendor.map(spec => ({ in: spec, out: spec })),
      absWorkingDir: root,
      outdir: path.join(outDir, CORE, 'vendor'),
      bundle: true,
      splitting: true,
      format: 'esm',
      platform: 'browser',
      minify: true,
      chunkNames: 'chunks/[name]-[hash]',
      logLevel: 'silent',
    })
  }

  // The game's own repo shows the game's README.
  const games = readdirSync(path.join(root, 'games')).filter(n => statSync(path.join(root, 'games', n)).isDirectory())
  const readme = path.join(root, home, 'README.md')
  if (games.length === 1 && existsSync(readme)) copyFileSync(readme, path.join(root, 'README.md'))

  return { files: [...written, ...walk(outDir, `${CORE}/vendor`, () => false)].sort() }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ options: { base: { type: 'string', default: '/' }, out: { type: 'string', default: 'dist' } }, allowPositionals: true })
    const game = positionals[0] ?? ''
    const { files } = await produceStaticSite({ root: process.cwd(), game, out: values.out, base: values.base })
    console.log(`${files.length} files in ${values.out}/, the game's page at ${values.out}/index.html, served at ${values.base}`)
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
}
