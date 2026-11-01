// The plugins a game ships in its own folder. The engine loads a scene's `plugins` from the
// top-level `plugins/` folder alone, so a plugin that belongs to one game — its level, say —
// lives in `games/<game>/plugins/<name>/` and is loaded by this one: the scene's `world.shipped`,
// `{ plugins }`, lists their names, read off the scene, since this plugin has no row; and each is `plugins/<name>/<name>.plugin.ts` under the page's own folder,
// exporting a function of its name, called once, as the engine calls a plugin.
//
// Its first tick imports them all, in that list's order, and puts each on `plugins.<name>`, so an
// actor or a plugin that ticks after this one uses a game's plugin the way it uses any other; the
// engine awaits a plugin's tick, so they tick in that same frame. Every `tick` and `afterTick` of
// theirs runs at this plugin's place in the scene's `plugins`, in that order, and `close`
// closes them in the reverse of it. A name the scene's `plugins` already gives throws.
//
// A game's plugin's server half is imported by the game's sim files as they import any plugin's.
// The names `world.shipped.plugins` lists are also how a mod of a game's plugin is found, in the
// game's folder beside it (`addons/scenemanager`'s mods): a game's plugin reaches another plugin,
// and is reached, through a mod as a top-level one is; `listed` there is the order they tick in.
import { imported, type Plugins } from '#engine/browser.ts'

export function shipped() {
  let made: any[] | undefined

  async function load(plugins: Plugins) {
    const names: string[] = plugins.wire.scene.world?.shipped?.plugins ?? []
    const mods = await Promise.all(names.map(n => imported(new URL(`plugins/${n}/${n}.plugin.ts`, plugins.wire.home).href)))
    made = names.map((n, i) => {
      if (n in plugins) throw new Error(`shipped plugin ${n} has the name of a plugin the scene already names`)
      if (!(n in mods[i])) throw new Error(`plugins/${n}/${n}.plugin.ts does not export ${n}`)
      const it = mods[i][n]()
      plugins[n] = it
      return it
    })
  }

  return {
    async tick(plugins: Plugins) {
      if (!made) await load(plugins)
      for (const p of made!) if ('tick' in p) await p.tick(plugins)
    },
    async afterTick(plugins: Plugins) {
      for (const p of made ?? []) if ('afterTick' in p) await p.afterTick(plugins)
    },
    close(plugins: Plugins) {
      for (const p of [...(made ?? [])].reverse()) if ('close' in p) p.close(plugins)
    },
  }
}
