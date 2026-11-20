// A CPU profile (a .cpuprofile, Chrome's or node's) laid out by who owns the time: each sampled
// millisecond is given to the file of core or the game that was running, read off its path as core names
// its files:
//   games/<game>/<kind>.client.ts          the kind's look        kind <kind>, look
//   games/<game>/<kind>.sim.ts             the kind's rules       kind <kind>, rules
//   games/<game>/plugins/<x>/<a>.<p>.ts,   a mod: what plugin a   mod <a>.<p>, the side of whoever called it
//   plugins/<x>/<a>.<p>.ts                 hands plugin p (a and p each a plugin, x one of them)
//   games/<game>/plugins/<p>/…             the game's plugin p    plugin <p>, rules (a .sim.ts), page (a
//   plugins/<p>/…                          core's plugin p          .plugin.ts), else the side of its caller
//   games/<game>/addons/<a>/…, addons/<a>/ an addon               addon <a>
//   engine/…                               the engine             engine, rules (engine.ts) or page
//   games/<game>/<game>.playtest.ts        the playtester's think playtester (`--playtest`)
//   anything else of the game's (dev.html) the page               page
// A mod is its own owner, never the plugin whose folder it sits in: shapes3d's mod for mechs, in
// mech's `plugins/mechs/shapes3d.mechs.ts`, read as mechs' page half on 2026-11-20 while it ate the
// outpost's frame, every building's height asked of it each time walker asked the ground's.
// A millisecond spent in a library (three, a physics wasm), in the browser's own functions or in core's
// `math` plugin (a library of sin, cos and hypot every plugin calls) is given to the nearest of ours that
// called it, and kept beside it as `via` (`three` 4.1 ms, `math` 2.0 ms), so render3d's draw is render3d's
// however deep in three it went, and a sin is whoever asked for it. Garbage collection and the browser's
// own work with no caller of ours are `browser`; idle time is counted apart and given to nobody.
// `owned(profile, at?)` reads each frame's file through `at` (`sources`, below, for a bundled page) and
// hands back { ms, idle, owners: [{ who, group, name, side, ms, via, functions }], chains }, most first;
// `functions` are the owner's ten costliest by their own time, a library's under its name. `chains` are
// the call chains the time was spent down, a flame graph in lines: each sample's owners from the
// outermost in, each hop an owner and the function it was entered by (`kind colossus tick → plugin walker
// walk → mod shapes3d.mechs height`), the same owner called again within itself one hop; the twenty
// costliest, each with its milliseconds and `self`, what its last hop spent itself.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname, '../../..')

// A page served as a bundle (`scripts/bundle.ts`: the dev server's game pages) runs its code out of a few
// files, so a frame's url is the bundle's. `sources(profile)` fetches each bundle's source map (linked
// beside it, as the dev server builds it) and hands back `at(frame)`, the frame's own file and line, which
// `owned` reads in place of the frame's url. A frame no map covers keeps its url.
const B64 = Object.fromEntries([...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].map((c, i) => [c, i]))
// a map's `mappings`, each line of the bundle a list of [column, source, line] it maps from
function decode(mappings) {
  const lines = []
  let source = 0, line = 0, column = 0
  for (const text of mappings.split(';')) {
    const segs = []
    let gen = 0
    for (const seg of text.split(',')) {
      if (!seg) continue
      const v = []
      let n = 0, shift = 0
      for (const c of seg) {
        const d = B64[c]
        n += (d & 31) << shift
        if (d & 32) { shift += 5; continue }
        v.push(n & 1 ? -(n >>> 1) : n >>> 1)
        n = 0; shift = 0
      }
      gen += v[0]
      if (v.length >= 4) { source += v[1]; line += v[2]; column += v[3]; segs.push([gen, source, line]) }
    }
    lines.push(segs)
  }
  return lines
}

