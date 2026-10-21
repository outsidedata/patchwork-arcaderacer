// A game's page built into a bundle: every module script of the page, and every module the game
// loads while it runs, packed by esbuild into a few files, so a browser makes a handful of requests
// for the game's code and not one for each of its files. The dev server builds a page's bundle each
// time the page is asked for (`vite.config.ts`), and the static site writes it
// (`scripts/produce_static_site.ts`).
//
// What a game loads while it runs is found from its folder and its scene files, since no import
// names it: each `<kind>.client.ts` beside the page, as `<kind>.client.ts?instance`, the drawing file
// made to hand out a fresh copy of itself (`scripts/instance.ts`); each `<scene>.sim.ts` beside a
// `<scene>.scene.json`; every plugin a scene's `plugins` or `world.shipped.plugins` names, the
// top-level one or the game's own; and every mod a scene's `world.<p>.mods` names, wherever it may
// sit (`addons/scenemanager`, Mods). The page's file imports every one of them, ahead of the page's
// own script, and hands the list of them, by the url each is loaded by, to `imported`
// (`engine/browser.ts`), which takes each from it: the page's code is the one file. A worker runs
// apart from the page and is a file of its own, as is each task it imports, and the code a worker
// shares with the page is in a chunk of its own, so every module is in the bundle once.
//
// A module of the repo is built with its `import.meta.url` written as the url the file has when it
// is served file by file, `url(rel)`, so every url it builds from its own place while it runs, a
// plugin's from the engine's, a scene's from the page's, a mod's from scenemanager's, is the url
// the list names. A file a module names as `new URL('<path>.ts', import.meta.url)` is a worker or a
// task a worker imports (`plugins/terrain3d`): it is an entry too, found as the build reads the
// module, and the url is written as its file's in the bundle, which a worker is made from and
// imports. A build that finds one more is built again with it.
//
// `bundler(o)` takes the repo's root, the page's path from it, `url`, `out`, the url's path the
// bundle's files are served under, ending in `/`, whether it is minified, and `json`, what each of
// the repo's `.json` files the bundle imports is written as. `build()` hands back the page with each
// module script in it written as a script of the bundle's, and every file of the bundle by its path
// under `out`. A page with no module script in it is handed back as it is, with no files. The build
// is kept between calls, and each reads only the files that changed since.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { context, transform, type BuildContext, type Plugin } from 'esbuild'
import { init, parse } from 'es-module-lexer'
import { looks } from '../engine/browser.ts'
import { instanced } from './instance.ts'

export type Options = {
  root: string
  page: string
  url: (rel: string) => string
  out: string
  minify?: boolean
  json?: (rel: string, text: string) => string
}

export type Built = { html: string; files: Map<string, Uint8Array> }

