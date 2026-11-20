// world3d: a place, as the library's pro-ng builds it, in a scene. A scene names its place and world3d hands every
// file pro-ng wrote for it to the plugin that uses it: the place is drawn and its moving things played by world3d's
// browser half (`world3d.plugin.ts`), and what is walked on, the ways, the looks, the course table and the hollows go
// to shapes3d, nav3d, supershader3d and lod3d through world3d's mods. The game adds its player and the things with
// rules of their own; nothing of the place is wired by hand. It has no row and no rule.
//
// `world.world3d`:
//   place  the place's name, pro-ng's for it (`smallville.town`): every file of it is an entry of the scene's loader
//          catalogue named the place, a dot and the part (`entry(world, part)`), each as pro-ng's build names the
//          file, `<place>.<part>.json` for the json ones and `<place>.glb` for the glb. A game's bake writes the
//          entries as it copies the files in.
//   playerStart  optional: the name of the place in the nav graph where the player starts, written as the place is
//          named in the place's solver output (`drum 1/outside the door`: the placed thing, then its nav place). A
//          game's bake hands it to the place's build as the override `<name with dots for slashes>.world3d_playerStart`
//          set to true, and that place in the nav graph comes out with `world3d_playerStart: true` in its data.
//          `playerStart(w)` returns that place, `{ name, at }`, for the game's player to read. A scene that names a
//          playerStart whose place does not say `world3d_playerStart` in the nav graph throws when it is read.
//
// The parts, `PARTS`, each an entry of its type, `preload`ed:
//   glb      `binary`: the place's geometry, every mesh of it in one glb, and its moving things' skin, animations and
//            morph targets (`world3d.place.ts`, the glb), drawn by the browser half.
//   looks    `json`: supershader3d's looks file of every material the place draws, handed to it by the `looks` mod
//            (`world3d.supershader3d.ts`). Its pictures are entries of their own, each named as the file names it.
//   clips    `json`: each moving thing's clips, `{ things: [{ thing, kind, clips: { <clip>: { about, how, start, loop,
//            seconds, animation? | poses? } } }] }` (`world3d.place.ts`, the clips), played by the browser half.
//   shapes3d `json`: shapes3d's shapes file, `{ kinds, shapes }`, what a body walks on and bumps into, handed to it by
//            the `shapes` mod (`world3d.shapes3d.ts`).
//   nav      `json`: nav3d's graph of the place's ways, handed to it as the graph `place` by the `graphs` mod
//            (`world3d.nav3d.ts`).
//   hollows  `json`: `[{ at, half }]`, a box round each building standing at elevation 0, handed to lod3d by the
//            `hollows` mod (`world3d.lod3d.ts`), so no grass, tree or stone is drawn inside one.
//   effects  `json`: `{ spawns: [{ effect, at, dir, node? }] }`, particle3d effects that burn for as long as the place
//            is drawn, each emitted by the browser half once particle3d holds every effect they name; one with a
//            `node` (a joint of the glb's skin) goes with that joint as the clips and poses move it.
//   crowd    `json`: the people the place's solvers made (stronghold's NAV.md, written by pro-ng's `town_nav.py`):
//            `verbs`, `[{ id, clips, type }]`, each verb's clips by the names the game's bodies play them by and its
//            type, `loiter`, done parked at a landmark, or `transfer`, done on a course between landmarks;
//            `activities`, `[{ id, verbs }]`; `landmarks`, `{ <whole name>: { at, yaw, activities } }`, where a
//            person's feet stand there, [x, y, z] metres, the way it faces, crowd3d's yaw, and the ids of the
//            activities done starting there; and `people`, `[{ person, model, chains, activities? }]`, each a
//            model a game draws by that name, its chains, each a list of landmarks by their whole names, and the
//            verbs it does in place of an activity's own, by the activity's id. The `world3d` row spawns them
//            (People, below).
//   hairs    `json`: the hair its kit things grow, `{ hairs, grows: [{ hair, thing, row, part, number }] }` (pro-ng's
//            `<place>.hairs.json`): each part that grows hair by its thing's row among the kit things and its number
//            in it, which the glb's kit vertices carry (their `lookInfo`'s second and third). Read only by a scene
//            listing hair3d, which grows it on world3d's wearers through world3d's `skins` mod (`world3d.hair3d.ts`).
// An entry the scene's catalogue has not throws where it is read, naming it.
//
// People. A scene whose place has people gives `world.world3d.people`, the kind each person is a row of, and one
// `world3d` actor. On its first step the `world3d` row spawns, over that kind's prefab, a row for each person,
// standing still at the first landmark of its first chain: `pos` and `to` the landmark's `at`, `yaw` its yaw, `body`
// its model, `clip` a clip of the first loiter verb the landmark has for it, any of the verb's at random (the
// prefab's with none),
// `chains`, `activities` its own verbs, `at` the landmark it is at, `going` the one it is at or going to, and
// `transfer` the transfer activity it does on a course ('' before one). It marks itself `peopled`, so it spawns them
// once. What a person then does is its kind's: an npc3d kind on world3d's behaviours (`world3d.npc3d.ts`), `loiter`
// and `transfer`.
//
// The scene's side:
//   "world3d": { "place": "smallville.town" },
//   "supershader3d": { "mods": { "looks": "world3d", "behaviors": ["world3d"] } },
//   "shapes3d": { "mods": { "shapes": ["world3d"] } },
//   "nav3d": { "mods": { "graphs": ["world3d"] } },
//   "lod3d": { "mods": { "hollows": ["world3d"] } },
// with `world3d` in `plugins` after supershader3d, render3d and particle3d's page halves are made, and the loader's
// entries of every part; and for its people, `world.world3d.people`, the `world3d` actor, its prefab
// `{ "peopled": false }`, `world3d` in the scene's `sim`, and `"npc3d": { "mods": { "behaviors": ["world3d"] } }`.
import type { Kind, W } from '#engine/engine.ts'
import { json } from '#plugins/loader/loader.sim.ts'

