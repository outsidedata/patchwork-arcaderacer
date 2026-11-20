// The page's loading cover, as the bundle writes it (`scripts/bundle.ts`): `covered(folder, rebase)`
// is the HTML that goes just inside a game page's `<body>`, or '' for a game whose entry scene shows
// no loading screen. It runs in node, and reads the game's scene files and none of its code.
//
// Every scene waits for files before it draws anything: `load` and `view` await each truth's
// `prepare`, and the loader's fetches every preloaded file a rule reads before the first step and
// before the page makes the client the ui draws in, and the page's code itself comes down before any
// of that. So the screen a scene asks for (`loader.ui.ts`) would show only once all of that is in.
// The cover is that screen drawn in the page's first bytes instead: the entry scene's `loading`
// panel of its `world.ui`, laid out where the ui lays it, drawn in the DOM by `loader.cover.js`,
// which fetches every file the loader fetches first while the code comes down. For every scene the
// manager names, that is every entry of its catalogue not marked `preload: false`, every font and
// every wad; the screen's pictures and fonts go first. The loader reads each from the cover's fetch
// (`loader.sim.ts`, the cover), so nothing is fetched twice, and `loader.ui.ts` takes the cover off
// the page the frame after it has drawn the same screen under it, from which the ui's screen goes on
// as in any scene: the files a file names, the shaders, then the fade.
//
// `rebase` is what a published site does to a `.json` file's paths (`produce_static_site.ts`): the
// catalogue's urls are written as the site serves them.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Scene } from '#engine/engine.ts'
import { sceneOf, type Entry as Visit } from '#addons/scenemanager/scenemanager.addon.ts'
import { preloaded, type Entry } from './loader.sim.ts'
import type { Loading } from './loader.ui.ts'

// The numbers `loader.cover.js` draws and fetches by.
export type Cover = {
  area: { width: number; height: number; fit?: string }
  panel: { anchor: string; size: [number, number]; at?: [number, number]; scale?: number }
  fill?: unknown
  pictures: { url: string; at: [number, number]; size: [number, number] }[]
  bar: Loading['bar'] | null
  lines: { at: [number, number]; every: number; text: string[]; style: Record<string, unknown> } | null
  fonts: { family: string; url: string }[]
  urls: string[]
}

// The game's manager scene: the one scene file of its folder whose `scenemanager` prefab names scenes.
function manager(folder: string): Scene | undefined {
  for (const name of readdirSync(folder).filter(n => n.endsWith('.scene.json'))) {
    const scene = JSON.parse(readFileSync(path.join(folder, name), 'utf8')) as Scene
    if (scene.prefabs?.scenemanager?.scenes) return scene
  }
  return undefined
}

// The cover's numbers for the game in `folder`, or undefined when its entry scene shows no loading
// screen.
export async function cover(folder: string): Promise<Cover | undefined> {
  const top = manager(folder)
  if (!top) return undefined
  const table = top.prefabs.scenemanager.scenes as Record<string, Visit>
  const base = pathToFileURL(path.join(folder, '/')).href
  const entry = top.prefabs.scenemanager.entry as string
  if (!table[entry]) throw new Error(`the manager scene's entry ${entry} is none of its scenes`)
  const first = await sceneOf(top, entry, table[entry], base)
  const ui = first.plugins?.includes('ui') ? first.world?.ui : undefined
  const named = Object.entries((ui?.panels ?? {}) as Record<string, any>).find(([, p]) => p.loading)
  if (!named) return undefined
  const [panelName, panel] = named
  const look = panel.loading as Loading

  const assets = (first.world?.loader?.assets ?? {}) as Record<string, Entry>
  const pictures = (look.pictures ?? []).map(p => {
    const it = assets[p.picture]
    if (!it || it.type !== 'texture' || it.for !== 'ui' || !preloaded(it)) throw new Error(`ui panel ${panelName}'s loading picture ${p.picture} is no preloaded texture entry for ui in world.loader.assets`)
    return { url: it.url, at: p.at, size: p.size }
  })

  // Every file the loader fetches first, once each: the entry scene's, then every other scene's.
  const others = await Promise.all(Object.entries(table).filter(([name]) => name !== entry).map(([name, e]) => sceneOf(top, name, e, base)))
  const urls = new Set<string>()
  const fonts = new Map<string, string>()
  for (const scene of [first, ...others]) {
    const loader = scene.world?.loader
    if (!loader) continue
    for (const url of (loader.wads ?? []) as string[]) urls.add(url)
    for (const [name, it] of Object.entries((loader.assets ?? {}) as Record<string, Entry>)) {
      if (it.type === 'font' && !fonts.has(it.url)) fonts.set(it.url, name)
      if (preloaded(it) || it.type === 'font') urls.add(it.url)
    }
  }

  const fit = first.plugins?.includes('render2d') ? first.world?.render2d?.fit : undefined
  const l = look.lines
  return {
    area: { width: first.prefabs.engine.width, height: first.prefabs.engine.height, ...(fit ? { fit } : {}) },
    panel: { anchor: panel.anchor, size: panel.size, ...(panel.at ? { at: panel.at } : {}), ...(panel.scale ? { scale: panel.scale } : {}) },
    fill: look.fill,
    pictures,
    bar: look.bar ?? null,
    lines: l ? { at: l.at, every: l.every, text: l.text, style: (ui.styles?.[l.style] ?? {}) as Record<string, unknown> } : null,
    fonts: [...fonts].map(([url, family]) => ({ family, url })),
    urls: [...urls],
  }
}

// The cover's HTML for the game in `folder`, `rebase` written over its numbers' text; '' when its
// entry scene shows no loading screen.
export async function covered(folder: string, rebase: (text: string) => string = t => t): Promise<string> {
  const c = await cover(folder)
  if (!c) return ''
  const numbers = rebase(JSON.stringify(c)).replace(/</g, '\\u003c')
  const script = readFileSync(new URL('./loader.cover.js', import.meta.url), 'utf8')
  return `<div id="loader-cover"></div>\n<script>\n{\nconst cover = ${numbers.trim()};\n${script}}\n</script>`
}