const SCRIPT = /(<script\b[^>]*\btype=["']module["'][^>]*>)([\s\S]*?)(<\/script>)/g
const WORKER = /new URL\(\s*(["'])(\.{1,2}\/[^"']+\.ts)\1\s*,\s*import\.meta\.url\s*\)/g

const posix = (p: string) => p.split(path.sep).join('/')

// A module the game loads while it runs: what esbuild reads, and the url it is loaded by.
type Loaded = { in: string; key: string }

// An entry of the bundle, a file of its own: what esbuild reads, and its path in the bundle without
// `.js`.
type Entry = { in: string; out: string }

export function bundler(o: Options) {
  const root = path.resolve(o.root)
  const home = path.posix.dirname(o.page)
  const rel = (abs: string) => posix(path.relative(root, abs))
  const has = (r: string) => existsSync(path.join(root, r))
  const noTs = (r: string) => r.replace(/\.ts$/, '')
  const at = (out: string) => `${o.out}${out}.js`

  // Every file a module names as a worker or a worker's task, by its path from the root.
  const workers = new Set<string>()
  // Each file of the repo as the build last read it, by its path, with the time it was written.
  const read = new Map<string, { mtime: number; code: string }>()
  let ctx: { key: string; it: BuildContext } | undefined

  // The scene files of the game's folder and every partial one of them extends.
  function scenes(): Record<string, any>[] {
    const dir = path.join(root, home)
    const out: Record<string, any>[] = []
    for (const name of readdirSync(dir).filter(n => n.endsWith('.scene.json'))) {
      const scene = JSON.parse(readFileSync(path.join(dir, name), 'utf8'))
      out.push(scene)
      if (typeof scene.extends === 'string') out.push(JSON.parse(readFileSync(path.join(dir, scene.extends), 'utf8')))
    }
    return out
  }

  // What the game loads while it runs, by the url each is loaded by.
  function loaded(): Loaded[] {
    const names = readdirSync(path.join(root, home))
    const entries: Loaded[] = []
    const add = (r: string) => {
      if (has(r) && !entries.some(e => e.key === o.url(r))) entries.push({ in: path.join(root, r), key: o.url(r) })
    }
    for (const kind of looks(names)) {
      const r = `${home}/${kind}.client.ts`
      entries.push({ in: `instance:${path.join(root, r)}`, key: `${o.url(r)}?instance` })
    }
    for (const n of names.filter(n => n.endsWith('.sim.ts') && names.includes(n.replace(/\.sim\.ts$/, '.scene.json')))) add(`${home}/${n}`)
    for (const scene of scenes()) {
      const world: Record<string, any> = scene.world ?? {}
      for (const n of [...(scene.plugins ?? []), ...(world.shipped?.plugins ?? [])] as string[]) {
        add(`plugins/${n}/${n}.plugin.ts`)
        add(`${home}/plugins/${n}/${n}.plugin.ts`)
      }
      for (const [p, fixed] of Object.entries(world)) {
        for (const entry of Object.values((fixed?.mods ?? {}) as Record<string, string | string[]>)) {
          for (const a of typeof entry === 'string' ? [entry] : entry) {
            add(`plugins/${a}/${a}.${p}.ts`)
            add(`${home}/plugins/${a}/${a}.${p}.ts`)
            add(`${home}/plugins/${p}/${a}.${p}.ts`)
          }
        }
      }
    }
    return entries
  }

  // A module of the repo as JavaScript, its workers' urls written as their files' in the bundle and
  // its `import.meta.url` as the url its file has, for the file at `r`.
  async function code(r: string, source: string, loader: 'ts' | 'js', url: string): Promise<string> {
    let js = loader === 'ts' ? (await transform(source, { loader: 'ts', format: 'esm', sourcefile: r, tsconfigRaw: readFileSync(path.join(root, 'tsconfig.json'), 'utf8') })).code : source
    js = js.replace(WORKER, (_, _q, to: string) => {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(r), to))
      workers.add(target)
      return `new URL(${JSON.stringify(at(noTs(target)))}, location.href)`
    })
    await init
    const metas = parse(js, r)[0].filter(i => i.d === -2 && js.startsWith('import.meta.url', i.s)).sort((a, b) => b.s - a.s)
    for (const m of metas) js = js.slice(0, m.s) + `new URL(${JSON.stringify(url)}, location.href).href` + js.slice(m.s + 'import.meta.url'.length)
    return js
  }

  async function cached(abs: string, make: (text: string) => Promise<string>, tag = '') {
    const mtime = statSync(abs).mtimeMs
    const had = read.get(abs + tag)
    if (had && had.mtime === mtime) return had.code
    const made = await make(readFileSync(abs, 'utf8'))
    read.set(abs + tag, { mtime, code: made })
    return made
  }

  const repo: Plugin = {
    name: 'core-bundle',
    setup(b) {
      b.onResolve({ filter: /^instance:/ }, a => ({ path: a.path.slice('instance:'.length), namespace: 'instance' }))
      b.onResolve({ filter: /^page:/ }, a => ({ path: a.path, namespace: 'page' }))
      b.onResolve({ filter: /^list:$/ }, () => ({ path: 'list:', namespace: 'list' }))
      // The list of what the game loads while it runs, every one of them imported and handed to
      // `imported` by the url it is loaded by.
      b.onLoad({ filter: /.*/, namespace: 'list' }, () => {
        const all = loaded()
        return {
          contents: [
            ...all.map((e, i) => `import * as m${i} from ${JSON.stringify(e.in)}`),
            `globalThis[Symbol.for('core.bundle')] = {${all.map((e, i) => `${JSON.stringify(e.key)}: m${i}`).join(', ')}}`,
          ].join('\n'),
          loader: 'js',
          resolveDir: root,
        }
      })
      b.onLoad({ filter: /.*/, namespace: 'instance' }, async a => ({
        contents: await cached(a.path, async t => instanced(await code(rel(a.path), t, 'ts', o.url(rel(a.path)))), '?instance'),
        loader: 'js',
        resolveDir: path.dirname(a.path),
      }))
      b.onLoad({ filter: /.*/, namespace: 'page' }, async a => {
        const i = Number(a.path.slice('page:'.length))
        return { contents: `import 'list:'\n${await code(o.page, scripts()[i], 'js', o.url(o.page))}`, loader: 'js', resolveDir: path.join(root, home) }
      })
      b.onLoad({ filter: /\.(ts|js|mjs|json)$/ }, async a => {
        const r = rel(a.path)
        if (r.startsWith('..') || r.split('/').includes('node_modules')) return undefined
        if (r.endsWith('.json')) return o.json ? { contents: o.json(r, readFileSync(a.path, 'utf8')), loader: 'json' } : undefined
        return { contents: await cached(a.path, t => code(r, t, r.endsWith('.ts') ? 'ts' : 'js', o.url(r))), loader: 'js', resolveDir: path.dirname(a.path) }
      })
    },
  }

  const html = () => readFileSync(path.join(root, o.page), 'utf8')
  const scripts = () => [...html().matchAll(SCRIPT)].map(s => s[2])

  async function build(): Promise<Built> {
    const page = html()
    const count = scripts().length
    if (!count) return { html: page, files: new Map() }
    const pages: Entry[] = Array.from({ length: count }, (_, i) => ({ in: `page:${i}`, out: `${noTs(o.page.replace(/\.html$/, ''))}.${i}` }))
    for (;;) {
      const entries = [...pages, ...[...workers].filter(has).map(w => ({ in: path.join(root, w), out: noTs(w) }))]
      const key = JSON.stringify(entries)
      if (ctx?.key !== key) {
        await ctx?.it.dispose()
        ctx = {
          key,
          it: await context({
            entryPoints: entries.map(e => ({ in: e.in, out: e.out })),
            absWorkingDir: root,
            outdir: path.join(root, '.bundle'),
            bundle: true,
            splitting: true,
            format: 'esm',
            platform: 'browser',
            target: 'es2022',
            write: false,
            minify: !!o.minify,
            sourcemap: o.minify ? false : 'linked',
            chunkNames: 'chunks/[name]-[hash]',
            external: ['node:*'],
            plugins: [repo],
            logLevel: 'silent',
          }),
        }
      }
      const before = workers.size
      const result = await ctx.it.rebuild()
      if (workers.size !== before) continue
      const files = new Map<string, Uint8Array>()
      for (const f of result.outputFiles ?? []) files.set(posix(path.relative(path.join(root, '.bundle'), f.path)), f.contents)
      let i = 0
      return { html: page.replace(SCRIPT, (_s, open: string) => `${open.replace(/>$/, ` src="${at(pages[i++].out)}">`)}</script>`), files }
    }
  }

  return {
    build,
    async dispose() {
      await ctx?.it.dispose()
      ctx = undefined
    },
  }
}
