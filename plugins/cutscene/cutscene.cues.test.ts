// The cutscene panel's cue logic on a cue file of a scene this test makes up: a cast of two, `hero` an
// `actor` with a rig and `ship` a `dropship`, a mark `pad` at [10, 0], one sound cue `boom`, and a step
// the scene delivers in its own words, `land` (`who`, `to`), with a wait on it. The model's lanes,
// chips and times, waits held as the measure says, a failing frame of the check on its shot; every
// change it makes, and what it refuses and why. Then the measure pass on a real recorder of a game
// this test writes in a temp folder: a manager and one scene, whose `starter` starts its cutscene on
// an open act as a game's curtain does, sent by the seat as a page would, and an `actor` that walks
// where the cutscene sends it.
import { afterAll, expect, test } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Row, Scene } from '#engine/engine.ts'
import type { Rig } from '#plugins/anim/anim.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { recorder } from '#addons/recorder/recorder.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import type { Down } from '#addons/scenemanager/scenemanager.addon.ts'
import { check, type Script, type Steps } from './cutscene.sim.ts'
import * as cues from './cutscene.cues.ts'

const table = (dur: number) => ({ dur, forward: 0, left: 0, yaw: 0, travel: [[0, 0, 0, 0], [dur, 0, 0, 0]] })
const RIG = { clips: { idle: { loop: true }, walk: { loop: true, gear: 0 }, wave: {}, nod: {} }, roles: {}, table: { idle: table(2), walk: table(1), wave: table(1.5), nod: table(0.6) } } as unknown as Rig
// The scene's own step, as a game's plugin delivers one: a dropship sent down on a pad, which a wait
// holds on.
const STEPS: Steps = { land: { fields: { who: 'who', to: 'target' }, fire() {}, wait: { holds: () => false, longest: f => f.end } } }
const context = (more: Partial<cues.Context> = {}): cues.Context => ({
  scene: 'stage', name: 'intro', marks: [{ name: 'pad', at: [10, 0] }], sounds: ['boom'],
  rig: kind => (kind === 'actor' ? RIG : undefined), steps: STEPS, scenes: ['stage', 'menu'], ...more,
})
const FILE: Script = {
  end: 10, reach: 1, stop: 0.2, head: 1.5, fov: 50, pace: 1, limit: 4,
  cast: { hero: { kind: 'actor', name: 'hero' }, ship: { kind: 'dropship', name: 'ship' } },
  cues: [
    { at: 0, do: 'shot', name: 'wide', pos: [0, 5, -10], look: 'hero', over: 0 },
    { at: 0, do: 'land', who: 'ship', to: 'pad' },
    { at: 0.5, do: 'shot', name: 'push', pos: [0, 4, -8], look: 'hero', over: 2 },
    { at: 1, do: 'play', who: 'hero', clip: 'idle', holds: false, rate: 1 },
    { at: 2, do: 'wait', on: 'land' },
    { at: 2, do: 'gesture', who: 'hero', clip: 'wave' },
    { at: 3, do: 'say', who: 'hero', text: 'go', for: 2 },
    { at: 4, do: 'prepare', where: [5, 5] },
    { at: 5, do: 'play', who: 'hero', clip: 'nod', holds: false, rate: 2 },
    { at: 6, do: 'sound', cue: 'boom', where: 'pad' },
    { at: 7, do: 'fade', to: 1, over: 1 },
  ],
}
// A measure of the file whose wait held 1.5 s.
const held = (n = FILE.cues.length): cues.Measured => ({
  key: 'k', start: 10, total: 11.5, done: true,
  fired: Array(n).fill(0), holds: FILE.cues.map((_, i) => (i === 4 ? 1.5 : 0)), passed: Array(n).fill(false), arrive: Array(n).fill(NaN), limited: Array(n).fill(false), paths: {},
})

test('the file keeps cutscene\'s own check with the scene\'s steps, so the model is of a file the scene plays', () => {
  expect(() => check('intro', FILE, STEPS)).not.toThrow()
})