export async function sources(profile) {
  const maps = new Map()
  for (const url of new Set(profile.nodes.map(n => n.callFrame.url))) {
    if (!/^https?:/.test(url)) continue
    try {
      const code = await (await fetch(url)).text()
      const link = code.match(/\/\/# sourceMappingURL=(\S+)\s*$/)?.[1]
      if (!link) continue
      const at = new URL(link, url)
      const map = link.startsWith('data:') ? JSON.parse(Buffer.from(link.split(',')[1], 'base64').toString()) : await (await fetch(at)).json()
      // A source is the repo file's own path, behind a namespace of the bundler's (`instance:` for a
      // drawing file), or relative to where the map is written on disk: under `.bundle/` at the root, at
      // the path the url has past the page's (`/@bundle/<page>/<path>`).
      const disk = pathToFileURL(path.join(root, '.bundle', decodeURIComponent(at.pathname).replace(/^\/@bundle\/.*?\.html\//, '')))
      const file = s => {
        const abs = s.replace(/^[a-z-]+:(?=\/)/, '')
        return abs.startsWith('/') ? pathToFileURL(abs).href : new URL(s, disk).href
      }
      maps.set(url, { lines: decode(map.mappings), files: map.sources.map(file) })
    } catch { /* a url that does not load or has no map keeps its own */ }
  }
  return frame => {
    const m = maps.get(frame.url)
    const segs = m?.lines[frame.lineNumber]
    if (!segs?.length) return undefined
    let hit = segs[0]
    for (const s of segs) { if (s[0] > frame.columnNumber) break; hit = s }
    return { url: m.files[hit[1]], line: hit[2] }
  }
}

// a url as a path from the repo's root: a file's, or one the dev server serves
const where = url => url
  .replace(pathToFileURL(root).href + '/', '')
  .replace(/^https?:\/\/[^/]+\//, '')
  .replace(/\?.*$/, '')

// Core's plugins that are libraries, whose time is their caller's.
const LIBRARIES = new Set(['math'])

// Every plugin's name: core's folders in `plugins/` and every game's in `games/<game>/plugins/`.
const dirs = d => { try { return fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) } catch { return [] } }
const PLUGINS = new Set([
  ...dirs(path.join(root, 'plugins')),
  ...dirs(path.join(root, 'games')).flatMap(g => dirs(path.join(root, 'games', g, 'plugins'))),
])

// Whose file `path` is, or undefined for a library's or the browser's. A side left undefined is the
// side of whoever called it (`owned`).
export function owner(path) {
  let m
  if ((m = path.match(/^games\/[^/]+\/plugins\/([^/]+)\/(.+)$/)) || (m = path.match(/^plugins\/([^/]+)\/(.+)$/))) {
    const [, folder, file] = m
    if (LIBRARIES.has(folder)) return undefined
    const parts = file.match(/^([^/.]+)\.([^/.]+)\.ts$/)
    if (parts && PLUGINS.has(parts[1]) && PLUGINS.has(parts[2]) && (parts[1] === folder || parts[2] === folder)) {
      return { group: 'mod', name: `${parts[1]}.${parts[2]}`, side: undefined }
    }
    return { group: 'plugin', name: folder, side: /\.sim\.ts$/.test(file) ? 'rules' : /\.plugin\.ts$/.test(file) ? 'page' : undefined }
  }
  if ((m = path.match(/^games\/[^/]+\/addons\/([^/]+)\//)) || (m = path.match(/^addons\/([^/]+)\//))) return { group: 'addon', name: m[1], side: 'rules' }
  if ((m = path.match(/^games\/([^/]+)\/\1\.playtest\.ts$/))) return { group: 'playtester', name: 'playtester', side: 'page' }
  if ((m = path.match(/^games\/[^/]+\/([^/.]+)\.client\.ts$/))) return { group: 'kind', name: m[1], side: 'look' }
  if ((m = path.match(/^games\/[^/]+\/([^/.]+)\.sim\.ts$/))) return { group: 'kind', name: m[1], side: 'rules' }
  if (path.startsWith('games/')) return { group: 'page', name: 'page', side: 'page' }
  if (path.startsWith('engine/')) return { group: 'engine', name: 'engine', side: path === 'engine/engine.ts' ? 'rules' : 'page' }
  return undefined
}

// The library a path is: `three` for node_modules/.vite/deps/three.js or node_modules/three/…
const library = path => {
  if (path.startsWith('wasm://')) return 'wasm'
  const own = path.match(/^(?:games\/[^/]+\/)?plugins\/([^/]+)\//)?.[1]
  if (own && LIBRARIES.has(own)) return own
  const m = path.match(/^node_modules\/\.vite\/deps\/([^/]+?)(?:\.js)?$/) ?? path.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)/)
  return m ? m[1].replace(/_/g, '/').replace(/-[A-Z0-9]{8}$/, '') : path ? path.split('/').pop() : 'the browser'
}

export function owned(profile, at = () => undefined) {
  // each frame's own file and line, the source map's where a bundle's
  const frameOf = n => {
    const s = at(n.callFrame)
    return s ? { url: s.url, line: s.line } : { url: n.callFrame.url, line: n.callFrame.lineNumber }
  }
  const byId = new Map(profile.nodes.map(n => [n.id, n]))
  const parent = new Map()
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  // each node's owner, and the library or browser frame it was in when it was not ours
  const of = new Map()
  const find = id => {
    if (of.has(id)) return of.get(id)
    const n = byId.get(id)
    const path = where(frameOf(n).url)
    const up = parent.get(id)
    const above = up === undefined ? undefined : find(up)
    const ours = above && above.group !== 'browser' ? above : undefined
    let o = path ? owner(path) : undefined
    if (o) o = { ...o, side: o.side ?? ours?.side ?? 'page', lib: undefined }
    else {
      const lib = n.callFrame.url ? library(path) : 'the browser'
      o = ours ? { ...ours, lib: ours.lib ?? lib } : { group: 'browser', name: 'browser', side: 'page', lib }
    }
    of.set(id, o)
    return o
  }
  // each node's call chain: the owners from the outermost in, each hop entered by its first function
  const chainOf = new Map()
  const chain = id => {
    if (chainOf.has(id)) return chainOf.get(id)
    const up = parent.get(id)
    const above = up === undefined ? { hops: [], key: undefined } : chain(up)
    const o = find(id)
    const key = `${o.group} ${o.name}`
    const c = o.group === 'browser' || key === above.key
      ? above
      : { hops: [...above.hops, `${key} ${byId.get(id).callFrame.functionName || '(anonymous)'}`], key }
    chainOf.set(id, c)
    return c
  }
  const chains = new Map()
  const owners = new Map()
  let ms = 0, idle = 0
  for (let i = 0; i < profile.samples.length; i++) {
    const dur = (profile.timeDeltas[i + 1] ?? 0) / 1000
    const n = byId.get(profile.samples[i])
    const fn = n.callFrame.functionName
    if (fn === '(idle)') { idle += dur; continue }
    const o = fn === '(garbage collector)' ? { group: 'browser', name: 'garbage collection', side: 'page' }
      : fn === '(program)' ? { group: 'browser', name: 'browser', side: 'page', lib: '(program)' }
      : find(n.id)
    const who = `${o.group} ${o.name} ${o.side}`
    const e = owners.get(who) ?? { who, group: o.group, name: o.name, side: o.side, ms: 0, via: {}, functions: new Map() }
    e.ms += dur
    if (o.lib) e.via[o.lib] = (e.via[o.lib] ?? 0) + dur
    const f = frameOf(n)
    const label = `${o.lib && f.url ? o.lib + ': ' : ''}${fn || '(anonymous)'}${f.url ? '  ' + where(f.url) + ':' + (f.line + 1) : ''}`
    e.functions.set(label, (e.functions.get(label) ?? 0) + dur)
    owners.set(who, e)
    ms += dur
    const { hops } = chain(n.id)
    for (let k = 1; k <= hops.length; k++) {
      const line = hops.slice(0, k).join(' → ')
      const c = chains.get(line) ?? { chain: line, ms: 0, self: 0 }
      c.ms += dur
      if (k === hops.length) c.self += dur
      chains.set(line, c)
    }
  }
  return {
    ms, idle,
    chains: [...chains.values()].filter(c => c.self > 0).sort((a, b) => b.self - a.self).slice(0, 20),
    owners: [...owners.values()].sort((a, b) => b.ms - a.ms).map(e => ({
      ...e, functions: [...e.functions].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, ms]) => ({ name, ms })),
    })),
  }
}
