// The server half of anim on scenes this test writes, each with `world.anim`, a body row and a rig
// file handed to the loader: the gear pick, the rate that keeps feet planted, the fraction carried
// across a change, markers on a lap and before a release, a one-shot's travel (turned, scaled, a
// 180 the short way, a roll's yaw zeroed), the upper channel, mirrored clips, the air and the
// landing, the crossfade fields, `committed`, a limp row, and a rig of other roles on a body of other
// fields.
import { expect, test } from 'vitest'
import { boot, type Row, type Scene, type W } from '#engine/engine.ts'
import { loader, written } from '#plugins/loader/loader.sim.ts'
import { animate, at, clipOf, committed, gesture, momentOf, play, pose, readsOf, rest, rigOf, roleOf, stop, type Measure, type Numbers, type Rig } from './anim.sim.ts'

// A table row: `path(u)` is [fwd, left, yawDeg] at u = t/dur, sampled every tenth and at dur.
function measure(dur: number, path: (u: number) => number[], more: Partial<Measure> = {}): Measure {
  const ts: number[] = []
  for (let t = 0; t < dur - 1e-9; t = Math.round((t + 0.1) * 10) / 10) ts.push(t)
  ts.push(dur)
  const travel = ts.map(t => [t, ...path(t / dur)])
  const [forward, left, yaw] = path(1)
  return { dur, forward, left, yaw, rise: 0, height: 1, low: 0, peak: dur / 2, travel, ...more }
}
const still = () => [0, 0, 0]
const wrap = (a: number) => ((a + 180) % 360 + 360) % 360 - 180

const RIG: Rig = {
  clips: {
    idle: { loop: true, stance: 'a', markers: { lap: 0, mid: '50%', top: 'peak' } },
    crouchIdle: { loop: true, stance: 'b' },
    walk: { loop: true, gear: 0, stance: 'a' },
    run: { loop: true, gear: 0, stance: 'a', rate: 1.25 },
    walkLeft: { loop: true, gear: 90, stance: 'a' },
    walkRight: { mirror: 'walkLeft' },
    walkBack: { loop: true, gear: 180, stance: 'a' },
    crouchWalk: { loop: true, gear: 0, stance: 'b' },
    roll: { scale: 0.5, markers: { cancel: 0.8 } },
    turnBack: { markers: { cancel: 0.5 } },
    turnBackOther: { mirror: 'turnBack' },
    strike: { markers: { hit: 'peak', chain: '45%', cancel: '70%', end: '100%' } },
    dash: { rate: 2 },
    nudge: {},
    jump: 'jump.fbx',
    leap: {},
    fall: { loop: true },
    land: { markers: { cancel: 0.3 } },
  },
  roles: { still: 'idle', jump: 'jump', leap: 'leap', fall: 'fall', land: 'land' },
  stances: { a: { idle: 'idle' }, b: { idle: 'crouchIdle' } },
  mask: 'Spine1',
  table: {
    idle: measure(2.5, still, { peak: 1.2 }),
    crouchIdle: measure(2, still),
    walk: measure(1.1, u => [1.65 * u, 0, 0]),
    run: measure(0.8, u => [3.2 * u, 0, 0]),
    walkLeft: measure(1.3, u => [0, 1.3 * u, 0]),
    walkBack: measure(1.2, u => [-1.2 * u, 0, 0]),
    crouchWalk: measure(1, u => [0.8 * u, 0, 0]),
    // A roll: 3 m forward, its measured facing wobbling to 20° and ending 5° right.
    roll: measure(1, u => [3 * u, 0.1 * Math.sin(Math.PI * u), 20 * Math.sin(Math.PI * u) - 5 * u]),
    // A 180 whose curve turns right, crosses −180° between two rows and ends at 175°: −185° the short way.
    turnBack: measure(0.8, u => [0.2 * u, 0, wrap(-185 * Math.min(1, 1.25 * u))]),
    strike: measure(1.2, still, { peak: 0.5 }),
    dash: measure(1, u => [2 * u, 0, 0]),
    nudge: measure(0.5, u => [0.03 * u, 0, 0]),
    jump: measure(0.5, still),
    leap: measure(0.6, u => [2 * u, 0, 0]),
    fall: measure(0.7, still),
    land: measure(1, still),
  },
}

const READS = { pos: 'pos', yaw: 'yaw', vel: 'vel', grounded: 'grounded', limp: 'limp' }
const ANIM: Numbers = { still: 0.05, shift: 0.75, leap: 0.5, landFall: 7.5, moves: 0.05, turns: 30, kinds: { body: { rig: 'rig', model: 'model', fade: 0.2, reads: READS } } }

