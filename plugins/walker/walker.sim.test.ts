// walker's kinematic body. Each test writes its own scene: `world.walker`, whose `kinds` holds one
// kind `body` (step 0.6, maxSlope 0.7, slopeBand 0.05, span 0.5, probe 1.5, slide 2, the rest as `K` says, with a test's own
// changes over it), and one row of that kind, whose `tick` sets its intents and then walks. The ground
// is written in the test as point functions: a flat, ramps, kerbs, risers and cliffs at angles,
// ledges, walls, ridges, stairs, a canyon, noise, a pond and solid circles, and combinations where
// more than one limit binds; the bodies solid to a kind are rows of a second kind, `post`. A feature at an angle ψ is written along the normal N = (cos ψ, sin ψ),
// and a walk φ off its normal heads at ψ + φ. `groundOf` is read on scenes a manager loads, as a
// game's are, whose `world.walker.mods` name terrain3d and scatter3d.
import { afterAll, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Row, type Scene, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import * as math from '#plugins/math/math.sim.ts'
import { depthAt, rawAt, type Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import { placed, solids as scattered, type Scatter } from '#plugins/scatter3d/scatter3d.sim.ts'
import { carry, check, groundOf, relative, seek, stand, walk, type Ground, type Numbers, type Solid } from './walker.sim.ts'

const DT = 1 / 60
const K: Numbers = {
  radius: 0.35, height: 1.7, accel: 14, turnRate: 12, gravity: 20, jumpH: 0.9,
  step: 0.6, maxSlope: 0.7, slopeBand: 0.05, slide: 2, wade: 0.5, span: 0.5, probe: 1.5, seekSpeed: 1.5,
}
const deg = Math.PI / 180
const wrap = (a: number) => a - 2 * Math.PI * Math.ceil((a - Math.PI) / (2 * Math.PI))

type Height = (x: number, z: number) => number
type Run = {
  at?: number[]; y?: number; want?: number[]; vel?: number[]; grounded?: boolean; over?: Partial<Numbers>
  depth?: Height; solids?: Solid[]; steps?: number; carry?: number[]
  drive?: (me: Row, w: W, ground: Ground) => void
  each?: (me: Row, i: number) => boolean | void
}

// A walking row's prefab.
const BODY = { pos: [0, 0, 0], yaw: 0, vel: [0, 0, 0], grounded: true, speed: 0, want: [0, 0], face: null, jump: false, side: 0, turned: 0, sliding: false }

const scene = (k: Numbers, o: Run): Scene => ({
  world: { walker: { kinds: { body: k } } },
  prefabs: {
    body: BODY,
  },
  actors: [
    { is: 'body', pos: [o.at?.[0] ?? 0, o.y ?? 0, o.at?.[1] ?? 0], vel: o.vel ?? [0, 0, 0], grounded: o.grounded ?? true, want: o.want ?? [0, 0] },
  ],
})

// Boots a scene on `height` and steps it; with `carry`, the body is carried by that move each step
// after it walks, as a clip's travel carries it. `each` sees the body after every step, and ends the
// run by returning true.
function run(height: Height, o: Run = {}) {
  const solids = o.solids ?? []
  const ground: Ground = { height, depth: o.depth, solids: (x, z, r) => solids.filter(s => Math.hypot(s.x - x, s.z - z) <= r + s.radius) }
  const k = { ...K, ...o.over }
  const truth = boot(scene(k, o), {
    body: { tick(me, dt, w) { o.drive?.(me, w, ground); walk(me, w, dt, ground); if (o.carry) carry(me, w, o.carry, ground) } },
  })
  const me = truth.rows.find(r => r.kind === 'body')!
  for (let i = 0; i < (o.steps ?? 120); i++) {
    truth.step(DT)
    if (o.each?.(me, i) === true) break
  }
  return { me, truth, ground, k, S: (x: number, z: number) => stand(k, ground, x, z) }
}

const flat: Height = () => 0
const heading = (a: number, v: number) => [v * Math.cos(a), v * Math.sin(a)]
const along = (N: number[], p: number[]) => p[0] * N[0] + p[2] * N[1]
// The five feet of a body at p: the span square's corners and its centre.
const feet = (p: number[], span = K.span) => [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].map(([a, b]) => [p[0] + (a * span) / 2, p[2] + (b * span) / 2])
// A ground rising along N at angle ψ, as a profile of the distance along N.
const across = (psi: number, profile: (s: number) => number): Height => {
  const N = [Math.cos(psi * deg), Math.sin(psi * deg)]
  return (x, z) => profile(x * N[0] + z * N[1])
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
// How far along N at angle ψ the footprint's leading corner is from its centre.
const lead = (psi: number) => (K.span / 2) * (Math.abs(Math.cos(psi * deg)) + Math.abs(Math.sin(psi * deg)))

// The height a body reaches walking straight at a feature, and how far along its normal it gets.
function approach(profile: (s: number) => number, psi: number, phi: number, speed: number, o: Run = {}) {
  const N = [Math.cos(psi * deg), Math.sin(psi * deg)]
  let top = -Infinity, far = -Infinity
  const r = run(across(psi, profile), {
    steps: 360, ...o, want: heading((psi + phi) * deg, speed),
    each: (me, i) => { top = Math.max(top, me.data.pos[1]); far = Math.max(far, along(N, me.data.pos)); o.each?.(me, i) },
  })
  return { top, far, r, N }
}

describe('check', () => {
  test('throws naming the kind when maxSlope·span·√2 is not under step', () => {
    expect(() => check({ steep: { ...K, maxSlope: 0.85 } })).toThrow(/^walker kind steep: maxSlope·span·√2 is 0\.60\d*, not under step 0\.6/)
    expect(() => check({ wide: { ...K, span: 0.9 } })).toThrow(/walker kind wide/)
    expect(() => check({ edge: { ...K, maxSlope: 0.6 / (0.5 * Math.SQRT2) } })).toThrow(/walker kind edge/)
  })

  test('throws naming the kind unless slopeBand is under maxSlope', () => {
    expect(() => check({ band: { ...K, slopeBand: 0.7 } })).toThrow('walker kind band: slopeBand 0.7 is not under maxSlope 0.7')
    expect(() => check({ band: { ...K, slopeBand: 0.69 } })).not.toThrow()
  })

  test('throws naming the kind and the number for any number out of range', () => {
    const above = ['radius', 'height', 'accel', 'turnRate', 'gravity', 'step', 'maxSlope', 'slopeBand', 'slide', 'span', 'probe', 'seekSpeed'] as const
    const zero = ['jumpH', 'wade'] as const
    for (const f of above) {
      for (const v of [0, -1, NaN, Infinity]) expect(() => check({ bad: { ...K, [f]: v } }), `${f} ${v}`).toThrow(new RegExp(`walker kind bad: ${f} `))
    }
    for (const f of zero) {
      expect(() => check({ ok: { ...K, [f]: 0 } })).not.toThrow()
      for (const v of [-0.1, NaN, Infinity]) expect(() => check({ bad: { ...K, [f]: v } }), `${f} ${v}`).toThrow(new RegExp(`walker kind bad: ${f} `))
    }
    expect(() => check({ bad: { ...K, step: 'high' as unknown as number } })).toThrow(/walker kind bad: step high/)
    expect(() => check({ ok: { ...K, turnMax: 1.5 } })).not.toThrow()
    for (const v of [0, -1, NaN, Infinity]) expect(() => check({ bad: { ...K, turnMax: v } }), `turnMax ${v}`).toThrow(`walker kind bad: turnMax ${v} is not a number above 0`)
  })

  test('throws naming the kind unless bodies is a list of the table\'s kinds', () => {
    expect(() => check({ body: { ...K, bodies: ['post', 'body'] }, post: K })).not.toThrow()
    expect(() => check({ body: { ...K, bodies: [] } })).not.toThrow()
    expect(() => check({ body: { ...K, bodies: ['ghost'] }, post: K })).toThrow('walker kind body: bodies ["ghost"] is not a list of the table\'s kinds')
    expect(() => check({ body: { ...K, bodies: 'post' as unknown as string[] }, post: K })).toThrow('walker kind body: bodies "post" is not a list of the table\'s kinds')
    expect(() => check({ body: { ...K, bodies: [3] as unknown as string[] }, post: K })).toThrow(/walker kind body: bodies \[3\]/)
  })

  test('a kind the table does not name throws naming it', () => {
    const truth = boot({ world: { walker: { kinds: { body: K } } }, prefabs: { other: { pos: [0, 0, 0], yaw: 0, vel: [0, 0, 0], grounded: true, speed: 0, want: [0, 0], face: null, jump: false, side: 0, turned: 0, sliding: false } }, actors: [{ is: 'other' }] },
      { other: { tick(me, dt, w) { walk(me, w, dt, { height: flat, solids: () => [] }) } } })
    expect(() => truth.step(DT)).toThrow('walker kinds has no kind other')
  })

  test('world.walker.kinds is checked the first time a body walks by it', () => {
    const truth = boot(scene({ ...K, maxSlope: 2 }, {}), { body: { tick(me, dt, w) { walk(me, w, dt, { height: flat, solids: () => [] }) } } })
    expect(() => truth.step(DT)).toThrow(/walker kind body: maxSlope·span·√2/)
    const good = boot(scene(K, {}), { body: { tick(me, dt, w) { walk(me, w, dt, { height: flat, solids: () => [] }) } } })
    expect(() => good.step(DT)).not.toThrow()
  })
})

describe('the camera-relative stick', () => {
  test('forward is the camera law\'s look direction and right is the camera\'s right, at three yaws', () => {
    for (const yaw of [0, Math.PI / 2, -2.3]) {
      // The camera law: eye behind the body along −(sin yaw, cos yaw), looking at the pivot.
      const pitch = 0.3
      const eye = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)]
      const f = eye.map(c => -c)
      const right = [-f[2], 0, f[0]] // forward × up, up (0, 1, 0)
      const flatF = [f[0], f[2]].map(c => c / Math.hypot(f[0], f[2]))
      const flatR = [right[0], right[2]].map(c => c / Math.hypot(right[0], right[2]))
      const w = relative([0, 1], yaw), d = relative([1, 0], yaw), a = relative([-1, 0], yaw), s = relative([0, -1], yaw)
      expect(w[0]).toBeCloseTo(flatF[0], 12)
      expect(w[1]).toBeCloseTo(flatF[1], 12)
      expect(d[0]).toBeCloseTo(flatR[0], 12)
      expect(d[1]).toBeCloseTo(flatR[1], 12)
      expect(a[0]).toBeCloseTo(-flatR[0], 12)
      expect(s[1]).toBeCloseTo(-flatF[1], 12)
      // The rule turns the stick with `plugins/math`, the same bits on the server and the page.
      expect(d).toEqual([-math.cos(yaw), math.sin(yaw)])
    }
  })

  test('is clamped to length 1, so W+D is run speed and not √2 of it', () => {
    expect(Math.hypot(...relative([1, 1], 0.7))).toBeCloseTo(1, 12)
    expect(Math.hypot(...relative([0.3, 0.4], 0.7))).toBeCloseTo(0.5, 12)
    const { me } = run(flat, { want: relative([1, 1], 0).map(c => 4 * c), steps: 180 })
    expect(me.data.speed).toBeCloseTo(4, 6)
  })
})

describe('moving', () => {
  test('a run from rest covers speed·(t − 1/accel)', () => {
    const V = 4, t = 3
    const { me } = run(flat, { want: [V, 0], steps: t * 60 })
    expect(Math.abs(me.data.pos[0] - V * (t - 1 / K.accel))).toBeLessThan(V * DT)
    expect(me.data.speed).toBeCloseTo(V, 6)
  })

  test('a reversal eases through zero, as a vector, and never swings sideways', () => {
    const vx: number[] = []
    run(flat, {
      want: [4, 0], steps: 180,
      drive: me => { if (me.data.pos[0] > 3) me.data.want = [-4, 0] },
      each: me => { vx.push(me.data.vel[0]); expect(me.data.vel[2]).toBe(0) },
    })
    const from = vx.findIndex((v, i) => i > 0 && v < vx[i - 1])
    const after = vx.slice(from - 1)
    after.slice(1).forEach((v, i) => expect(v).toBeLessThanOrEqual(after[i]))
    expect(after.some(v => Math.abs(v) < 4 * (1 - Math.exp(-K.accel * DT)))).toBe(true)
    expect(vx.at(-1)).toBeCloseTo(-4, 3)
  })

  test('vel and speed report the speed moved, against a wall, not the one asked for', () => {
    const { me } = run((x: number) => (x >= 1 ? 2 : 0), { want: [4, 0], steps: 120 })
    expect(me.data.speed).toBe(0)
    expect(me.data.vel).toEqual([0, 0, 0])
    expect(me.data.want).toEqual([4, 0])
  })

  test('an unobstructed body\'s vel is the eased velocity exactly, not a rounding of the move', () => {
    const ease = 1 - Math.exp(-K.accel * DT)
    let v = [0, 0]
    run(flat, {
      at: [3.3, 11], want: [1.3, -4], steps: 300,
      each: me => {
        v = [v[0] + (1.3 - v[0]) * ease, v[1] + (-4 - v[1]) * ease]
        expect(me.data.vel).toEqual([v[0], 0, v[1]])
        expect(me.data.speed).toBe(Math.hypot(v[0], v[1]))
      },
    })
  })

  test('a body let go of far from the origin stops, and does not creep on by rounding', () => {
    const { me, truth } = run(flat, { at: [0, 15], want: [0, -4], steps: 60 })
    expect(me.data.pos[2]).toBeCloseTo(11, 0)
    me.data.want = [0, 0]
    for (let i = 0; i < 600; i++) truth.step(DT)
    const still = [...me.data.pos]
    for (let i = 0; i < 4000; i++) truth.step(DT)
    expect(me.data.pos).toEqual(still)
    expect(me.data.speed).toBe(0)
  })

  test('yaw eases toward want\'s bearing, or toward face when it is set', () => {
    const turn = 1 - Math.exp(-K.turnRate * DT)
    const { me, truth } = run(flat, { want: [4, 0], steps: 1 })
    expect(me.data.yaw).toBeCloseTo((Math.PI / 2) * turn, 12)
    for (let i = 0; i < 120; i++) truth.step(DT)
    expect(me.data.yaw).toBeCloseTo(Math.PI / 2, 9)
    me.data.face = -Math.PI / 2
    for (let i = 0; i < 120; i++) truth.step(DT)
    expect(me.data.yaw).toBeCloseTo(-Math.PI / 2, 9)
    me.data.face = null
    me.data.want = [0, 0]
    for (let i = 0; i < 60; i++) truth.step(DT)
    expect(me.data.yaw).toBeCloseTo(-Math.PI / 2, 9)
  })

  test('yaw turns no faster than turnMax, and eases in once the ease is the slower', () => {
    const { me, truth } = run(flat, { over: { turnMax: 1.5 }, want: [0, -4], steps: 1 })
    expect(Math.abs(me.data.yaw)).toBeCloseTo(1.5 * DT, 12)
    let last = me.data.yaw
    for (let i = 0; i < 180; i++) {
      truth.step(DT)
      expect(Math.abs(wrap(me.data.yaw - last))).toBeLessThanOrEqual(1.5 * DT + 1e-12)
      last = me.data.yaw
    }
    // π at 1.5 rad/s is 2.1 s at most; the ease brings it the rest of the way.
    expect(Math.abs(me.data.yaw)).toBeCloseTo(Math.PI, 3)
  })

  test('yaw turns the short way round, across π, and stays in (−π, π]', () => {
    const { me, truth } = run(flat, { steps: 120, drive: me => { me.data.face ??= 3 } })
    expect(me.data.yaw).toBeCloseTo(3, 9)
    me.data.face = -3
    for (let i = 0; i < 120; i++) {
      truth.step(DT)
      expect(Math.abs(me.data.yaw)).toBeGreaterThan(2.99)
      expect(me.data.yaw).toBeGreaterThan(-Math.PI)
      expect(me.data.yaw).toBeLessThanOrEqual(Math.PI)
    }
    expect(me.data.yaw).toBeCloseTo(-3, 9)
  })

  test('pos and vel are new arrays each step, never the loaded scene\'s', () => {
    const k = { ...K }
    const s = scene(k, { want: [3, 0] })
    const actor = s.actors[0]
    const before = JSON.stringify(actor)
    const ground: Ground = { height: flat, solids: () => [] }
    const truth = boot(s, { body: { tick(me, dt, w) { walk(me, w, dt, ground) } } })
    for (let i = 0; i < 30; i++) truth.step(DT)
    expect(JSON.stringify(actor)).toBe(before)
    expect(truth.rows.find(r => r.kind === 'body')!.data.pos[0]).toBeGreaterThan(0)
  })
})

describe('stand height', () => {
  test('over noise, pos.y is the mean of all five feet every step, far stiller than a single sample', () => {
    const noise: Height = (x, z) => 0.02 * Math.sin(9.1 * x + 7.3 * z) + 0.015 * Math.sin(13.7 * z - 5.3 * x + 1) + 0.01 * Math.sin(17.9 * z + 11.3 * x)
    const ys: number[] = [], single: number[] = []
    run(noise, {
      want: [0.6, 1.4], steps: 600,
      each: me => {
        const hs = feet(me.data.pos).map(([x, z]) => noise(x, z))
        expect(me.data.grounded).toBe(true)
        expect(me.data.pos[1]).toBeCloseTo(hs.reduce((a, b) => a + b, 0) / 5, 12)
        ys.push(me.data.pos[1])
        single.push(noise(me.data.pos[0], me.data.pos[2]))
      },
    })
    const jitter = (a: number[]) => a.slice(1).reduce((s, y, i) => s + (y - a[i]) ** 2, 0)
    expect(jitter(ys) / jitter(single)).toBeLessThan(0.25)
  })

  test('a hill steepening toward maxSlope is climbed with no jump in pos.y', () => {
    const L = 6, G = 0.68
    const hill = (x: number) => (x <= 0 ? 0 : x < L ? (G * x * x) / (2 * L) : (G * L) / 2 + G * (x - L))
    const ys: number[] = []
    const { me } = run(x => hill(x), { at: [-2, 0], want: [3, 0], steps: 300, each: me => { expect(me.data.grounded).toBe(true); ys.push(me.data.pos[1]) } })
    expect(me.data.pos[0]).toBeGreaterThan(12)
    // The hill's own curvature a step is G/L·(3·dt)²; the stand height bends no faster.
    const bend = Math.max(...ys.slice(2).map((y, i) => Math.abs(y - 2 * ys[i + 1] + ys[i])))
    expect(bend).toBeLessThan(1.1 * (G / L) * (3 * DT) ** 2)
  })

  test('a body spawned straddling a cliff stands on the top', () => {
    // Its front feet are over the drop; its centre, on the top, is not on the edge itself, whose
    // ground reads as steeper than any grade.
    for (const y of [0, 5]) {
      const { me } = run((x: number) => (x < 0 ? 5 : 0), { at: [-0.1, 0], y, steps: 5 })
      expect(me.data.pos).toEqual([-0.1, 5, 0])
      expect(me.data.grounded).toBe(true)
    }
  })
})

describe('the step rule', () => {
  test('vertical risers at 0–45° and 0.8–1.6 m, walked at 0–85° off the normal, are refused: y stays 0 and no foot crosses', () => {
    for (const psi of [0, 10, 20, 30, 45]) for (const H of [0.8, 1.0, 1.2, 1.4, 1.6]) for (const phi of [0, 30, 60, 85]) {
      const N = [Math.cos(psi * deg), Math.sin(psi * deg)]
      let near = Infinity
      run(across(psi, s => (s >= 0.6 ? H : 0)), {
        want: heading((psi + phi) * deg, 3), steps: 240,
        each: me => {
          expect(me.data.pos[1], `${psi}° ${H} m ${phi}°`).toBe(0)
          for (const [x, z] of feet(me.data.pos)) near = Math.min(near, 0.6 - (x * N[0] + z * N[1]))
        },
      })
      expect(near, `${psi}° ${H} m ${phi}°`).toBeGreaterThan(0)
      expect(near, `${psi}° ${H} m ${phi}° reached the riser`).toBeLessThan(0.01)
    }
  })

  test('kerbs up to step pass at any angle and any walk angle, and at a low maxSlope too', () => {
    for (const maxSlope of [0.7, 0.1]) for (const H of [0.2, 0.4, 0.6]) for (const psi of [0, 20, 45]) for (const phi of [0, 30, 60, 85]) {
      const { r, far } = approach(s => (s >= 0.6 ? H : 0), psi, phi, 3, { over: { maxSlope }, steps: 300 })
      expect(r.me.data.pos[1], `${maxSlope} ${H} ${psi}° ${phi}°`).toBe(H)
      expect(far, `${maxSlope} ${H} ${psi}° ${phi}°`).toBeGreaterThan(0.6 + K.span)
    }
  })

  test('walking off a 3 m and a 50 m ledge: on top until the last foot leaves, then the exact gravity sum, then walking on below', () => {
    for (const H of [3, 50]) {
      const trail: { x: number; y: number; grounded: boolean }[] = []
      const { me } = run((x: number) => (x < 0 ? H : 0), { at: [-1, 0], y: H, want: [3, 0], steps: 360, each: me => { trail.push({ x: me.data.pos[0], y: me.data.pos[1], grounded: me.data.grounded }) } })
      const leave = trail.findIndex(t => !t.grounded)
      const land = trail.findIndex((t, i) => i > leave && t.grounded)
      // Up to the step the last foot, the back corners, crosses the edge, it stands on top.
      trail.slice(0, leave).forEach(t => { expect(t.y).toBe(H); expect(t.x - K.span / 2).toBeLessThan(0) })
      expect(trail[leave].x - K.span / 2).toBeGreaterThanOrEqual(0)
      trail.slice(leave, land).forEach((t, n) => expect(t.y).toBeCloseTo(H - K.gravity * DT * DT * ((n + 1) * (n + 2)) / 2, 9))
      trail.slice(land).forEach(t => { expect(t.y).toBe(0); expect(t.grounded).toBe(true) })
      expect(me.data.pos[0]).toBeGreaterThan(15)
      expect(me.data.speed).toBeCloseTo(3, 6)
    }
  })

  test('a body near a 5 m or 50 m drop walks away from it, and one overhanging a drop walks back onto the top', () => {
    for (const H of [5, 50]) for (const d of [0.6, 1.0, 1.5]) {
      const { me } = run((x: number) => (x < 0 ? H : 0), { at: [-d, 0], y: H, want: [-3, 0], steps: 120, each: me => { expect(me.data.pos[1]).toBe(H); expect(me.data.grounded).toBe(true) } })
      expect(me.data.pos[0]).toBeCloseTo(-d - 3 * (2 - 1 / K.accel), 1)
    }
    const { me } = run((x: number) => (x < 0 ? 5 : 0), { at: [0.1, 0], y: 5, want: [-3, 0], steps: 120, each: me => expect(me.data.pos[1]).toBe(5) })
    expect(me.data.pos[0]).toBeLessThan(-5)
  })
})

describe('the slope rule', () => {
  test('ramps under maxSlope, up to 0.69 at 0.7, are climbed straight up at 0, 20 and 45°, at 1 and 8 m/s', () => {
    for (const G of [0.3, 0.5, 0.69]) for (const psi of [0, 20, 45]) for (const V of [1, 8]) {
      const { r, far } = approach(s => G * Math.max(0, s - 0.6), psi, 0, V, { steps: Math.round((6 / V) * 60) + 30 })
      expect(far, `${G} ${psi}° ${V} m/s`).toBeGreaterThan(5)
      expect(r.me.data.pos[1]).toBeCloseTo(r.S(r.me.data.pos[0], r.me.data.pos[2]), 12)
    }
  })

  test('ramps over maxSlope are never climbed a span up at any angle or walk angle, and are slid along at their foot at 3·sin φ', () => {
    for (const G of [0.75, 1, 3]) for (const psi of [0, 20, 45]) for (const phi of [0, 30, 60, 85]) {
      const speeds: number[] = []
      const { far } = approach(s => G * Math.max(0, s - 0.6), psi, phi, 3, { steps: 400, each: (me, i) => { if (i >= 340) speeds.push(me.data.speed) } })
      expect(far - 0.6, `${G} ${psi}° ${phi}°`).toBeLessThan(K.span)
      const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length
      expect(mean, `${G} ${psi}° ${phi}°`).toBeCloseTo(3 * Math.sin(phi * deg), 4)
    }
  })

  test('ground steeper than maxSlope is not ground: a body on it slides down its steepest descent at slide, ungrounded, and cannot jump', () => {
    for (const G of [0.75, 1]) for (const psi of [0, 20, 45]) for (const phi of [0, 90, 180]) {
      const N = [Math.cos(psi * deg), Math.sin(psi * deg)]
      const what = `${G} at ${psi}° asking ${phi}° off uphill`
      let n = 0
      const { me } = run(across(psi, s => G * s), {
        y: 0.001, want: heading((psi + phi) * deg, 3), steps: 90,
        drive: me => { if (n++ === 45) me.data.jump = true },
        each: (me, i) => {
          expect(me.data.grounded, what).toBe(false)
          if (i === 45) expect(me.data.vel[1], what).toBeLessThanOrEqual(0)
        },
      })
      // Downhill at no less than slide, whatever it asks; across the face as it asks.
      const down = -(me.data.vel[0] * N[0] + me.data.vel[2] * N[1])
      expect(down, what).toBeGreaterThan(K.slide - 0.01)
      if (phi === 180) expect(down, what).toBeCloseTo(3, 2)
      if (phi === 90) expect(me.data.vel[0] * -N[1] + me.data.vel[2] * N[0], what).toBeCloseTo(3, 2)
      expect(me.data.jump).toBe(false)
    }
  })

  test('ground whose grade hovers within ±0.002 of maxSlope turns grounded on or off at most once', () => {
    const L = 2, A = 0.002
    for (const start of [K.maxSlope - A, K.maxSlope + A]) for (const V of [1, 1.5, 3]) {
      // Downhill along +x at a grade of start + A·sin(2πx/L)... about maxSlope.
      const mean = K.maxSlope
      const h = (x: number) => -(mean * x - ((A * L) / (2 * Math.PI)) * Math.cos((2 * Math.PI * x) / L) * Math.sign(start - mean))
      let flips = 0, was: boolean | undefined
      // Already walking down it, so setting off does not leave the ground.
      run(x => h(x), {
        y: h(0), vel: [V, -V * mean, 0], want: [V, 0], steps: 600,
        each: me => { if (was !== undefined && me.data.grounded !== was) flips++; was = me.data.grounded },
      })
      expect(flips, `from ${start} at ${V}`).toBeLessThanOrEqual(1)
    }
  })

  test('a face so steep its slide outruns the fall is come down in slides and falls, never grounded on it and never rising', () => {
    for (const psi of [0, 20, 45]) {
      let prev = Infinity
      const { me } = run(across(psi, s => 3 * s), {
        y: 0.001, want: heading(psi * deg, 3), steps: 180,
        each: (me, i) => { expect(me.data.grounded).toBe(false); if (i > 0) expect(me.data.pos[1]).toBeLessThanOrEqual(prev); prev = me.data.pos[1] },
      })
      // At a third of a metre a second or more.
      expect(me.data.pos[1]).toBeLessThan(-1)
    }
  })

  test('a body sliding off steep ground stands again on walkable ground below it', () => {
    const face = (x: number) => Math.max(0, 1.5 * x)
    const { me, S } = run(face, { at: [2, 0], y: 3, want: [3, 0], steps: 120 })
    expect(me.data.grounded).toBe(true)
    const [x, y, z] = me.data.pos
    expect(y).toBe(S(x, z))
    expect(Math.abs(S(x + 1e-4, z) - S(x - 1e-4, z)) / 2e-4).toBeLessThanOrEqual(K.maxSlope)
    expect(y).toBeLessThan(0.3)
  })

  test('no hop climbs ground steeper than maxSlope further than jumpH + step above the last walkable ground', () => {
    const faces: [string, (s: number) => number][] = [
      ['grade 1', s => Math.max(0, Math.min(5, s - 1))],
      ['grade 1.5', s => Math.max(0, Math.min(5, 1.5 * (s - 1)))],
      ['grade 3', s => Math.max(0, Math.min(5, 3 * (s - 1)))],
      ['grade 10', s => Math.max(0, Math.min(5, 10 * (s - 1)))],
      ['a 0.8 m riser', s => (s > 1 ? 0.8 : 0)],
    ]
    for (const [name, profile] of faces) for (const V of [1, 3]) for (const psi of [0, 30]) {
      let top = 0, last = 0, worst = 0
      run(across(psi, profile), {
        want: heading(psi * deg, V), steps: 1200,
        drive: me => { if (me.data.grounded) me.data.jump = true },
        each: me => {
          const y = me.data.pos[1]
          if (me.data.grounded) last = y
          top = Math.max(top, y)
          worst = Math.max(worst, y - last)
        },
      })
      const what = `${name} at ${V} m/s turned ${psi}°`
      expect(worst, what).toBeLessThanOrEqual(K.jumpH + K.step + 0.01)
      // The faces have no walkable ground above their foot, so nothing is stood on above it either.
      if (name !== 'a 0.8 m riser') expect(top, what).toBeLessThanOrEqual(K.jumpH + K.step + 0.01)
    }
  })

  test('a staircase of 0.8 m risers is hopped up tread by tread, each landing within jumpH + step of the tread before', () => {
    let last = 0, worst = 0, top = 0
    run(across(0, s => (s > 1 ? Math.min(8, 0.8 * Math.ceil((s - 1) / 0.4)) : 0)), {
      want: [3, 0], steps: 1200,
      drive: me => { if (me.data.grounded) me.data.jump = true },
      each: me => { if (me.data.grounded) { worst = Math.max(worst, me.data.pos[1] - last); last = me.data.pos[1] } top = Math.max(top, me.data.pos[1]) },
    })
    expect(top).toBeGreaterThan(7)
    expect(worst).toBeLessThanOrEqual(K.jumpH + K.step + 0.01)
  })

  test('steep continuous walls, 3 m over 0.3 m and 10 m over 1 m, are not climbed at 60°', () => {
    for (const [H, f] of [[3, 0.3], [10, 1]]) for (const psi of [0, 20, 45]) for (const V of [0.5, 3]) {
      const { top } = approach(s => H * clamp01((s - 0.6) / f), psi, 60, V, { steps: 300 })
      expect(top, `${H}/${f} ${psi}° ${V} m/s`).toBeLessThan(K.step)
    }
  })

  test('walls 0.7–1.1 m on faces 0.02–0.3 m, at θ 0 and 20°, walked at 0–85° at 0.5 and 3 m/s, are refused', () => {
    // The face starts 2 cm ahead of the leading foot, so every walk comes to it, and 1 m ahead for
    // the walks fast enough across it to come to it at full speed.
    const runs: number[][] = []
    for (const phi of [0, 30, 60, 85]) for (const V of [0.5, 3]) runs.push([phi, V, 0.02])
    for (const phi of [0, 30, 60]) runs.push([phi, 3, 1])
    for (const H of [0.7, 0.8, 0.9, 1.0, 1.1]) for (const f of [0.02, 0.05, 0.1, 0.2, 0.3]) for (const psi of [0, 20]) for (const [phi, V, ahead] of runs) {
      const s0 = lead(psi) + ahead
      const N = [Math.cos(psi * deg), Math.sin(psi * deg)]
      const what = `${H} on ${f} at ${psi}° walked ${phi}° at ${V} from ${ahead} m`
      let reached = -Infinity
      const { top, far } = approach(s => H * clamp01((s - s0) / f), psi, phi, V, {
        steps: 240, each: me => { reached = Math.max(reached, ...feet(me.data.pos).map(([x, z]) => x * N[0] + z * N[1])) },
      })
      // Refused, a body eases in again from rest, by up to 3·(1 − exp(−accel·dt))·dt ≈ 1 cm a move.
      expect(reached, what).toBeGreaterThan(s0 - 0.02)
      expect(far, what).toBeLessThan(s0 + f)
      expect(top, what).toBeLessThan(H)
    }
  })

  test('stacked 0.5 + 0.5 and 0.55 + 0.55 risers on 5 mm–10 cm treads are refused', () => {
    for (const R of [0.5, 0.55]) for (const t of [0.005, 0.01, 0.03, 0.05, 0.1]) for (const psi of [0, 20]) for (const phi of [0, 30, 60]) for (const V of [0.5, 3]) {
      const { top } = approach(s => (s >= 0.6 ? R : 0) + (s >= 0.6 + t ? R : 0), psi, phi, V)
      expect(top, `${R} + ${R} on ${t} at ${psi}° walked ${phi}° at ${V}`).toBeLessThan(2 * R)
    }
  })

  test('ridges 1.2–5 m on 0.1–1 m bases and 1.0–1.1 m on 0.2–1 m bases, walked at 0 and 45° at 0.5, 1 and 3 m/s, are refused', () => {
    const ridges: number[][] = []
    for (const H of [1.2, 1.5, 2, 3, 5]) for (const B of [0.1, 0.2, 0.4, 0.8, 1]) ridges.push([H, B])
    for (const H of [1.0, 1.1]) for (const B of [0.2, 0.4, 0.8, 1]) ridges.push([H, B])
    for (const [H, B] of ridges) for (const phi of [0, 45]) for (const V of [0.5, 1, 3]) {
      const { far } = approach(s => H * Math.max(0, 1 - Math.abs(s - 1) / (B / 2)), 0, phi, V, { steps: 300 })
      expect(far, `${H} m on ${B} m walked ${phi}° at ${V}`).toBeLessThan(1)
    }
  })

  test('a staircase of 0.2 m risers on 0.3 m treads, walked square on, is climbed turned 0 and 20° from the world\'s axes at 0.5–3 m/s, and 45° at a walk', () => {
    const stairs = (s: number) => 0.2 * Math.min(40, Math.max(0, Math.floor((s - 0.6) / 0.3) + 1))
    for (const [psi, V] of [[0, 0.5], [0, 1.5], [0, 3], [20, 0.5], [20, 1.5], [20, 3], [45, 1.5]]) {
      const { r } = approach(stairs, psi, 0, V, { steps: Math.round((14 / V) * 60) })
      expect(r.me.data.pos[1], `${psi}° at ${V}`).toBe(8)
    }
  })

  test('inside corners: a steep ramp or an edge beside a distant cliff is refused, straight or diagonally', () => {
    const corners: [string, Height][] = [
      ['ramp', (x, z) => Math.max(Math.max(0, x - 1), z >= 2 ? 5 : 0)],
      ['edge', (x, z) => Math.max(x >= 1 ? 1 : 0, z >= 2 ? 5 : 0)],
    ]
    for (const [name, h] of corners) for (const a of [0, 30, 45, 60]) {
      let top = 0, farX = -Infinity, farZ = -Infinity
      run(h, { want: heading(a * deg, 3), steps: 300, each: me => { top = Math.max(top, me.data.pos[1]); farX = Math.max(farX, me.data.pos[0]); farZ = Math.max(farZ, me.data.pos[2]) } })
      expect(top, `${name} ${a}°`).toBeLessThan(K.step)
      expect(farX, `${name} ${a}°`).toBeLessThan(1 + K.span)
      expect(farZ + K.span / 2, `${name} ${a}°`).toBeLessThanOrEqual(2)
    }
  })

  test('gentle ramps are walked to the top beside a 5 m cliff 0.6, 1.0 and 1.5 m to the side', () => {
    for (const G of [0.05, 0.3, 0.6]) for (const side of [0.6, 1.0, 1.5]) {
      const { me } = run((x, z) => G * clamp01((z - 1) / 10) * 10 + (x >= side ? 5 : 0), { want: [0, 3], steps: 300 })
      expect(me.data.pos[2], `${G} ${side}`).toBeGreaterThan(11)
      expect(me.data.pos[1]).toBeCloseTo(10 * G, 12)
      expect(me.data.speed).toBeCloseTo(3, 6)
    }
  })

  test('noise beside a cliff is walked as far as without it', () => {
    const noise: Height = (x, z) => 0.03 * Math.sin(1.7 * x + 2.3 * z) + 0.02 * Math.sin(4.1 * z - 3.3 * x + 1) + 0.015 * Math.sin(7.9 * z + 1.3 * x)
    const alone = run(noise, { want: [0, 3], steps: 300 })
    const beside = run((x, z) => noise(x, z) + (x >= 0.6 ? 5 : 0), { want: [0, 3], steps: 300 })
    expect(beside.me.data.pos).toEqual(alone.me.data.pos)
  })

  test('a canyon floor rising 0.3 between grade-3 walls is walked along for gaps of 0.3–2 m', () => {
    for (const gap of [0.3, 0.5, 0.8, 1, 1.5, 2]) {
      const { me } = run((x, z) => 0.3 * z + 3 * Math.max(0, Math.abs(x) - gap / 2), { want: [0, 3], steps: 240 })
      expect(me.data.pos[2], `${gap}`).toBeGreaterThan(11)
      expect(me.data.pos[0]).toBe(0)
      expect(me.data.speed).toBeCloseTo(3, 6)
    }
  })

  test('a gentle ramp is walked up to a wall, and stops with its front feet span/2 short of it', () => {
    const { me } = run((_, z) => 0.3 * z + (z >= 5 ? 3 : 0), { want: [0, 3], steps: 300 })
    const front = me.data.pos[2] + K.span / 2
    expect(front).toBeLessThanOrEqual(5 - K.span / 2)
    expect(front).toBeGreaterThan(5 - K.span / 2 - 0.01)
  })
})

describe('sliding along', () => {
  // Whether a body walked by `drive` round a feature stays moving: no run of more than `few` steps
  // without moving, and how high it got.
  function round(height: Height, o: Run & { few?: number }) {
    let still = 0, worst = 0, top = 0, prev: number[] | undefined
    run(height, {
      ...o,
      each: (me, i) => {
        const p = me.data.pos
        if (prev && Math.hypot(p[0] - prev[0], p[2] - prev[2]) < 1e-4) worst = Math.max(worst, ++still)
        else still = 0
        top = Math.max(top, p[1])
        prev = p
        return o.each?.(me, i)
      },
    })
    return { worst, top }
  }
  // Heads at φ off the normal pointing into a round feature about the origin, and round it.
  const circling = (phi: number, v: number, inward: boolean) => (me: Row) => {
    const p = me.data.pos, a = Math.atan2(p[2], p[0])
    const n = inward ? [-Math.cos(a), -Math.sin(a)] : [Math.cos(a), Math.sin(a)]
    const c = Math.cos(phi * deg), s = Math.sin(phi * deg)
    me.data.want = [v * (c * n[0] - s * n[1]), v * (c * n[1] + s * n[0])]
  }

  test('a riser turned 10° is slid along at the speed of the move along it', () => {
    for (const phi of [30, 60, 85]) for (const V of [0.5, 3]) {
      const T = [-Math.sin(10 * deg), Math.cos(10 * deg)]
      const { me } = run(across(10, s => (s >= 0.6 ? 0.65 : 0)), { want: heading((10 + phi) * deg, V), steps: 240 })
      expect(me.data.vel[0] * T[0] + me.data.vel[2] * T[1], `${phi}° at ${V}`).toBeCloseTo(V * Math.sin(phi * deg), 6)
      expect(me.data.pos[1]).toBe(0)
    }
  })

  test('a vertical tower wall of R 3, 10 and 100 m is slid round without stalling', () => {
    for (const R of [3, 10, 100]) for (const phi of [30, 60, 80]) for (const V of [1, 3, 8]) {
      const { worst, top } = round((x, z) => (Math.hypot(x, z) < R ? 3 : 0), { at: [R + 1, 0], steps: 600, drive: circling(phi, V, true) })
      expect(worst, `R ${R} ${phi}° at ${V}`).toBeLessThanOrEqual(3)
      expect(top).toBe(0)
    }
  })

  test('a plateau face walked along at 10–80° is slid along past its outside corner', () => {
    for (const phi of [10, 30, 45, 60, 80]) for (const V of [3, 8]) for (const H of [0.8, 5]) {
      const { me } = run((x, z) => (x > 1 && z < 3 ? H : 0), { want: heading(phi * deg, V), steps: 600 })
      expect(me.data.pos[2], `${phi}° at ${V}, ${H} m`).toBeGreaterThan(3 + K.span)
      expect(me.data.pos[1]).toBe(0)
    }
  })

  test('a grade-1.5 cone of R 10 m and a round pond shore of R 6 m are slid round without sticking', () => {
    for (const phi of [30, 60, 80]) for (const V of [1, 3, 8]) {
      const cone = round((x, z) => Math.max(0, Math.min(5, 1.5 * (10 - Math.hypot(x, z)))), { at: [11, 0], steps: 600, drive: circling(phi, V, true) })
      expect(cone.worst, `cone ${phi}° at ${V}`).toBeLessThanOrEqual(3)
      expect(cone.top).toBeLessThan(K.step)
    }
    const pond = round(flat, {
      at: [7, 0], steps: 600, drive: circling(20, 3, true),
      depth: (x, z) => Math.max(0, 1.5 * (1 - Math.hypot(x, z) ** 2 / 36)),
    })
    expect(pond.worst).toBeLessThanOrEqual(3)
  })

  test('a cliff is slid along without leaving the ground, and at 0.2 rad, 0.5 rad and 45° into it at 3·cos of that', () => {
    for (const psi of [0, 20, 45]) for (const a of [0, 0.2, 0.5, Math.PI / 4]) {
      const N = [Math.cos(psi * deg), Math.sin(psi * deg)], T = [-N[1], N[0]]
      const want = [3 * (T[0] * Math.cos(a) + N[0] * Math.sin(a)), 3 * (T[1] * Math.cos(a) + N[1] * Math.sin(a))]
      const { me } = run(across(psi, s => (s >= 0.4 ? 5 : 0)), { want, steps: 240, each: me => { expect(me.data.grounded).toBe(true); expect(me.data.pos[1]).toBe(0) } })
      expect(me.data.speed, `${psi}° ${a}`).toBeCloseTo(3 * Math.cos(a), 6)
    }
  })
})

describe('in the air', () => {
  test('a jump peaks at the sum of its steps', () => {
    let top = 0, n = 0
    run(flat, { steps: 100, drive: me => { if (n++ === 10) me.data.jump = true }, each: me => { top = Math.max(top, me.data.pos[1]) } })
    let v = Math.sqrt(2 * K.gravity * K.jumpH), sum = 0
    for (v -= K.gravity * DT; v > 0; v -= K.gravity * DT) sum += v * DT
    expect(top).toBe(sum)
  })

  test('jump is taken on the ground and cleared either way', () => {
    const { me, truth } = run(flat, { steps: 1 })
    me.data.jump = true
    truth.step(DT)
    expect(me.data.jump).toBe(false)
    expect(me.data.grounded).toBe(false)
    const vy = me.data.vel[1]
    me.data.jump = true
    truth.step(DT)
    expect(me.data.jump).toBe(false)
    expect(me.data.vel[1]).toBeCloseTo(vy - K.gravity * DT, 12)
  })

  test('a jump lands on a 0.5 m ledge at step 0.1, on 0.7 and 0.8 m ledges at step 0.6 and on 0.8 m at maxSlope 0.5, and not on 0.9 m', () => {
    const cases: [number, Partial<Numbers>, boolean][] = [[0.5, { step: 0.1, maxSlope: 0.1 }, true], [0.7, {}, true], [0.8, {}, true], [0.8, { maxSlope: 0.5 }, true], [0.9, {}, false]]
    for (const [H, over, lands] of cases) {
      let n = 0
      const { me } = run((x: number) => (x >= 1 ? H : 0), { over, want: [4, 0], steps: 180, drive: me => { if (n++ === 60) me.data.jump = true } })
      expect(me.data.grounded).toBe(true)
      expect(me.data.pos[1], `${H} ${JSON.stringify(over)}`).toBe(lands ? H : 0)
      if (!lands) expect(me.data.pos[0] + K.span / 2).toBeLessThan(1)
    }
  })

  test('a real downhill leaves the ground at most once per footprint kink, and is walked on the ground below them', () => {
    for (const G of [0.2, 0.5, 0.69]) for (const V of [3, 5.6]) {
      let leaves = 0, was = true
      run((x: number) => -G * Math.max(0, x), {
        at: [-3, 0], want: [V, 0], steps: 240,
        each: me => {
          if (was && !me.data.grounded) leaves++
          was = me.data.grounded
          if (me.data.pos[0] > 3) expect(me.data.grounded, `${G} ${V}`).toBe(true)
        },
      })
      expect(leaves, `${G} at ${V}`).toBeLessThanOrEqual(3)
      // The front corners are two of the five feet, so the first kink steepens the drop by 2/5·G·V
      // m/s; no more than gravity·dt, the body never leaves.
      if ((2 / 5) * G * V <= K.gravity * DT) expect(leaves).toBe(0)
    }
  })

  test('a jump landing on a downhill is grounded from then on', () => {
    for (const G of [0.2, 0.5, 0.69]) {
      let n = 0, landed = -1
      run((x: number) => -G * x, {
        want: [3, 0], steps: 240, drive: me => { if (n++ === 30) me.data.jump = true },
        each: (me, i) => { if (i > 31 && landed < 0 && me.data.grounded) landed = i; if (landed >= 0) expect(me.data.grounded).toBe(true) },
      })
      expect(landed).toBeGreaterThan(0)
    }
  })

  test('landing onto a rising footprint sets vel[1] to 0, and onto a falling one the landing move\'s rate', () => {
    const up = run((x: number) => (x >= 0.27 ? 0.3 : 0), { y: 0.02, grounded: false, vel: [3, 0, 0], want: [3, 0], steps: 1 })
    expect(up.me.data.grounded).toBe(true)
    expect(up.me.data.pos[1]).toBeGreaterThan(0.02)
    expect(up.me.data.vel[1]).toBe(0)
    const down = run(flat, { y: 0.001, grounded: false, steps: 1 })
    expect(down.me.data.grounded).toBe(true)
    expect(down.me.data.vel[1]).toBeCloseTo(-0.001 / DT, 12)
  })
})

describe('thin walls and pillars', () => {
  test('a wall 0.1 m thick turned 45°, walked into at 0.5 m/s, is not climbed', () => {
    for (const H of [0.65, 1, 2, 5]) for (const phi of [0, 20, 45]) {
      const { top } = approach(s => (s > 1 && s < 1.1 ? H : 0), 45, phi, 0.5, { steps: 480 })
      expect(top, `${H} m at ${phi}°`).toBe(0)
    }
  })

  test('a 0.3 m pillar approached at 15° is not climbed', () => {
    for (const H of [0.8, 1.5, 3, 5]) for (const V of [0.5, 3]) {
      let top = 0
      const a = 15 * deg
      run((x, z) => (Math.abs(x - 2) < 0.15 && Math.abs(z) < 0.15 ? H : 0), {
        at: [2 - 0.15 - 1.2, -1.2 * Math.tan(a)], want: [V * Math.cos(a), V * Math.sin(a)], steps: 480,
        each: me => { top = Math.max(top, me.data.pos[1]) },
      })
      expect(top, `${H} m at ${V}`).toBe(0)
    }
  })
})

describe('water and solids', () => {
  const pond: Height = x => Math.max(0, 0.5 * (x - 2))
  const depthAt = (p: number[]) => feet(p).slice(0, 4).reduce((s, [x, z]) => s + pond(x, z), 0) / 4

  test('a body stops at the wade line', () => {
    const { me } = run(flat, { depth: pond, want: [3, 0], steps: 300, each: me => expect(depthAt(me.data.pos)).toBeLessThanOrEqual(K.wade) })
    expect(depthAt(me.data.pos)).toBeGreaterThan(K.wade - 0.01)
    expect(me.data.speed).toBe(0)
  })

  test('level water deeper than wade does not trap the body, and deep water is left toward the shore but not deepened', () => {
    const level = run(flat, { depth: () => 1, want: [3, 1], steps: 120 })
    expect(level.me.data.speed).toBeCloseTo(Math.hypot(3, 1), 6)
    const out = run(flat, { depth: pond, at: [5, 0], want: [-3, 0], steps: 60 })
    expect(out.me.data.pos[0]).toBeLessThan(2.5)
    const deeper = run(flat, { depth: pond, at: [5, 0], want: [3, 0], steps: 60 })
    expect(deeper.me.data.pos[0]).toBe(5)
  })

  test('a body walked straight at a solid stops at radius + solid radius', () => {
    let nearest = Infinity
    const { me } = run(flat, { solids: [{ x: 2, z: 0, radius: 0.3 }], want: [3, 0], steps: 240, each: me => { nearest = Math.min(nearest, Math.hypot(me.data.pos[0] - 2, me.data.pos[2])) } })
    expect(nearest).toBeCloseTo(0.65, 12)
    expect(me.data.pos[0]).toBeCloseTo(2 - 0.65, 12)
  })

  test('a push out of one solid onto another is caught', () => {
    for (const [cx, cz] of [[1.2, 0.5], [1.2, 0.7], [1.4, 0.6], [1.6, 0.9]]) for (const r of [0.05, 0.2]) for (const z of [0.1, 0.3]) for (const V of [3, 8]) {
      const solids = [{ x: 2, z: 0, radius: 0.3 }, { x: cx, z: cz, radius: r }]
      run(flat, {
        at: [0, z], solids, want: [V, 0], steps: 120,
        each: me => { for (const s of solids) expect(Math.hypot(me.data.pos[0] - s.x, me.data.pos[2] - s.z), `${cx} ${cz} ${r} ${z} ${V}`).toBeGreaterThan(s.radius + K.radius - 1e-9) },
      })
    }
  })

  test('a cliff and a diagonal shoreline together still refuse the cliff', () => {
    const depth: Height = (x, z) => Math.max(0, 0.8 * (x + z - 2))
    for (const a of [0, 20, 45, 70, 90]) {
      run((x: number) => (x >= 2 ? 3 : 0), {
        depth, want: heading(a * deg, 3), steps: 300,
        each: me => {
          expect(me.data.pos[1]).toBe(0)
          expect(feet(me.data.pos).slice(0, 4).reduce((s, [x, z]) => s + depth(x, z), 0) / 4).toBeLessThanOrEqual(K.wade)
        },
      })
    }
  })

  test('a solid at a cliff\'s foot never lifts the body', () => {
    const s = { x: 1.9, z: 0, radius: 0.3 }
    for (const z of [0, 0.2, -0.3]) for (const a of [0, 30, -30]) {
      run((x: number) => (x >= 2 ? 3 : 0), {
        at: [0, z], solids: [s], want: heading(a * deg, 3), steps: 240,
        each: me => { expect(me.data.pos[1]).toBe(0); expect(Math.hypot(me.data.pos[0] - s.x, me.data.pos[2] - s.z)).toBeGreaterThan(0.65 - 1e-9) },
      })
    }
  })

  test('a steep slope with a solid beside it is refused straight and diagonally', () => {
    for (const a of [0, 30, 45]) {
      let far = -Infinity, top = 0
      run((x: number) => Math.max(0, x - 1), { solids: [{ x: 0.9, z: 0.6, radius: 0.3 }], want: heading(a * deg, 3), steps: 240, each: me => { far = Math.max(far, me.data.pos[0]); top = Math.max(top, me.data.pos[1]) } })
      expect(far - 1, `${a}°`).toBeLessThan(K.span)
      expect(top).toBeLessThan(K.step)
    }
  })
})

describe('bodies', () => {
  // A body walking at a post: a row of kind `post`, whose entry in the table has radius 0.3, standing
  // at (2, 0), `limp` or not, and named in the body's `bodies` unless the test names others. With
  // `target`, the body seeks it; with `carry`, it is carried by that move each step, as a clip's
  // travel carries it.
  const POST = { ...K, radius: 0.3 }
  const reach = K.radius + POST.radius
  function past(o: { at: number[]; want?: number[]; target?: number[]; carry?: number[]; limp?: boolean; bodies?: string[]; solids?: Solid[]; steps?: number }) {
    const solids = o.solids ?? []
    const ground: Ground = { height: flat, solids: (x, z, r) => solids.filter(s => Math.hypot(s.x - x, s.z - z) <= r + s.radius) }
    const truth = boot({
      world: { walker: { kinds: { body: { ...K, bodies: o.bodies ?? ['post'] }, post: POST } } },
      prefabs: { body: BODY, post: { pos: [2, 0, 0], limp: false } },
      actors: [{ is: 'post', limp: o.limp ?? false }, { is: 'body', pos: [o.at[0], 0, o.at[1]], want: o.want ?? [0, 0] }],
    }, {
      post: {},
      body: { tick(me, dt, w) { if (o.target) seek(me, w, o.target, 0.2, ground); walk(me, w, dt, ground); if (o.carry) carry(me, w, o.carry, ground) } },
    })
    const me = truth.rows.find(r => r.kind === 'body')!
    let nearest = Infinity
    for (let i = 0; i < (o.steps ?? 240); i++) {
      truth.step(DT)
      nearest = Math.min(nearest, Math.hypot(me.data.pos[0] - 2, me.data.pos[2]))
    }
    return { me, nearest }
  }

  test('a body walked straight at a post from any side stops at the two radii, still', () => {
    for (let a = 0; a < 360; a += 30) {
      const from = [2 + 3 * Math.cos(a * deg), 3 * Math.sin(a * deg)]
      const { me, nearest } = past({ at: from, want: heading((a + 180) * deg, 3) })
      expect(nearest, `${a}°`).toBeCloseTo(reach, 12)
      expect(Math.hypot(me.data.pos[0] - 2, me.data.pos[2]), `${a}°`).toBeCloseTo(reach, 12)
      expect(me.data.speed, `${a}°`).toBeLessThan(1e-6)
    }
  })

  test('a body walked at a post off its centre slides round it, never nearer than the two radii, and goes on', () => {
    for (let a = 0; a < 360; a += 45) for (const off of [0.1, 0.3, -0.5]) {
      const way = (a + 180) * deg, side = [-Math.sin(way) * off, Math.cos(way) * off]
      const { me, nearest } = past({ at: [2 + 3 * Math.cos(a * deg) + side[0], 3 * Math.sin(a * deg) + side[1]], want: heading(way, 3) })
      expect(nearest, `${a}° ${off}`).toBeGreaterThan(reach - 1e-9)
      expect(nearest, `${a}° ${off}`).toBeLessThan(reach + 1e-3)
      // Past the post, on its far side along the way.
      expect((me.data.pos[0] - 2) * Math.cos(way) + me.data.pos[2] * Math.sin(way), `${a}° ${off}`).toBeGreaterThan(2)
    }
  })

  test('a limp post, and a post of a kind bodies does not name, are walked through; a kind naming its own is no solid to itself', () => {
    for (const o of [{ limp: true }, { bodies: [] }, { bodies: ['body'] }]) {
      const { me, nearest } = past({ at: [-1, 0], want: [3, 0], ...o })
      expect(nearest, JSON.stringify(o)).toBeLessThan(0.05)
      expect(me.data.pos[0], JSON.stringify(o)).toBeGreaterThan(4)
      expect(me.data.speed, JSON.stringify(o)).toBeCloseTo(3, 9)
    }
  })

  // Where a body carried along the way from `at` first meets a circle of `reach` about c, or undefined.
  const meeting = (at: number[], way: number, c: number[]) => {
    const d = [Math.cos(way), Math.sin(way)], q = [at[0] - c[0], at[1] - c[1]]
    const b = q[0] * d[0] + q[1] * d[1], disc = b * b - (q[0] * q[0] + q[1] * q[1] - reach * reach)
    return disc < 0 ? undefined : [at[0] + (-b - Math.sqrt(disc)) * d[0], at[1] + (-b - Math.sqrt(disc)) * d[1]]
  }

  test('a carry into a post, or into a trunk, stops where the circles first meet, off its centre too, and never slides round it', () => {
    for (let a = 0; a < 360; a += 45) for (const off of [0, 0.3, -0.5]) for (const trunk of [false, true]) {
      const way = (a + 180) * deg
      const at = [2 + 3 * Math.cos(a * deg) - Math.sin(way) * off, 3 * Math.sin(a * deg) + Math.cos(way) * off]
      const o = trunk ? { bodies: [], solids: [{ x: 2, z: 0, radius: POST.radius }] } : {}
      const { me } = past({ at, carry: heading(way, 0.05), steps: 120, ...o })
      const end = meeting(at, way, [2, 0])!
      expect(me.data.pos[0], `${a}° ${off} ${trunk}`).toBeCloseTo(end[0], 9)
      expect(me.data.pos[2], `${a}° ${off} ${trunk}`).toBeCloseTo(end[1], 9)
    }
  })

  test('a carry clear of a post, away from one it touches, or through a limp one, is not cut', () => {
    const cases: [string, { at: number[]; carry: number[]; limp?: boolean }, number[]][] = [
      ['passing it wide', { at: [-1, reach + 0.01], carry: [0.05, 0] }, [-1 + 0.05 * 120, reach + 0.01]],
      ['away from it, touching', { at: [2 - reach, 0], carry: [-0.05, 0] }, [2 - reach - 0.05 * 120, 0]],
      ['along it, touching', { at: [2, reach], carry: [0.05, 0] }, [2 + 0.05 * 120, reach]],
      ['through it, limp', { at: [-1, 0], carry: [0.05, 0], limp: true }, [-1 + 0.05 * 120, 0]],
    ]
    for (const [what, o, end] of cases) {
      const { me } = past({ ...o, steps: 120 })
      expect(me.data.pos[0], what).toBeCloseTo(end[0], 9)
      expect(me.data.pos[2], what).toBeCloseTo(end[1], 9)
    }
  })

  test('seek goes round a post to a target behind it', () => {
    const { me, nearest } = past({ at: [0, 0], target: [4, 0], steps: 600 })
    expect(Math.hypot(me.data.pos[0] - 4, me.data.pos[2])).toBeLessThan(0.2 + 1e-9)
    expect(nearest).toBeGreaterThan(reach - 1e-9)
  })
})

describe('carried on the ground', () => {
  test('a carry up or down a grade under maxSlope stands on S, grounded, every step, however fast', () => {
    for (const grade of [0.1, 0.3, 0.6]) for (const psi of [0, 30]) for (const way of [1, -1]) for (const speed of [2, 5, 8]) {
      const at = `${grade} ${psi}° ${way} ${speed}`
      const height = across(psi, s => -way * grade * s)
      run(height, {
        carry: heading(psi * deg, speed * DT), steps: 90,
        each: me => {
          expect(me.data.grounded, at).toBe(true)
          expect(me.data.pos[1], at).toBe(stand(K, { height, solids: () => [] }, me.data.pos[0], me.data.pos[2]))
        },
      })
    }
  })

  test('a carry steps down a kerb up to step, and off a 3 m ledge falls from the step it crosses by the exact gravity sum', () => {
    for (const H of [0.2, 0.4, 0.6]) {
      const height = (x: number) => (x < 0 ? H : 0)
      const { me } = run(height, {
        at: [-1, 0], y: H, carry: [3 * DT, 0], steps: 60,
        each: me => { expect(me.data.grounded, `${H}`).toBe(true); expect(me.data.pos[1], `${H}`).toBe(stand(K, { height, solids: () => [] }, me.data.pos[0], me.data.pos[2])) },
      })
      expect(me.data.pos[1], `${H}`).toBe(0)
    }
    const trail: { x: number; y: number; grounded: boolean }[] = []
    run((x: number) => (x < 0 ? 3 : 0), { at: [-1, 0], y: 3, carry: [3 * DT, 0], steps: 120, each: me => { trail.push({ x: me.data.pos[0], y: me.data.pos[1], grounded: me.data.grounded }) } })
    const leave = trail.findIndex(t => !t.grounded)
    const land = trail.findIndex((t, i) => i > leave && t.grounded)
    trail.slice(0, leave).forEach(t => { expect(t.y).toBe(3); expect(t.x - K.span / 2).toBeLessThan(0) })
    expect(trail[leave].x - K.span / 2).toBeGreaterThanOrEqual(0)
    trail.slice(leave, land).forEach((t, n) => expect(t.y).toBeCloseTo(3 - K.gravity * DT * DT * (n * (n + 1)) / 2, 9))
    trail.slice(land).forEach(t => { expect(t.y).toBe(0); expect(t.grounded).toBe(true) })
  })

  test('a carry over the edge of a face steeper than maxSlope leaves it, is never grounded on it and never below it', () => {
    for (const grade of [1, 3]) {
      const height = (x: number) => (x < 0 ? 0 : -grade * x)
      let left = 0
      run(height, {
        carry: [3 * DT, 0], at: [-1, 0], steps: 60,
        each: me => {
          const S = stand(K, { height, solids: () => [] }, me.data.pos[0], me.data.pos[2])
          expect(me.data.pos[1], `${grade}`).toBeGreaterThanOrEqual(S - 1e-9)
          if (me.data.pos[0] - K.span / 2 > 1e-9) expect(me.data.grounded, `${grade}`).toBe(false)
          left = Math.max(left, me.data.pos[1] - S)
        },
      })
      expect(left, `${grade}`).toBeGreaterThan(0.05)
    }
  })

  test('a body in the air carried onto a kerb its feet are below lands on it that step, with vy 0', () => {
    for (const H of [0.2, 0.5]) {
      const height = (x: number) => (x < 0 ? 0 : H)
      let landed = -1
      const { me } = run(height, {
        at: [-0.5, 0], y: 0.1, grounded: false, carry: [0.1, 0], steps: 30,
        each: (me, i) => {
          expect(me.data.pos[1], `${H}`).toBeGreaterThanOrEqual(stand(K, { height, solids: () => [] }, me.data.pos[0], me.data.pos[2]))
          if (landed < 0 && me.data.grounded) landed = i
        },
      })
      expect(me.data.pos[1], `${H}`).toBe(H)
      expect(me.data.vel[1], `${H}`).toBe(0)
      expect(landed, `${H}`).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('seek', () => {
  // Seeks target from `at` over a flat with solids, and counts the steps to arrive.
  function go(solids: Solid[], target: number[], o: { at?: number[]; want?: number[] } = {}) {
    let arrived = -1, n = 0, gap = Infinity
    const path: number[][] = []
    const r = run(flat, {
      at: o.at, want: o.want, solids, steps: 1200,
      drive: (me, w, ground) => { if (seek(me, w, target, 0.2, ground) && arrived < 0) arrived = n; n++ },
      each: me => {
        path.push([me.data.pos[0], me.data.pos[2]])
        for (const s of solids) gap = Math.min(gap, Math.hypot(me.data.pos[0] - s.x, me.data.pos[2] - s.z) - s.radius - K.radius)
      },
    })
    expect(gap).toBeGreaterThan(-1e-9)
    return { arrived, path, me: r.me }
  }
  const five = [-1.6, -0.8, 0, 0.8, 1.6].map(x => ({ x, z: 2, radius: 0.2 }))

  test('reaches a target behind a solid', () => {
    expect(go([{ x: 0, z: 2, radius: 0.3 }], [0, 4]).arrived).toBeGreaterThan(0)
    expect(go([{ x: 0.05, z: 2, radius: 0.3 }], [0, 4]).arrived).toBeGreaterThan(0)
  })

  test('goes round two trunks closer together than the body is wide', () => {
    const { arrived, path } = go([{ x: -0.3, z: 2, radius: 0.2 }, { x: 0.3, z: 2, radius: 0.2 }], [0, 4])
    expect(arrived).toBeGreaterThan(0)
    expect(path.some(([x, z]) => Math.abs(z - 2) < 0.05 && Math.abs(x) < 0.3 + 0.2 + K.radius)).toBe(false)
  })

  test('is not stuck in front of a row of five, and reaches a target 1 m behind its middle', () => {
    expect(go(five, [0, 4]).arrived).toBeGreaterThan(0)
    expect(go(five, [0, 3]).arrived).toBeGreaterThan(0)
  })

  test('arrives from just clear of a close pair', () => {
    expect(go([{ x: -0.3, z: 2, radius: 0.2 }, { x: 0.3, z: 2, radius: 0.2 }], [0, 4], { at: [0, 1.4] }).arrived).toBeGreaterThan(0)
  })

  test('threads a gap wide enough for the body', () => {
    const { arrived, path } = go([{ x: -0.9, z: 2, radius: 0.2 }, { x: 0.9, z: 2, radius: 0.2 }], [0, 4])
    expect(arrived).toBeGreaterThan(0)
    path.forEach(([x]) => expect(x).toBe(0))
  })

  test('chases a target moved after arrival at seekSpeed, and zeroes want on arrival', () => {
    let target = [0, 2], phase = 0, peak = 0
    const { me } = run(flat, {
      steps: 600,
      drive: (me, w, ground) => {
        const there = seek(me, w, target, 0.2, ground)
        if (there) expect(me.data.want).toEqual([0, 0])
        else expect(Math.hypot(me.data.want[0], me.data.want[1])).toBeCloseTo(K.seekSpeed, 12)
        if (there && phase === 0) { phase = 1; target = [5, 2] } else if (there && phase === 1) phase = 2
      },
      each: me => { if (phase === 1) peak = Math.max(peak, me.data.speed) },
    })
    expect(phase).toBe(2)
    expect(peak).toBeCloseTo(K.seekSpeed, 9)
    expect(Math.hypot(me.data.pos[0] - 5, me.data.pos[2] - 2)).toBeLessThan(0.3)
  })

  test('takes a fence longer than the way to target as one group, and goes round its true near end', () => {
    // Its ends are 7.8 m and 6.2 m to each side, past the 4.35 m round the body the solids are first
    // asked for.
    const fence = Array.from({ length: 18 }, (_, i) => ({ x: -2.8 + i * 0.8, z: 2, radius: 0.2 }))
    const { arrived, path } = go(fence, [5, 4], { at: [5, 0] })
    expect(arrived).toBeGreaterThan(0)
    expect(Math.max(...path.map(([x]) => x))).toBeGreaterThan(11.2)
    expect(Math.min(...path.map(([x]) => x))).toBeGreaterThan(4.9)
  })

  test('commits to a side while the line to target is blocked, and heads straight once it is clear', () => {
    const sides: number[] = []
    let clearAt = -1
    run(flat, {
      solids: five, steps: 600,
      drive: (me, w, ground) => { seek(me, w, [0, 4], 0.2, ground); sides.push(me.data.side) },
      each: (me, i) => { if (clearAt < 0 && me.data.side === 0 && i > 0) clearAt = i },
    })
    const committed = sides[0]
    expect(Math.abs(committed)).toBe(1)
    expect(clearAt).toBeGreaterThan(0)
    sides.slice(0, clearAt).forEach(side => expect(side).toBe(committed))
  })

  // Random groves, sparse and dense, each with a reachable target beyond it.
  const groves = (dense: boolean, seeds: number) => Array.from({ length: seeds }, (_, n) => {
    let seed = n + 1
    const r = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
    const count = dense ? 60 + Math.floor(r() * 90) : 10 + Math.floor(r() * 40)
    const solids = Array.from({ length: count }, () => ({ x: -8 + r() * 16, z: 2 + r() * 12, radius: 0.15 + r() * 0.5 }))
      .filter(s => Math.hypot(s.x, s.z) > s.radius + K.radius + 0.1)
    return { solids, target: [-4 + r() * 8, 17 + r() * 3] }
  })

  test('arrives through 40 sparse and 40 dense random groves', () => {
    for (const dense of [false, true]) groves(dense, 40).forEach(({ solids, target }, n) => {
      let arrived = false
      run(flat, { solids, steps: 3600, drive: (me, w, ground) => { if (seek(me, w, target, 0.3, ground)) arrived = true }, each: () => arrived })
      expect(arrived, `${dense ? 'dense' : 'sparse'} grove ${n + 1}`).toBe(true)
    })
  })

  test('goes round the near end of an 11-trunk fence in the same number of steps whether want started at [0, 0] or pointing at the far end', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({ x: i * 0.8, z: 2, radius: 0.2 }))
    const still = go(eleven, [1, 4], { at: [1, 0] })
    const far = [7, 2].map(c => (c / Math.hypot(7, 2)) * K.seekSpeed)
    const pointed = go(eleven, [1, 4], { at: [1, 0], want: far })
    expect(still.arrived).toBeGreaterThan(0)
    expect(pointed.arrived).toBe(still.arrived)
    expect(Math.min(...still.path.map(([x]) => x))).toBeLessThan(0)
  })
})

describe('a ground with a cell', () => {
  // A curved ground, and the triangles of its lattice of `c`: each cell split from its low corner to its
  // high one.
  const curved: Height = (x, z) => 0.05 * x * x - 0.03 * x * z + 0.2 * Math.sin(z)
  const triangles = (f: Height, c: number): Height => (x, z) => {
    const i = Math.floor(x / c), j = Math.floor(z / c), fx = x / c - i, fz = z / c - j
    const a = f(i * c, j * c), d = f((i + 1) * c, (j + 1) * c)
    if (fx >= fz) { const b = f((i + 1) * c, j * c); return a + (b - a) * fx + (d - b) * fz }
    const e = f(i * c, (j + 1) * c)
    return a + (e - a) * fz + (d - e) * fx
  }

  test('a body stands on the triangles of the lattice, not on the ground between its corners', () => {
    for (const c of [2, 0.5]) {
      const ground: Ground = { height: curved, solids: () => [], cell: c }
      const plain: Ground = { height: triangles(curved, c), solids: () => [] }
      for (const [x, z] of [[0.3, 0.7], [-3.1, 2.25], [5.5, -4.9], [1, 1]]) expect(stand(K, ground, x, z)).toBeCloseTo(stand(K, plain, x, z), 12)
    }
  })

  test('walking on it climbs and stops just as walking on its triangles does', () => {
    const c = 2
    const hill: Height = (x, z) => 0.6 * Math.max(0, x - 1) + 0.02 * z
    const lattice = run(triangles(hill, c), { want: [2, 0], steps: 120 })
    const withCell = (() => {
      const ground: Ground = { height: hill, solids: () => [], cell: c }
      const truth = boot(scene(K, { want: [2, 0] }), { body: { tick(me, dt, w) { walk(me, w, dt, ground) } } })
      for (let i = 0; i < 120; i++) truth.step(DT)
      return truth.rows.find(r => r.kind === 'body')!.data.pos
    })()
    lattice.me.data.pos.forEach((v: number, i: number) => expect(withCell[i]).toBeCloseTo(v, 9))
    expect(withCell[0]).toBeGreaterThan(1)
  })
})

describe('groundOf', () => {
  // Two children of one manager: `full` names terrain3d's height and depth and scatter3d's solids,
  // `bare` terrain3d's height alone. The land is flooded hills; the trees stand on it.
  const field: Field = {
    program: { world: 600, hscale: 4, sea: 0.625, flood: true, out: 'hills', nodes: [{ id: 'hills', op: 'noise', kind: 'simplex', freq: 6, seed: 5 }] },
    analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
    bands: [{ colour: '#3e5722', amount: 1, rules: [] }],
    grain: { base: 1, range: 0 },
    detail: [],
    surfaces: {},
    layers: [],
  }
  const url = '/walker-test/shore.json'
  written(url, JSON.stringify(field))
  const scatter: Scatter & { mods: Record<string, string> } = {
    cutout: 0.45, coverage: 0.25, budget: 1e9, remember: 100000, mods: { ground: 'terrain3d' },
    packs: {
      trees: {
        asset: 'firs', rows: { fir: { weight: 1, solid: 0.4 } },
        cell: 8, reach: 60, seed: 33, lods: [20, 40], shadow: 30, leaf: 0.5, density: 0.5, rules: [], clearing: 0, size: [0.8, 0.6], vary: 0.2,
      },
    },
  }
  const childOf = (mods: Record<string, string>) => ({
    world: {
      loader: { assets: { land: { type: 'json', url, preload: true } } },
      terrain3d: { field: 'land' },
      scatter3d: scatter,
      walker: { kinds: { body: K }, mods },
    },
    prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, probe: {} },
    actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'probe' }],
    plugins: ['scenemanager'],
  })
  const top: Scene = {
    prefabs: {
      engine: { dt: DT },
      scenemanager: { scenes: { full: { file: 'full.scene.json', suspend: false }, bare: { file: 'bare.scene.json', suspend: false } }, dt: DT, entry: 'full', port: 0 },
    },
    actors: [{ is: 'scenemanager' }],
    plugins: ['scenemanager'],
    seats: 1,
  }
  const dir = mkdtempSync(join(tmpdir(), 'walker-'))
  afterAll(() => rmSync(dir, { recursive: true }))
  const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
  for (const [name, mods] of [['full', { height: 'terrain3d', depth: 'terrain3d', solids: 'scatter3d' }], ['bare', { height: 'terrain3d' }]] as const) {
    writeFileSync(join(dir, `${name}.scene.json`), JSON.stringify(childOf(mods)))
    writeFileSync(join(dir, `${name}.sim.ts`), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './${name}.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, probe: { before(_me, _dt, w) { (globalThis.walkerGround ??= {})['${name}'] = w } } }
export const scene = file
`)
  }
  const booted = async () => {
    const children = await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)
    for (const c of children.values()) c.step(DT)
    return (globalThis as { walkerGround?: Record<string, W> }).walkerGround!
  }
  const points = Array.from({ length: 61 * 61 }, (_, k) => [(k % 61) * 4 - 120, Math.floor(k / 61) * 4 - 120])

  test('the mods a scene names make the ground: terrain3d\'s height and depth, and scatter3d\'s solids', async () => {
    const { full } = await booted()
    const ground = groundOf(full)
    let wet = 0
    for (const [x, z] of points) {
      expect(ground.height(x, z)).toBe(rawAt(full, x, z))
      expect(ground.depth!(x, z)).toBe(depthAt(full, x, z))
      if (ground.depth!(x, z) > 0) wet++
    }
    expect(wet).toBeGreaterThan(20)
    let found = 0
    for (const [x, z, r] of [[30, 20, 12], [-70, 45, 30], [0, 0, 5]]) {
      const got = ground.solids(x, z, r)
      expect(got).toEqual(scattered(full, x, z, r, placed(full)))
      found += got.length
    }
    expect(found).toBeGreaterThan(10)
  })

  test('with no depth named there is no depth, and with no solids named there are none', async () => {
    const { bare } = await booted()
    const ground = groundOf(bare)
    expect('depth' in ground).toBe(false)
    for (const [x, z] of points.slice(0, 200)) expect(ground.height(x, z)).toBe(rawAt(bare, x, z))
    for (const [x, z, r] of [[30, 20, 12], [-70, 45, 30], [0, 0, 5]]) expect(ground.solids(x, z, r)).toEqual([])
    // The trees are there, for a ground that asks for them.
    expect(scattered(bare, -70, 45, 30, placed(bare)).length).toBeGreaterThan(0)
  })

  test('a scene that names no height throws', () => {
    let w!: W
    boot({ world: { walker: { kinds: { body: K }, mods: { solids: 'scatter3d' } } }, prefabs: { probe: {} }, actors: [{ is: 'probe' }] }, { probe: { before(_me, _dt, got) { w = got } } }).step(DT)
    expect(() => groundOf(w)).toThrow('walker is asked for the ground its mods make, and the scene names no world.walker.mods.height')
    w.world.walker.mods = undefined
    expect(() => groundOf(w)).toThrow('walker is asked for the ground its mods make, and the scene names no world.walker.mods.height')
  })
})

test('in the air, vel eases by airAccel: at 0 a body thrown sideways keeps its speed until it lands and eases by accel from there; absent, by accel as on the ground', () => {
  const thrown = { y: 5, vel: [10, 0, 0], grounded: false, want: [0, 0] }
  const kept: number[] = [], grounded: boolean[] = []
  run(flat, { ...thrown, over: { airAccel: 0 }, steps: 60, each: me => { kept.push(me.data.vel[0]); grounded.push(me.data.grounded) } })
  const landed = grounded.indexOf(true)
  expect(landed).toBeGreaterThan(30)
  for (const v of kept.slice(0, landed + 1)) expect(v).toBe(10)
  expect(kept[landed + 1]).toBeCloseTo(10 * Math.exp(-K.accel * DT))

  const eased: number[] = []
  run(flat, { ...thrown, steps: 10, each: me => { eased.push(me.data.vel[0]) } })
  eased.forEach((v, i) => expect(v).toBeCloseTo(10 * Math.exp(-K.accel * DT * (i + 1))))

  expect(() => check({ body: { ...K, airAccel: -1 } })).toThrow('walker kind body: airAccel -1 is not a number at or above 0')
  expect(() => check({ body: { ...K, airAccel: 0 } })).not.toThrow()
})
