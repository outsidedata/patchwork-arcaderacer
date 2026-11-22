// The asset workshop's server: where a game's props are made and fitted to the game, with no game
// running. Run as
//
//   node --experimental-strip-types tools/workshop/workshop.server.ts
//
// and open http://localhost:5180/?game=<game>. Run as
//
//   node --experimental-strip-types tools/workshop/workshop.server.ts --effects <path> [--sheet <key>=<path>]…
//
// it is the particle workshop on that one effects file, anywhere on disk, with no game chosen: open
// http://localhost:5180/particles. A game is read from its own files and nothing else:
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
//   /puppet3d            the puppet3d workshop, `puppet3d.html` (`puppet3d.ts`): a game's puppet3d bodies
//                        posed by their cues drivers through puppet3d's own code, the senses and weights
//                        set by hand, each bone's cues tuned live and saved, no game running.
//   /hair3d              the hair workshop, `hair3d.html` (`hair3d.ts`): a game's hairs grown by core's hair3d
//                        on test subjects that are moved, turned and run forward, each number tuned live
//                        and saved, no game running.
//   /grass3d             the grass workshop, `grass3d.html` (`grass3d.ts`): a game's grasses grown by core's
//                        grass3d on test grounds, trodden by a body or a car going round, each number tuned
//                        live and saved, no game running.
//   /item3d              the item3d workshop, `item3d.html` (`item3d.ts`): a game's own scene run in the page,
//                        each body of its bodies sheet looked at with what it holds, what it wears and its
//                        capsules drawn over it, each number tuned live and saved.
//   /tools/workshop/…    the workshop's own files by their repo path, `.ts` with its types stripped: the
//                        hair and grass workshops' pages and the plugins beside them (`plugins/subjects/`,
//                        `plugins/grounds/`).
//   /views               the views page, `views.html` (`views.ts`): the effects file given by `--effects` on
//                        the particle workshop's stage alone, which `yarn particle-views` takes pictures of.
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
//   GET  /api/particles        the effects file given by `--effects` as the particle workshop draws it
//                              (`givenSummary`), one entry of `/api/particles/<game>`'s shape; a 404
//                              when none was given, or a sheet it draws from is catalogued nowhere.
//   POST /api/particles        `{ file, effects, drivers, forceGenerators }`, saved into the given file as below.
//   /given/effects/…, /given/sheet/<key>/…   the given effects file's folder, and each given sheet's.
//   GET  /api/particles/<game> the game's effects files as the particle workshop draws them
//                              (`particlesSummary`): each file, its scenes, what it holds and the stage.
//   POST /api/particles/<game> `{ file, effects: { <name>: [layers] } }`: each effect's layers set in place
//                              in the effects file, the layout kept, checked by particle3d's own `check`
//                              before it is written. With `drivers` or `forceGenerators`, the file's
//                              drivers or force generators set whole; a save gives at least one of the
//                              three. Hands back `written`.
//   GET  /api/hair3d/<game>    the game's hairs files as the hair workshop draws them (`hairSummary`): each
//                              file, the scenes that name it, what it holds, and the workshop's stage.
//   POST /api/hair3d/<game>    `{ file, edits: [{ path, value }] }`: each value set in place in the hairs
//                              file, under its `wind`, its `gust` or one of its `hairs`, the layout kept,
//                              checked by hair3d's own `check`, and each hair's program compiled over the
//                              ops the first scene that names the file delivers, before it is written.
//   GET  /api/grass3d/<game>   the game's grasses files as the grass workshop draws them (`grassSummary`):
//                              each file, the scenes that name it, what it holds, its land's lattice, and
//                              the workshop's stage.
//   POST /api/grass3d/<game>   `{ file, edits: [{ path, value }] }`: each value set in place in the grasses
//                              file, its `budget`, its `bend`, or under its `wind`, its `gust`, its
//                              `trample` or one of its `grasses`, the layout kept, checked by grass3d's own
//                              `check` before it is written.
//   GET  /api/item3d/<game>    the game's bodies sheets as the item3d workshop opens them (`itemSummary`): each
//                              sheet, the scene the page boots, the items a hold may name, and that scene's
//                              fabrics file.
//   POST /api/item3d/<game>    `{ file, lists, fabrics }`: a body's `holds`, `capsules` and `wears` set in the
//                              bodies sheet, and a fabric's `pins` and numbers in the fabrics file, each
//                              checked by its own plugin's `check` before either is written (`itemSaving`).
//   GET  /api/puppet3d/<game>  the game's puppet3d bodies as the puppet3d workshop draws them
//                              (`puppetSummary`): each scene whose world lists puppet3d kinds, its kinds,
//                              its definitions file and the url of it, its loader catalogue, its solvers'
//                              sheets, the mods that deliver its solvers and its step.
//   POST /api/puppet3d/<game>  `{ file, edits: [{ path, value }] }`: each value (a bone's angle's cues, a
//                              driver's weight, a number of a solver's block) set in place at `path` in a
//                              puppet3d scene's definitions file, a solver's sheet or a cue sheet
//                              (`scenes.ts`'s `set`), the layout kept, or with an empty `path` the whole
//                              file (a cue sheet given a bone or letting one go), written only once every
//                              edit applied and it parses. Hands back `written`, the files changed.
//   POST /api/puppet3d/<game>/layer  `{ scene, kind, layout, add }`: the library's cue sheet `add` copied
//                              into the game, listed in the scene's catalogue and laid on top of the
//                              layout's drivers at weight 1; `{ scene, kind, layout, remove }`: the layout's
//                              driver at that index taken off (`puppetLayer`). Hands back `written`.
//   POST /api/puppet3d/<game>/library  `{ sheet }`: the game's cue sheet copied over the library's of its
//                              name (`puppetToLibrary`). Hands back `written`.
//   GET  /api/events           server-sent events: `changed <path>` for each file of `games/` written,
//                              150 ms after its last write, so a half-written export is not read.
// `start({ port, root, packs, library })` runs it on any port against any root, which is how its test
// runs it.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { stripTypeScriptTypes } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import os from 'node:os'
import { execFile, execFileSync } from 'node:child_process'
import { check, type Interaction, type Step } from '../../plugins/interact/interact.sim.ts'
import { check as particleCheck, drawers } from '../../plugins/particle3d/particle3d.plugin.ts'
import { check as hairCheck, OUTS as hairOuts } from '../../plugins/hair3d/hair3d.sim.ts'
import { check as grassCheck, OUTS as grassOuts } from '../../plugins/grass3d/grass3d.sim.ts'
import { compile as compileProgram, opsOf } from '../../plugins/gpgpu3d/gpgpu3d.ops.ts'
import { layoutOf } from '../../plugins/terrain3d/terrain3d.rings.ts'
import { looks } from '../../engine/browser.ts'
import { prepare } from '../../addons/scenemanager/scenemanager.addon.ts'
import { instanced } from '../../scripts/instance.ts'
import { readPoints, writePoints, type Point } from './glb.ts'
import { besideOf, readBeside, setBeside } from './beside.ts'
import { catalogue, fit, listed, points, poses, rows, set, type Hold } from './scenes.ts'
import { check as bodiesCheck } from '../../plugins/item3d/item3d.bodies.ts'
import { behaviorsOf as fabricWords, check as fabricCheck } from '../../plugins/fabric3d/fabric3d.plugin.ts'
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