let files = 0
function world(body: Record<string, unknown> = {}, rig: Rig = RIG, numbers: Numbers = ANIM) {
  const url = `test/anim/${++files}.json`
  written(url, JSON.stringify(rig))
  const scene: Scene = {
    world: { anim: structuredClone(numbers), loader: { assets: { rig: { type: 'json', url, preload: true } } } },
    prefabs: { loader: {}, body: { pos: [0, 0, 0], yaw: 0, vel: [0, 0, 0], grounded: true, ...body }, probe: {} },
    actors: [{ is: 'loader' }, { is: 'body' }, { is: 'probe' }],
  }
  let w!: W
  const t = boot(scene, { loader, body: {}, probe: { before(_me, _dt, got) { w = got } } })
  t.step(0)
  const row = t.rows.find(r => r.kind === 'body') as Row
  return { w, row, d: row.data, step: (dt = 1 / 60) => animate(row, w, dt) }
}
const DEG = Math.PI / 180

test('a pose is its clip held at its frame: the playhead at its time, not moving, holding, faded into as a clip is', () => {
  const rig = { ...RIG, poses: { lean: { clip: 'strike', frame: 15, at: 0.5 }, crouch: { clip: 'strike', frame: 3, at: 0.1 } } }
  const { w, row, d, step } = world({}, rig)
  step()
  step()
  pose(row, w, 'lean')
  expect([d.clip, d.clipT, d.rate, d.state, d.holds, committed(row)]).toEqual(['strike', 0.5, 0, 'act', true, true])
  // Faded into from the clip it had, frozen where it stood.
  expect([d.from, d.blend]).toEqual(['idle', 0])
  for (let i = 0; i < 120; i++) step()
  expect([d.clip, d.clipT, d.state, d.blend]).toEqual(['strike', 0.5, 'act', 1])
  // A pose of the same clip fades from the one before it, at its own time.
  pose(row, w, 'crouch')
  expect([d.clip, d.clipT, d.from, d.fromT, d.blend]).toEqual(['strike', 0.1, 'strike', 0.5, 0])
  // `stop` lets it go, back to the gears.
  stop(row, w)
  step()
  expect([d.state, d.clip]).toEqual(['loco', 'idle'])
  expect(() => pose(row, w, 'dab')).toThrow('anim: body\'s rig has no pose dab')
})

test('a row that gives no anim fields stands in the first stance\'s still role, at full weight', () => {
  const { d, step } = world()
  step()
  expect(d.state).toBe('loco')
  expect(d.clip).toBe('idle')
  expect(d.blend).toBe(1)
  expect(d.from).toBe(null)
  expect(committed({ id: 0, kind: 'body', data: d })).toBe(false)
})

test('the gear is the nearest direction, all ties kept, then the fastest whose speed·shift the body reaches, or the slowest', () => {
  const pick = (vel: number[], yaw = 0, rig?: string) => {
    const { d, step } = world({ vel, yaw, ...(rig && { rig }) })
    step()
    return [d.clip, d.rate]
  }
  expect(pick([0, 0, 0.04])).toEqual(['idle', 1]) // under still
  expect(pick([0, 0, 1.2])[0]).toBe('walk')
  expect(pick([0, 0, 3.7])[0]).toBe('walk') // run's 5 m/s·0.75 is 3.75
  expect(pick([0, 0, 3.75])[0]).toBe('run')
  expect(pick([0, 0, -1])[0]).toBe('walkBack')
  expect(pick([1, 0, 0])[0]).toBe('walkLeft') // facing +z, +x is left
  expect(pick([-1, 0, 0])[0]).toBe('walkRight')
  // Facing +x (yaw 90°), +x is forward and −z is left.
  expect(pick([1.2, 0, 0], 90 * DEG)[0]).toBe('walk')
  expect(pick([0, 0, -1], 90 * DEG)[0]).toBe('walkLeft')
  // 45° between walk and walkLeft keeps both: the faster where the body reaches it, else the one it
  // reaches, else the slower.
  const diag = (s: number) => pick([s / Math.SQRT2, 0, s / Math.SQRT2])[0]
  expect(diag(1.2)).toBe('walk')
  expect(diag(0.9)).toBe('walkLeft')
  expect(diag(0.5)).toBe('walkLeft')
  // Another stance has its own gears and idle.
  expect(pick([0, 0, 1], 0, 'b')[0]).toBe('crouchWalk')
  expect(pick([0, 0, 0], 0, 'b')[0]).toBe('crouchIdle')
})