test('lanes, chips and lengths: the cast\'s, then camera, say, sound and screen; a step of the scene\'s on its who\'s lane, a wait on it on that step\'s lane', () => {
  const m = cues.build(context(), FILE)
  expect(m.lanes).toEqual(['hero', 'ship', 'camera', 'say', 'sound', 'screen'])
  const at = (i: number) => m.chips[i]
  expect(m.chips.map(c => c.lane)).toEqual(['camera', 'ship', 'camera', 'hero', 'ship', 'hero', 'say', 'screen', 'hero', 'sound', 'screen'])
  expect(at(1).label).toBe('land pad')
  expect(at(4).label).toBe('wait on land')
  expect(at(7).label).toBe('prepare 5, 5')
  // A looping clip runs to the next play on its lane; a clip that does not, its length at its rate.
  expect(at(3)).toMatchObject({ look: 'stripe', length: 4 })
  expect(at(8)).toMatchObject({ look: 'bar', length: 0.3 })
  expect(at(5).length).toBe(1.5)
  expect(at(6)).toMatchObject({ length: 2, resize: true })
  expect(at(2)).toMatchObject({ length: 2, resize: true, look: 'ramp' })
  expect(at(0).length).toBeUndefined()
  expect(at(10)).toMatchObject({ length: 1, resize: true })
  // The cast's chips may go onto another member's lane; a shot onto none.
  expect(at(5).lanes).toEqual(['hero', 'ship'])
  expect(at(0).lanes).toBeUndefined()
  // The kinds the form offers: cutscene's own, then the scene's.
  expect(m.dos).toEqual([...cues.DOS, 'land'])
  expect(m.problems).toEqual([])
})

test('elapsed time: every cue after a wait drawn its hold later, and a time in the hold going back to the wait', () => {
  const m = cues.build(context(), FILE, held())
  expect(m.elapsed(4)).toBe(2)
  expect(m.elapsed(5)).toBe(3.5)
  expect(m.elapsed(10)).toBe(8.5)
  expect(m.end).toBe(11.5)
  expect(m.toCue(5)).toBe(3.5)
  expect(m.toCue(2.7)).toBe(2)
  expect(m.toCue(1)).toBe(1)
  expect(m.holdMarks).toEqual([{ at: 2, length: 1.5 }])
  expect(m.note(5)[0]).toBe('3.5 s elapsed, after 1.5 s of waits')
  expect(m.note(4)).toContain('holds 1.5 s')
})

test('a failing frame of the check is on the shot that drew it: outlined, a problem naming what is wrong, and in its note', () => {
  const failed = [{ shot: 'push', e: 1.2, text: 'push at 1.20: hero is hidden from the camera by the hangar' }, { shot: 'push', e: 1.3, text: 'push at 1.30: hero is hidden from the camera by the hangar' }]
  const m = cues.build(context(), FILE, undefined, failed)
  expect(m.failed).toBe(failed)
  expect(m.chips[2].warn).toBe(true)
  expect(m.chips[0].warn).toBe(false)
  expect(m.problems).toEqual([{ cue: 2, text: '2 frames fail the check: push at 1.20: hero is hidden from the camera by the hangar' }])
  expect(m.note(2)).toContain('push at 1.30: hero is hidden from the camera by the hangar')
})

test('a cue added on a lane at the playhead: a play on a member\'s, a shot of the camera there is on the camera lane, and a lane there is not refused', () => {
  const eye = (): cues.Eye => ({ pos: [3, 12, 4], dir: [0, 0, -1], fov: 47.4 })
  const m = cues.build(context({ eye, height: () => () => 2 }), FILE, held())
  expect(cues.addEdits(m, 'hero', 6)).toEqual([{ at: ['cues', 11], value: { at: 4.5, do: 'play', who: 'hero', clip: 'idle', holds: false, rate: 1 } }])
  expect(cues.addEdits(m, 'camera', 1)).toEqual([{ at: ['cues', 11], value: { at: 1, do: 'shot', name: 'shot3', pos: [3, 10, 4], look: [3, 10, -6], fov: 47, over: 0 } }])
  expect(cues.addEdits(m, 'screen', 1, { do: 'land' })).toEqual([{ at: ['cues', 11], value: { at: 1, do: 'land', who: 'hero', to: 'pad' } }])
  expect(() => cues.addEdits(m, 'nope', 1)).toThrow('no lane nope: the lanes are hero, ship, camera, say, sound, screen')
  expect(() => cues.addEdits(cues.build(context({ sounds: [] }), FILE), 'sound', 1)).toThrow('stage has no sound cues')
})

