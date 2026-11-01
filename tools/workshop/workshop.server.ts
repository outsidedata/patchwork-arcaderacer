// The asset workshop's server: where a game's props are made and fitted to the game, with no game
// running. Run as
//
//   node --experimental-strip-types tools/workshop/workshop.server.ts
//
// and open http://localhost:5180/?game=<game>. A game is read from its own files and nothing else:
// its manager scene, `games/<game>/<game>.scene.json`, and each scene that names (`scenemanager`'s
// `scenes`), or the manager alone when it names none, each scene loaded whole by scenemanager's own
// `child` (`loaded.ts`): the manager's world and prefabs under it, and the partial it `extends`
// between, so a model, a body or an IK a scene has from its partial is found. The workshop writes back
// into those same files, a value into the file that gives it (a scene's, or its partial's),
// so what it shows and what the game plays never disagree, and moving a prop to another game is
// writing that game's files. A game's models are of two kinds: a glb (a loader `model`), which a body
// can hold and whose empties are its mount points, and a solids model (a loader `json` the solids
// plugin's meshes are made from, drawn by the solids plugin or by the game's own plugins through it),
// whose nodes and empties are its points. A machine with interactions is of two kinds: a solids model
// (mech's jimmy), whose points are its empties, written into its json (`/api/frames`), or a vehicle of
// box3dvehicle's fleet (vehicles's jeep), whose points are its look's `points`, written into the scene
// file that gives the look (`/api/vehicle`). A game's moves, the body against the things of its level,
// are made by its own code (`<game>.workshop.ts`), which the page imports and runs on the game's scene;
// so are the models it marks, drawn by its own plugins, whose points and sizes are kept in a points file
// beside each glb (`/api/beside`), since the glb is written again from elsewhere.
//
// It serves:
//   /                    the page, `workshop.html`, and `/<name>.ts` of this folder with its types
//                        stripped (node's `stripTypeScriptTypes`), so the page is TypeScript.
//   /three/…             `node_modules/three`.
//   /npm/…               `node_modules`, for the packages core's browser code imports by name
//                        (the loader's `fflate` and `fzstd`), which the page's import map points here.
//   /engine/…, /plugins/…, /addons/…   core's own files, `.ts` with its types stripped: the page
//                        draws with the game's own plugins, loader, anim, ik3d and render3d, and
//                        loads the mods its scene names through scenemanager's `prepare`.
//   /games/…             a game's files as they are, which the game's catalogue names by these paths.
//   …`.ts?instance`      any of those `.ts` made into a file that hands out a fresh copy of itself
//                        (`scripts/instance.ts`), as the dev server serves a kind's look, so the page
//                        draws each row by a copy of its own (`engine/browser.ts`'s `drawing`).
//   /packs/<pack>/<clip>.fbx   a clip of the Mixamo packs (`PATCHWORK_CLIPS`), read no deeper than a pack.
//   /poses               the pose lab, `poses.html` (`poses.ts`).
//   /ui                  the UI workshop, `ui.html` (`ui.ts`): a game's title screen, HUD and messages
//                        drawn by the game's own looks on core's ui plugin, tuned and saved, no game running.
//   /particles           the particle workshop, `particles.html` (`particles.ts`): a game's particle effects
//                        played by core's particle3d on a stage, each layer tuned live and saved, no game running.
//   /library/characters/…   the library's rigged characters (`PATCHWORK_LIBRARY`, else ~/patchwork-library),
//                        each `characters/<name>/<name>.fbx` and the textures beside it, the bodies the
//                        pose lab poses.
// Every path is resolved inside its folder, and one that resolves outside it is refused.
//
// It answers:
//   GET  /api/games            the games: each folder of `games/` with its manager scene.
//   GET  /api/game/<game>      the game as the page draws it (`summary`).
//   GET  /api/packs            each pack and its clips.
//   GET  /api/notes?file=<path>, POST (a note), PATCH /api/notes/<n>?file=<path> (`status`, `reply`):
//                              a model's notes, `<stem>.notes.json` beside its file: its glb, or its
//                              solids model's json (`strider.model.json`, `strider.model.notes.json`).
//                              A note is `{ text, at, mesh, material, camera }`: the point in the
//                              model's frame, the mesh (a solids model's: the node its part hangs in)
//                              and the material (a solids model's: the paint), and the camera.
//   GET  /api/points?file=<path>, POST `{ points }`: a glb's empties, read and written in it (`glb.ts`).
//   GET  /api/beside?file=<glb>, POST `{ points?, sizes?, drop? }`: a glb's points file, `<stem>.points.json`
//                              beside it (`beside.ts`), where a game keeps what is marked on a model
//                              that is written again from elsewhere (canyonracer's podracers, written
//                              by Blender): `{ points: { <name>: { at, turn } }, sizes: { <name>: n } }`,
//                              read as empty where there is no file yet; a POST takes out each point
//                              `drop` names, sets each point and size it names, keeps the rest, and
//                              writes the file a point a line.
//   GET  /api/frames?file=<path>, POST `{ nodes?, empties?, turns? }`: a solids model's nodes (`at`,
//                              `turn` [rx, ry] radians), empties and the empties' turns (quaternions,
//                              as a glb's), read and written in its json in place, its layout kept
//                              (`solids.ts`); a node or an empty it lacks is added.
//   POST /api/fit/<game>       `{ body, prop, hold?, ik? }`: how a body holds a prop, written for
//                              every scene of the game that draws the body and has the prop, into the
//                              file that gives each value, a scene's or its partial's (`fitting`,
//                              `scenes.ts`'s `fit`), adding the prop to a body that held none; a 409
//                              when a partial's scene draws the body and lacks the prop.
//   POST /api/bring/<game>     `{ from, key, body?, like? }`: the glb model `key` of the game `from` brought
//                              into this one: its glb copied to `games/<game>/assets/`, a catalogue
//                              entry of that key added to every scene file and partial that draws
//                              with anim, and with a
//                              `body`, that body given it held as `from`'s body `like` held it (its
//                              hold and its IK), the starting point to fit it from.
//   GET  /api/vehicle/<game>/<vehicle>, POST `{ empties?, turns? }`: a box3dvehicle vehicle's points,
//                              its look's `points` (`summary`'s `vehicles`), read as a solids model's
//                              frames are, `{ nodes: {}, empties, turns }` (each point's `at` in the
//                              chassis's frame, and the quaternion `turn` of each that gives one), and
//                              written in place into every file that gives the look (`vehicleFiles`,
//                              `scenes.ts`'s `points`), its layout kept; a point it lacks is added. The
//                              POST hands back the points and `written`, the files it changed.
//   POST /api/interaction?file=<path>   an interaction (`plugins/interact`), checked and written into
//                              its `.interaction.json`, each step on lines of its own.
//   POST /api/machine?file=<path>   `{ machine, name, poses }`: what the machine does in each step of
//                              its interaction `name`, `{ <step>: { <field>: number } }` (mech's jimmy's
//                              `kneel`), written in place into the game's definitions file (`world.defs`,
//                              `scenes.ts`'s `poses`), its layout kept. Hands back the definition's
//                              `interact.<name>` as the file now holds it.
//   POST /api/bake/<game>      `{ body, clip: "pack:<pack>/<file>", name }`: a pack clip added to the
//                              body's rig as `name` and every body of the rig baked again (`baking`).
//   GET  /api/characters       the library's rigged characters: each `{ name, fbx }`, its FBX's path
//                              under the library.
//   GET  /api/poses            the pose lab's clips, each FBX of the packs folder's `poses` pack:
//                              `{ name, fbx, poses }`, its name, its path under the packs folder, and
//                              its sidecar's `poses` (`<name>.poses.json` beside it), frame to name.
//   POST /api/poses            `{ name, body, rest, poses: [{ name, bones, hips }] }`: the lab's poses
//                              written as one clip, `poses/<name>.fbx` in the packs folder, by Blender
//                              (`poses.export.py`, whose header says what `body`, `rest` and each pose
//                              hold), and its sidecar beside it, `<name>.poses.json`,
//                              `{ "poses": { "<frame>": "<pose>" } }`, a pose a frame from 0. Hands
//                              back what `GET /api/poses` gives of it.
//   GET  /api/ui/<game>        the game's UI as the UI workshop draws it (`uiSummary`): its screens file,
//                              and each scene with a `world.ui`, the file giving it and its definitions file.
//   POST /api/ui/<game>        `{ edits: [{ file, path, value }] }`: each value set in place at `path` in
//                              a scene's ui file or its definitions file (`scenes.ts`'s `set`), the
//                              layout kept, every file written only once every edit applied. Hands back
//                              `written`, the files changed.
//   GET  /api/particles/<game> the game's effects files as the particle workshop draws them
//                              (`particlesSummary`): each file, its scenes, what it holds and the stage.
//   POST /api/particles/<game> `{ file, effects: { <name>: [layers] } }`: each effect's layers set in place
//                              in the effects file, the layout kept, checked by particle3d's own `check`
//                              before it is written. Hands back `written`.
//   GET  /api/events           server-sent events: `changed <path>` for each file of `games/` written,
//                              150 ms after its last write, so a half-written export is not read.
// `start({ port, root, packs, library })` runs it on any port against any root, which is how its test
// runs it.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { stripTypeScriptTypes } from 'node:module'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import { execFile, execFileSync } from 'node:child_process'
import { check, type Interaction, type Step } from '../../plugins/interact/interact.sim.ts'
import { check as particleCheck } from '../../plugins/particle3d/particle3d.plugin.ts'
import { instanced } from '../../scripts/instance.ts'
import { readPoints, writePoints, type Point } from './glb.ts'
import { besideOf, readBeside, setBeside } from './beside.ts'
import { catalogue, fit, listed, points, poses, set, type Hold } from './scenes.ts'
import { framesOf, setFrames, solid } from './solids.ts'