test('the rate keeps the feet planted: the playhead covers the clip\'s own distance as the body covers the ground, at any clip rate', () => {
  for (const [speed, clip] of [[1.2, 'walk'], [0.9, 'walk'], [4.5, 'run'], [6, 'run']] as const) {
    const { d, step } = world({ vel: [0, 0, speed] })
    step()
    expect(d.clip).toBe(clip)
    const c = clipOf(RIG, clip)
    const before = d.clipT
    const dt = 0.013
    step(dt)
    const covered = ((d.clipT - before) / c.dur) * c.measure.forward
    expect(covered).toBeCloseTo(speed * dt, 12)
  }
})

test('a change of clip in the gears carries the playhead as a fraction of the clip', () => {
  const { d, step } = world()
  step(2) // 2 s into the 2.5 s idle: 0.8 of it
  expect(d.clip).toBe('idle')
  expect(d.clipT).toBeCloseTo(2, 12)
  d.vel = [0, 0, 1.5]
  step(0)
  expect(d.clip).toBe('walk')
  expect(d.clipT).toBeCloseTo(0.8 * 1.1, 12)
  expect(d.from).toBe('idle')
  expect(d.fromT).toBeCloseTo(2, 12)
})

test('markers fire on crossing, a loop\'s lap included, in the order they are crossed; a marker at 0 fires on a lap', () => {
  const { d, step } = world()
  const names = (dt: number) => step(dt).markers.map(m => `${m.name}${m.upper ? '^' : ''}`)
  expect(names(1)).toEqual([]) // 0 → 1
  expect(names(0.25)).toEqual(['top', 'mid']) // 1 → 1.25: top at 1.2 (the table's peak), mid at 1.25
  expect(names(1.3)).toEqual(['lap']) // 1.25 → 2.55: the lap wraps to 0.05
  expect(d.clipT).toBeCloseTo(0.05, 12)
  expect(names(3)).toEqual(['top', 'mid', 'lap']) // 0.05 → 3.05: one whole lap more
  expect(step(0.01).markers[0]).toBeUndefined()
  expect(step(2.5).markers).toEqual([{ name: 'top', clip: 'idle', upper: false }, { name: 'mid', clip: 'idle', upper: false }, { name: 'lap', clip: 'idle', upper: false }])
})

test('markers of both channels come in the order they are crossed within the step', () => {
  const { d, row, step } = world()
  step()
  gesture(row, 'strike')
  d.clipT = 1.15
  d.upperT = 0.48
  // 0.1 s: the idle crosses top (1.2) halfway and mid (1.25) at its end; the strike crosses hit (0.5) a fifth in and chain (0.54) three fifths in.
  expect(step(0.1).markers.map(m => `${m.name}${m.upper ? '^' : ''}`)).toEqual(['hit^', 'top', 'chain^', 'mid'])
})

test('a one-shot releases on the step it reaches its end, after that step\'s markers, into its gears from their start', () => {
  const { d, row, step } = world({ vel: [0, 0, 1.2] })
  step()
  play(row, 'strike')
  expect(committed(row)).toBe(true) // until animate reads its cancel
  expect(step(0.5).markers.map(m => m.name)).toEqual(['hit']) // the table's peak, 0.5
  expect(d.cancel).toBeCloseTo(0.84, 12)
  expect(committed(row)).toBe(true)
  expect(step(0.4).markers.map(m => m.name)).toEqual(['chain', 'cancel']) // 45% and 70% of 1.2
  expect(committed(row)).toBe(false)
  expect(d.state).toBe('act')
  expect(step(0.3).markers).toEqual([{ name: 'end', clip: 'strike', upper: false }])
  expect(d.state).toBe('loco')
  expect(d.clip).toBe('walk')
  expect(d.clipT).toBe(0)
  expect(d.from).toBe('strike')
  expect(d.fromT).toBe(1.2)
  expect(d.cancel).toBe(0)
})

test('a one-shot marker at 0 never fires', () => {
  const rig = structuredClone(RIG)
  rig.clips.nudge = { markers: { start: 0, half: '50%' } }
  const { row, step } = world({}, rig)
  step()
  play(row, 'nudge')
  expect(step(0.3).markers.map(m => m.name)).toEqual(['half'])
})