export function start({ port, root, packs: packsGiven, library, effects: effectsGiven, sheets: sheetsGiven }: {
  port: number; root: string; packs?: string; library?: string; effects?: string; sheets?: Record<string, string>
}): Promise<{ url: string; close(): Promise<void> }> {
  const here = path.join(root, 'tools/workshop')
  const gamesDir = path.join(root, 'games')
  // The root's `.env` (`.env.example` lists it: `BLENDER` for a bake), under what the shell set.
  if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'))
  // The effects file the particle workshop opens on, and the sheets it draws from, each a whole path.
  const given = effectsGiven === undefined ? undefined : {
    effects: path.resolve(effectsGiven),
    sheets: Object.fromEntries(Object.entries(sheetsGiven ?? {}).map(([k, f]) => [k, path.resolve(f)])),
  }
  if (given) {
    if (!fs.existsSync(given.effects)) throw new Error(`no effects file ${given.effects}`)
    for (const [k, f] of Object.entries(given.sheets)) if (!fs.existsSync(f)) throw new Error(`no sheet ${k} at ${f}`)
  }
  // The Mixamo packs, `packs/` in the clip collection (`PATCHWORK_CLIPS`, else ~/troupe-collection), each
  // a folder of FBX clips. Only this folder and the folders directly in it are read, so the held view can
  // try any pack clip on a body before it is baked.
  const packs = packsGiven ?? path.join((process.env.PATCHWORK_CLIPS ?? '~/troupe-collection').replace(/^~(?=$|\/)/, os.homedir()), 'packs')
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
  //            `box3dvehicle` and, when the scene lists `particle3d` and attaches effects to its sources
  //            (`world.particle3d.attach`), `particle3d`; and `world`, their numbers: `box3dvehicle`, the
  //            scene's fleet with this vehicle alone and no `mods` (no gravity, no land: nothing moves it
  //            and no tracks are laid), and with `particle3d`, the scene's `world.particle3d`.
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
          const smokes = lists('particle3d') && !!w.particle3d?.attach?.length
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

  // ---- the puppet3d workshop ----

  // The game's puppet3d bodies as the puppet3d workshop draws them (`puppet3d.ts`), from every scene whose
  // world lists puppet3d kinds: `name`, the scene's; `kinds`, `world.puppet3d.kinds`; `defs`, the repo
  // path of its definitions file (`world.defs`'s catalogue entry), and `defsUrl` the url it is served at;
  // `assets`, its loader catalogue, which names each layout's skeleton and skin and each driver's sheets;
  // `sheets`, the repo path of each sheet a driver of its kinds reads, a solver's (`gait`) and each cue
  // sheet (`cues`), by entry;
  // `behaviors`, the url of each `<p>.puppet3d.ts` its `world.puppet3d.mods.behaviors` names, in order,
  // the game's own plugin's where it has one, else core's; `dt`, its engine's step.
  function puppetSummary(game: string) {
    const scenes = scenesOf(game).filter(s => Array.isArray(s.scene.world?.puppet3d?.kinds) && s.scene.world.puppet3d.kinds.length).map(s => {
      const w = s.scene.world, url = w.loader?.assets?.[w.defs]?.url
      if (typeof url !== 'string') throw new Error(`${game}'s ${s.name} draws puppet3d kinds and has no definitions file: world.defs names no entry of its catalogue`)
      const defs = read(path.join(root, fileOf(url)))
      const sheets: Record<string, string> = {}
      for (const kind of w.puppet3d.kinds as string[]) for (const L of Object.values(defs[kind]?.layouts ?? {}) as Json[]) for (const x of L.drivers ?? []) {
        for (const entry of [x.gait, x.cues]) {
          if (typeof entry !== 'string') continue
          const u = w.loader.assets[entry]?.url
          if (typeof u !== 'string') throw new Error(`${game}'s ${kind} drives by the sheet ${entry}, which ${s.name}'s catalogue has no entry for`)
          sheets[entry] = fileOf(u)
        }
      }
      const behaviors = ((w.puppet3d.mods?.behaviors ?? []) as string[]).map(p => {
        const own = path.join(gamesDir, game, 'plugins', p, `${p}.puppet3d.ts`)
        if (fs.existsSync(own)) return `/games/${game}/plugins/${p}/${p}.puppet3d.ts`
        if (fs.existsSync(path.join(root, 'plugins', p, `${p}.puppet3d.ts`))) return `/plugins/${p}/${p}.puppet3d.ts`
        throw new Error(`${game}'s ${s.name} names ${p} in world.puppet3d.mods.behaviors, and neither the game nor core has ${p}/${p}.puppet3d.ts`)
      })
      return { name: s.name, file: s.file, kinds: w.puppet3d.kinds as string[], defs: fileOf(url), defsUrl: url, assets: w.loader.assets, sheets, behaviors, dt: s.scene.prefabs?.engine?.dt as number }
    })
    if (!scenes.length) throw new Error(`${game} has no scene whose world.puppet3d lists kinds`)
    // The library's cue sheets, each `<name>.cues.json` of its `cues/`, by name, with the bones it names:
    // what a body can be given.
    const cues = path.join(lib, 'cues')
    const library = fs.existsSync(cues) ? Object.fromEntries(fs.readdirSync(cues).filter(f => f.endsWith('.cues.json')).sort().map(f => [f.slice(0, -'.cues.json'.length), Object.keys(read(path.join(cues, f)))])) : {}
    return { game, scenes, library }
  }

  // A game's cue sheet sent to the library: `{ sheet }`, the game's `assets/cues/<sheet>.cues.json` copied
  // over the library's `cues/<sheet>.cues.json`, so every game that plays it can take it from there. Hands
  // back the file written.
  function puppetToLibrary(game: string, b: { sheet?: unknown }): string[] {
    if (typeof b.sheet !== 'string' || !/^[\w-]+$/.test(b.sheet)) throw new Error('sheet names a cue sheet of the game')
    const from = path.join(gamesDir, game, 'assets', 'cues', `${b.sheet}.cues.json`)
    if (!fs.existsSync(from)) throw new Error(`${game} has no cue sheet ${b.sheet} in its assets/cues/`)
    const to = path.join(lib, 'cues', `${b.sheet}.cues.json`)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
    return [to]
  }

  // A layer added to a kind's layout or taken off it. `{ scene, kind, layout, add }`: the library's sheet
  // `add` copied into the game's `assets/cues/` (when it has no file of that name), listed in the scene's
  // catalogue as the entry of its name (when it has none), and a driver of its name playing it laid on
  // top of the layout's drivers, at a weight of 1 on the kind's clock sense. `{ scene, kind, layout,
  // remove }`: the layout's driver at index `remove` taken off. Hands back the files written.
  function puppetLayer(game: string, b: { scene?: unknown; kind?: unknown; layout?: unknown; add?: unknown; remove?: unknown }): string[] {
    const s = puppetSummary(game).scenes.find(x => x.name === b.scene)
    if (!s) throw new Error(`${String(b.scene)} is none of ${game}'s puppet3d scenes`)
    if (typeof b.kind !== 'string' || !s.kinds.includes(b.kind)) throw new Error(`${String(b.kind)} is none of ${s.name}'s puppet3d kinds`)
    const defsFile = path.join(root, s.defs), defs = read(defsFile) as Json
    const d = defs[b.kind], L = typeof b.layout === 'string' ? d.layouts[b.layout] : undefined
    if (!L) throw new Error(`${b.kind} has no layout ${String(b.layout)}`)
    const written: string[] = []
    let drivers: Json[]
    if (typeof b.remove === 'number') {
      if (!L.drivers[b.remove]) throw new Error(`${b.kind}'s ${String(b.layout)} has no layer ${b.remove}`)
      drivers = L.drivers.filter((_: Json, i: number) => i !== b.remove)
    } else {
      if (typeof b.add !== 'string' || !/^[\w-]+$/.test(b.add)) throw new Error('add names a sheet of the library')
      const from = path.join(lib, 'cues', `${b.add}.cues.json`)
      if (!fs.existsSync(from)) throw new Error(`the library has no sheet ${b.add}`)
      const clock = Object.keys(d.senses).find(k => d.senses[k] === 'clock')
      if (!clock) throw new Error(`${b.kind} senses no clock, which a library sheet plays by`)
      const to = path.join(gamesDir, game, 'assets', 'cues', `${b.add}.cues.json`)
      if (!fs.existsSync(to)) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); written.push(path.relative(root, to)) }
      if (!s.assets[b.add]) {
        const sceneFile = path.resolve(root, s.file)
        fs.writeFileSync(sceneFile, set(fs.readFileSync(sceneFile, 'utf8'), ['world', 'loader', 'assets', b.add], { type: 'json', url: `/games/${game}/assets/cues/${b.add}.cues.json`, preload: true }))
        written.push(path.relative(root, sceneFile))
      }
      if (L.drivers.some((x: Json) => x.name === b.add)) throw new Error(`${b.kind}'s ${String(b.layout)} already has a layer ${b.add}`)
      drivers = [...L.drivers, { name: b.add, weight: [{ by: clock, keys: [[0, 1]] }], cues: b.add }]
    }
    fs.writeFileSync(defsFile, set(fs.readFileSync(defsFile, 'utf8'), [b.kind, 'layouts', b.layout as string, 'drivers'], drivers))
    written.push(s.defs)
    return written
  }

  // The puppet3d workshop's edits written into one definitions file, solver's sheet or cue sheet, each
  // `{ path, value }` set in place (`scenes.ts`'s `set`), or with an empty `path` the whole file laid out
  // anew (a cue sheet that has been given a bone or let one go), the file written only once every edit
  // applied and it parses; hands back the files written.
  function puppetSaving(game: string, b: { file?: unknown; edits?: unknown }): string[] {
    const allowed = new Set(puppetSummary(game).scenes.flatMap(s => [s.defs, ...Object.values(s.sheets)]))
    if (typeof b.file !== 'string' || !allowed.has(b.file)) throw new Error(`${String(b.file)} is none of ${game}'s puppet3d definitions files or sheets: ${[...allowed].join(', ')}`)
    if (!Array.isArray(b.edits) || !b.edits.length) throw new Error('edits is a list of { path, value }')
    const full = path.join(root, b.file)
    const was = fs.readFileSync(full, 'utf8')
    let text = was
    for (const e of b.edits as { path?: unknown; value?: unknown }[]) {
      if (!Array.isArray(e?.path) || !e.path.every(k => typeof k === 'string' || (typeof k === 'number' && Number.isInteger(k) && k >= 0)))
        throw new Error('an edit\'s path is a list of keys, each a string or a list\'s index')
      if (e.value === undefined) throw new Error(`${e.path.join('.')} is given no value`)
      text = e.path.length ? set(text, e.path as (string | number)[], e.value) : JSON.stringify(e.value, null, 2) + '\n'
    }
    if (text === was) return []
    JSON.parse(text) // never write a file that does not parse
    fs.writeFileSync(full + '.tmp', text)
    fs.renameSync(full + '.tmp', full)
    return [b.file]
  }

  // ---- the hair workshop ----

  // The game's hairs files as the hair workshop draws them (`hair3d.ts`): each hairs file a scene that
  // lists hair3d names (`world.hair3d.hairs`, an entry of its loader catalogue), once, from the first
  // scene that names it: `file`, its repo path, which a save writes; `scenes`, every scene that names it;
  // `hairs`, the file as it is on disk; `render3d`, that first scene's render3d prefab, so the tone and the
  // exposure are the game's; `dt`, its step. `stage` is the workshop's own stage file
  // (`hair3d.stage.json`): the test subjects a hair is grown on, their motions, and the stage's light.
  const HAIR_STAGE = fileURLToPath(new URL('./hair3d.stage.json', import.meta.url))
  function hairSummary(game: string) {
    const files = new Map<string, { file: string; scenes: string[]; hairs: Json; render3d: Json; dt: number }>()
    for (const s of scenesOf(game)) {
      const w = s.scene.world ?? {}
      if (!((s.scene.plugins ?? []) as string[]).includes('hair3d') || !w.hair3d) continue
      const key = w.hair3d.hairs
      const url = w.loader?.assets?.[key]?.url
      if (typeof url !== 'string') throw new Error(`${s.name} names the hairs file ${key}, which is not in its loader catalogue`)
      const file = fileOf(url)
      const had = files.get(file)
      if (had) { had.scenes.push(s.name); continue }
      const full = inside(root, file)
      if (!full || !full.startsWith(gamesDir + path.sep) || !fs.existsSync(full)) throw new Error(`${s.name}'s hairs file ${file} is not a file of games/`)
      files.set(file, { file, scenes: [s.name], hairs: read(full), render3d: s.scene.prefabs?.render3d ?? {}, dt: s.scene.prefabs?.engine?.dt ?? 1 / 60 })
    }
    if (!files.size) throw new Error(`${game} has no scene that lists hair3d and names a hairs file`)
    return { game, files: [...files.values()], stage: read(HAIR_STAGE) }
  }

  // The hair workshop's save: `{ file, edits: [{ path, value }] }`, `file` a hairs file the summary names,
  // each value set in place (`scenes.ts`'s `set`) at a path under the file's `wind`, its `gust` or one of
  // its `hairs`, the rest of the file and its layout kept. The file as it would be written is checked by
  // hair3d's own `check`, and each hair's program is compiled over the ops the first scene that names the
  // file delivers, as the page compiles it, and written only when it passes; hands back whether it was
  // written.
  async function hairSaving(game: string, b: { file?: unknown; edits?: unknown }): Promise<{ written: boolean }> {
    const files = hairSummary(game).files
    const found = files.find(f => f.file === b.file)
    if (!found) throw new Error(`${String(b.file)} is none of ${game}'s hairs files: ${files.map(f => f.file).join(', ')}`)
    if (!Array.isArray(b.edits) || !b.edits.length) throw new Error('edits is a list of { path, value }')
    const full = path.join(root, found.file)
    const was = fs.readFileSync(full, 'utf8')
    let text = was
    for (const e of b.edits as { path?: unknown; value?: unknown }[]) {
      const p = e?.path
      if (!Array.isArray(p) || p.length < 2 || !p.every(k => typeof k === 'string' || (typeof k === 'number' && Number.isInteger(k) && k >= 0)))
        throw new Error('an edit\'s path is a list of at least two keys, each a string or a list\'s index')
      if (p[0] !== 'wind' && p[0] !== 'gust' && !(p[0] === 'hairs' && p.length > 2 && Object.hasOwn(found.hairs.hairs ?? {}, p[1])))
        throw new Error(`${p.join('.')} is not a number of the file's wind, its gust or one of its hairs: ${Object.keys(found.hairs.hairs ?? {}).join(', ')}`)
      if (e.value === undefined) throw new Error(`${p.join('.')} is given no value`)
      text = set(text, p as (string | number)[], e.value)
    }
    const next = JSON.parse(text)
    hairCheck(next)
    const scene = scenesOf(game).find(s => s.name === found.scenes[0])!.scene
    const world = { ...scene.world, scenemanager: { ...scene.world?.scenemanager, home: pathToFileURL(path.join(gamesDir, game) + '/').href } }
    await prepare({}, [], world)
    const ops = opsOf(world)
    for (const [name, h] of Object.entries<Json>(next.hairs)) {
      if (h.program) compileProgram(ops, h.program, 'program', `hair3d hair ${name} program`, hairOuts)
    }
    if (text === was) return { written: false }
    fs.writeFileSync(full + '.tmp', text)
    fs.renameSync(full + '.tmp', full)
    return { written: true }
  }

  // ---- the grass workshop ----

  // The game's grasses files as the grass workshop draws them (`grass3d.ts`): each grasses file a scene
  // that lists grass3d names (`world.grass3d.grasses`, an entry of its loader catalogue), once, from the
  // first scene that names it: `file`, its repo path, which a save writes; `scenes`, every scene that names
  // it; `grasses`, the file as it is on disk; `render3d`, that first scene's render3d prefab, so the tone
  // and the exposure are the game's; `dt`, its step; `cell`, the metres between the lattice points of that
  // scene's land where terrain3d is its land (`world.grass3d.mods.land`), terrain3d's finest ring's, so the
  // test ground is cut as finely as the game's, else null. `stage` is the workshop's own stage file
  // (`grass3d.stage.json`): the field, the test grounds a grass is grown on, the treaders that tread it,
  // the views and the stage's light.
  const GRASS_STAGE = fileURLToPath(new URL('./grass3d.stage.json', import.meta.url))
  function grassSummary(game: string) {
    const files = new Map<string, { file: string; scenes: string[]; grasses: Json; render3d: Json; dt: number; cell: number | null }>()
    for (const s of scenesOf(game)) {
      const w = s.scene.world ?? {}
      if (!((s.scene.plugins ?? []) as string[]).includes('grass3d') || !w.grass3d) continue
      const key = w.grass3d.grasses
      const url = w.loader?.assets?.[key]?.url
      if (typeof url !== 'string') throw new Error(`${s.name} names the grasses file ${key}, which is not in its loader catalogue`)
      const file = fileOf(url)
      const had = files.get(file)
      if (had) { had.scenes.push(s.name); continue }
      const full = inside(root, file)
      if (!full || !full.startsWith(gamesDir + path.sep) || !fs.existsSync(full)) throw new Error(`${s.name}'s grasses file ${file} is not a file of games/`)
      const cell = w.grass3d.mods?.land === 'terrain3d' && w.terrain3d?.rings ? layoutOf(w.terrain3d.rings).c0 : null
      files.set(file, { file, scenes: [s.name], grasses: read(full), render3d: s.scene.prefabs?.render3d ?? {}, dt: s.scene.prefabs?.engine?.dt ?? 1 / 60, cell })
    }
    if (!files.size) throw new Error(`${game} has no scene that lists grass3d and names a grasses file`)
    return { game, files: [...files.values()], stage: read(GRASS_STAGE) }
  }

  // The grass workshop's save: `{ file, edits: [{ path, value }] }`, `file` a grasses file the summary
  // names, each value set in place (`scenes.ts`'s `set`) at the file's `budget` or `bend`, or at a path
  // under its `wind`, its `gust`, its `trample` or one of its `grasses`, the rest of the file and its
  // layout kept. The file as it would be written is checked by grass3d's own `check`, and each grass's
  // program is compiled over the ops the first scene that names the file delivers, as the page compiles it,
  // and written only when it passes; hands back whether it was written.
  async function grassSaving(game: string, b: { file?: unknown; edits?: unknown }): Promise<{ written: boolean }> {
    const files = grassSummary(game).files
    const found = files.find(f => f.file === b.file)
    if (!found) throw new Error(`${String(b.file)} is none of ${game}'s grasses files: ${files.map(f => f.file).join(', ')}`)
    if (!Array.isArray(b.edits) || !b.edits.length) throw new Error('edits is a list of { path, value }')
    const full = path.join(root, found.file)
    const was = fs.readFileSync(full, 'utf8')
    let text = was
    const names = Object.keys(found.grasses.grasses ?? {})
    for (const e of b.edits as { path?: unknown; value?: unknown }[]) {
      const p = e?.path
      if (!Array.isArray(p) || !p.length || !p.every(k => typeof k === 'string' || (typeof k === 'number' && Number.isInteger(k) && k >= 0)))
        throw new Error('an edit\'s path is a list of keys, each a string or a list\'s index')
      const own = (p.length === 1 && (p[0] === 'budget' || p[0] === 'bend')) || (p.length === 2 && (p[0] === 'wind' || p[0] === 'gust' || p[0] === 'trample'))
      if (!own && !(p[0] === 'grasses' && p.length > 2 && names.includes(p[1])))
        throw new Error(`${p.join('.')} is not the file's budget, its bend, a number of its wind, its gust or its trample, or of one of its grasses: ${names.join(', ')}`)
      if (e.value === undefined) throw new Error(`${p.join('.')} is given no value`)
      text = set(text, p as (string | number)[], e.value)
    }
    const next = JSON.parse(text)
    grassCheck(next)
    const scene = scenesOf(game).find(s => s.name === found.scenes[0])!.scene
    const world = { ...scene.world, scenemanager: { ...scene.world?.scenemanager, home: pathToFileURL(path.join(gamesDir, game) + '/').href } }
    await prepare({}, [], world)
    const ops = opsOf(world)
    for (const [name, g] of Object.entries<Json>(next.grasses)) {
      if (g.program) compileProgram(ops, g.program, 'program', `grass3d grass ${name} program`, grassOuts)
    }
    if (text === was) return { written: false }
    fs.writeFileSync(full + '.tmp', text)
    fs.renameSync(full + '.tmp', full)
    return { written: true }
  }

  // ---- the item3d workshop ----

  // The game's bodies sheets as the item3d workshop opens them (`item3d.ts`): each bodies sheet a scene that
  // lists item3d names (`world.item3d.bodies`, an entry of its loader catalogue), once, from the first scene
  // that names it:
  //   file, url   the sheet's repo path, which a save writes, and its url as the catalogue has it
  //   scene       that first scene, which the page boots the game into; `scenes`, every scene that names it
  //   sheet       the sheet as it is on disk
  //   items       the names of that scene's `world.item3d.items`, which a hold may name
  //   fabrics     where that scene lists fabric3d: `{ file, url, fabrics }`, its fabrics file the same three
  //               ways, whose fabrics a body wears and whose pins and numbers the page tunes
  function itemSummary(game: string) {
    const sheets = new Map<string, { file: string; url: string; scene: string; scenes: string[]; sheet: Json; items: string[]; fabrics?: { file: string; url: string; fabrics: Json }; world: Json }>()
    const onDisk = (s: Loaded, key: unknown, what: string) => {
      const url = s.scene.world?.loader?.assets?.[key as string]?.url
      if (typeof url !== 'string') throw new Error(`${s.name} names the ${what} ${String(key)}, which is not in its loader catalogue`)
      const file = fileOf(url)
      const full = inside(root, file)
      if (!full || !full.startsWith(gamesDir + path.sep) || !fs.existsSync(full)) throw new Error(`${s.name}'s ${what} ${file} is not a file of games/`)
      return { file, url, full }
    }
    for (const s of scenesOf(game)) {
      const w = s.scene.world ?? {}
      const listed = (s.scene.plugins ?? []) as string[]
      if (!listed.includes('item3d') || w.item3d?.bodies === undefined) continue
      const { file, url, full } = onDisk(s, w.item3d.bodies, 'bodies sheet')
      const had = sheets.get(file)
      if (had) { had.scenes.push(s.name); continue }
      const cloth = listed.includes('fabric3d') && w.fabric3d ? onDisk(s, w.fabric3d.fabrics, 'fabrics file') : undefined
      sheets.set(file, {
        file, url, scene: s.name, scenes: [s.name], sheet: read(full), items: Object.keys(w.item3d.items ?? {}),
        ...(cloth ? { fabrics: { file: cloth.file, url: cloth.url, fabrics: read(cloth.full) } } : {}),
        world: w,
      })
    }
    if (!sheets.size) throw new Error(`${game} has no scene that lists item3d and names a bodies sheet (world.item3d.bodies)`)
    return { game, sheets: [...sheets.values()] }
  }

  // The item3d workshop's save: `{ file, lists?, fabrics? }`, `file` a bodies sheet the summary names.
  //   lists     `[{ path, items }]`, each a body's `holds`, `capsules` or `wears` (`['bodies', <body>, <list>]`)
  //             set to `items`, a row an item (`scenes.ts`'s `rows`). The sheet as it would be written is
  //             checked by item3d's own `check`.
  //   fabrics   `{ lists?, edits? }` of that sheet's scene's fabrics file: `lists` each a fabric's `pins`
  //             (`['fabrics', <fabric>, 'pins']`) set the same way, `edits` `[{ path, value }]`, each a number
  //             of a fabric set in place (`set`). The file as it would be written is checked by fabric3d's own
  //             `check`, with the words the scene's mods deliver.
  // Neither file is written unless both pass. Hands back `written`, the files changed.
  async function itemSaving(game: string, b: { file?: unknown; lists?: unknown; fabrics?: { lists?: unknown; edits?: unknown } }): Promise<{ written: string[] }> {
    const sheets = itemSummary(game).sheets
    const found = sheets.find(f => f.file === b.file)
    if (!found) throw new Error(`${String(b.file)} is none of ${game}'s bodies sheets: ${sheets.map(f => f.file).join(', ')}`)
    const keys = (p: unknown): p is (string | number)[] => Array.isArray(p) && p.every(k => typeof k === 'string' || (typeof k === 'number' && Number.isInteger(k) && k >= 0))
    const listsOf = (v: unknown, what: string): { path: (string | number)[]; items: unknown[] }[] => {
      if (v === undefined) return []
      if (!Array.isArray(v) || !v.every(l => l && keys(l.path) && Array.isArray(l.items))) throw new Error(`${what} is a list of { path, items }`)
      return v
    }
    const out: [string, string, string][] = []
    // the sheet
    const full = path.join(root, found.file)
    const was = fs.readFileSync(full, 'utf8')
    let text = was
    for (const l of listsOf(b.lists, 'lists')) {
      if (l.path.length !== 3 || l.path[0] !== 'bodies' || !['holds', 'capsules', 'wears'].includes(l.path[2] as string))
        throw new Error(`${l.path.join('.')} is not a body's holds, capsules or wears`)
      text = rows(text, l.path, l.items)
    }
    bodiesCheck(JSON.parse(text), found.items)
    out.push([found.file, was, text])
    // its fabrics file
    if (b.fabrics !== undefined) {
      if (!found.fabrics) throw new Error(`${found.scene} lists no fabric3d, so ${found.file} has no fabrics file`)
      const fullCloth = path.join(root, found.fabrics.file)
      const wasCloth = fs.readFileSync(fullCloth, 'utf8')
      let cloth = wasCloth
      const names = Object.keys(found.fabrics.fabrics.fabrics ?? {})
      const ofFabric = (p: (string | number)[]) => p[0] === 'fabrics' && names.includes(p[1] as string)
      for (const l of listsOf(b.fabrics.lists, 'fabrics.lists')) {
        if (l.path.length !== 3 || !ofFabric(l.path) || l.path[2] !== 'pins') throw new Error(`${l.path.join('.')} is not the pins of one of the file's fabrics: ${names.join(', ')}`)
        cloth = rows(cloth, l.path, l.items)
      }
      const edits = b.fabrics.edits ?? []
      if (!Array.isArray(edits)) throw new Error('fabrics.edits is a list of { path, value }')
      for (const e of edits as { path?: unknown; value?: unknown }[]) {
        if (!keys(e?.path) || e.path.length < 3 || !ofFabric(e.path)) throw new Error(`${Array.isArray(e?.path) ? e.path.join('.') : String(e?.path)} is not a number of one of the file's fabrics: ${names.join(', ')}`)
        if (e.value === undefined) throw new Error(`${e.path.join('.')} is given no value`)
        cloth = set(cloth, e.path, e.value)
      }
      const world = { ...found.world, scenemanager: { ...found.world.scenemanager, home: pathToFileURL(path.join(gamesDir, game) + '/').href } }
      await prepare({}, [], world)
      fabricCheck(JSON.parse(cloth), world.fabric3d, fabricWords(world), world)
      out.push([found.fabrics.file, wasCloth, cloth])
    }
    const written: string[] = []
    for (const [file, before, after] of out) {
      if (after === before) continue
      const at = path.join(root, file)
      fs.writeFileSync(at + '.tmp', after)
      fs.renameSync(at + '.tmp', at)
      written.push(file)
    }
    return { written }
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
  //             `loader` its catalogue cut to the sheets (the only files an effect draws from) and the
  //             effects file itself (whose `files` particle3d reads from beside it), and
  //             `lights3d` when the scene lists lights3d, which draws an effect's `lamp`, and
  //             `dither3d` when the scene lists dither3d, so the stage draws the frame as the game does.
  //   plugins   the plugins the stage lists, in the scene's order: particle3d, lights3d, dither3d and
  //             skydome3d when the scene lists them, render3d.
  //   render3d  the scene's render3d prefab, so the tone, the exposure and the bloom are the game's.
  //   sky       the scene's skydome3d row's prefab, when the scene lists skydome3d (`world.skydome3d`
  //             is then in `world`): the sky the stage draws, its time of day the page's to turn.
  //   dt        the scene's step, which particle3d moves every effect by.
  //   thrown    the thrown source's numbers, the stage file's `thrown` (`particles.stage.json`,
  //             `thrown.ts`): the body box3d throws across the stage for an effect to ride.
  //   listed    each file the effects file lists (`files`), in its order: `file`, its path as `file` is
  //             written, and `effects`, the file as it is on disk. particle3d plays their effects, force
  //             generators and drivers as the effects file's own, and a save of one of them writes it.
  //   ui3d      each scene naming the effects file that lists ui3d and gives `world.ui3d.looks`, found as
  //             the effects file is: `scene`, its name; `file`, the repo path of its looks file; `looks`,
  //             the file as it is on disk; and `world`, what the stage adds to its own to show them:
  //             `ui3d`, the scene's (its overlay, keys, looks and the mods that deliver its words), and
  //             `loader`'s catalogue cut to the looks file and every model a look of it names. The page's
  //             ui3d mode shows each look on the stage with ui3d and the scene's words, its particles
  //             played by the stage's particle3d from the effects file being tuned.
  type Ui3d = { scene: string; file: string; looks: Json; world: Json }
  function particlesSummary(game: string) {
    const files = new Map<string, { file: string; key: string; scenes: string[]; effects: Json; world: Json; plugins: string[]; render3d: Json; sky?: Json; dt: number; thrown: Json; listed: Listed[]; ui3d: Ui3d[] }>()
    // A scene's looks file, when it lists ui3d and names one.
    const looksOf = (s: Loaded, lists: string[], w: Json): Ui3d | undefined => {
      if (!lists.includes('ui3d') || typeof w.ui3d?.looks !== 'string') return undefined
      const at = w.loader?.assets?.[w.ui3d.looks]
      if (typeof at?.url !== 'string' || at.type !== 'json') throw new Error(`${s.name} names the looks file ${w.ui3d.looks}, which is not a json entry of its loader catalogue`)
      const file = fileOf(at.url)
      const full = inside(root, file)
      if (!full || !fs.existsSync(full)) throw new Error(`${s.name}'s looks file ${file} is not a file`)
      const looks = read(full)
      const models = Object.values(looks as Record<string, Json>).map(l => l.model).filter((m): m is string => typeof m === 'string')
      for (const m of models) if (w.loader.assets[m]?.type !== 'model') throw new Error(`${file}'s looks name the model ${m}, which is not a model entry of ${s.name}'s loader catalogue`)
      const assets = Object.fromEntries([w.ui3d.looks, ...models].map(k => [k, w.loader.assets[k]]))
      return { scene: s.name, file, looks, world: { ui3d: w.ui3d, loader: { assets } } }
    }
    for (const s of scenesOf(game)) {
      const lists = (s.scene.plugins ?? []) as string[]
      const w = s.scene.world ?? {}
      if (!lists.includes('particle3d') || !w.particle3d) continue
      const key = w.particle3d.effects
      const url = w.loader?.assets?.[key]?.url
      if (typeof url !== 'string') throw new Error(`${s.name} names the effects file ${key}, which is not in its loader catalogue`)
      const file = fileOf(url)
      const ui3d = looksOf(s, lists, w)
      const had = files.get(file)
      if (had) {
        had.scenes.push(s.name)
        if (ui3d) had.ui3d.push(ui3d)
        continue
      }
      const full = inside(root, file)
      if (!full || !full.startsWith(gamesDir + path.sep) || !fs.existsSync(full)) throw new Error(`${s.name}'s effects file ${file} is not a file of games/`)
      const sheets = Object.fromEntries(Object.entries((w.loader.assets ?? {}) as Record<string, Json>).filter(([k, e]) => e.type === 'sheet' || k === key))
      const plugins = lists.filter(p => p === 'particle3d' || p === 'instances3d' || p === 'lights3d' || p === 'dither3d' || p === 'skydome3d' || p === 'render3d')
      const effects = read(full)
      files.set(file, {
        file, key, scenes: [s.name], effects, listed: listedOf(full, effects),
        world: { particle3d: w.particle3d, loader: { ...w.loader, assets: sheets }, ...(plugins.includes('instances3d') ? { instances3d: w.instances3d } : {}), ...(plugins.includes('lights3d') ? { lights3d: w.lights3d } : {}), ...(plugins.includes('dither3d') ? { dither3d: w.dither3d } : {}), ...(plugins.includes('skydome3d') ? { skydome3d: w.skydome3d } : {}), ...(w.shipped ? { shipped: w.shipped } : {}) },
        plugins, render3d: s.scene.prefabs?.render3d ?? {}, ...(plugins.includes('skydome3d') ? { sky: s.scene.prefabs?.skydome3d } : {}), dt: s.scene.prefabs?.engine?.dt ?? 1 / 60,
        thrown: read(STAGE).thrown,
        ui3d: ui3d ? [ui3d] : [],
      })
    }
    return { files: [...files.values()] }
  }

  // The particle workshop's save: `{ file, effects }`, `file` an effects file the summary names and
  // `effects` each effect changed, by name, its whole list of layers, each set in place at
  // `effects.<name>` (`scenes.ts`'s `set`), the rest of the file and its layout kept; an effect it does
  // not have yet is added at the end. The file as it would be written is checked by particle3d's own
  // `check`, and written only when it passes and parses; hands back whether it was written.
  function particlesSaving(game: string, b: Saved): Promise<{ written: boolean }> {
    const s = particlesSummary(game)
    const found = s.files.find(f => f.file === b.file || f.listed.some(l => l.file === b.file))
    if (!found) throw new Error(`${String(b.file)} is none of ${game}'s effects files, nor a file one lists: ${s.files.flatMap(f => [f.file, ...f.listed.map(l => l.file)]).join(', ')}`)
    return listedWriting(path.join(root, found.file), found, b)
  }

  // A file an effects file lists (`files`): its path as the page names it (`label`), where it is, and
  // the file as it is on disk.
  type Listed = { file: string; full: string; effects: Json }
  // Each file the effects file at `full`, read as `effects`, lists, from its folder, in its order.
  function listedOf(full: string, effects: Json): Listed[] {
    return ((effects.files ?? []) as string[]).map(rel => {
      const at = path.resolve(path.dirname(full), rel)
      if (!fs.existsSync(at)) throw new Error(`${label(full)} lists ${rel}, which is no file`)
      return { file: label(at), full: at, effects: read(at) }
    })
  }
  // The effects file `main` with the files it lists laid over it, as particle3d lays them when it reads
  // it: one file of every effect, force generator and driver, listing none.
  function gathered(main: Json, listed: Json[]): Json {
    const { files: _, ...whole } = main
    whole.effects = Object.assign({}, main.effects, ...listed.map(l => l.effects))
    if (main.forceGenerators || listed.some(l => l.forceGenerators)) whole.forceGenerators = Object.assign({}, main.forceGenerators, ...listed.map(l => l.forceGenerators))
    if (main.drivers || listed.some(l => l.drivers)) whole.drivers = Object.assign({}, main.drivers, ...listed.map(l => l.drivers))
    return whole
  }
  // A save into the effects file at `main`, of the summary entry `found`, or into a file it lists, as
  // `b.file` names it; the file written checked with every other of the set as it is on disk, gathered as
  // particle3d gathers them, so a layer may be in a force generator or name a driver of another file.
  function listedWriting(main: string, found: { file: string; effects: Json; world: Json; listed: Listed[] }, b: Saved): Promise<{ written: boolean }> {
    if (b.file === found.file) return effectsWriting(main, found.world, b, now => gathered(now, found.listed.map(l => l.effects)))
    const into = found.listed.find(l => l.file === b.file)
    if (!into) throw new Error(`${String(b.file)} is neither ${found.file} nor a file it lists: ${found.listed.map(l => l.file).join(', ')}`)
    return effectsWriting(into.full, found.world, b, now => gathered(found.effects, found.listed.map(l => (l === into ? now : l.effects))))
  }

  // Each effect of `effects` set in place in the effects file at `full`, and the file's `drivers` and
  // `forceGenerators` set whole when they are given, checked by particle3d's own `check` against
  // `world.particle3d` and the words the scene's mods deliver (its mods loaded as a truth loads them),
  // and written only when it passes and parses. A save gives at least one of the three. `whole` hands
  // back what is checked, from the file as it would be written: the set of files it is one of, gathered.
  type Saved = { file?: unknown; effects?: unknown; drivers?: unknown; forceGenerators?: unknown }
  async function effectsWriting(full: string, world: Json, b: Saved, whole: (now: Json) => Json): Promise<{ written: boolean }> {
    const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
    if (b.effects === undefined && b.drivers === undefined && b.forceGenerators === undefined) throw new Error('a save is effects, each effect changed, by name, its list of layers; drivers, the file\'s drivers; or forceGenerators, the file\'s force generators')
    if (b.effects !== undefined && (!record(b.effects) || (!Object.keys(b.effects).length && b.drivers === undefined && b.forceGenerators === undefined))) throw new Error('effects is each effect changed, by name, its list of layers')
    if (b.drivers !== undefined && !record(b.drivers)) throw new Error('drivers is the file\'s drivers, each a number or an expression by name')
    if (b.forceGenerators !== undefined && !record(b.forceGenerators)) throw new Error('forceGenerators is the file\'s force generators, each a list of entries by name')
    let text = fs.readFileSync(full, 'utf8')
    if (b.drivers !== undefined) text = set(text, ['drivers'], b.drivers)
    if (b.forceGenerators !== undefined) text = set(text, ['forceGenerators'], b.forceGenerators)
    for (const [name, layers] of Object.entries((b.effects ?? {}) as Record<string, unknown>)) {
      if (!Array.isArray(layers) || !layers.every(l => l && typeof l === 'object' && !Array.isArray(l))) throw new Error(`${name} is a list of layers, each an object`)
      text = set(text, ['effects', name], layers)
    }
    const now = JSON.parse(text) // never write a file that does not parse
    // a game's own plugins' mods are found in its folder, the effects file's game's
    const game = /^games\/([^/]+)\//.exec(label(full))?.[1]
    await prepare({}, [], game ? { ...world, scenemanager: { ...world.scenemanager, home: pathToFileURL(path.join(gamesDir, game) + '/').href } } : world)
    particleCheck(whole(now), world.particle3d, drawers(world), world)
    if (text === fs.readFileSync(full, 'utf8')) return { written: false }
    fs.writeFileSync(full + '.tmp', text)
    fs.renameSync(full + '.tmp', full)
    return { written: true }
  }

  // The effects file the server was started on (`--effects <path>`), as the particle workshop draws it:
  // one entry in the shape `particlesSummary` gives, `file` its path as given, from the root where it is
  // under it. Its stage is that of the first scene of any game that names the file, so a game's file is
  // seen in the game's own light; a file no game names is seen on the workshop's own stage,
  // `particles.stage.json`. Its catalogue is the scene's sheets, the sheets given (`--sheet <key>=<path>`,
  // over the scene's of the same key) and the file itself, each given file served from its own folder
  // (`/given/effects/…`, `/given/sheet/<key>/…`). Throws naming each sheet a layer of the file, or of a
  // file its `files` lists, draws from that the catalogue has not.
  const STAGE = fileURLToPath(new URL('./particles.stage.json', import.meta.url))
  const label = (full: string) => (full.startsWith(root + path.sep) ? path.relative(root, full) : full)
  // The game scene that names the given file, found by reading every game's scenes: half a second, so
  // kept until a file under games/ is written (the watcher below forgets it).
  type Named = { game: string; f: ReturnType<typeof particlesSummary>['files'][number] } | undefined
  let scanned: { named: Named } | undefined
  function givenSummary() {
    if (!given) throw new Error('the workshop was started on no effects file: run it with --effects <path>')
    const effects = read(given.effects)
    if (!scanned) {
      const games = fs.existsSync(gamesDir) ? fs.readdirSync(gamesDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && fs.existsSync(path.join(gamesDir, d.name, `${d.name}.scene.json`))).map(d => d.name).sort() : []
      let found: Named
      for (const game of games) {
        let files: ReturnType<typeof particlesSummary>['files']
        try { files = particlesSummary(game).files } catch { continue }
        const f = files.find(x => path.join(root, x.file) === given.effects)
        if (f) { found = { game, f }; break }
      }
      scanned = { named: found }
    }
    const { named } = scanned
    const stage = read(STAGE)
    const key = named?.f.key ?? 'effects'
    const sheets: Record<string, Json> = Object.fromEntries(Object.entries((named?.f.world.loader.assets ?? {}) as Record<string, Json>).filter(([k]) => k !== key))
    for (const [k, full] of Object.entries(given.sheets)) sheets[k] = { type: 'sheet', url: `/given/sheet/${encodeURIComponent(k)}/${encodeURIComponent(path.basename(full))}` }
    const drawn = new Set<string>()
    const take = (e: Json) => {
      for (const layers of Object.values((e?.effects ?? {}) as Record<string, Json[]>)) for (const l of layers) if (l && typeof l.sheet === 'string') drawn.add(l.sheet)
    }
    const listed = listedOf(given.effects, effects)
    take(effects)
    for (const l of listed) take(l.effects)
    const lacking = [...drawn].filter(k => !sheets[k])
    if (lacking.length) throw new Error(`${label(given.effects)} draws from the sheet${lacking.length === 1 ? '' : 's'} ${lacking.join(', ')}, which no game's scene catalogues for it: give each as --sheet <key>=<path of its sheet json>`)
    const world = named ? named.f.world : stage.world
    return {
      files: [{
        file: label(given.effects), key,
        scenes: named ? named.f.scenes.map(s => `${named!.game}/${s}`) : [],
        effects, listed,
        world: {
          ...world,
          particle3d: { ...world.particle3d, effects: key },
          loader: { assets: { ...sheets, [key]: { type: 'json', url: `/given/effects/${encodeURIComponent(path.basename(given.effects))}` } } },
        },
        plugins: named ? named.f.plugins : stage.plugins,
        render3d: named ? named.f.render3d : stage.render3d,
        sky: named ? named.f.sky : stage.sky,
        dt: named ? named.f.dt : stage.dt,
        thrown: stage.thrown,
        ui3d: named ? named.f.ui3d : [],
      }],
    }
  }

  // ---- events ----

  const clients = new Set<http.ServerResponse>()
  const timers = new Map<string, NodeJS.Timeout>()
  const watcher = fs.existsSync(gamesDir) ? fs.watch(gamesDir, { recursive: true }, (_e, name) => {
    if (!name || name.endsWith('.tmp')) return
    scanned = undefined
    const rel = path.join('games', name.toString())
    clearTimeout(timers.get(rel))
    timers.set(rel, setTimeout(() => {
      timers.delete(rel)
      for (const c of clients) c.write(`data: changed ${rel}\n\n`)
    }, DEBOUNCE))
  }) : undefined
  // The effects file given and each file it lists (`files`) as the server starts, watched where each is,
  // under games/ or not, sent as changed by the path the page knows it by. Which files are watched is
  // asked again at each change, so a file the given one lists from then on is sent too when it is in a
  // folder already watched.
  const givenFiles = (): string[] => {
    if (!given) return []
    try { return [given.effects, ...listedOf(given.effects, read(given.effects)).map(l => l.full)] } catch { return [given.effects] }
  }
  const givenWatchers = [...new Set(givenFiles().map(f => path.dirname(f)))].map(dir => fs.watch(dir, (_e, name) => {
    if (!name) return
    const full = path.join(dir, name.toString())
    if (!givenFiles().includes(full)) return
    const rel = label(full)
    if (rel.startsWith('games' + path.sep)) return // the watch on games/ sends it
    clearTimeout(timers.get(rel))
    timers.set(rel, setTimeout(() => {
      timers.delete(rel)
      for (const c of clients) c.write(`data: changed ${rel}\n\n`)
    }, DEBOUNCE))
  }))

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
      if (p === '/puppet3d') return file(res, path.join(here, 'puppet3d.html'))
      if (p === '/hair3d') return file(res, path.join(here, 'hair3d.html'))
      if (p === '/grass3d') return file(res, path.join(here, 'grass3d.html'))
      if (p === '/item3d') return file(res, path.join(here, 'item3d.html'))
      if (p === '/views') return file(res, path.join(here, 'views.html'))
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
        if (parts[1] === 'particles' && parts.length === 2) {
          if (req.method === 'GET') {
            try { return send(res, 200, givenSummary()) } catch (e) { return send(res, 404, { error: (e as Error).message }) }
          }
          if (req.method === 'POST') {
            const b = await body(req)
            try {
              const [found] = givenSummary().files
              return send(res, 200, await listedWriting(given!.effects, found, b))
            } catch (e) { return send(res, 400, { error: (e as Error).message }) }
          }
        }
        if (parts[1] === 'particles' && parts.length === 3) {
          if (req.method === 'GET') {
            try { return send(res, 200, particlesSummary(parts[2])) } catch (e) { return send(res, 404, { error: (e as Error).message }) }
          }
          if (req.method === 'POST') {
            const b = await body(req)
            try { return send(res, 200, await particlesSaving(parts[2], b)) } catch (e) { return send(res, 400, { error: (e as Error).message }) }
          }
        }
        if (parts[1] === 'puppet3d' && parts.length === 4 && parts[3] === 'library' && req.method === 'POST') {
          const b = await body(req)
          try { return send(res, 200, { written: puppetToLibrary(parts[2], b) }) } catch (e) { return send(res, 400, { error: (e as Error).message }) }
        }
        if (parts[1] === 'puppet3d' && parts.length === 4 && parts[3] === 'layer' && req.method === 'POST') {
          const b = await body(req)
          try { return send(res, 200, { written: puppetLayer(parts[2], b) }) } catch (e) { return send(res, 400, { error: (e as Error).message }) }
        }
        if (parts[1] === 'puppet3d' && parts.length === 3) {
          if (req.method === 'GET') {
            try { return send(res, 200, puppetSummary(parts[2])) } catch (e) { return send(res, 404, { error: (e as Error).message }) }
          }
          if (req.method === 'POST') {
            const b = await body(req)
            try { return send(res, 200, { written: puppetSaving(parts[2], b) }) } catch (e) { return send(res, 400, { error: (e as Error).message }) }
          }
        }
        if (parts[1] === 'hair3d' && parts.length === 3) {
          if (req.method === 'GET') {
            try { return send(res, 200, hairSummary(parts[2])) } catch (e) { return send(res, 404, { error: (e as Error).message }) }
          }
          if (req.method === 'POST') {
            const b = await body(req)
            try { return send(res, 200, await hairSaving(parts[2], b)) } catch (e) { return send(res, 400, { error: (e as Error).message }) }
          }
        }
        if (parts[1] === 'grass3d' && parts.length === 3) {
          if (req.method === 'GET') {
            try { return send(res, 200, grassSummary(parts[2])) } catch (e) { return send(res, 404, { error: (e as Error).message }) }
          }
          if (req.method === 'POST') {
            const b = await body(req)
            try { return send(res, 200, await grassSaving(parts[2], b)) } catch (e) { return send(res, 400, { error: (e as Error).message }) }
          }
        }
        if (parts[1] === 'item3d' && parts.length === 3) {
          if (req.method === 'GET') {
            try { return send(res, 200, itemSummary(parts[2])) } catch (e) { return send(res, 404, { error: (e as Error).message }) }
          }
          if (req.method === 'POST') {
            const b = await body(req)
            try { return send(res, 200, await itemSaving(parts[2], b)) } catch (e) { return send(res, 400, { error: (e as Error).message }) }
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
        // `<folder>/looks.json`, the kinds with a look in that folder of a game, read off the folder as it is:
        // what a page's client reads before it imports any row's look (`engine/browser.ts`), as the dev
        // server answers it (`vite.config.ts`), for the item3d workshop's page, which runs a game's scene.
        if (full && parts[0] === 'games' && path.basename(full) === 'looks.json' && !fs.existsSync(full) && fs.existsSync(path.dirname(full)))
          return send(res, 200, looks(fs.readdirSync(path.dirname(full))))
        return full ? file(res, full, url.searchParams.has('instance')) : send(res, 403, { error: `outside ${parts[0]}` })
      }
      // The workshop's own folder by its repo path: a page loaded from here (`/tools/workshop/hair3d.ts`,
      // `/tools/workshop/grass3d.ts`)
      // imports the workshop's own plugins beside it (`tools/workshop/plugins/<p>/`), which its stage lists
      // as a game lists its own, its `world.scenemanager.home` `/tools/workshop/`, where their mods are found.
      if (parts[0] === 'tools' && parts[1] === 'workshop') {
        const full = inside(here, parts.slice(2).join('/'))
        return full ? file(res, full) : send(res, 403, { error: 'outside the workshop' })
      }
      // The given effects file's folder, and each given sheet's, whose pages are beside it.
      if (parts[0] === 'given' && given) {
        const dir = parts[1] === 'effects' ? path.dirname(given.effects)
          : parts[1] === 'sheet' && given.sheets[parts[2]] ? path.dirname(given.sheets[parts[2]]) : undefined
        const full = dir && inside(dir, parts.slice(parts[1] === 'effects' ? 2 : 3).join('/'))
        return full ? file(res, full) : send(res, 403, { error: 'outside the given files\' folders' })
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
        for (const w of givenWatchers) w.close()
        for (const c of clients) c.end()
        for (const t of timers.values()) clearTimeout(t)
        server.close(() => closed())
      }),
    })
  }))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  // `--effects <path>`: the particle workshop opens on that effects file; `--sheet <key>=<path>`, as
  // many as it draws from, a sheet it names by `key` that no game's scene catalogues for it.
  const args = process.argv.slice(2)
  let effects: string | undefined
  const sheets: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--effects' && args[i + 1]) effects = args[++i]
    else if (a === '--sheet' && /^[^=]+=.+$/.test(args[i + 1] ?? '')) {
      const [k, ...rest] = args[++i].split('=')
      sheets[k] = rest.join('=')
    } else throw new Error(`${a} is not --effects <path> or --sheet <key>=<path>`)
  }
  if (Object.keys(sheets).length && !effects) throw new Error('--sheet is a sheet of the effects file given by --effects, and none was given')
  start({ port: Number(process.env.WORKSHOP_PORT ?? 5180), root, effects, sheets }).then(s =>
    console.log(effects ? `particle workshop on ${effects} at ${s.url}/particles` : `workshop at ${s.url}`))
}