test('a cue\'s fields set, its kind changed whole, a wait for a member or on a step, a shot given and let go of whom it follows', () => {
  const m = cues.build(context(), FILE)
  expect(cues.patched(m, 3, { clip: 'wave', rate: 2 })).toEqual([{ at: ['cues', 3, 'clip'], value: 'wave' }, { at: ['cues', 3, 'rate'], value: 2 }])
  expect(cues.patched(m, 7, { do: 'land' })).toEqual([{ at: ['cues', 7], value: { at: 4, do: 'land', who: 'hero', to: 'pad' } }])
  expect(cues.patched(m, 1, { do: 'walk' })).toEqual([{ at: ['cues', 1], value: { at: 0, do: 'walk', who: 'ship', to: 'pad', gear: null } }])
  expect(cues.patched(m, 4, { who: 'hero' })).toEqual([{ at: ['cues', 4, 'on'], value: undefined }, { at: ['cues', 4, 'who'], value: 'hero' }])
  const following = cues.edited(FILE, [{ at: ['cues', 0, 'follows'], value: 'hero' }, { at: ['cues', 0, 'frame'], value: 'body' }, { at: ['cues', 0, 'pos'], value: 'pad' }])
  const f = cues.build(context(), following)
  expect(cues.patched(f, 0, { follows: undefined })).toEqual([{ at: ['cues', 0, 'follows'], value: undefined }, { at: ['cues', 0, 'frame'], value: undefined }])
  expect(cues.patched(m, 2, { follows: 'hero' })).toEqual([{ at: ['cues', 2, 'follows'], value: 'hero' }])
  expect(cues.patched(cues.build(context(), cues.edited(FILE, [{ at: ['cues', 2, 'pos'], value: 'pad' }])), 2, { follows: 'hero' })).toEqual([{ at: ['cues', 2, 'pos'], value: [0, 2, -4] }, { at: ['cues', 2, 'follows'], value: 'hero' }])
  expect(() => cues.patched(m, 40, {})).toThrow('the cue file has no cue 40: its cues are 0 to 10')
})

test('cues moved in elapsed time back on the cue clock, onto another member\'s lane, to another length; what cannot be is refused', () => {
  const m = cues.build(context(), FILE, held())
  expect(cues.moveEdits(m, [{ cue: 5, at: 4.5, lane: 'ship' }])).toEqual([{ at: ['cues', 5, 'at'], value: 3 }, { at: ['cues', 5, 'who'], value: 'ship' }])
  expect(cues.moveEdits(m, [{ cue: 10, len: 2.5 }])).toEqual([{ at: ['cues', 10, 'over'], value: 2.5 }])
  expect(cues.moveEdits(m, [{ cue: 6, len: 2 }])).toEqual([])
  expect(() => cues.moveEdits(m, [{ cue: 0, lane: 'say' }])).toThrow('cue 0, a shot on camera, goes onto no other lane')
  expect(() => cues.moveEdits(m, [{ cue: 3, at: 20 }])).toThrow('cue 3 moved to 20 s would be past the end, 11.5 s elapsed')
  expect(() => cues.moveEdits(m, [{ cue: 5, len: 1 }])).toThrow('cue 5, a gesture, has no length')
  expect(() => cues.moveEdits(m, [{ cue: 5 }, { cue: 5 }])).toThrow('cue 5 is named twice')
  expect(cues.nudged(m, ['3', '5'], 0.5)).toEqual([{ at: ['cues', 3, 'at'], value: 1.5 }, { at: ['cues', 5, 'at'], value: 2.5 }])
})