test('a one-shot\'s travel is its table\'s, turned by the row\'s yaw, at the clip\'s rate', () => {
  const { d, row, step } = world({ yaw: 30 * DEG })
  step()
  play(row, 'dash', { rate: 1.5 })
  const dt = 0.1
  const { travel } = step(dt)
  // 2 m in 1 s of clip, at clip rate 2 and row rate 1.5: 0.6 m this step, facing 30°.
  expect(travel.move[0]).toBeCloseTo(0.6 * Math.sin(30 * DEG), 12)
  expect(travel.move[1]).toBeCloseTo(0.6 * Math.cos(30 * DEG), 12)
  expect(travel.yaw).toBe(0)
  expect(d.clipT).toBeCloseTo(0.3, 12)
})

test('a one-shot under moves and turns carries nothing; the loops carry nothing', () => {
  const { d, row, step } = world({ vel: [0, 0, 1.5] })
  for (let n = 0; n < 30; n++) expect(step().travel).toEqual({ move: [0, 0], yaw: 0 })
  play(row, 'nudge')
  for (let n = 0; n < 40; n++) expect(step().travel).toEqual({ move: [0, 0], yaw: 0 })
  expect(d.state).toBe('loco')
})

test('a 180\'s yaw goes the short way each step, and its move is turned back by the curve\'s yaw at the step\'s start', () => {
  const { d, row, step } = world({ yaw: 10 * DEG })
  step()
  play(row, 'turnBack')
  let yaw = 0
  const moved = [0, 0]
  for (let n = 0; n < 100 && d.state === 'act'; n++) {
    const { travel } = step(1 / 60)
    expect(Math.abs(travel.yaw)).toBeLessThan(10 * DEG)
    moved[0] += travel.move[0]
    moved[1] += travel.move[1]
    d.yaw += travel.yaw
    yaw += travel.yaw
  }
  expect(yaw / DEG).toBeCloseTo(-185, 9)
  expect(d.state).toBe('loco')
  // The step's move follows the facing the body had, so the whole path is the table's, from the
  // facing the clip started at: 0.2 m forward of 10°.
  expect(moved[0]).toBeCloseTo(0.2 * Math.sin(10 * DEG), 12)
  expect(moved[1]).toBeCloseTo(0.2 * Math.cos(10 * DEG), 12)
})

test('the move is turned back by the curve\'s yaw at t0 exactly', () => {
  // A clip that turns 90° left over its first half standing still, then walks 1 m to its own left.
  const rig = structuredClone(RIG)
  rig.clips.corner = {}
  rig.table.corner = { dur: 1, forward: 0, left: 1, yaw: 90, travel: [[0, 0, 0, 0], [0.5, 0, 0, 90], [1, 0, 1, 90]] }
  const { d, row, step } = world({}, rig)
  step()
  play(row, 'corner')
  expect(step(0.5).travel.yaw).toBeCloseTo(90 * DEG, 12)
  d.yaw += 90 * DEG
  const { travel } = step(0.25)
  // The clip's own left, 0.5 m of it, is where the body faces now: +x, the left it started with.
  expect(travel.move[0]).toBeCloseTo(0.5, 12)
  expect(travel.move[1]).toBeCloseTo(0, 12)
  expect(travel.yaw).toBe(0)
})

test('the roll\'s yaw column is zeroed, and its distance is scaled', () => {
  const { d, row, step } = world()
  step()
  play(row, 'roll')
  const moved = [0, 0]
  for (let n = 0; n < 120 && d.state === 'act'; n++) {
    const { travel } = step(1 / 60)
    expect(travel.yaw).toBe(0)
    moved[0] += travel.move[0]
    moved[1] += travel.move[1]
  }
  expect(moved[1]).toBeCloseTo(1.5, 9) // 3 m at scale 0.5
  expect(moved[0]).toBeCloseTo(0, 9) // its sideways wobble comes back to 0
})

test('the upper channel has its own playhead, never travels, reports its markers flagged, and lets go at its end', () => {
  const { d, row, step } = world({ vel: [0, 0, 1.2] })
  step()
  gesture(row, 'dash')
  let out = step(0.1)
  expect(out.travel).toEqual({ move: [0, 0], yaw: 0 })
  expect(d.upperT).toBeCloseTo(0.2, 12) // the dash's own rate 2, not the walk's 0.8 besides
  expect(d.clip).toBe('walk')
  gesture(row, 'strike')
  expect(d.was).toBe('dash')
  out = step(0.5)
  expect(out.markers).toEqual([{ name: 'hit', clip: 'strike', upper: true }])
  expect(out.travel).toEqual({ move: [0, 0], yaw: 0 })
  out = step(0.7)
  expect(out.markers.map(m => m.name)).toEqual(['chain', 'cancel', 'end'])
  expect(d.upper).toBe(null)
  expect(d.upperW).toBe(0)
  expect(d.state).toBe('loco')
})