export type Note = {
  id: number; text: string; at: number[]; mesh: string; material: string
  camera: { position: number[]; target: number[]; fov: number }
  status: 'open' | 'fixed'; reply: string; made: string
}

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/javascript', '.json': 'application/json',
  '.cjs': 'text/javascript', '.glb': 'model/gltf-binary', '.fbx': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.bin': 'application/octet-stream', '.wasm': 'application/wasm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
}

const DEBOUNCE = 150

// The top-level plugins a solids model's stand-in carries beside its drawers when a drawer's mod names
// one and the scene lists it: audio, which a drawer hears through (mech's legs3d), made on the page and
// never ticked, so nothing of the game's ledger, cues or loops plays on a still row; and the store
// that comes with it.
const CARRIED = ['audio']

// The script that loads a game's scenes, beside this file whatever root the server runs against.
const LOADED = fileURLToPath(new URL('./loaded.ts', import.meta.url))

// Node's `stripTypeScriptTypes` in its `transform` mode, which node 22 runs and the installed
// `@types/node` does not list (it names only `strip`).
const transform = stripTypeScriptTypes as unknown as (code: string, options: { mode: 'transform'; sourceUrl: string }) => string

type Json = any

export function start({ port, root, packs: given, library }: { port: number; root: string; packs?: string; library?: string }): Promise<{ url: string; close(): Promise<void> }> {
  const here = path.join(root, 'tools/workshop')
  const gamesDir = path.join(root, 'games')
  // The root's `.env` (`.env.example` lists it: `BLENDER` for a bake), under what the shell set.
  if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'))
  // The Mixamo packs, `packs/` in the clip collection (`PATCHWORK_CLIPS`, else ~/troupe-collection), each
  // a folder of FBX clips. Only this folder and the folders directly in it are read, so the held view can
  // try any pack clip on a body before it is baked.
  const packs = given ?? path.join((process.env.PATCHWORK_CLIPS ?? '~/troupe-collection').replace(/^~(?=$|\/)/, os.homedir()), 'packs')
  // The library, whose rigged characters the pose lab poses.
  const lib = library ?? (process.env.PATCHWORK_LIBRARY ?? '~/patchwork-library').replace(/^~(?=$|\/)/, os.homedir())
  const characters = path.join(lib, 'characters')

  // A path under `base`, or undefined when it resolves outside it.
  function inside(base: string, rel: string) {
    const full = path.resolve(base, rel)
    return full === base || full.startsWith(base + path.sep) ? full : undefined
  }
  const read = (file: string): Json => JSON.parse(fs.readFileSync(file, 'utf8'))

  // ---- a game, from its files ----

  // The game's scenes as the game loads them (`loaded.ts`, scenemanager's `child` in a process of its
  // own): each scene its manager names, by name, its file, its partial's file when it extends one, and
  // the whole scene, the manager's world and prefabs and its partial's under its own; or the manager
  // alone.
  type Loaded = { name: string; file: string; partial?: string; scene: Json }
  function scenesOf(game: string): Loaded[] {
    const dir = inside(gamesDir, game)
    if (!dir || !/^[\w-]+$/.test(game)) throw new Error(`no game ${game}`)
    const manager = path.join(dir, `${game}.scene.json`)
    if (!fs.existsSync(manager)) throw new Error(`no game ${game}`)
    try {
      return JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', LOADED, manager], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
    } catch (e) {
      throw new Error(`${game}'s scenes do not load: ${(e as { stderr?: string }).stderr?.trim() || (e as Error).message}`)
    }
  }

  // The repo path of a file a catalogue url names (`/games/<game>/…`).
  const fileOf = (url: string) => url.replace(/^\//, '')

  // A `json` file of a game's catalogue, parsed, or undefined when it is missing or does not parse.
  function jsonOf(url: string, cache: Map<string, Json>) {
    if (!cache.has(url)) {
      const full = inside(root, fileOf(url))
      let v: Json
      try { v = full && full.startsWith(gamesDir + path.sep) ? read(full) : undefined } catch { v = undefined }
      cache.set(url, v)
    }
    return cache.get(url)
  }

  // A game's own plugin draws solids models when its browser half makes meshes through the solids
  // plugin it is handed (`plugins.solids.meshes(`, or any name for `plugins` before `.solids.meshes(`).
  function drawsSolids(game: string, name: string) {
    const file = inside(path.join(gamesDir, game, 'plugins'), `${name}/${name}.plugin.ts`)
    return !!file && fs.existsSync(file) && /\.solids\.meshes\(/.test(fs.readFileSync(file, 'utf8'))
  }

  // Every string at a key `model` in a definition, with its path from the definition's kind:
  // `strider.model`, `strider.cabin.model`.
  function modelsIn(defs: Json): { kind: string; path: string; key: string }[] {
    const out: { kind: string; path: string; key: string }[] = []
    const walk = (v: Json, kind: string, at: string) => {
      if (!v || typeof v !== 'object') return
      for (const [k, x] of Object.entries(v)) {
        if (k === 'model' && typeof x === 'string') out.push({ kind, path: `${at}.model`, key: x })
        else walk(x, kind, `${at}.${k}`)
      }
    }
    if (defs && typeof defs === 'object') for (const [kind, d] of Object.entries(defs)) walk(d, kind, kind)
    return out
  }

  // The game as the page draws it:
  //   scenes   every scene's name.
  //   world    what the page builds its stand-in scene from: the catalogue every scene has (the
  //            union, each key's first entry), anim's numbers with every kind any scene draws, ik3d's
  //            kinds, render3d's prefab (the first scene's that draws with anim, else the manager's),
  //            and the engine's step.
  //   models   every model the game draws, each `{ key, url, file, type, scenes, open }`: its catalogue
  //            key and url, its file as a repo path, what it is, the scenes whose catalogue has it, and
  //            its count of open notes. `type` is `glb`, a `model` entry, or `solids`, a `json` entry
  //            whose file is a solids model (`solids.ts`), which a solids model also carries:
  //              named   `[{ by, kind, path, scenes }]`, how the game finds it: `by` `solids` for a
  //                      kind of `world.solids.kinds` (the solids plugin draws its rows from it), `defs`
  //                      for a string at `path` in the definition of `kind` in the scene's `world.defs`
  //                      (`strider.model`, `strider.cabin.model`), which a game's own plugin reads.
  //              stand   how the page draws it, as the game draws it, from the first scene that can:
  //                      `{ scene, kind, by, defs, drawers, world }`, one row of `kind` (the solids
  //                      plugin's kind when `by` is `solids`; else the kind whose definition's own
  //                      `model` it is) drawn by the solids plugin and the scene's own plugins that draw
  //                      solids models (`drawers`, in its `world.shipped.plugins` order), each one's
  //                      `world.<p>` in `world` (and each carried plugin's), its mods kept where they name a drawer or a plugin the
  //                      stand-in carries (CARRIED) that the scene lists; `order`, `shipped` and the
  //                      plugins carried, in the scene's order (audio named by a mod, as legs3d's mech
  //                      look hears through it, and with it the store when the scene lists one, its
  //                      keys how loud); `store`, the scene's store prefab when the store is carried;
  //                      undefined when no scene names it so.
  //            A solids model no scene finds as either is listed with `named` empty: the game has it
  //            in its catalogue and nothing of the game's draws it.
  //   bodies   every anim kind: its model and rig, the scenes that draw it, what it holds (`props`),
  //            its IK, and `drift`, the scenes whose anim kind or IK for it is not the first scene's.
  //   interactions   every interaction of `world.interact.kinds` (`plugins/interact`), from the first
  //            scene that has it and builds its machine with a `fit`, else the first that has it: `{ scene, machine, name, key, url, file, body, fit, poses }`: the
  //            machine's kind and the interaction's name, its catalogue key, url and file, the anim kind
  //            of the body that plays it (the file's `body`); `fit`, how the scene fits the machine, the
  //            `fit` of the actor that builds one (an actor whose `is` is the machine's kind, or one with
  //            a field naming it, as mech's `start` names its `mech`), so its modules are drawn; and
  //            `poses`, what the machine does in each step, its definition's `interact.<name>` (mech's
  //            jimmy kneels), `{ <step>: { <field>: value } }`, and `defs`, the definitions file that
  //            gives them (null for a scene with none), which a save of them writes; and `mods`, the
  //            scene's `world.interact.mods`, the plugin that hands interact the machine's points.
  //   vehicles every vehicle of box3dvehicle's fleet (`world.box3dvehicle.vehicles`) a scene has
  //            interactions for: a scene that lists `box3dvehicle` in its `plugins` and gives
  //            `world.interact.kinds.box3dvehicle`, each vehicle a machine of the kind `box3dvehicle`,
  //            whose interactions are every vehicle's. From the first such scene that has it:
  //            `{ name, scene, files, model, plugins, world }`: the vehicle's name; the scene; `files`,
  //            the files that give its look (`vehicleFiles`), which a save of its points writes; `model`,
  //            its look's model's catalogue key, or null for a look drawn in code; and how the page
  //            draws it still, as the game draws it: `plugins`, the look plugins it lists for it,
  //            `box3dvehicle` and, when the scene lists `particle3d` and the look has an exhaust or dust,
  //            `particle3d`; and `world`, their numbers: `box3dvehicle`, the scene's fleet with this
  //            vehicle alone and no `mods` (no gravity, no land: nothing moves it, no dust and no tracks
  //            are thrown), and with `particle3d`, the scene's `world.particle3d`.
  //   workshop the url of the game's own workshop file, `games/<game>/<game>.workshop.ts`, when it has
  //            one: its moves (the page's Moves) and the models it marks (the page's Marks).
  function summary(game: string) {
    const scenes = scenesOf(game).map(s => ({ ...s, json: s.scene }))
    const managerFile = path.join(gamesDir, game, `${game}.scene.json`)
    const manager = read(managerFile)
    const assets: Record<string, Json> = {}
    const anim: Json = { kinds: {} }
    const ik3d: Json = { kinds: {} }
    const files = new Map<string, Json>()
    type Named = { by: 'solids' | 'defs'; kind: string; path: string; scenes: string[] }
    type Stand = { scene: string; kind: string; by: 'solids' | 'defs'; defs?: string; drawers: string[]; world: Record<string, Json>; order?: string[]; store?: Json }
    const models = new Map<string, { key: string; url: string; file: string; type: 'glb' | 'solids'; scenes: string[]; named?: Named[]; stand?: Stand }>()
    const bodies = new Map<string, { kind: string; model: string; rig: string; scenes: string[]; first: string; ikFirst: string; drift: string[] }>()
    const interactions = new Map<string, { scene: string; machine: string; name: string; key: string; url: string; file: string; body: string; fit: Json; poses: Json; defs: string | null; mods: Json }>()
    const vehicles = new Map<string, { name: string; scene: string; files: string[]; model: string | null; plugins: string[]; world: Record<string, Json> }>()
    let render3d: Json
    for (const s of scenes) {
      const w = s.json.world ?? {}
      const lists = (p: string) => ((s.json.plugins ?? []) as string[]).includes(p)
      if (lists('box3dvehicle') && w.interact?.kinds?.box3dvehicle && w.box3dvehicle?.vehicles) {
        for (const [name, v] of Object.entries(w.box3dvehicle.vehicles as Record<string, Json>)) {
          if (vehicles.has(name)) continue
          const smokes = lists('particle3d') && !!(v.look?.exhaust?.length || v.look?.dust)
          const fleet = { ...w.box3dvehicle, vehicles: { [name]: v } }
          delete fleet.mods
          vehicles.set(name, {
            name, scene: s.name, files: vehicleFiles(game, name, scenes).map(f => path.relative(root, f)), model: v.look?.model?.asset ?? null,
            plugins: ['box3dvehicle', ...(smokes ? ['particle3d'] : [])],
            world: { box3dvehicle: fleet, ...(smokes ? { particle3d: w.particle3d } : {}) },
          })
        }
      }
      const defsOf = typeof w.defs === 'string' && w.loader?.assets?.[w.defs]?.type === 'json' ? jsonOf(w.loader.assets[w.defs].url, files) : undefined
      for (const [machine, all] of Object.entries((w.interact?.kinds ?? {}) as Record<string, Record<string, string>>)) {
        for (const [name, key] of Object.entries(all)) {
          const a = w.loader?.assets?.[key]
          const builder = ((s.json.actors ?? []) as Json[]).find(x => x.is === machine || Object.entries(x).some(([k, v]) => k !== 'is' && v === machine))
          // The first scene that builds the machine, else the first that has the interaction.
          const had = interactions.get(`${machine}.${name}`)
          if ((had && (Object.keys(had.fit).length || !builder?.fit)) || a?.type !== 'json') continue
          interactions.set(`${machine}.${name}`, {
            scene: s.name, machine, name, key, url: a.url, file: fileOf(a.url), body: jsonOf(a.url, files).body,
            fit: builder?.fit ?? {}, poses: defsOf?.[machine]?.interact?.[name] ?? {},
            defs: defsOf ? fileOf(w.loader.assets[w.defs].url) : null, mods: w.interact.mods ?? {},
          })
        }
      }
      const catalogued = (w.loader?.assets ?? {}) as Record<string, Json>
      for (const [key, a] of Object.entries(catalogued)) {
        if (!(key in assets)) assets[key] = a
        const type = a.type === 'model' ? 'glb' : a.type === 'json' && solid(jsonOf(a.url, files)) ? 'solids' : undefined
        if (!type) continue
        const m = models.get(key) ?? { key, url: a.url, file: fileOf(a.url), type, scenes: [] as string[], ...(type === 'solids' ? { named: [] as Named[] } : {}) }
        m.scenes.push(s.name)
        models.set(key, m)
      }
      // How this scene finds each solids model: the solids plugin's kinds, and the definitions' models.
      const name = (key: string, n: Omit<Named, 'scenes'>) => {
        const m = models.get(key)
        if (m?.type !== 'solids' || catalogued[key]?.type !== 'json') return
        const had = m.named!.find(x => x.by === n.by && x.kind === n.kind && x.path === n.path)
        if (had) had.scenes.push(s.name)
        else m.named!.push({ ...n, scenes: [s.name] })
      }
      const drawers = ((w.shipped?.plugins ?? []) as string[]).filter(p => drawsSolids(game, p))
      const listsSolids = ((s.json.plugins ?? []) as string[]).includes('solids')
      for (const [kind, key] of Object.entries((w.solids?.kinds ?? {}) as Record<string, string>)) {
        name(key, { by: 'solids', kind, path: `world.solids.kinds.${kind}` })
        const m = models.get(key)
        if (m?.type === 'solids' && !m.stand && listsSolids) m.stand = { scene: s.name, kind, by: 'solids', drawers: [], world: {} }
      }
      const defsKey = typeof w.defs === 'string' ? w.defs : undefined
      const defs = defsKey && catalogued[defsKey]?.type === 'json' ? jsonOf(catalogued[defsKey].url, files) : undefined
      for (const d of modelsIn(defs)) {
        name(d.key, { by: 'defs', kind: d.kind, path: d.path })
        const m = models.get(d.key)
        if (m?.type === 'solids' && !m.stand && listsSolids && drawers.length && d.path === `${d.kind}.model`) {
          // Each drawer's numbers, with the mods it names kept only where the plugin they name draws too,
          // or is one the stand-in carries (CARRIED) and the scene lists.
          const listed = (s.json.plugins ?? []) as string[]
          const kept = (x: string) => drawers.includes(x) || (CARRIED.includes(x) && listed.includes(x))
          const world: Record<string, Json> = {}
          const carried = new Set<string>()
          for (const p of drawers) {
            const block = structuredClone(w[p] ?? {})
            if (block.mods) block.mods = Object.fromEntries(Object.entries(block.mods as Record<string, string | string[]>)
              .map(([f, a]) => [f, (Array.isArray(a) ? a : [a]).filter(kept)] as const)
              .filter(([, a]) => a.length).map(([f, a]) => [f, a.length === 1 ? a[0] : a]))
            for (const x of Object.values((block.mods ?? {}) as Record<string, string | string[]>).flat()) if (!drawers.includes(x)) carried.add(x)
            world[p] = block
          }
          // A sound is heard at a loudness the store's keys hold, so the store comes with the audio.
          if (carried.has('audio') && listed.includes('store')) carried.add('store')
          for (const p of carried) if (w[p] !== undefined) world[p] = structuredClone(w[p])
          const order = listed.filter(p => p === 'shipped' || carried.has(p))
          const store = carried.has('store') ? s.json.prefabs?.store ?? {} : undefined
          m.stand = { scene: s.name, kind: d.kind, by: 'defs', defs: defsKey, drawers, world, order, ...(store ? { store } : {}) }
        }
      }
      if (!w.anim) continue
      render3d ??= s.json.prefabs?.render3d
      for (const [k, v] of Object.entries(w.anim)) if (k !== 'kinds' && !(k in anim)) anim[k] = v
      for (const [kind, k] of Object.entries((w.anim.kinds ?? {}) as Record<string, Json>)) {
        const ik = w.ik3d?.kinds?.[kind]
        const text = JSON.stringify(k), ikText = JSON.stringify(ik ?? null)
        const b = bodies.get(kind)
        if (!b) {
          anim.kinds[kind] = k
          if (ik) ik3d.kinds[kind] = ik
          bodies.set(kind, { kind, model: k.model, rig: k.rig, scenes: [s.name], first: text, ikFirst: ikText, drift: [] })
        } else {
          b.scenes.push(s.name)
          if (text !== b.first || ikText !== b.ikFirst) b.drift.push(s.name)
        }
      }
    }
    render3d ??= manager.prefabs?.render3d
    const engine = manager.prefabs?.scenemanager?.dt ? { dt: manager.prefabs.scenemanager.dt } : scenes[0]?.json.prefabs?.engine ?? {}
    return {
      game,
      scenes: scenes.map(s => s.name),
      world: { loader: { assets }, anim, ik3d: { mods: { body: 'anim' }, kinds: ik3d.kinds } },
      render3d,
      engine,
      models: [...models.values()].map(m => ({ ...m, open: readNotes(m.file).filter(n => n.status === 'open').length })),
      bodies: [...bodies.values()].map(({ first, ikFirst, ...b }) => ({ ...b, props: anim.kinds[b.kind].props ?? [], ik: ik3d.kinds[b.kind] })),
      interactions: [...interactions.values()],
      vehicles: [...vehicles.values()],
      ...(fs.existsSync(path.join(gamesDir, game, `${game}.workshop.ts`)) ? { workshop: `/games/${game}/${game}.workshop.ts` } : {}),
    }
  }

  // ---- a box3dvehicle vehicle's points ----

  // The files that give the vehicle `name`'s look to the game's scenes: for each scene whose world has
  // it, the first of its own file, its partial and the manager whose own `world` gives `box3dvehicle`
  // (a child's `world.box3dvehicle` is the whole of it, over the manager's), when that one's fleet has
  // the vehicle's look. Absolute paths, each once.
  function vehicleFiles(game: string, name: string, scenes: Loaded[] = scenesOf(game)): string[] {
    const manager = path.join(gamesDir, game, `${game}.scene.json`)
    const own = (f: string) => read(f).world?.box3dvehicle
    const out = new Set<string>()
    for (const s of scenes) {
      if (!s.scene.world?.box3dvehicle?.vehicles?.[name]) continue
      const giver = [s.file, s.partial, manager].find(f => f && own(f))
      if (giver && own(giver).vehicles?.[name]?.look) out.add(giver)
    }
    return [...out]
  }
  // A vehicle's points as the first scene that has it gives them, as a solids model's frames are
  // read: `{ nodes: {}, empties, turns }`, each point's `at` and the `turn` of each that gives one.
  function vehicleFrames(game: string, name: string) {
    const s = scenesOf(game).find(x => x.scene.world?.box3dvehicle?.vehicles?.[name])
    if (!s) return undefined
    const pts = (s.scene.world.box3dvehicle.vehicles[name].look?.points ?? {}) as Record<string, Json>
    return {
      nodes: {},
      empties: Object.fromEntries(Object.entries(pts).map(([n, p]) => [n, Array.isArray(p) ? p : p.at])),
      turns: Object.fromEntries(Object.entries(pts).flatMap(([n, p]) => (!Array.isArray(p) && p.turn ? [[n, p.turn]] : []))),
    }
  }

  // ---- notes, points and frames, by a model's file ----

  // A file of a game, by its repo path, ending in `ext`, or undefined.
  function gameFile(rel: string | null, ext: string) {
    if (!rel || !rel.endsWith(ext) || !rel.startsWith('games/')) return undefined
    const full = inside(root, rel)
    return full && full.startsWith(gamesDir + path.sep) && fs.existsSync(full) ? full : undefined
  }
  const glbFile = (rel: string | null) => gameFile(rel, '.glb')
  // A solids model's file: a `.json` of a game that is a solids model.
  function solidsFile(rel: string | null) {
    const full = gameFile(rel, '.json')
    if (!full || full.endsWith('.notes.json')) return undefined
    try { return solid(read(full)) ? full : undefined } catch { return undefined }
  }
  // A model's file: its glb, or its solids model's json.
  const modelFile = (rel: string | null) => glbFile(rel) ?? solidsFile(rel)
  // A model's notes, beside it: `<stem>.notes.json`, its stem its name less `.glb` or `.json`.
  const notesFile = (rel: string) => path.join(root, rel.replace(/\.(glb|json)$/, '.notes.json'))
  const readNotes = (rel: string): Note[] => fs.existsSync(notesFile(rel)) ? read(notesFile(rel)) : []
  const writeNotes = (rel: string, notes: Note[]) => fs.writeFileSync(notesFile(rel), JSON.stringify(notes, null, 2) + '\n')

  // ---- writing a game's scenes ----

  // Each file edited by `change`, which hands back the new text or undefined to leave it; the files
  // changed, as repo paths.
  function edit(files: string[], change: (text: string, file: string) => string | undefined) {
    const out: string[] = []
    for (const file of new Set(files)) {
      const text = fs.readFileSync(file, 'utf8')
      const now = change(text, file)
      if (now === undefined || now === text) continue
      JSON.parse(now) // never write a file that does not parse
      fs.writeFileSync(file, now)
      out.push(path.relative(root, file))
    }
    return out
  }
  // Every file the game's scenes are read from: each scene's own, and the partial it extends.
  const filesOf = (scenes: Loaded[]) => scenes.flatMap(s => (s.partial ? [s.file, s.partial] : [s.file]))

  // How the body holds the prop, written where each scene that draws the body and has the prop (as the
  // game loads it) is given those numbers: the hold into the file whose own `world.anim.kinds` has the
  // body, the scene's or else its partial's; the IK into the scene's own file when it gives its own
  // `world.ik3d.kinds.<body>`, else its partial's when that does, else beside the hold; and `ik3d` into
  // the scene's `plugins`. A partial is written once for every scene that extends it, so a scene that
  // draws the body from the partial and lacks the prop refuses the fit: it would hang a model it has not.
  function fitting(game: string, f: { body: string; prop: string; hold?: Hold; ik?: unknown }) {
    const scenes = scenesOf(game)
    const draws = (s: Loaded) => !!s.scene.world?.anim?.kinds?.[f.body]
    const has = (s: Loaded) => !!s.scene.world?.loader?.assets?.[f.prop]
    const owns = (file: string, at: (w: Json) => unknown) => !!at(read(file).world ?? {})
    const holds = new Set<string>(), iks = new Set<string>(), lists = new Set<string>()
    for (const s of scenes.filter(s => draws(s) && has(s))) {
      const hold = !s.partial || owns(s.file, w => w.anim?.kinds?.[f.body]) ? s.file : s.partial
      holds.add(hold)
      if (f.ik === undefined) continue
      iks.add(owns(s.file, w => w.ik3d?.kinds?.[f.body]) ? s.file : s.partial && owns(s.partial, w => w.ik3d?.kinds?.[f.body]) ? s.partial : hold)
      lists.add(s.file)
    }
    const lacking = scenes.filter(s => s.partial && holds.has(s.partial) && draws(s) && !has(s) && !owns(s.file, w => w.anim?.kinds?.[f.body]))
    if (lacking.length) throw new Error(`${lacking.map(s => s.name).join(', ')} draw ${f.body} from ${path.relative(root, lacking[0].partial!)} and have no ${f.prop}`)
    return [
      ...(f.hold ? edit([...holds], text => fit(text, { body: f.body, prop: f.prop, hold: f.hold })) : []),
      ...edit([...iks], text => fit(text, { body: f.body, prop: f.prop, ik: f.ik })),
      ...edit([...lists], text => listed(text)),
    ].filter((x, i, all) => all.indexOf(x) === i)
  }

  // ---- the UI workshop ----

  // The game's UI as the UI workshop draws it (`ui.ts`), from every scene that gives a `world.ui`:
  //   screens  the url of the game's screens file, `games/<game>/<game>.screens.ts`, or null when it
  //            has none: which scene its screens are drawn in, and each screen's states.
  //   scenes   each scene with a `world.ui`, `{ name, ui, defs, world, engine }`: `ui` the repo path of
  //            the file whose own `world` gives the ui (the scene's, its partial's, or the manager's),
  //            which a save of a panel or a style writes; `defs` the repo path of its definitions file
  //            (`world.defs`'s catalogue entry), which a save of a word or a place writes, or null; `world`
  //            the scene's whole world as the game loads it; and `engine` its engine prefab (its width
  //            and height are the canvas the ui lays its panels on), and `store` its store prefab, the
  //            store's starting values.
  function uiSummary(game: string) {
    const managerFile = path.join(gamesDir, game, `${game}.scene.json`)
    const scenes = scenesOf(game)
      .filter(s => s.scene.world?.ui)
      .map(s => {
        const own = (f: string | undefined) => (f && fs.existsSync(f) ? read(f).world?.ui : undefined)
        const uiFile = own(s.file) ? s.file : own(s.partial) ? s.partial! : managerFile
        const defsName = s.scene.world.defs
        const defsUrl = typeof defsName === 'string' ? s.scene.world.loader?.assets?.[defsName]?.url : undefined
        return {
          name: s.name,
          ui: path.relative(root, uiFile),
          defs: typeof defsUrl === 'string' ? fileOf(defsUrl) : null,
          world: s.scene.world,
          engine: s.scene.prefabs?.engine ?? {},
          store: s.scene.prefabs?.store ?? {},
        }
      })
    const screens = path.join(gamesDir, game, `${game}.screens.ts`)
    return { screens: fs.existsSync(screens) ? `/games/${game}/${game}.screens.ts` : null, scenes }
  }

  // The UI workshop's edits written: each `{ file, path, value }`, `file` a repo path the game's ui
  // summary names (a scene's `ui` file or its `defs`), `path` the keys down to the value, set in place
  // (`scenes.ts`'s `set`). Every file is edited in memory first and written only when every edit of the
  // call applied and the file still parses; hands back the files written.
  function uiSaving(game: string, edits: unknown): string[] {
    if (!Array.isArray(edits) || !edits.length) throw new Error('edits is a list of { file, path, value }')
    const s = uiSummary(game)
    const allowed = new Set(s.scenes.flatMap(x => [x.ui, x.defs]).filter((f): f is string => !!f))
    const texts = new Map<string, string>()
    for (const e of edits as { file?: unknown; path?: unknown; value?: unknown }[]) {
      if (typeof e?.file !== 'string' || !allowed.has(e.file)) throw new Error(`${String(e?.file)} is none of ${game}'s ui or definitions files: ${[...allowed].join(', ')}`)
      if (!Array.isArray(e.path) || !e.path.length || !e.path.every(k => typeof k === 'string' || (typeof k === 'number' && Number.isInteger(k) && k >= 0)))
        throw new Error('an edit\'s path is a list of keys, each a string or a list\'s index')
      if (e.value === undefined) throw new Error(`${e.path.join('.')} is given no value`)
      const full = path.join(root, e.file)
      texts.set(e.file, set(texts.get(e.file) ?? fs.readFileSync(full, 'utf8'), e.path as (string | number)[], e.value))
    }
    const written: string[] = []
    for (const [rel, text] of texts) {
      const full = path.join(root, rel)
      if (text === fs.readFileSync(full, 'utf8')) continue
      JSON.parse(text) // never write a file that does not parse
      fs.writeFileSync(full + '.tmp', text)
      fs.renameSync(full + '.tmp', full)
      written.push(rel)
    }
    return written
  }

  // ---- the particle workshop ----

  // The game's particle effects as the particle workshop draws them (`particles.ts`): each effects file a
  // scene that lists particle3d names (`world.particle3d.effects`, an entry of its loader catalogue),
  // once, from the first scene that names it:
  //   file      the repo path of the effects file, which a save writes.
  //   key       its catalogue key.
  //   scenes    every scene that names it.
  //   effects   the file as it is on disk.
  //   world     what the page builds its stage from, the first scene's: `particle3d` its own numbers,
  //             `loader` its catalogue cut to the sheets (the only files an effect draws from), and
  //             `lights3d` when the scene lists lights3d, which draws a particle's `light`.
  //   plugins   the plugins the stage lists, in the scene's order: particle3d, lights3d when the scene
  //             lists it, render3d.
  //   render3d  the scene's render3d prefab, so the tone, the exposure and the bloom are the game's.
  //   dt        the scene's step, which particle3d moves every effect by.
  function particlesSummary(game: string) {
    const files = new Map<string, { file: string; key: string; scenes: string[]; effects: Json; world: Json; plugins: string[]; render3d: Json; dt: number }>()
    for (const s of scenesOf(game)) {
      const lists = (s.scene.plugins ?? []) as string[]
      const w = s.scene.world ?? {}
      if (!lists.includes('particle3d') || !w.particle3d) continue
      const key = w.particle3d.effects
      const url = w.loader?.assets?.[key]?.url
      if (typeof url !== 'string') throw new Error(`${s.name} names the effects file ${key}, which is not in its loader catalogue`)
      const file = fileOf(url)
      const had = files.get(file)
      if (had) { had.scenes.push(s.name); continue }
      const full = inside(root, file)
      if (!full || !full.startsWith(gamesDir + path.sep) || !fs.existsSync(full)) throw new Error(`${s.name}'s effects file ${file} is not a file of games/`)
      const sheets = Object.fromEntries(Object.entries((w.loader.assets ?? {}) as Record<string, Json>).filter(([, e]) => e.type === 'sheet'))
      const plugins = lists.filter(p => p === 'particle3d' || p === 'lights3d' || p === 'render3d')
      files.set(file, {
        file, key, scenes: [s.name], effects: read(full),
        world: { particle3d: w.particle3d, loader: { ...w.loader, assets: sheets }, ...(plugins.includes('lights3d') ? { lights3d: w.lights3d } : {}) },
        plugins, render3d: s.scene.prefabs?.render3d ?? {}, dt: s.scene.prefabs?.engine?.dt ?? 1 / 60,
      })
    }
    return { files: [...files.values()] }
  }

  // The particle workshop's save: `{ file, effects }`, `file` an effects file the summary names and
  // `effects` each effect changed, by name, its whole list of layers, each set in place at
  // `effects.<name>` (`scenes.ts`'s `set`), the rest of the file and its layout kept; an effect it does
  // not have yet is added at the end. The file as it would be written is checked by particle3d's own
  // `check`, and written only when it passes and parses; hands back whether it was written.
  function particlesSaving(game: string, b: { file?: unknown; effects?: unknown }): { written: boolean } {
    const s = particlesSummary(game)
    const found = s.files.find(f => f.file === b.file)
    if (!found) throw new Error(`${String(b.file)} is none of ${game}'s effects files: ${s.files.map(f => f.file).join(', ')}`)
    if (!b.effects || typeof b.effects !== 'object' || Array.isArray(b.effects) || !Object.keys(b.effects).length) throw new Error('effects is each effect changed, by name, its list of layers')
    const full = path.join(root, found.file)
    let text = fs.readFileSync(full, 'utf8')
    for (const [name, layers] of Object.entries(b.effects as Record<string, unknown>)) {
      if (!Array.isArray(layers) || !layers.every(l => l && typeof l === 'object' && !Array.isArray(l))) throw new Error(`${name} is a list of layers, each an object`)
      text = set(text, ['effects', name], layers)
    }
    const now = JSON.parse(text) // never write a file that does not parse
    particleCheck(now, found.world.particle3d)
    if (text === fs.readFileSync(full, 'utf8')) return { written: false }
    fs.writeFileSync(full + '.tmp', text)
    fs.renameSync(full + '.tmp', full)
    return { written: true }
  }

  // ---- events ----

  const clients = new Set<http.ServerResponse>()
  const timers = new Map<string, NodeJS.Timeout>()
  const watcher = fs.existsSync(gamesDir) ? fs.watch(gamesDir, { recursive: true }, (_e, name) => {
    if (!name || name.endsWith('.tmp')) return
    const rel = path.join('games', name.toString())
    clearTimeout(timers.get(rel))
    timers.set(rel, setTimeout(() => {
      timers.delete(rel)
      for (const c of clients) c.write(`data: changed ${rel}\n\n`)
    }, DEBOUNCE))
  }) : undefined

  // ---- the server ----

  // ---- interactions and baking a pack clip into a body ----

  // An interaction's file as the workshop writes it: its keys in order, each step on lines of its own.
  function interactionText(f: Interaction): string {
    const step = (s: Step) => {
      const { ik, ...rest } = s
      const head = JSON.stringify(rest).slice(0, -1)
      if (!ik?.length) return `    ${head}}`
      return `    ${head}, "ik": [\n${ik.map(l => `      ${JSON.stringify(l)}`).join(',\n')}\n    ]}`
    }
    return `{\n  "body": ${JSON.stringify(f.body)},\n  "steps": [\n${f.steps.map(step).join(',\n')}\n  ]\n}\n`
  }

  // A pack clip baked into a body's rig: `{ body, clip: 'pack:<pack>/<file>', name }`, the anim kind
  // of the body, the pack clip, and the name it takes in the rig. The clip is added to the rig file's
  // `clips` (its file under the packs folder's parent, as anim's export reads clips), every body of
  // the rig is baked by Blender with anim's export (`plugins/anim/anim.export.py`, which packs each
  // glb), and the measured table written back into the rig in its own layout (the using-mixamo-assets
  // skill's `merge-table.mjs`). Blender is `BLENDER`, else the macOS application's binary. Hands back
  // `{ clip, written }`, the clip's name and every file written.
  async function baking(game: string, b: { body?: unknown; clip?: unknown; name?: unknown }) {
    if (typeof b.body !== 'string' || typeof b.clip !== 'string' || !b.clip.startsWith('pack:') || typeof b.name !== 'string' || !/^[A-Za-z][\w]*$/.test(b.name))
      throw new Error('a bake is { body, clip: "pack:<pack>/<file>", name }, name a word')
    const s = summary(game)
    const kind = s.world.anim.kinds[b.body]
    if (!kind) throw new Error(`${game} draws no body ${b.body}`)
    const assets = s.world.loader.assets as Record<string, Json>
    const rigFile = inside(root, fileOf(assets[kind.rig]?.url ?? ''))
    if (!rigFile || !fs.existsSync(rigFile)) throw new Error(`${b.body}'s rig ${kind.rig} is no file of ${game}'s`)
    const [pack, clipFile] = b.clip.slice('pack:'.length).split('/')
    const fbx = path.join(packs, pack, clipFile)
    if (!fs.existsSync(fbx)) throw new Error(`no pack clip ${pack}/${clipFile}`)
    const rig = read(rigFile)
    if (rig.clips[b.name] && JSON.stringify(rig.clips[b.name]) !== JSON.stringify({ file: `packs/${pack}/${clipFile}` })) throw new Error(`${b.body}'s rig has a clip ${b.name} already, of another file`)
    rig.clips[b.name] = { file: `packs/${pack}/${clipFile}` }
    const outs = Object.keys(rig.bodies ?? {}).map(model => {
      const glb = inside(root, fileOf(assets[model]?.url ?? ''))
      if (!glb) throw new Error(`${b.body}'s rig bakes ${model}, which ${game}'s catalogue has no glb for`)
      return `${model}=${glb}`
    })
    if (!outs.length) throw new Error(`${b.body}'s rig names no bodies to bake`)
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'workshop-bake-'))
    try {
      const staged = path.join(work, 'rig.json'), table = path.join(work, 'table.json')
      fs.writeFileSync(staged, JSON.stringify(rig, null, 1) + '\n')
      const blender = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender'
      await run(blender, ['--background', '--factory-startup', '--python', path.join(root, 'plugins/anim/anim.export.py'), '--', staged, table, ...outs])
      await run(process.execPath, [path.join(root, '.claude/skills/using-mixamo-assets/scripts/merge-table.mjs'), staged, table, rigFile])
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
    return { clip: b.name, written: [path.relative(root, rigFile), ...outs.map(o => path.relative(root, o.split('=')[1]))] }
  }
  // ---- the pose lab ----

  const posesDir = path.join(packs, 'poses')
  // The library's rigged characters: each folder of `characters` with its `<name>.fbx`.
  const charactersOf = () => (fs.existsSync(characters) ? fs.readdirSync(characters, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(characters, d.name, `${d.name}.fbx`)))
    .map(d => ({ name: d.name, fbx: `characters/${d.name}/${d.name}.fbx` })).sort((a, b) => a.name.localeCompare(b.name)) : [])
  // One clip of the lab's: its name, its FBX under the packs folder, and its sidecar's poses.
  function posesOf(name: string) {
    const side = path.join(posesDir, `${name}.poses.json`)
    return { name, fbx: `poses/${name}.fbx`, poses: (fs.existsSync(side) ? read(side).poses : {}) as Record<string, string> }
  }
  const posesAll = () => (fs.existsSync(posesDir) ? fs.readdirSync(posesDir).filter(n => n.toLowerCase().endsWith('.fbx')).map(n => posesOf(n.slice(0, -4))).sort((a, b) => a.name.localeCompare(b.name)) : [])
  const quat = (v: unknown) => Array.isArray(v) && v.length === 4 && v.every(n => typeof n === 'number' && Number.isFinite(n))
  // The lab's poses written as one clip, by Blender (`poses.export.py`), and its sidecar beside it.
  async function posing(b: { name?: unknown; body?: unknown; rest?: any; poses?: any }) {
    if (typeof b.name !== 'string' || !/^[\w-]+$/.test(b.name)) throw new Error('a clip of poses is named by a word: letters, digits, _ and -')
    if (typeof b.body !== 'string' || !charactersOf().some(c => c.fbx === b.body)) throw new Error(`${b.body} is none of the library's characters`)
    const bones = (v: any, what: string) => {
      if (!v || typeof v !== 'object' || !Object.keys(v).length) throw new Error(`${what} gives no bones`)
      for (const [n, q] of Object.entries(v)) if (!quat(q)) throw new Error(`${what}: ${n} is not a quaternion, [x, y, z, w]`)
    }
    if (!b.rest || !triple(b.rest.hips)) throw new Error('rest is { bones, hips }, hips three numbers')
    bones(b.rest.bones, 'rest')
    if (!Array.isArray(b.poses) || !b.poses.length) throw new Error('poses is a list of at least one pose')
    const names = new Set<string>()
    b.poses.forEach((p: any, i: number) => {
      if (typeof p?.name !== 'string' || !/^[A-Za-z][\w]*$/.test(p.name)) throw new Error(`pose ${i} is named by a word that starts with a letter`)
      if (names.has(p.name)) throw new Error(`two poses are named ${p.name}`)
      names.add(p.name)
      if (!triple(p.hips)) throw new Error(`pose ${p.name}'s hips is not three numbers`)
      bones(p.bones, `pose ${p.name}`)
    })
    const out = path.join(posesDir, `${b.name}.fbx`)
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'workshop-poses-'))
    try {
      const request = path.join(work, 'poses.json')
      fs.writeFileSync(request, JSON.stringify({ body: b.body, rest: b.rest, poses: b.poses.map((p: any) => ({ bones: p.bones, hips: p.hips })) }))
      const blender = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender'
      const staged = path.join(work, `${b.name}.fbx`)
      await run(blender, ['--background', '--factory-startup', '--python-exit-code', '1', '--python', path.join(here, 'poses.export.py'), '--', request, staged])
      fs.mkdirSync(posesDir, { recursive: true })
      fs.copyFileSync(staged, out)
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
    const side = { poses: Object.fromEntries(b.poses.map((p: any, i: number) => [String(i), p.name])) }
    fs.writeFileSync(path.join(posesDir, `${b.name}.poses.json`), `{\n  "poses": {\n${Object.entries(side.poses).map(([f, n]) => `    ${JSON.stringify(f)}: ${JSON.stringify(n)}`).join(',\n')}\n  }\n}\n`)
    return posesOf(b.name)
  }

  const run = (file: string, args: string[]) => new Promise<void>((done, fail) =>
    execFile(file, args, { maxBuffer: 64 << 20 }, (e, out, err) => (e ? fail(new Error(`${path.basename(file)}: ${(err || out).split('\n').filter(l => /Error|error/.test(l)).slice(-4).join(' ') || e.message}`)) : done())))

  function send(res: http.ServerResponse, code: number, body: unknown) {
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  function file(res: http.ServerResponse, full: string, instance = false) {
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return send(res, 404, { error: 'not found' })
    const ext = path.extname(full).toLowerCase()
    if (ext === '.ts') {
      // `transform`, so what strip-only refuses (an enum, a parameter property) is turned into
      // JavaScript too; stripped before anything is written, so a file that fails is a 500.
      const stripped = transform(fs.readFileSync(full, 'utf8'), { mode: 'transform', sourceUrl: full })
      const js = instance ? instanced(stripped) : stripped
      res.writeHead(200, { 'content-type': TYPES['.ts'], 'cache-control': 'no-store' })
      return res.end(js)
    }
    res.writeHead(200, { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    fs.createReadStream(full).pipe(res)
  }
  function body(req: http.IncomingMessage): Promise<any> {
    return new Promise((done, fail) => {
      let text = ''
      req.on('data', c => text += c)
      req.on('end', () => { try { done(JSON.parse(text || '{}')) } catch (e) { fail(e) } })
    })
  }
  const triple = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n))

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    let p: string
    try { p = decodeURIComponent(url.pathname) } catch { return send(res, 400, { error: 'bad path' }) }
    const parts = p.split('/').filter(Boolean)
    try {
      if (p === '/') return file(res, path.join(here, 'workshop.html'))
      if (p === '/poses') return file(res, path.join(here, 'poses.html'))
      if (p === '/ui') return file(res, path.join(here, 'ui.html'))
      if (p === '/particles') return file(res, path.join(here, 'particles.html'))
      if (parts[0] === 'library' && parts[1] === 'characters') {
        const full = inside(characters, parts.slice(2).join('/'))
        return full ? file(res, full) : send(res, 403, { error: 'outside the library\'s characters' })
      }
      if (parts[0] === 'api') {
        if (parts[1] === 'games' && req.method === 'GET') {
          const games = fs.existsSync(gamesDir) ? fs.readdirSync(gamesDir, { withFileTypes: true })
            .filter(d => d.isDirectory() && fs.existsSync(path.join(gamesDir, d.name, `${d.name}.scene.json`))).map(d => d.name).sort() : []
          return send(res, 200, games)
        }
        if (parts[1] === 'game' && parts.length === 3 && req.method === 'GET') {
          try { return send(res, 200, summary(parts[2])) } catch (e) { return send(res, 404, { error: (e as Error).message }) }
        }
        if (parts[1] === 'packs' && req.method === 'GET') {
          if (!fs.existsSync(packs)) return send(res, 200, [])
          return send(res, 200, fs.readdirSync(packs, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => ({
            pack: d.name,
            clips: fs.readdirSync(path.join(packs, d.name)).filter(n => n.toLowerCase().endsWith('.fbx')).sort(),
          })).filter(x => x.clips.length).sort((a, b) => a.pack.localeCompare(b.pack)))
        }
        if (parts[1] === 'notes') {
          const rel = url.searchParams.get('file')
          if (!modelFile(rel)) return send(res, 404, { error: 'no such model: a game\'s glb, or its solids model\'s json' })
          const notes = readNotes(rel!)
          if (req.method === 'GET' && parts.length === 2) return send(res, 200, notes)
          if (req.method === 'POST' && parts.length === 2) {
            const b = await body(req)
            if (typeof b.text !== 'string' || !b.text.trim()) return send(res, 400, { error: 'a note needs text' })
            if (!triple(b.at)) return send(res, 400, { error: 'a note\'s at is three numbers' })
            const note: Note = {
              id: notes.reduce((m, n) => Math.max(m, n.id), 0) + 1, text: b.text.trim(), at: b.at, mesh: b.mesh ?? '',
              material: b.material ?? '', camera: b.camera, status: 'open', reply: '', made: new Date().toISOString(),
            }
            writeNotes(rel!, [...notes, note])
            return send(res, 200, note)
          }
          if (req.method === 'PATCH' && parts.length === 3) {
            const note = notes.find(n => n.id === Number(parts[2]))
            if (!note) return send(res, 404, { error: 'no such note' })
            const b = await body(req)
            if (b.status !== undefined) {
              if (b.status !== 'open' && b.status !== 'fixed') return send(res, 400, { error: 'status is open or fixed' })
              note.status = b.status
            }
            if (typeof b.reply === 'string') note.reply = b.reply
            writeNotes(rel!, notes)
            return send(res, 200, note)
          }
        }
        if (parts[1] === 'frames' && parts.length === 2) {
          const full = solidsFile(url.searchParams.get('file'))
          if (!full) return send(res, 404, { error: 'no such solids model' })
          if (req.method === 'GET') return send(res, 200, framesOf(read(full)))
          if (req.method === 'POST') {
            const b = await body(req)
            if ([b.nodes, b.empties, b.turns].some(v => v !== undefined && (typeof v !== 'object' || v === null)))
              return send(res, 400, { error: 'frames are { nodes?: { <name>: { at, turn?, parent? } }, empties?: { <name>: [x, y, z] }, turns?: { <name>: [x, y, z, w] } }' })
            const text = fs.readFileSync(full, 'utf8')
            let now: string
            try { now = setFrames(text, { nodes: b.nodes, empties: b.empties, turns: b.turns }) } catch (e) { return send(res, 400, { error: (e as Error).message }) }
            if (now !== text) {
              JSON.parse(now) // never write a file that does not parse
              fs.writeFileSync(full + '.tmp', now)
              fs.renameSync(full + '.tmp', full)
            }
            return send(res, 200, framesOf(JSON.parse(now)))
          }
        }
        if (parts[1] === 'vehicle' && parts.length === 4) {
          const [, , game, name] = parts
          let files: string[]
          try { files = vehicleFiles(game, name) } catch (e) { return send(res, 404, { error: (e as Error).message }) }
          if (!files.length) return send(res, 404, { error: `${game} has no vehicle ${name} with a look` })
          if (req.method === 'GET') return send(res, 200, vehicleFrames(game, name))
          if (req.method === 'POST') {
            const b = await body(req)
            const shape = 'a vehicle\'s points are { empties?: { <name>: [x, y, z] }, turns?: { <name>: [x, y, z, w] } }'
            if ([b.empties, b.turns].some(v => v !== undefined && (typeof v !== 'object' || v === null))) return send(res, 400, { error: shape })
            for (const [n, p] of Object.entries((b.empties ?? {}) as Record<string, unknown>)) {
              if (!/^[\w.-]+$/.test(n)) return send(res, 400, { error: `${n} is not a point's name` })
              if (!triple(p)) return send(res, 400, { error: `${n} is not three numbers` })
            }
            for (const [n, q] of Object.entries((b.turns ?? {}) as Record<string, unknown>)) {
              if (!Array.isArray(q) || q.length !== 4 || !q.every(x => typeof x === 'number' && Number.isFinite(x))) return send(res, 400, { error: `${n}'s turn is not a quaternion, [x, y, z, w]` })
            }
            let written: string[]
            try { written = edit(files, text => points(text, name, { empties: b.empties, turns: b.turns })) } catch (e) { return send(res, 400, { error: (e as Error).message }) }
            return send(res, 200, { ...vehicleFrames(game, name), written })
          }
        }
        if (parts[1] === 'points' && parts.length === 2) {
          const full = glbFile(url.searchParams.get('file'))
          if (!full) return send(res, 404, { error: 'no such glb' })
          if (req.method === 'GET') return send(res, 200, readPoints(full))
          if (req.method === 'POST') {
            const pts = (await body(req)).points as Record<string, Point> | undefined
            if (!pts || typeof pts !== 'object') return send(res, 400, { error: 'points is { <name>: { at, turn } }' })
            for (const [name, pt] of Object.entries(pts)) {
              if (!/^[\w.-]+$/.test(name)) return send(res, 400, { error: `${name} is not a point's name` })
              if (!triple(pt.at)) return send(res, 400, { error: `${name}.at is not three numbers` })
              if (!Array.isArray(pt.turn) || pt.turn.length !== 4 || !pt.turn.every(Number.isFinite)) return send(res, 400, { error: `${name}.turn is not a quaternion` })
            }
            try { writePoints(full, pts) } catch (e) { return send(res, 409, { error: (e as Error).message }) }
            return send(res, 200, readPoints(full))
          }
        }
        if (parts[1] === 'beside' && parts.length === 2) {
          const full = glbFile(url.searchParams.get('file'))
          if (!full) return send(res, 404, { error: 'no such glb' })
          const file = besideOf(full)
          if (req.method === 'GET') return send(res, 200, readBeside(file))
          if (req.method === 'POST') {
            const b = await body(req)
            if ([b.points, b.sizes].some(v => v !== undefined && (typeof v !== 'object' || v === null)))
              return send(res, 400, { error: 'a points file is { points?: { <name>: { at, turn } }, sizes?: { <name>: metres } }' })
            for (const [name, pt] of Object.entries((b.points ?? {}) as Record<string, Point>)) {
              if (!/^[\w.-]+$/.test(name)) return send(res, 400, { error: `${name} is not a point's name` })
              if (!pt || !triple(pt.at)) return send(res, 400, { error: `${name}.at is not three numbers` })
              if (!Array.isArray(pt.turn) || pt.turn.length !== 4 || !pt.turn.every(n => typeof n === 'number' && Number.isFinite(n))) return send(res, 400, { error: `${name}.turn is not a quaternion` })
            }
            for (const [name, v] of Object.entries((b.sizes ?? {}) as Record<string, unknown>)) {
              if (!/^[\w.-]+$/.test(name)) return send(res, 400, { error: `${name} is not a size's name` })
              if (typeof v !== 'number' || !Number.isFinite(v)) return send(res, 400, { error: `${name} is not a number` })
            }
            if (b.drop !== undefined && (!Array.isArray(b.drop) || !b.drop.every((n: unknown) => typeof n === 'string')))
              return send(res, 400, { error: 'drop is a list of points\' names' })
            setBeside(file, { points: b.points, sizes: b.sizes, drop: b.drop })
            return send(res, 200, readBeside(file))
          }
        }
        if (parts[1] === 'fit' && parts.length === 3 && req.method === 'POST') {
          const b = await body(req)
          if (typeof b.body !== 'string' || typeof b.prop !== 'string') return send(res, 400, { error: 'a fit names its body and its prop' })
          if (b.hold !== undefined && (typeof b.hold.bone !== 'string' || !triple(b.hold.at) || !triple(b.hold.turn))) return send(res, 400, { error: 'hold is { bone, at, turn }' })
          if (b.ik !== undefined && (typeof b.ik !== 'object' || b.ik === null)) return send(res, 400, { error: 'ik is world.ik3d.kinds.<body>' })
          try { scenesOf(parts[2]) } catch (e) { return send(res, 404, { error: (e as Error).message }) }
          try {
            return send(res, 200, { scenes: fitting(parts[2], { body: b.body, prop: b.prop, hold: b.hold as Hold | undefined, ik: b.ik }) })
          } catch (e) { return send(res, 409, { error: (e as Error).message }) }
        }
        if (parts[1] === 'bring' && parts.length === 3 && req.method === 'POST') {
          const b = await body(req)
          const game = parts[2]
          let from: ReturnType<typeof summary>, to: ReturnType<typeof summary>
          try { from = summary(b.from); to = summary(game) } catch (e) { return send(res, 404, { error: (e as Error).message }) }
          const model = from.models.find(m => m.key === b.key)
          if (!model) return send(res, 404, { error: `${b.from} has no model ${b.key}` })
          // A body holds a loader model, a glb (anim's props); a solids model is drawn by its game's own
          // plugins, which another game does not have.
          if (model.type !== 'glb') return send(res, 409, { error: `${b.from}'s ${b.key} is a solids model, which a body cannot hold: only a glb is brought` })
          const source = path.join(root, model.file)
          const name = path.basename(source)
          const dest = path.join(gamesDir, game, 'assets', name)
          if (fs.existsSync(dest) && !fs.readFileSync(dest).equals(fs.readFileSync(source))) return send(res, 409, { error: `games/${game}/assets/${name} is there already, and is another file` })
          const written: string[] = []
          if (!fs.existsSync(dest)) {
            fs.mkdirSync(path.dirname(dest), { recursive: true })
            fs.copyFileSync(source, dest)
            written.push(path.relative(root, dest))
          }
          const entry = { type: 'model', url: `/games/${game}/assets/${name}` }
          try {
            written.push(...edit(filesOf(scenesOf(game)), text => catalogue(text, b.key, entry)))
          } catch (e) { return send(res, 409, { error: (e as Error).message }) }
          if (b.body) {
            if (!to.bodies.some(x => x.kind === b.body)) return send(res, 404, { error: `${game} draws no body ${b.body}` })
            const like = from.bodies.find(x => x.kind === b.like) ?? from.bodies.find(x => x.props.some((pr: Json) => pr.model === b.key))
            const was = like?.props.find((pr: Json) => pr.model === b.key)
            const hold: Hold = was ? { bone: was.bone, at: was.at, turn: was.turn } : { bone: 'RightHand', at: [0, 0, 0], turn: [0, 0, 0] }
            const ik = like?.ik && JSON.stringify(like.ik).includes(JSON.stringify(b.key)) ? like.ik : undefined
            try { written.push(...fitting(game, { body: b.body, prop: b.key, hold, ik })) } catch (e) { return send(res, 409, { error: (e as Error).message }) }
          }
          return send(res, 200, { written: [...new Set(written)] })
        }
        if (parts[1] === 'interaction' && parts.length === 2 && req.method === 'POST') {
          const rel = url.searchParams.get('file')
          const full = rel && rel.endsWith('.interaction.json') ? inside(gamesDir, path.relative('games', rel)) : undefined
          if (!full || !fs.existsSync(full)) return send(res, 404, { error: 'no such interaction: a game\'s .interaction.json' })
          const f = await body(req)
          try { check(f, path.basename(full)) } catch (e) { return send(res, 400, { error: (e as Error).message }) }
          fs.writeFileSync(full + '.tmp', interactionText(f))
          fs.renameSync(full + '.tmp', full)
          return send(res, 200, read(full))
        }
        if (parts[1] === 'machine' && parts.length === 2 && req.method === 'POST') {
          const rel = url.searchParams.get('file')
          const full = rel && rel.endsWith('.json') ? inside(gamesDir, path.relative('games', rel)) : undefined
          if (!full || !fs.existsSync(full)) return send(res, 404, { error: 'no such definitions file: a game\'s json' })
          const b = await body(req)
          const shape = 'a machine\'s poses are { machine, name, poses: { <step>: { <field>: number } } }'
          if (typeof b.machine !== 'string' || typeof b.name !== 'string' || typeof b.poses !== 'object' || b.poses === null) return send(res, 400, { error: shape })
          for (const [st, fields] of Object.entries(b.poses as Record<string, unknown>)) {
            if (typeof fields !== 'object' || fields === null) return send(res, 400, { error: `${st}: ${shape}` })
            for (const [k, v] of Object.entries(fields)) if (typeof v !== 'number' || !Number.isFinite(v)) return send(res, 400, { error: `${st}.${k} is not a number` })
          }
          const text = fs.readFileSync(full, 'utf8')
          const now = poses(text, b.machine, b.name, b.poses)
          if (now === undefined) return send(res, 404, { error: `${rel} has no definition ${b.machine}` })
          if (now !== text) {
            JSON.parse(now) // never write a file that does not parse
            fs.writeFileSync(full + '.tmp', now)
            fs.renameSync(full + '.tmp', full)
          }
          return send(res, 200, JSON.parse(now)[b.machine].interact[b.name])
        }
        if (parts[1] === 'bake' && parts.length === 3 && req.method === 'POST') {
          const b = await body(req)
          try { return send(res, 200, await baking(parts[2], b)) } catch (e) { return send(res, 409, { error: (e as Error).message }) }
        }
        if (parts[1] === 'ui' && parts.length === 3) {
          if (req.method === 'GET') {
            try { return send(res, 200, uiSummary(parts[2])) } catch (e) { return send(res, 404, { error: (e as Error).message }) }
          }
          if (req.method === 'POST') {
            const b = await body(req)
            try { return send(res, 200, { written: uiSaving(parts[2], b.edits) }) } catch (e) { return send(res, 400, { error: (e as Error).message }) }
          }
        }
        if (parts[1] === 'particles' && parts.length === 3) {
          if (req.method === 'GET') {
            try { return send(res, 200, particlesSummary(parts[2])) } catch (e) { return send(res, 404, { error: (e as Error).message }) }
          }
          if (req.method === 'POST') {
            const b = await body(req)
            try { return send(res, 200, particlesSaving(parts[2], b)) } catch (e) { return send(res, 400, { error: (e as Error).message }) }
          }
        }
        if (parts[1] === 'characters' && parts.length === 2 && req.method === 'GET') return send(res, 200, charactersOf())
        if (parts[1] === 'poses' && parts.length === 2) {
          if (req.method === 'GET') return send(res, 200, posesAll())
          if (req.method === 'POST') {
            const b = await body(req)
            try { return send(res, 200, await posing(b)) } catch (e) { return send(res, 409, { error: (e as Error).message }) }
          }
        }
        if (parts[1] === 'events') {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
          res.write(': open\n\n')
          clients.add(res)
          req.on('close', () => clients.delete(res))
          return
        }
        return send(res, 404, { error: 'no such route' })
      }
      if (parts[0] === 'three') {
        const full = inside(path.join(root, 'node_modules/three'), parts.slice(1).join('/'))
        return full ? file(res, full) : send(res, 403, { error: 'outside three' })
      }
      // The packages core's browser code imports by name, as the page's import map names them.
      if (parts[0] === 'npm') {
        const full = inside(path.join(root, 'node_modules'), parts.slice(1).join('/'))
        return full ? file(res, full) : send(res, 403, { error: 'outside node_modules' })
      }
      if (parts[0] === 'engine' || parts[0] === 'plugins' || parts[0] === 'addons' || parts[0] === 'games') {
        const full = inside(path.join(root, parts[0]), parts.slice(1).join('/'))
        return full ? file(res, full, url.searchParams.has('instance')) : send(res, 403, { error: `outside ${parts[0]}` })
      }
      if (parts[0] === 'packs') {
        const full = inside(packs, parts.slice(1).join('/'))
        return full && full.toLowerCase().endsWith('.fbx') && path.dirname(path.dirname(full)) === packs ? file(res, full) : send(res, 403, { error: 'not a pack clip' })
      }
      if (parts.length === 1 && /^[\w.-]+\.ts$/.test(parts[0])) return file(res, path.join(here, parts[0]))
      return send(res, 404, { error: 'not found' })
    } catch (e) {
      console.error(`${req.method} ${p}:`, e)
      if (res.headersSent) res.end()
      else send(res, 500, { error: String(e) })
    }
  })

  return new Promise(done => server.listen(port, () => {
    const { port: bound } = server.address() as { port: number }
    done({
      url: `http://localhost:${bound}`,
      close: () => new Promise(closed => {
        watcher?.close()
        for (const c of clients) c.end()
        for (const t of timers.values()) clearTimeout(t)
        server.close(() => closed())
      }),
    })
  }))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  start({ port: Number(process.env.WORKSHOP_PORT ?? 5180), root }).then(s => console.log(`workshop at ${s.url}`))
}
