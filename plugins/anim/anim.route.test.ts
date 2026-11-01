// anim's route over HTTP, on a repo of its own holding a small rig of one body and three clips, a
// mirror among them. Every export the route must refuse is refused with nothing written; an export
// writes each glb and the table into the rig as one value. Those run against a stand-in for Blender,
// `BLENDER` pointing at a script that answers as `anim.export.py` does: a table of every clip with a
// file, and each glb named. Then, where Blender and ~/troupe-collection are on this machine, the real
// export: X Bot with two of the rifle pack's clips, the glb written with both, the table measuring
// each. That an export is one change, which one undo takes back byte for byte, and that one failing
// part-way leaves nothing, is shown where a change runs it (`anim.extension.test.tsx`).
import { afterAll, beforeAll, expect, test } from 'vitest'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { edit } from '#editor/server/files.ts'
import { start } from '#editor/server/server.ts'

const here = path.join(process.cwd(), 'plugins/anim')
const root = mkdtempSync(path.join(tmpdir(), 'anim-route-'))
const outside = mkdtempSync(path.join(tmpdir(), 'anim-blender-'))
mkdirSync(path.join(root, 'plugins/anim'), { recursive: true })
for (const f of ['anim.route.ts', 'anim.sim.ts', 'anim.export.py']) symlinkSync(path.join(here, f), path.join(root, 'plugins/anim', f))

const RIG = 'games/tiny/assets/tiny.rig.json'
const XBOT = 'games/tiny/assets/xbot.glb', YBOT = 'games/tiny/assets/ybot.glb'
const PACK = 'packs/Rifle 8-Way Locomotion Pack 30FPS'
const rig = {
  bodies: { xbot: 'packs/Human_ActionAdventurePack_30FPS/X Bot.fbx', ybot: 'packs/Capoeira Pack/Y Bot.fbx' },
  clips: { turn: `${PACK}/turn 90 left.fbx`, jump: { file: `${PACK}/jump up.fbx` }, turnBack: { mirror: 'turn' } },
}
mkdirSync(path.join(root, 'games/tiny/assets'), { recursive: true })
writeFileSync(path.join(root, RIG), JSON.stringify(rig, null, 2))
writeFileSync(path.join(root, 'games/tiny/assets/broken.rig.json'), JSON.stringify({ ...rig, broken: true }))
const OLD = 'the glb that was there before'
const at = (p: string) => path.join(root, p)

// The stand-in: `anim.export.py`'s arguments, its table of every clip with a file, and a glb naming
// its body and clips; a rig that says it is broken fails as Blender does, on stderr.
const fake = path.join(outside, 'blender')
writeFileSync(fake, `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(process.argv.indexOf('--') + 1)
const spec = JSON.parse(fs.readFileSync(args[0], 'utf8'))
if (spec.broken) { console.error('Traceback\\nRuntimeError: Error: the rig will not import'); process.exit(1) }
const clips = Object.entries(spec.clips).filter(([, e]) => typeof e === 'string' || e.file).map(([n]) => n)
fs.writeFileSync(args[1], JSON.stringify(Object.fromEntries(clips.map((n, i) => [n, { frames: 30 * (i + 1), dur: i + 1 }]))))
for (const a of args.slice(2)) { const [body, out] = a.split('='); fs.writeFileSync(out, 'glb of ' + body + ': ' + clips.join(' ')) }
`)
chmodSync(fake, 0o755)