test('the upper weight rises by dt/fade, never above its out-ramp; the gesture it replaced falls by dt/fade', () => {
  const { d, row, step } = world()
  step()
  gesture(row, 'strike')
  step(0.05)
  expect(d.upperW).toBeCloseTo(0.25, 12)
  step(0.1)
  expect(d.upperW).toBeCloseTo(0.75, 12)
  step(0.2)
  expect(d.upperW).toBe(1)
  step(0.8) // 1.15 of 1.2: 0.05 s left of a 0.2 s fade
  expect(d.upperW).toBeCloseTo(0.25, 12)
  gesture(row, 'dash')
  expect(d.was).toBe('strike')
  expect(d.wasT).toBeCloseTo(1.15, 12)
  expect(d.wasW).toBeCloseTo(0.25, 12)
  step(0.02)
  expect(d.wasW).toBeCloseTo(0.15, 12)
  expect(d.wasT).toBeCloseTo(1.15, 12) // frozen
  step(0.05)
  expect(d.was).toBe(null)
  expect(d.wasW).toBe(0)
})

test('a change keeps the last clip at full weight as `from`, frozen, and blend rises by dt/fade', () => {
  const { d, row, step } = world()
  step(0.3)
  play(row, 'strike')
  expect(d.from).toBe('idle')
  expect(d.fromT).toBeCloseTo(0.3, 12)
  expect(d.blend).toBe(0)
  step(0.05)
  expect(d.blend).toBeCloseTo(0.25, 12)
  // A change before the fade is done keeps the idle, the last at full weight.
  play(row, 'dash')
  expect(d.from).toBe('idle')
  expect(d.fromT).toBeCloseTo(0.3, 12)
  step(0.25)
  expect(d.blend).toBe(1)
  play(row, 'dash')
  expect(d.from).toBe('dash')
  expect(d.fromT).toBeCloseTo(0.5, 12)
})

test('a mirrored clip is its clip\'s table row with left and yaw negated, and a mirrored gear walks the mirrored way', () => {
  const m = clipOf(RIG, 'walkRight')
  expect(m.source).toBe('walkLeft')
  expect(m.mirrored).toBe(true)
  expect(m.gear).toBe(-90)
  expect(m.loop).toBe(true)
  expect(m.stance).toBe('a')
  expect(m.measure.left).toBe(-1.3)
  const [t5, f5, l5, y5] = m.measure.travel[5]
  expect([t5, f5, y5]).toEqual([0.5, 0, -0])
  expect(l5).toBeCloseTo(-0.5, 12)
  const t = clipOf(RIG, 'turnBackOther')
  expect(t.measure.yaw).toBe(-RIG.table.turnBack.yaw)
  expect(t.measure.forward).toBe(RIG.table.turnBack.forward)
  expect(t.markers).toEqual([{ name: 'cancel', t: 0.5 }])
  expect(at(t.measure, 0.4)[2]).toBeCloseTo(-at(RIG.table.turnBack, 0.4)[2], 12)
  // A mirror's own gear wins, and a gear of 180 mirrors to 180.
  const rig = structuredClone(RIG)
  rig.clips.backAgain = { mirror: 'walkBack' }
  rig.clips.sideways = { mirror: 'walk', gear: 45 }
  expect(clipOf(rig, 'backAgain').gear).toBe(180)
  expect(clipOf(rig, 'sideways').gear).toBe(45)
  // The other 180 turns the other way, 185° left.
  const { d, row, step } = world()
  step()
  play(row, 'turnBackOther')
  let yaw = 0
  while (d.state === 'act') yaw += step(1 / 60).travel.yaw
  expect(yaw / DEG).toBeCloseTo(185, 9)
})

test('a mirror of a mirror throws, and so does a clip the rig does not hold', () => {
  const rig = structuredClone(RIG)
  rig.clips.twice = { mirror: 'walkRight' }
  expect(() => clipOf(rig, 'twice')).toThrow('twice mirrors walkRight, itself a mirror')
  const { row, step } = world()
  play(row, 'nothing')
  expect(() => step()).toThrow('the rig has no clip nothing')
})