test('cues taken out the last first, copied after the last at a time, duplicated after their end; the file\'s end, go and arrive', () => {
  const m = cues.build(context(), FILE)
  const out = cues.edited(FILE, cues.removeEdits(m, [3, 9]))
  expect(out.cues.map(c => c.do)).toEqual(['shot', 'land', 'shot', 'wait', 'gesture', 'say', 'prepare', 'play', 'fade'])
  expect(FILE.cues).toHaveLength(11)
  expect(cues.pasteEdits(m, [FILE.cues[5], FILE.cues[6]], 8)).toEqual([
    { at: ['cues', 11], value: { ...FILE.cues[5], at: 8 } },
    { at: ['cues', 12], value: { ...FILE.cues[6], at: 9 } },
  ])
  expect(cues.after(m, [5, 6])).toBe(5)
  expect(cues.after(m, [9])).toBe(6.5)
  expect(cues.fileEdits(m, { end: 12, go: 'menu', reach: 1 })).toEqual([{ at: ['end'], value: 12 }, { at: ['go'], value: 'menu' }])
})

test('a change refused, saying why: the check, a name no cast member or mark has, a clip of no rig, a sound the scene has not, a go to no scene; a name the file had let be', () => {
  const m = cues.build(context(), FILE)
  const refused = (edits: cues.Edit[]) => cues.refusal(m, cues.edited(FILE, edits))
  expect(refused([{ at: ['cues', 3, 'clip'], value: 'wave' }])).toBeUndefined()
  expect(refused([{ at: ['cues', 0, 'over'], value: 1 }])).toBe('intro: cue 0 (shot at 0): the first shot has an over, and before it the camera is not the cutscene\'s')
  expect(refused([{ at: ['cues', 1, 'who'], value: 'rover' }])).toBe('intro: cue 1 (land at 0): who "rover" is not a cast member: hero, ship')
  expect(refused([{ at: ['cues', 2, 'look'], value: 'tower' }])).toBe('no cast member or mark is named tower: the cast is hero, ship, and the marks are pad')
  expect(refused([{ at: ['cues', 3, 'clip'], value: 'dance' }])).toBe('dance is not a clip of hero\'s rig: its clips are idle, walk, wave, nod')
  expect(refused([{ at: ['cues', 9, 'cue'], value: 'bang' }])).toBe('"bang" is no sound cue of the scene: its sound cues are boom')
  expect(refused([{ at: ['go'], value: 'nowhere' }])).toBe('go nowhere is no scene of the game: its scenes are stage, menu')
  expect(refused([{ at: ['go'], value: 'menu' }])).toBeUndefined()
  // A file that names a clip its rig lacks already: a change of another field is let through.
  const bad = cues.edited(FILE, [{ at: ['cues', 3, 'clip'], value: 'dance' }])
  const b = cues.build(context(), bad)
  expect(b.problems).toEqual([{ cue: 3, text: 'dance is not a clip of hero\'s rig: its clips are idle, walk, wave, nod' }])
  expect(cues.refusal(b, cues.edited(bad, [{ at: ['cues', 3, 'rate'], value: 2 }]))).toBeUndefined()
})