export const PARTS = ['glb', 'looks', 'clips', 'shapes3d', 'nav', 'hollows', 'effects', 'crowd', 'hairs'] as const
export type Part = (typeof PARTS)[number]

// The crowd file (People, above).
export type Verb = { id: string; clips: string[]; type: 'loiter' | 'transfer' }
export type Activity = { id: string; verbs: string[] }
// a point a person stands at, the way it faces there, and the activities done starting there
export type Landmark = { at: number[]; yaw: number; activities: string[] }
export type Person = { person: string; model: string; chains: string[][]; activities?: Record<string, string[]> }
export type Crowd = { verbs: Verb[]; activities: Activity[]; landmarks: Record<string, Landmark>; people: Person[] }

export const crowdOf = (w: W): Crowd => json(w, entry(w.world, 'crowd'))

// The verbs of `type` a person does for an activity: its own for it (`own`, by the activity's id), else the activity's.
export function verbsOf(crowd: Crowd, activity: string, own: Record<string, string[]>, type: Verb['type']): Verb[] {
  const ids = own[activity] ?? crowd.activities.find(a => a.id === activity)!.verbs
  return ids.map(id => crowd.verbs.find(v => v.id === id)!).filter(v => v.type === type)
}

// The activities of a landmark a person has verbs of `type` for.
export const activitiesAt = (crowd: Crowd, landmark: string, own: Record<string, string[]>, type: Verb['type']): string[] =>
  crowd.landmarks[landmark].activities.filter(a => verbsOf(crowd, a, own, type).length)

// The name of the nav3d graph of the place's ways.
export const GRAPH = 'place'

// The catalogue entry of the scene's place's part.
export const entry = (world: Record<string, any>, part: Part) => `${world.world3d.place}.${part}`

// The player's start (`world.world3d.playerStart`, above): the place of the nav graph whose data says
// `world3d_playerStart`, for any kind to read.
type NavPlace = { point: { at: number[] }; data?: Record<string, any> }
export function playerStart(w: W): { name: string; at: number[] } {
  const name: string = w.world.world3d.playerStart
  const nav: { places: NavPlace[] } = json(w, entry(w.world, 'nav'))
  const p = nav.places.find(q => q.data?.world3d_playerStart === true)
  if (!p) throw new Error(`world3d: no place of ${entry(w.world, 'nav')} says world3d_playerStart, the playerStart ${name}`)
  return { name, at: [...p.point.at] }
}

// The `world3d` row: the place's people spawned on its first step (People, above).
export const world3d: Kind = {
  tick(me, _dt, w) {
    if (me.data.peopled) return
    me.data.peopled = true
    const crowd = crowdOf(w)
    for (const p of crowd.people) {
      const at = p.chains[0][0]
      const l = crowd.landmarks[at]
      const own = p.activities ?? {}
      // standing on a clip of the first loiter verb its landmark has for it, any of the verb's at random, until it
      // first thinks
      const verb = activitiesAt(crowd, at, own, 'loiter').flatMap(a => verbsOf(crowd, a, own, 'loiter'))[0]
      w.spawn(w.world.world3d.people, {
        pos: [...l.at], to: [...l.at], yaw: l.yaw, body: p.model, ...(verb ? { clip: verb.clips[Math.floor(w.die() * verb.clips.length)] } : {}),
        chains: p.chains.map(c => [...c]), activities: { ...own }, at, going: at, transfer: '',
      })
    }
  },
}