test('leaving the ground rising plays leap faster than leap over the ground, jump slower, and not rising fall; a jump that ends in the air falls', () => {
  const air = (vel: number[]) => {
    const { d, step } = world({ vel: [0, 0, 1.5] })
    step()
    d.grounded = false
    d.vel = vel
    step()
    return d
  }
  expect(air([0, 6, 0.6]).clip).toBe('leap')
  expect(air([0, 6, 0.4]).clip).toBe('jump')
  const d = air([0, -1, 3])
  expect([d.clip, d.state, d.sink]).toEqual(['fall', 'fall', 1])
  const { d: j, step } = world({ vel: [0, 6, 0] })
  step()
  j.grounded = false
  step()
  expect(j.clip).toBe('jump')
  step(0.3)
  expect(j.clip).toBe('jump')
  step(0.2)
  expect(j.clip).toBe('fall')
  expect(j.from).toBe('jump')
  expect(j.state).toBe('fall')
})

test('a kind with falls plays on through a short drop, and up its bands, never down, through a long one', () => {
  const FALLS: Numbers = { ...ANIM, kinds: { body: { ...ANIM.kinds.body, falls: [{ above: 4.3, role: 'fall' }, { above: 9, role: 'dash' }] } } }
  const { d, step } = world({ vel: [0, 0, 1.5] }, RIG, FALLS)
  step()
  // A step down a stair: in the air, falling at most 4.2 m/s, it walks on, and lands walking.
  d.grounded = false
  for (const v of [1, 3, 4.2]) {
    d.vel = [0, -v, 1.5]
    step()
    expect([d.state, d.clip]).toEqual(['loco', 'walk'])
  }
  d.grounded = true
  d.vel = [0, 0, 1.5]
  step()
  expect([d.state, d.clip, d.band]).toEqual(['loco', 'walk', -1])
  // Off a ledge: past 4.3 it falls, past 9 it plays the next band, and slowing never takes it back.
  d.grounded = false
  d.vel = [0, -5, 1.5]
  step()
  expect([d.state, d.clip, d.band]).toEqual(['fall', 'fall', 0])
  d.vel = [0, -10, 1.5]
  step()
  expect([d.clip, d.band]).toEqual(['dash', 1])
  d.vel = [0, -5, 1.5]
  step()
  expect([d.clip, d.band]).toEqual(['dash', 1])
  d.grounded = true
  d.vel = [0, 0, 1.5]
  step()
  expect([d.state, d.clip, d.band]).toEqual(['loco', 'walk', -1])
})

test('airborne overrides an act and drops the gesture as `was`', () => {
  const { d, row, step } = world()
  step()
  play(row, 'strike', { holds: true })
  gesture(row, 'dash')
  step(0.3)
  d.grounded = false
  d.vel = [0, -2, 0]
  step()
  expect([d.state, d.clip, d.holds, d.upper, d.was]).toEqual(['fall', 'fall', false, null, 'dash'])
})

test('touching down faster than landFall plays land, not holding; slower goes straight back to the gears', () => {
  const land = (fall: number) => {
    const { d, row, step } = world({ vel: [0, 0, 1.5] })
    step()
    d.grounded = false
    d.vel = [0, -fall, 1.5]
    step()
    d.grounded = true
    d.vel = [0, 0, 1.5] // walker's landing step sets vel[1] from the ground
    step()
    return { d, row }
  }
  const hard = land(8)
  expect([hard.d.state, hard.d.clip, hard.d.holds, hard.d.sink]).toEqual(['act', 'land', false, 8])
  expect(committed(hard.row)).toBe(true) // before its cancel
  const soft = land(7)
  expect([soft.d.state, soft.d.clip]).toEqual(['loco', 'walk'])
  expect(committed(soft.row)).toBe(false)
})

test('committed is holds, or before the cancel marker', () => {
  const { d, row, step } = world()
  step()
  play(row, 'dash', { holds: true })
  step(0.4)
  expect(d.cancel).toBe(0)
  expect(committed(row)).toBe(true)
  play(row, 'roll')
  step(0.5)
  expect(committed(row)).toBe(true)
  step(0.4)
  expect(committed(row)).toBe(false)
})

