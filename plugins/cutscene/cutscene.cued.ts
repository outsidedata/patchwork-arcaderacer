// A scene's cue file checked for the dev server (`cutscene.serve.ts`), run as
//
//   node --experimental-strip-types plugins/cutscene/cutscene.cued.ts <manager scene file> <scene> file|frames
//
// with the cue file, as JSON, on its standard input. The scene is loaded as the game loads it
// (scenemanager's `child`) and its world's mods loaded (`prepare`), so the steps it delivers are known.
//   file     the cue file held to what the panel holds a change to (`cutscene.cues.ts`'s `refusal`):
//            cutscene's `check` with the scene's delivered steps, every name a cue places at a cast
//            member or a mark of the scene, every clip and gear one of its member's rig, every sound one
//            of the scene's, a `go` one of the game's scenes; what the file on the disk had already let
//            be. Prints `{ file }`, the cue file's path from the repo, or `{ error }` naming what is wrong.
//   frames   the cue file's own check, the script beside it of its name (`assets/intro.ts` beside
//            `assets/intro.json`), its `failing(script)`: printed as `{ failed: [{ shot, e, text }] }`,
//            `{ none }` when there is no script there, or `{ error }` when it throws or has no `failing`.
// A process of its own each time, since node keeps an import for the life of a process, and the
// game's own check boots the whole game.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { child, prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { stepsOf, type Script } from './cutscene.sim.ts'
import { build, refusal, type Context } from './cutscene.cues.ts'

const [managerFile, name, mode] = process.argv.slice(2)
const manager = path.resolve(managerFile)
const top = JSON.parse(fs.readFileSync(manager, 'utf8'))
const base = pathToFileURL(manager).href
const root = path.resolve(path.dirname(manager), '../..')
// What it found, written, and then the process ended, whatever the game's code left running.
const said = (v: unknown) => process.stdout.write(JSON.stringify(v), () => process.exit(0))

try {
  const script = JSON.parse(fs.readFileSync(0, 'utf8')) as Script
  const table = top.prefabs?.scenemanager?.scenes ?? {}
  if (!table[name]) throw new Error(`the manager names no scene ${name}: its scenes are ${Object.keys(table).join(', ')}`)
  const { scene, sim } = await child(top, name, table[name], base)
  const world = scene.world ?? {}
  if (!(scene.actors ?? []).some((a: { is: string }) => a.is === 'cutscene')) throw new Error(`${name} has no cutscene row`)
  const assets = (world.loader?.assets ?? {}) as Record<string, { type: string; url: string }>
  const key = world.cutscene?.script as string
  const url = assets[key]?.type === 'json' ? assets[key].url : undefined
  if (!url) throw new Error(`${name}'s world.cutscene.script names no json entry of its catalogue`)
  const file = path.join(root, url.replace(/^\//, ''))
  if (mode === 'frames') {
    const check = file.replace(/\.json$/, '.ts')
    if (!fs.existsSync(check)) {
      said({ none: `${path.relative(root, file)} has no check beside it, ${path.relative(root, check)}` })
    } else {
      const m = await import(pathToFileURL(check).href)
      if (typeof m.failing !== 'function') throw new Error(`${path.relative(root, check)} exports no failing(script)`)
      said({ failed: await m.failing(script) })
    }
  } else {
    await prepare(sim, [], world)
    const read = (u: string) => { try { return JSON.parse(fs.readFileSync(path.join(root, u.replace(/^\//, '')), 'utf8')) } catch { return undefined } }
    const context: Context = {
      scene: name, name: key,
      marks: (scene.actors ?? []).filter((a: { is: string }) => a.is === 'mark').map((a: Record<string, unknown>) => ({ name: String(a.name ?? ''), at: (a.at as number[]) ?? [0, 0] })),
      sounds: Object.keys(world.audio?.cues ?? {}),
      rig: kind => { const r = world.anim?.kinds?.[kind]?.rig; return r && assets[r] ? read(assets[r].url) : undefined },
      steps: stepsOf(world),
      scenes: Object.keys(table),
    }
    const was = read(url) as Script | undefined
    const why = refusal(build(context, was && Array.isArray(was.cues) && was.cast ? was : { ...script, cues: [] }), script)
    said(why ? { error: why } : { file: path.relative(root, file) })
  }
} catch (e) {
  said({ error: (e as Error).message })
}