test('a shot\'s camera stood on a world point: over the ground following nobody, else from its member in the world\'s axes or its own', () => {
  const hero: Row = { id: 7, kind: 'actor', data: { name: 'hero', pos: [2, 1, 3], yaw: Math.PI / 2 } }
  const rows = () => [hero]
  const m = cues.build(context({ rows, height: () => () => 2 }), cues.edited(FILE, [
    { at: ['cues', 2, 'follows'], value: 'hero' }, { at: ['cues', 2, 'pos'], value: [0, 2, -4] },
    { at: ['cues', 0, 'pos'], value: [0, 5, -10] },
  ]))
  expect(cues.standEdits(m, 0, [4, 9, 5], () => 2)).toEqual([{ at: ['cues', 0, 'pos'], value: [4, 7, 5] }])
  expect(() => cues.standEdits(m, 0, [4, 9, 5], undefined)).toThrow('the view has no ground of stage yet')
  expect(cues.standEdits(m, 2, [4, 3, 3], undefined)).toEqual([{ at: ['cues', 2, 'pos'], value: [2, 2, 0] }])
  const body = cues.build(context({ rows }), cues.edited(m.file, [{ at: ['cues', 2, 'frame'], value: 'body' }]))
  // In the member's own axes: facing +x, so a point 2 m along +x of it is 2 m ahead of it.
  expect(cues.standEdits(body, 2, [4, 3, 3], undefined)[0].value).toEqual([0, 2, 2])
  expect(() => cues.standEdits(m, 3, [0, 0, 0], undefined)).toThrow('cue 3 is a play, not a shot: the shots are 0, 2')
  // The camera taken into a shot: its place, its fov kept within 10 and 120, a look that is a point made 10 m ahead.
  const looking = cues.build(context({ rows }), cues.edited(m.file, [{ at: ['cues', 0, 'look'], value: [0, 0] }]))
  expect(cues.takeEdits(looking, 0, { pos: [1, 6, 1], dir: [1, 0, 0], fov: 130 }, () => 2)).toEqual([
    { at: ['cues', 0, 'pos'], value: [1, 4, 1] }, { at: ['cues', 0, 'fov'], value: 120 }, { at: ['cues', 0, 'look'], value: [11, 4, 1] },
  ])
})

test('a target picked in the view: the mark within a metre, else the point; and one typed', () => {
  const walking = cues.edited(FILE, [{ at: ['cues', 11], value: { at: 2, do: 'walk', who: 'hero', to: [0, 0], gear: null } }])
  const m = cues.build(context(), walking)
  expect(cues.pickEdits(m, 11, 'to', [10.5, 0, 0.5])).toEqual([{ at: ['cues', 11, 'to'], value: 'pad' }])
  expect(cues.pickEdits(m, 11, 'to', [3.12345, 1, -2])).toEqual([{ at: ['cues', 11, 'to'], value: [3.123, -2] }])
  expect(() => cues.pickEdits(m, 0, 'to', [0, 0])).toThrow('cue 0 is a shot, and a target is picked for a walk or a face: the walks and faces are 11')
  expect(cues.typed(m, ' pad ')).toBe('pad')
  expect(cues.typed(m, '3, 4.5')).toEqual([3, 4.5])
  expect(cues.typed(m, '1 2 3')).toEqual([1, 2, 3])
  expect(() => cues.typed(m, 'tower')).toThrow('"tower" is neither a cast member, a mark nor [x, z] or [x, up, z]')
})

// ---------------------------------------------------------------- the measure pass, on a game

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cutscene-cues-'))
afterAll(() => fs.rmSync(dir, { recursive: true }))
const DT = 1 / 60
const engine = (p: string) => JSON.stringify(new URL(`../../${p}`, import.meta.url).pathname)
// A walker of the plainest kind: straight at what the cutscene sends it to, at the file's pace.
const STAGE_SIM = `
import { cutscene, mark } from ${engine('plugins/cutscene/cutscene.sim.ts')}
import { loader } from ${engine('plugins/loader/loader.sim.ts')}
import { scenemanager } from ${engine('plugins/scenemanager/scenemanager.sim.ts')}
import file from './stage.scene.json' with { type: 'json' }
const walk = (me, dt) => {
  const w = me.data.direct?.walk
  if (!w) return
  const d = [w.to[0] - me.data.pos[0], w.to[1] - me.data.pos[2]], far = Math.hypot(d[0], d[1])
  const k = far ? Math.min(far, w.pace * dt) / far : 0
  me.data.pos = [me.data.pos[0] + d[0] * k, 0, me.data.pos[2] + d[1] * k]
}
const actor = { tick: (me, dt) => walk(me, dt), acts: { advance: (me, _w, _s, dt) => walk(me, dt) } }
const starter = { acts: { ready: (me, w) => { w.call(w.find('cutscene'), 'start', -1) } }, open: ['ready'] }
export const sim = { loader, scenemanager, cutscene: cutscene(() => 0), mark, actor, starter }
export const scene = file
`
const CUE_URL = 'test/cutscene/cues/intro.json'
const WALKING: Script = {
  end: 3, reach: 0.5, stop: 0.2, head: 1, fov: 50, pace: 2, limit: 5,
  cast: { hero: { kind: 'actor', name: 'hero' } },
  cues: [
    { at: 0, do: 'shot', name: 'wide', pos: [0, 3, -5], look: 'hero', over: 0 },
    { at: 0.5, do: 'walk', who: 'hero', to: 'pad', gear: null },
    { at: 0.5, do: 'wait', who: 'hero' },
    { at: 1, do: 'fade', to: 1, over: 0.5 },
  ],
}
const TOP: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { stage: { file: 'stage.scene.json', suspend: false } }, dt: DT, entry: 'stage', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
fs.writeFileSync(path.join(dir, 'stage.scene.json'), JSON.stringify({
  world: { cutscene: { script: 'intro', kinds: ['actor'], settle: 0.5, tremor: [[1, 1], [1, 1], [1, 1]] }, loader: { assets: { intro: { type: 'json', url: CUE_URL, preload: true } } } },
  prefabs: { engine: { dt: DT }, loader: {}, scenemanager: { out: {} }, cutscene: {}, starter: {}, mark: { name: '', at: [0, 0] }, actor: { name: '', direct: null, pos: [0, 0, 0], yaw: 0 } },
  actors: [{ is: 'loader' }, { is: 'scenemanager' }, { is: 'cutscene' }, { is: 'starter' }, { is: 'mark', name: 'pad', at: [6, 0] }, { is: 'actor', name: 'hero', pos: [0, 0, 0] }],
  plugins: ['loader', 'scenemanager'],
}))
fs.writeFileSync(path.join(dir, 'stage.sim.ts'), STAGE_SIM)