// An act past its cancel gives way to the stick: the game stops it, and the body is back in its
// gears that step, from their start, the act fading out where it stood. A loop played as an act, a
// guard held say, has no end to release it, and is stopped the same way.
test('stop hands an act back to its gears, which it enters at the start of their clip, the act fading out as `from`', () => {
  const { d, row, w, step } = world({ vel: [0, 0, 1.2] })
  step()
  play(row, 'roll')
  step(0.9)
  expect(committed(row)).toBe(false)
  stop(row, w)
  expect([d.state, d.holds, committed(row), d.clip, d.clipT, d.blend]).toEqual(['loco', false, false, 'walk', 0, 0])
  const { travel } = step(0.1)
  expect(travel).toEqual({ move: [0, 0], yaw: 0 })
  expect([d.state, d.clip, d.from]).toEqual(['loco', 'walk', 'roll'])
  expect(d.fromT).toBeCloseTo(0.9, 12)
  // walk's gear speed is 1.5 m/s, so at 1.2 m/s its playhead runs at 0.8 from 0.
  expect(d.clipT).toBeCloseTo(0.08, 12)
  play(row, 'idle', { holds: true })
  step(1.9)
  expect([d.state, d.clip, committed(row)]).toEqual(['act', 'idle', true])
  stop(row, w)
  step(0.1)
  expect([d.state, d.clip]).toEqual(['loco', 'walk'])
  expect(d.clipT).toBeCloseTo(0.08, 12)
})

test('stop starts the gear from its start when it is the clip the act played', () => {
  const { d, row, w, step } = world()
  step()
  play(row, 'idle', { holds: true })
  step(1)
  stop(row, w)
  expect([d.state, d.clip, d.clipT, d.from, d.blend]).toEqual(['loco', 'idle', 0, 'idle', 0])
  expect(d.fromT).toBeCloseTo(1, 12)
})

test('stop leaves a body in its gears or in the air as it is', () => {
  const { d, row, w, step } = world({ vel: [0, 0, 1.2] })
  step()
  const was = structuredClone(d)
  stop(row, w)
  expect(d).toEqual(was)
  d.grounded = false
  d.vel = [0, 2, 1.2]
  step()
  const air = structuredClone(d)
  stop(row, w)
  expect(d).toEqual(air)
})

test('rest puts a row back as a row that has played nothing: its stance\'s still role at full weight, nothing fading and nothing on the upper channel', () => {
  const fresh = world({ rig: 'b' })
  fresh.step()
  const { d, row, step } = world({ rig: 'b', vel: [0, 0, 0.8] })
  step(0.3)
  play(row, 'roll', { holds: true, rate: 1.5 })
  gesture(row, 'strike')
  step(0.2)
  gesture(row, 'nudge')
  step(0.05)
  d.grounded = false
  d.vel = [0, -9, 0]
  step()
  expect([d.state, d.upper, d.was]).toEqual(['fall', null, 'nudge'])
  play(row, 'dash')
  expect(committed(row)).toBe(true)
  rest(row)
  d.grounded = true
  d.vel = [0, 0, 0]
  expect(committed(row)).toBe(false)
  step()
  expect(d).toEqual({ ...fresh.d })
  expect([d.state, d.clip, d.blend, d.from, d.upper, d.was, d.sink]).toEqual(['loco', 'crouchIdle', 1, null, null, null, 0])
})

test('a limp row is not animated or moved, and nothing on it is written', () => {
  const { d, row, step } = world({ vel: [0, 0, 1.5] })
  step(0.3)
  play(row, 'dash')
  d.limp = true
  const before = structuredClone(d)
  for (let n = 0; n < 10; n++) expect(step()).toEqual({ markers: [], travel: { move: [0, 0], yaw: 0 } })
  expect(d).toEqual(before)
})

test('rigOf and roleOf read the kind\'s rig and a stance\'s roles, a role it does not name being the clip of that name', () => {
  const { w } = world()
  const rig = rigOf(w, 'body')
  expect(Object.keys(rig.clips)).toEqual(Object.keys(RIG.clips))
  expect(roleOf(rig, 'b', 'idle')).toBe('crouchIdle')
  expect(roleOf(rig, 'b', 'land')).toBe('land')
  expect(momentOf(rig, 'b', 'still')).toBe('crouchIdle')
  expect(momentOf(rig, 'b', 'fall')).toBe('fall')
  expect(readsOf(w, 'body')).toEqual(READS)
  expect(() => rigOf(w, 'nobody')).toThrow('anim kinds has no nobody')
})