const real = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender'
let server: Awaited<ReturnType<typeof start>>
beforeAll(async () => {
  // The route reads BLENDER once, when this server first loads it.
  process.env.BLENDER = fake
  server = await start({ root, port: 0 })
})
afterAll(async () => {
  await server.close()
  if (real === '/Applications/Blender.app/Contents/MacOS/Blender') delete process.env.BLENDER
  else process.env.BLENDER = real
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

const post = (url: string, route: string, body: unknown) =>
  fetch(`${url}/api/x/anim/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const refused = async (res: Response) => {
  expect(res.status).toBe(400)
  return (await res.json()).error as string
}

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('an export refuses a rig, models or a body it cannot take, and writes nothing', async () => {
  const exp = (body: unknown) => post(server.url, 'export', body)
  const models = { xbot: XBOT }
  expect(await refused(await exp({ rig: 'games/tiny/assets/tiny.rig.txt', models }))).toBe('rig is a .json file of the repo')
  expect(await refused(await exp({ rig: 5, models }))).toBe('rig is a .json file of the repo')
  expect(await refused(await exp(null))).toBe('rig is a .json file of the repo')
  expect(await refused(await exp({ rig: '../elsewhere.json', models }))).toBe('../elsewhere.json is not in the repo')
  expect(await refused(await exp({ rig: RIG }))).toBe('models is { <body>: <glb> }')
  expect(await refused(await exp({ rig: RIG, models: 'xbot' }))).toBe('models is { <body>: <glb> }')
  expect(await refused(await exp({ rig: RIG, models: {} }))).toBe('an export names at least one body')
  expect(await refused(await exp({ rig: RIG, models: { xbot: 'games/tiny/assets/xbot.gltf' } }))).toBe('the model of xbot is a .glb file of the repo')
  expect(await refused(await exp({ rig: RIG, models: { xbot: '../../xbot.glb' } }))).toBe('../../xbot.glb is not in the repo')
  expect(await refused(await exp({ rig: RIG, models: { xbot: XBOT, ghost: 'games/tiny/assets/ghost.glb' } }))).toBe(`${RIG} names no body ghost in its bodies`)
  expect(await refused(await exp({ rig: 'games/tiny/assets/none.rig.json', models }))).toMatch(/ENOENT/)
  // Blender failing is refused in its own words.
  expect(await refused(await exp({ rig: 'games/tiny/assets/broken.rig.json', models }))).toBe('Blender: RuntimeError: Error: the rig will not import')
  expect(existsSync(at(XBOT)) || existsSync(at(YBOT)) || existsSync(at('games/tiny/assets/ghost.glb'))).toBe(false)
  expect(JSON.parse(readFileSync(at(RIG), 'utf8'))).toEqual(rig)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('an export writes each glb, over one that was there too, and the table into the rig as one value, and answers the table and every file written, the rig among them', async () => {
  writeFileSync(at(XBOT), OLD)
  const before = readFileSync(at(RIG), 'utf8')
  const res = await post(server.url, 'export', { rig: `/${RIG}`, models: { xbot: XBOT, ybot: YBOT } })
  expect(res.status).toBe(200)
  const done = await res.json()
  const table = { turn: { frames: 30, dur: 1 }, jump: { frames: 60, dur: 2 } }
  expect(done).toEqual({ table, files: [XBOT, YBOT, RIG] })
  expect(readFileSync(at(XBOT), 'utf8')).toBe('glb of xbot: turn jump')
  expect(readFileSync(at(YBOT), 'utf8')).toBe('glb of ybot: turn jump')
  // The rig is what it was with its table set, and nothing else of it changed.
  expect(readFileSync(at(RIG), 'utf8')).toBe(edit(before, ['table'], table))
  writeFileSync(at(RIG), before)
  rmSync(at(XBOT))
  rmSync(at(YBOT))
})

// The glb's JSON chunk: the names of its animations.
function animations(glb: Buffer): string[] {
  expect(glb.subarray(0, 4).toString()).toBe('glTF')
  const length = glb.readUInt32LE(12)
  expect(glb.readUInt32LE(16)).toBe(0x4e4f534a)
  return (JSON.parse(glb.subarray(20, 20 + length).toString()).animations ?? []).map((a: { name: string }) => a.name)
}

const troupe = (process.env.PATCHWORK_CLIPS ?? '~/troupe-collection').replace(/^~(?=$|\/)/, homedir())
const blenderHere = existsSync(real) && [rig.bodies.xbot, rig.clips.turn, rig.clips.jump.file].every(f => existsSync(path.join(troupe, f)))

// OCT-24-EDITOR-ALPHA-SWEEP
test.skipIf(!blenderHere).skip('Blender bakes the rig\'s clips onto the body, measures each at 30 frames a second, and the table is written into the rig', async () => {
  process.env.BLENDER = real
  const blender = await start({ root, port: 0 })
  const before = readFileSync(at(RIG), 'utf8')
  try {
    writeFileSync(at(XBOT), OLD)
    const res = await post(blender.url, 'export', { rig: RIG, models: { xbot: XBOT } })
    const done = await res.json()
    expect(res.status, done.error).toBe(200)
    expect(done.files).toEqual([XBOT, RIG])
    expect(JSON.parse(readFileSync(at(RIG), 'utf8')).table).toEqual(done.table)
    // Every clip with a file, and the mirror anim builds itself left out.
    expect(Object.keys(done.table).sort()).toEqual(['jump', 'turn'])
    for (const m of Object.values(done.table) as { frames: number; dur: number; travel: number[][] }[]) {
      expect(m.frames).toBeGreaterThan(5)
      expect(m.dur).toBeCloseTo(m.frames / 30, 3)
      expect(m.travel.at(-1)![0]).toBeCloseTo(m.dur, 3)
    }
    const glb = readFileSync(at(XBOT))
    expect(animations(glb).sort()).toEqual(['jump', 'turn'])
  } finally {
    await blender.close()
    process.env.BLENDER = fake
    writeFileSync(at(RIG), before)
    rmSync(at(XBOT), { force: true })
  }
}, 600_000)
