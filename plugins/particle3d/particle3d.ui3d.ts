// particle3d's mod for ui3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.ui3d.mods: { behaviors: [..., 'particle3d'] }` gives every ui3d look the word `particles`: effects
// of particle3d's effects file kept running on the thing for as long as it is shown, driven by its state:
//
//   { "at": [0, 0.2, -3], "select": true,
//     "particles": [{ "effect": "embers", "at": [0, 0.3, 0], "drivers": { "heat": "selected" } }] }
//
// `particles` is a list, each `{ effect, at, drivers? }`: `effect` the effect's name, thrown the first frame
// the thing is shown; `at` [x, y, z] metres off the thing's middle in its holder's frame, which moves, turns
// and sways with it, its point written there every frame; and `drivers`, each a driver of the effects file
// by name and the state of the thing it is held at every frame, for this effect alone (particle3d's
// header, Drivers):
//
//   selected   1 while the thing is the selected one (the pointer came onto it, or a key moved to it), else 0
//   chosen     1 while any thing of the menu is selected, else 0
//   age        the seconds since the thing was first shown
//
// The effects file says what each driver does to the effect, its numbers expressions of them, so a thing
// whose embers rise faster while it is hovered names `{ "rise": "selected" }` and the file's layer says
// `"speed": ["1 + 3 * rise", "2 + 3 * rise"]`.
//
// Each effect runs for as long as the thing is shown: ui3d takes the thing's holder out of its overlay the
// first frame nobody shows it, and that frame (three's `removed` on the holder) every effect of it is over,
// its particles living out their lives. A thing shown again after that is new, and its effects are thrown
// again.
//
// particle3d is listed in the scene, after ui3d, so it moves and draws the effects the frame their points
// are written, and before render3d. Its particles are drawn in the world, under ui3d's overlay.
import type * as THREE from 'three'
import type { Behaviors, Placed } from '#plugins/ui3d/ui3d.plugin.ts'
import type { Effect } from './particle3d.plugin.ts'

type One = { effect: string; at: number[]; drivers?: Record<string, string> }
const STATES = ['selected', 'chosen', 'age'] as const
type State = (typeof STATES)[number]

const value = (state: State, it: Placed) => (state === 'age' ? it.age : it[state] ? 1 : 0)

// Each thing's running effects, by its holder, in the order its `particles` gives them.
const running = new WeakMap<THREE.Group, Effect[]>()
// The holders whose `removed` ends their effects.
const ending = new WeakSet<THREE.Group>()

export function behaviors(): Behaviors {
  return {
    particles(list: One[], it: Placed) {
      if (!Array.isArray(list)) throw new Error(`ui3d's ${it.key} particles ${JSON.stringify(list)} are not a list of { effect, at, drivers? }`)
      const fx3 = it.plugins.particle3d
      it.holder.updateMatrixWorld()
      let fxs = running.get(it.holder)
      list.forEach((one, i) => {
        for (const k of Object.keys(one)) if (!['effect', 'at', 'drivers'].includes(k)) throw new Error(`ui3d's ${it.key} particles ${i} has ${k}, and it is { effect, at, drivers? }`)
        if (!(Array.isArray(one.at) && one.at.length === 3)) throw new Error(`ui3d's ${it.key} particles ${i} at ${JSON.stringify(one.at)} is not [x, y, z]`)
        for (const [name, state] of Object.entries(one.drivers ?? {}))
          if (!STATES.includes(state as State)) throw new Error(`ui3d's ${it.key} particles ${i} drives ${name} by ${JSON.stringify(state)}, and a thing's state is one of ${STATES.join(', ')}`)
      })
      const at = (one: One) => it.holder.localToWorld(new it.T.Vector3().fromArray(one.at)).toArray()
      // a look whose list now names other effects: the old ones' lives are over, and the new ones thrown
      if (fxs && (fxs.length !== list.length || fxs.some((fx, i) => fx.name !== list[i].effect))) {
        for (const fx of fxs) fx.life = fx.age
        running.delete(it.holder)
        fxs = undefined
      }
      if (!fxs) {
        if (!list.every(one => fx3.has(one.effect))) return
        running.set(it.holder, (fxs = list.map(one => fx3.emit(one.effect, at(one), { life: Infinity }))))
        if (!ending.has(it.holder)) {
          ending.add(it.holder)
          it.holder.addEventListener('removed', () => {
            for (const fx of running.get(it.holder) ?? []) fx.life = fx.age
            running.delete(it.holder)
          })
        }
      }
      list.forEach((one, i) => {
        const fx = fxs![i]
        fx.at = at(one)
        for (const [name, state] of Object.entries(one.drivers ?? {})) fx.drivers[name] = value(state as State, it)
      })
    },
  }
}