// A game of its own roles and its own mover: its rig calls standing `rest`, the jumps `hop` and
// `bound`, the air `tumble` and the landing `thud`, played by the same clips under other names, and
// its body carries its mover's numbers as `at`, `facing`, `v`, `footed` and `ragged`, beside fields
// called `vel` and `grounded` that mean nothing to it.
const OTHER: Rig = {
  ...RIG,
  roles: { still: 'rest', jump: 'hop', leap: 'bound', fall: 'tumble', land: 'thud' },
  stances: { a: { rest: 'idle', hop: 'jump', bound: 'leap', tumble: 'fall', thud: 'land' }, b: { rest: 'crouchIdle' } },
}
const MOVER = { pos: 'at', yaw: 'facing', vel: 'v', grounded: 'footed', limp: 'ragged' }
const OTHERS: Numbers = { ...ANIM, kinds: { body: { ...ANIM.kinds.body, reads: MOVER } } }

test('a rig of other roles on a body of other fields plays as the rig and `world.anim` name them', () => {
  const body = (more: Record<string, unknown> = {}) => world({ at: [0, 0, 0], facing: 0, v: [0, 0, 0], footed: true, vel: [0, 0, 3], grounded: false, ...more }, OTHER, OTHERS)
  const standing = body()
  standing.step()
  expect([standing.d.state, standing.d.clip]).toEqual(['loco', 'idle'])
  const crouched = body({ rig: 'b' })
  crouched.step()
  expect(crouched.d.clip).toBe('crouchIdle')
  // Facing +x, a body moving along −z moves to its left.
  const walking = body({ v: [0, 0, -1], facing: 90 * DEG })
  walking.step()
  expect(walking.d.clip).toBe('walkLeft')
  const air = (v: number[]) => {
    const b = body({ v: [0, 0, 1.5] })
    b.step()
    b.d.footed = false
    b.d.v = v
    b.step()
    return b
  }
  expect(air([0, 6, 0.6]).d.clip).toBe('leap')
  expect(air([0, 6, 0.4]).d.clip).toBe('jump')
  const falling = air([0, -8, 1.5])
  expect([falling.d.clip, falling.d.sink]).toEqual(['fall', 8])
  falling.d.footed = true
  falling.d.v = [0, 0, 1.5]
  falling.step()
  expect([falling.d.state, falling.d.clip]).toEqual(['act', 'land'])
  // A roll carries its travel by the body's own facing.
  const rolling = body({ facing: 90 * DEG })
  rolling.step()
  play(rolling.row, 'dash')
  expect(rolling.step(0.25).travel.move.map(x => Number(x.toFixed(9)))).toEqual([1, 0])
  rolling.d.ragged = true
  const before = structuredClone(rolling.d)
  expect(rolling.step()).toEqual({ markers: [], travel: { move: [0, 0], yaw: 0 } })
  expect(rolling.d).toEqual(before)
})

test('a moment the rig names no role for changes no clip when a body comes to it, and a kind whose reads name no field throws', () => {
  const { roles: _, ...bare } = OTHER
  const flat: Rig = { ...bare, roles: { still: 'rest' } }
  const b = world({ vel: [0, 0, 1.5] }, flat)
  b.step()
  expect(b.d.clip).toBe('walk')
  b.d.grounded = false
  b.d.vel = [0, 6, 1.5]
  b.step()
  expect([b.d.state, b.d.clip]).toEqual(['loco', 'walk'])
  const { limp: __, ...partial } = READS
  const blind = world({}, RIG, { ...ANIM, kinds: { body: { ...ANIM.kinds.body, reads: partial as typeof READS } } })
  expect(() => blind.step()).toThrow('anim kinds.body.reads names no limp')
})

test('a rig written while the game runs is read on the next step', () => {
  const url = `test/anim/${++files}.json`
  written(url, JSON.stringify(RIG))
  const scene: Scene = {
    world: { anim: structuredClone(ANIM), loader: { assets: { rig: { type: 'json', url, preload: true } } } },
    prefabs: { loader: {}, body: { pos: [0, 0, 0], yaw: 0, vel: [0, 0, 1.2], grounded: true }, probe: {} },
    actors: [{ is: 'loader' }, { is: 'body' }, { is: 'probe' }],
  }
  let w!: W
  const t = boot(scene, { loader, body: {}, probe: { before(_me, _dt, got) { w = got } } })
  t.step(0)
  const row = t.rows.find(r => r.kind === 'body')!
  animate(row, w, 0.1)
  expect(row.data.rate).toBeCloseTo(1.2 / 1.5, 12)
  const next = structuredClone(RIG)
  next.table.walk = measure(1.1, u => [2.2 * u, 0, 0])
  written(url, JSON.stringify(next))
  animate(row, w, 0.1)
  expect(row.data.rate).toBeCloseTo(1.2 / 2, 12)
})
