// motion3d's step of a bake: each clip's two offsets (motion3d's Offsets), for every body the rig
// measures, from that body's measures, written into the character's baked motion3d file. A game's bake
// runs it once anim's export has measured the clips and its measures are merged into the rig:
//   node --experimental-strip-types plugins/motion3d/motion3d.offsets.ts <rig.json> <motion3d.json>
// `motion3d.json` is the character's motion3d file (`xbot.motion3d.json`): its `moves` and `turns` say
// which clips anim carries the travel and the turn of, which is where the clip's bones are drawn. The
// offsets go beside it, in `<name>.motion3d.baked.json` (`xbot.motion3d.baked.json`).
//
// A clip's sidecar, `<clip>.motion3d.json` beside its FBX in `~/troupe-collection` (a mirrored clip's,
// its source's), says its spot and how it meets its point, its judgement, the one place it is said (a
// game's motions name the point, never the spot):
//   `{ spot, on, facing?, after? }`
//   spot    the bones of the spot, Mixamo's names (`LeftHand`, `Hips`; motion3d's `BONES`); none, the root
//   on      `both`, the spot on the point from the first frame to the last (a hang, a seat, a lap of a
//           climb); `begin`, on it at the first frame (up off a lip); `end`, on it at the last, facing its
//           way then (down into a seat); `face`, against the wall the clip's hands or feet are on (its
//           touches' `face`), the point that wall, `facing` `into` it or `along` it the way the spot goes
//   after   the name of a clip measured against a wall (`on: 'face'`): this clip is held to the same point
//           from where that one ends the root, its spot the root
// Every clip gives `held`, even one whose offsets come out zero; a clip that gives none stops the bake,
// naming it.
//
// It writes `{ held, offsets }`: `held`, every clip's judgement as its sidecar gives it, `{ <clip>: { spot,
// on, facing?, after? } }`, since a game reaches no sidecar; and `offsets` for every clip of the rig on
// every body it measures, zeros included, so motion3d finds every clip's there:
// `{ <body>: { <clip>: { beginOffset, endOffset, beginTurn, normal? } } }`, every
// number arithmetic on the body's measures (`motion3d.clip.ts`'s `rigOffsets`), in the rig file's own
// layout (one space a level, every array of plain values on one line), over the file it had.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Rig } from './motion3d.play.ts'
import { rigOffsets, type Held } from './motion3d.clip.ts'

// The rig file's own layout (the mixamo skill's `merge-table.mjs`): one space a level, every array of
// plain values on one line.
const flat = (a: unknown[]) => a.every(x => x === null || typeof x !== 'object')
function fmt(v: unknown, ind: number): string {
  const pad = ' '.repeat(ind), inner = ' '.repeat(ind + 1)
  if (Array.isArray(v)) {
    if (flat(v)) return `[${v.map(x => JSON.stringify(x)).join(', ')}]`
    return `[\n${v.map(x => inner + fmt(x, ind + 1)).join(',\n')}\n${pad}]`
  }
  if (v && typeof v === 'object') {
    const es = Object.entries(v)
    if (!es.length) return '{}'
    return `{\n${es.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${fmt(x, ind + 1)}`).join(',\n')}\n${pad}}`
  }
  return JSON.stringify(v)
}

// Each clip's judgement from its sidecar, `<clip>.motion3d.json` beside the clip's FBX in
// `~/troupe-collection`; a mirrored clip's is its source's. A clip with no sidecar throws, naming it.
function sidecar(rig: Rig): (clip: string) => Held {
  return function judge(clip: string): Held {
    const e = rig.clips[clip] as string | { file?: string; mirror?: string }
    if (typeof e === 'object' && e.mirror !== undefined) return judge(e.mirror)
    const file = typeof e === 'string' ? e : e.file
    if (!file) throw new Error(`motion3d: the rig's clip ${clip} names no FBX`)
    const at = path.join((process.env.PATCHWORK_CLIPS ?? '~/troupe-collection').replace(/^~(?=$|\/)/, os.homedir()), file.replace(/\.fbx$/i, '.motion3d.json'))
    if (!existsSync(at)) throw new Error(`motion3d: ${clip} has no sidecar at ${at}`)
    return JSON.parse(readFileSync(at, 'utf8')) as Held
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [rigPath, motionPath] = process.argv.slice(2)
  if (!rigPath || !motionPath) throw new Error('motion3d.offsets.ts <rig.json> <motion3d.json>')
  // The rig and what its bake measured, `<name>.rig.baked.json` beside it.
  const rig = { ...JSON.parse(readFileSync(rigPath, 'utf8')), ...JSON.parse(readFileSync(rigPath.replace(/\.json$/, '.baked.json'), 'utf8')) } as Rig
  const anim = JSON.parse(readFileSync(motionPath, 'utf8'))
  if (typeof anim.moves !== 'number' || typeof anim.turns !== 'number') throw new Error(`${motionPath} gives no moves and turns`)
  const judge = sidecar(rig)
  const held = Object.fromEntries(Object.keys(rig.clips).map(clip => [clip, judge(clip)]))
  const offsets = rigOffsets(rig, anim, judge)
  const out = motionPath.replace(/\.json$/, '.baked.json')
  writeFileSync(out, fmt({ held, offsets }, 0) + '\n')
  console.log('wrote', out)
  for (const [body, clips] of Object.entries(offsets)) {
    for (const [clip, o] of Object.entries(clips)) console.log(body, clip.padEnd(12), 'begin', JSON.stringify(o.beginOffset).padEnd(24), 'end', JSON.stringify(o.endOffset).padEnd(24), 'turn', o.beginTurn)
  }
}