test('the measure pass, replaying the recording: the step the cutscene started on, when each cue fired, how long the wait held, when the walk ended, the path walked', async () => {
  written(CUE_URL, JSON.stringify(WALKING))
  const base = pathToFileURL(path.join(dir, 'top.scene.json')).href
  const rec = await recorder(structuredClone(TOP), { scenemanager }, base)
  let last: Down | undefined
  rec.link.hear(d => { last = d })
  for (let i = 0; i < 5; i++) await rec.step()
  // The seat starts it, as a page's curtain does: an open act sent up the link, journaled.
  const row = (kind: string) => last!.packet.rows.find(r => r.kind === kind)!
  rec.link.send({ scene: last!.scene, seat: last!.seat, msg: { seq: 1, n: last!.packet.n, id: row('starter').id, action: 'ready', args: [] } })
  for (let i = 0; i < 30; i++) await rec.step()
  const d = row('cutscene').data
  expect(d.running).toBe(true)
  const start = rec.n - Math.round(d.e / DT)
  const again = await recorder(structuredClone(TOP), { scenemanager }, base, [...rec.journal], rec.end)
  const got = (await cues.pass(again, 'stage', WALKING, 'k', () => true))!
  rec.link.close()
  expect(got.start).toBe(start)
  expect(got.done).toBe(true)
  // The walk from the origin to the pad at [6, 0] at 2 m/s, done within 0.2 m: 2.9 s after it began.
  expect(got.arrive[1]).toBeCloseTo(0.5 + 2.9, 1)
  expect(got.limited[1]).toBe(false)
  expect(got.holds[2]).toBeCloseTo(2.9, 1)
  expect(got.passed[2]).toBe(false)
  expect(got.fired[3]).toBeCloseTo(1 + 2.9, 1)
  expect(got.total).toBeCloseTo(3 + 2.9, 1)
  const walked = got.paths.hero
  expect(walked[0]).toEqual([0, 0, 0])
  expect(walked.at(-1)![0]).toBeGreaterThan(5.7)
  // Drawn with that measure, every cue after the wait is drawn as late as it held.
  const m = cues.build(context({ marks: [{ name: 'pad', at: [6, 0] }], rig: () => undefined, steps: {} }), WALKING, got)
  expect(m.elapsed(3)).toBeCloseTo(1 + 2.9, 1)
  expect(m.chips[1].length).toBeCloseTo(2.9, 1)
}, 30000)
