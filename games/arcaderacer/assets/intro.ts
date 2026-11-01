// The title's intro, written from the race itself: the cutscene's cue file, intro.json (the camera's
// cuts and sweeps, the bars and the fades; core's `plugins/cutscene`). Run from the repo root:
// `node --experimental-strip-types games/arcaderacer/assets/intro.ts`.
//
// The title's race is a pure function of its seed and its numbers: the circuit and the land are made
// from Tokyo's seed and course file, the eight rivals drive by their pilots, and the curtain flags the
// race off on the step the intro starts. So the race the intro films is the same race every time, and
// this script plays it here first. It boots the game as the server does, enters the title, sends the
// curtain `ready` as a page would, and records every car on every step; then it lays the shots on what
// the cars really do: the grid, the launch, a sweep down onto the leader, the fight for the lead, the
// first big drift, the pack over the bay bridge, and the title. Its first run needs a cue file to
// cast the rivals from, so it writes the cast with no cues first; nothing the cutscene does changes how
// a rival drives, so the race it records is the race the finished intro plays.
//
// It then plays the finished file through and checks every frame of every shot (`frames`): the car
// the shot looks at is inside the camera's view, no further than `FAR`, with nothing between them, no
// building and no ground, and the camera is above the ground and outside every building. It throws,
// naming the shot and the time, when one is not. The title's test (`title.sim.test.ts`) runs the same
// check on the file as written.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot, type Arg, type Scene } from '#engine/engine.ts'
import { connection, load, manager, type Down } from '#addons/scenemanager/scenemanager.addon.ts'
import { pose, type Cue, type Script } from '#plugins/cutscene/cutscene.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { sim } from '../arcaderacer.sim.ts'
import file from '../arcaderacer.scene.json' with { type: 'json' }
import title from '../title.scene.json' with { type: 'json' }
import tokyo from './courses/tokyo.json' with { type: 'json' }
import { landOf, type Course, type Land } from '../plugins/land/land.sim.ts'
import { inside as within, locate, sample, wrap } from '../plugins/track/track.sim.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const game = new URL('../', import.meta.url).href
const DT = file.prefabs.engine.dt

// The cue file's numbers. Only `head`, `fov` and the cues matter to a cast that is only filmed: no cue
// walks, so `reach`, `stop`, `pace` and `limit` are never read but must be given.
const HEAD = 1.0
const HEADER = { reach: 10, stop: 10, head: HEAD, fov: 55, pace: 1, limit: 1 }
// How long the race is recorded for, the most the intro can run.
const RECORD = 60
// The furthest a shot's car may be from its camera.
export const FAR = 420
// How high a camera stood beside the road stands over what it stands on, metres: a person's eye.
const EYE = 1.6

export const land = (): Land => landOf(tokyo as unknown as Course, title.world.seed)
const names = title.actors.filter(a => a.is === 'rival').map(a => (a as { name: string }).name)
const cast = Object.fromEntries(names.map(name => [name, { kind: 'rival', name }]))

type Car = { pos: number[]; yaw: number; speed: number; drift: number; slip: number; s: number; far: number; vel: number[] }
type Frame = { e: number; phase: string; cars: Record<string, Car> }

// The title as the server runs it: a seat in it, and `send` for the seat's messages.
export async function enter() {
  const truth = boot(structuredClone(file) as Scene, sim)
  const scenes = await load(truth, game)
  const t = scenes.get('title')!
  const heard: Down[] = []
  const seat = connection(manager(truth), d => heard.push(d))
  truth.step(DT)
  const send = (id: number, action: string, ...args: Arg[]) => {
    const d = heard.at(-1)!
    seat.take({ scene: d.scene, seat: d.seat, msg: { seq: heard.length, n: d.packet.n, id, action, args } })
  }
  const one = (kind: string) => t.rows.find(r => r.kind === kind)!
  return { truth, t, send, one }
}

// The race, recorded from the step the curtain is ready until `RECORD` seconds of the cue clock.
async function record(): Promise<Frame[]> {
  const { truth, send, one, t } = await enter()
  send(one('curtain').id, 'ready')
  const frames: Frame[] = []
  for (let i = 0; i < RECORD / DT + 2; i++) {
    truth.step(DT)
    const d = one('cutscene').data
    if (!d.running) continue
    const cars: Record<string, Car> = {}
    for (const r of t.rows.filter(r => r.kind === 'rival')) {
      const { pos, yaw, speed, drift, slip, s, far, vel } = r.data
      cars[r.data.name] = { pos: [...pos], yaw, speed, drift, slip, s, far, vel: [...vel] }
    }
    frames.push({ e: d.e, phase: one('race').data.phase, cars })
  }
  return frames
}

// The cue file written, on the disk and in this process's loader, which keeps every file it has read
// and is told so of a new one (`written`), so the next boot here plays what was just written.
function write(script: Script) {
  const text = JSON.stringify(script, null, 2) + '\n'
  fs.writeFileSync(path.join(here, 'intro.json'), text)
  written(title.world.loader.assets.intro.url, text)
}

// ---------------------------------------------------------------- places

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d
const pt = (p: number[]) => p.map(v => round(v))
// The point `side` metres right of the centre line at `s` along the circuit and `up` over the road there.
function beside(L: Land, s: number, side: number, up: number): number[] {
  const c = sample(L.track, s)
  return [c.x - Math.cos(c.yaw) * side, c.y + up, c.z + Math.sin(c.yaw) * side]
}
// A car's course: the way it goes, which in a slide is not the way its nose points.
const course = (c: Car) => (Math.hypot(c.vel[0], c.vel[1]) > 1 ? Math.atan2(c.vel[0], c.vel[1]) : c.yaw)
// An offset [left, up, ahead] of a car going along heading `h`, in the world's axes, as a shot that
// follows it with no `frame` takes it.
const around = ([left, up, ahead]: number[], h: number) => pt([left * Math.cos(h) + ahead * Math.sin(h), up, -left * Math.sin(h) + ahead * Math.cos(h)])

// ---------------------------------------------------------------- the shots

// The cue file, laid on the recorded race. Every time is read off the recording: when the race goes,
// when the first drift of the race begins, when the leader reaches the bridge.
function plan(frames: Frame[], L: Land): Script {
  const T = L.track
  const at = (e: number) => frames.find(f => f.e >= e - 1e-9) ?? frames.at(-1)!
  const go = frames.find(f => f.phase === 'go')!.e
  const pole = names[0]
  const drift = frames.find(f => f.e > go && f.cars[pole].drift !== 0)!.e
  const bridge = T.features.find(f => f.kind === 'bridge')!
  const onBridge = frames.find(f => f.e > drift && wrap(T, f.cars[pole].s - bridge.s0) >= 0 && wrap(T, f.cars[pole].s - bridge.s0) < bridge.s1 - bridge.s0)!.e
  const mid = (bridge.s0 + bridge.s1) / 2
  const cue = (e: number, d: string, more: Record<string, unknown>): Cue => ({ at: round(e), do: d, ...more })

  // 1. The grid, from in front of the line, low, pushing in as the count runs.
  const grid = at(0).cars[names[3]].pos
  const lookGrid = [grid[0], grid[1] + HEAD, grid[2]]
  // 2. The launch: from the right of the road, just beyond the wall, standing `EYE` metres over what
  // is there (the wall's top or the bank over it, `floor`), so it looks over the wall, where the pole
  // car comes past 3 s after go.
  const by = at(go + 3.2).cars[pole].s
  const launch = beside(L, by, T.walls + 1.5, 0)
  launch[1] = blocker(L, tokyo as unknown as Drawn).floor(by, T.walls + 1.5) + EYE
  // 3. The sweep, from high over the inside of the first drifting bend down to the pack in it.
  const bend = at(drift + 1.2).cars[pole].s
  // 5. The leader chased, from behind the car behind it.
  const chaser = names[1]
  // 6. The bridge from out over the bay, its deck `deck` high.
  // 7. Alongside the third car between the bridge's hangers.
  const third = names[2]
  const t = {
    grid: 0, launch: go - 0.6, sweep: drift - 2.6, slide: drift + 1.4, chase: drift + 4.2,
    bridge: onBridge - 0.3, hangers: onBridge + 4.6, title: onBridge + 7.0,
  }
  const end = t.title + 1.8
  const slider = names[4]
  const slideCourse = course(at(t.slide + 1).cars[slider])
  const titleCourse = course(at(t.title + 0.5).cars[pole])
  const cues: Cue[] = [
    cue(0, 'bars', { on: true, over: 0 }),
    cue(0, 'fade', { to: 1, over: 0 }),
    cue(t.grid, 'shot', { name: 'grid', pos: pt(beside(L, 22, 6, 1.1)), look: pt(lookGrid), fov: 38, over: 0 }),
    cue(0.15, 'fade', { to: 0, over: 1.4 }),
    cue(t.grid + 0.05, 'shot', { name: 'grid push', pos: pt(beside(L, 13, 4.5, 0.7)), look: pt(lookGrid), fov: 42, over: t.launch - t.grid - 0.05 }),
    cue(t.launch, 'shot', { name: 'launch', pos: pt(launch), look: pole, fov: 44, over: 0 }),
    cue(go + 0.05, 'shake', { over: 0.8, amp: 0.12 }),
    cue(t.sweep, 'shot', { name: 'sweep', pos: pt(beside(L, bend + 60, -70, 55)), look: pole, fov: 48, over: 0 }),
    cue(t.sweep + 0.05, 'shot', { name: 'sweep down', pos: pt(beside(L, bend + 10, -34, 14)), look: pole, fov: 52, over: t.slide - t.sweep - 0.05 }),
    cue(t.slide, 'shot', { name: 'slide', pos: around([-4.5, 1.1, 2.5], slideCourse), look: slider, follows: slider, fov: 50, over: 0 }),
    cue(t.chase, 'shot', { name: 'chase', pos: [0.9, 1.2, -5.5], look: pole, follows: chaser, frame: 'body', fov: 40, over: 0 }),
    cue(t.bridge, 'shot', { name: 'bay', pos: pt(beside(L, mid - 120, 150, bridge.deck - sample(T, mid - 120).y + 45)), look: pole, fov: 46, over: 0 }),
    cue(t.bridge + 0.05, 'shot', { name: 'bay drift', pos: pt(beside(L, mid + 40, 95, bridge.deck - sample(T, mid + 40).y + 22)), look: pole, fov: 42, over: t.hangers - t.bridge - 0.05 }),
    cue(t.hangers, 'shot', { name: 'hangers', pos: [3.4, 0.9, 1.2], look: third, follows: third, frame: 'body', fov: 56, over: 0 }),
    cue(t.title, 'shot', { name: 'title', pos: around([6, 6.5, -16], titleCourse), look: pole, follows: pole, fov: 55, over: 0 }),
    cue(t.title + 0.1, 'bars', { on: false, over: 1.2 }),
  ]
  return { end: round(end), ...HEADER, cast, cues }
}

// ---------------------------------------------------------------- the check

// The course file's numbers the corridor is drawn by (the land plugin's `walls`, `tunnel`, `elevated`
// and the land's `skirt` and `clearance`).
export type Drawn = Course & {
  look: { walls: { height: number; retain: number; railHeight: number }; tunnel: { height: number }; elevated: { deck: number } }
}

// What stands between a camera and a car, as the land plugin draws it (`land.plugin.ts`, the
// corridor): the ground outside the road's corridor; each building's box; and the corridor itself,
// sample by sample of the circuit as the plugin draws it: the road's deck under the road; at each edge
// the wall, `walls.height` over the road's edge, grown to the ground beside it where that is higher,
// at most `retain` over the road, and from its top the bank running straight out to the ground
// `skirt` beyond it; on a bridge, where the road stands `clearance` over the ground, the rail,
// `railHeight` over the road's edge, and nothing beyond it; in a bore, the ceiling `tunnel.height`
// over the road and the lid of ground over it all. `through(a, b)` walks the segment every `step`
// metres, and a wall is met where the segment crosses an edge below the wall's top. `floor(s, side)`
// is the height of the solid surface `side` metres right of the centre line at `s`: the road, the bank
// beyond the wall, the ground past the corridor, for standing a camera on. The buildings are found
// through a grid of buckets `cell` across.
export function blocker(L: Land, C: Drawn, cell = 60) {
  const grid = new Map<string, Land['blocks']>()
  const key = (i: number, j: number) => `${i},${j}`
  for (const b of L.blocks) {
    for (let i = Math.floor((b.x - b.w / 2) / cell); i <= Math.floor((b.x + b.w / 2) / cell); i++) {
      for (let j = Math.floor((b.z - b.d / 2) / cell); j <= Math.floor((b.z + b.d / 2) / cell); j++) {
        const k = key(i, j)
        const list = grid.get(k)
        if (list) list.push(b)
        else grid.set(k, [b])
      }
    }
  }
  const inside = (p: number[]) => (grid.get(key(Math.floor(p[0] / cell), Math.floor(p[2] / cell))) ?? [])
    .find(b => Math.abs(p[0] - b.x) < b.w / 2 && Math.abs(p[2] - b.z) < b.d / 2 && p[1] >= b.y && p[1] <= b.y + b.h)
  const buried = (p: number[]) => !L.cut(p[0], p[2]) && p[1] < L.height(p[0], p[2])

  // The corridor as the land plugin draws it, at sample i and `side` metres right of the centre line.
  const T = L.track, W = C.look.walls, outer = T.walls + C.land.skirt
  const at = (i: number, side: number): number[] => [T.x[i] - Math.cos(T.yaw[i]) * side, T.y[i] - side * T.slope[i], T.z[i] + Math.sin(T.yaw[i]) * side]
  const groundAt = (i: number, side: number) => { const p = at(i, side); return L.height(p[0], p[2]) }
  const bored = (i: number) => T.features.some(f => (f.kind === 'tunnel' || f.kind === 'underground') && within(f, i * T.step, T.length) === 1)
  const over = (i: number, side: number) => at(i, side)[1] - groundAt(i, side) > C.land.clearance
  const top = (i: number, way: number) => {
    const e = at(i, way * T.walls)[1]
    return Math.max(e + W.height, Math.min(groundAt(i, way * outer), e + W.retain))
  }
  const lid = (i: number) => Math.max(groundAt(i, -outer), groundAt(i, outer), at(i, 0)[1] + C.look.tunnel.height + 1.5)
  // What a point inside the corridor is in, or undefined in the open; `w` is where it is on the circuit.
  const solid = (p: number[], w: { i: number; side: number; height: number }): string | undefined => {
    const s = Math.abs(w.side), way = Math.sign(w.side) || 1
    if (s > outer) return
    if (bored(w.i)) {
      if (s <= T.walls) return p[1] > w.height + C.look.tunnel.height && p[1] < lid(w.i) ? 'the tunnel\'s roof' : undefined
      return p[1] < lid(w.i) ? 'the ground over the tunnel' : undefined
    }
    if (s <= T.walls) return p[1] < w.height - 0.05 && p[1] > w.height - C.look.elevated.deck ? 'the road' : undefined
    if (over(w.i, way * outer)) return
    const t0 = top(w.i, way), g = groundAt(w.i, way * outer)
    return p[1] < t0 + (g - t0) * ((s - T.walls) / C.land.skirt) ? 'the bank' : undefined
  }
  // The wall's top, or the rail's, at the edge on the `way` side of sample i.
  const edge = (i: number, way: number) => (bored(i) ? Infinity : over(i, way * outer) ? at(i, way * T.walls)[1] + W.railHeight : top(i, way))

  const through = (a: number[], b: number[], step = 1.5): string | undefined => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step)
    let hint = -1
    let last: { p: number[]; side: number; i: number } | undefined
    for (let k = 0; k <= n; k++) {
      const p = [0, 1, 2].map(i => a[i] + ((b[i] - a[i]) * k) / n)
      const w = locate(T, p[0], p[2], hint)
      hint = w.i
      if (last) {
        // an edge crossed between the last point and this one: the wall's top there against the segment
        for (const way of [-1, 1]) {
          const was = last.side * way - T.walls, now = w.side * way - T.walls
          if (was * now >= 0) continue
          const u = was / (was - now)
          const y = last.p[1] + (p[1] - last.p[1]) * u
          if (y < edge(u < 0.5 ? last.i : w.i, way)) return bored(w.i) ? 'the tunnel\'s wall' : over(w.i, way * outer) ? 'the rail' : 'the wall'
        }
      }
      last = { p, side: w.side, i: w.i }
      if (k === 0 || k === n) continue
      if (buried(p)) return 'the ground'
      if (inside(p)) return 'a building'
      const hit = solid(p, w)
      if (hit) return hit
    }
  }
  const floor = (s: number, side: number) => {
    const c = sample(T, s)
    const x = c.x - Math.cos(c.yaw) * side, z = c.z + Math.sin(c.yaw) * side
    const w = locate(T, x, z, -1)
    const a = Math.abs(side), way = Math.sign(side) || 1
    if (a <= T.walls) return w.height
    if (a > outer) return L.height(x, z)
    const t0 = top(w.i, way)
    return t0 + (groundAt(w.i, way * outer) - t0) * ((a - T.walls) / C.land.skirt)
  }
  return { inside, buried, through, floor }
}

// A world direction in the camera's axes, from its orientation [x, y, z, w]: the conjugate rotation.
function local(q: number[], v: number[]): number[] {
  const [x, y, z, w] = [-q[0], -q[1], -q[2], q[3]]
  const [vx, vy, vz] = v
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx)
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)]
}

// Where on the screen a shot's car must stand, as a share of the way from the middle to each edge: across,
// and up or down, kept inside the letterbox's bars (each 96 of the 720 rows) with room to spare.
const ASPECT = 1280 / 720
export const ACROSS = 0.85
export const UPRIGHT = (1 - (2 * 96) / 720) * 0.85

// The car's place on the screen, [across, up], each −1 to 1 from edge to edge, or undefined behind it.
function onScreen(p: { quat: number[]; fov: number }, dir: number[]): number[] | undefined {
  const [x, y, z] = local(p.quat, dir)
  if (z >= 0) return
  const tan = Math.tan((p.fov * Math.PI) / 360)
  return [x / -z / (tan * ASPECT), y / -z / tan]
}

export type Seen = { shot: string; from: number; to: number; near: number; far: number; off: number }

// Plays the title's intro as the server would, from `ready`, with `script` its cue file, and checks
// every `every`th step of every shot: the camera above the ground and in no building, the car its shot
// looks at within `FAR`, inside half the shot's fov of the way it looks, and seen with nothing in
// between. Throws naming the shot and the time of the first step that fails; hands back each shot's
// span, its nearest and furthest car and the most its car was off the middle of the frame, in degrees.
// The cue file has no waits, so the cue clock is `e` and a step's shot is the last to fire by then.
export async function frames(script: Script, every = 3): Promise<Seen[]> {
  const { truth, send, one, t } = await enter()
  const L = land()
  const B = blocker(L, tokyo as unknown as Drawn)
  const shots = script.cues.filter(c => c.do === 'shot').sort((a, b) => a.at - b.at)
  send(one('curtain').id, 'ready')
  const seen = new Map<string, Seen>()
  for (let i = 0; i < 1e5; i++) {
    truth.step(DT)
    const d = one('cutscene').data
    if (d.done) break
    if (!d.running || !d.shot || i % every) continue
    const shot = shots.filter(c => c.at <= d.e + 1e-9).at(-1)!.name as string
    const where = `${shot} at ${d.e.toFixed(2)}:`
    const p = pose(d, t.rows, () => 0)
    if (!p) throw new Error(`${where} the shot has no pose: a car it names has no row`)
    if (B.buried(p.pos)) throw new Error(`${where} the camera is under the ground`)
    const house = B.inside(p.pos)
    if (house) throw new Error(`${where} the camera is inside a building at ${house.x.toFixed(0)}, ${house.z.toFixed(0)}`)
    const name = d.shot.to.look
    if (typeof name !== 'string') continue
    const car = t.rows.find(r => r.kind === 'rival' && r.data.name === name)!
    const head = [car.data.pos[0], car.data.pos[1] + HEAD, car.data.pos[2]]
    const dir = [0, 1, 2].map(k => head[k] - p.pos[k])
    const dist = Math.hypot(...dir)
    if (dist > FAR) throw new Error(`${where} ${name} is ${dist.toFixed(0)} m from the camera, past ${FAR}`)
    const at = onScreen(p, dir)
    if (!at) throw new Error(`${where} ${name} is behind the camera`)
    if (Math.abs(at[0]) > ACROSS || Math.abs(at[1]) > UPRIGHT) throw new Error(`${where} ${name} stands at ${at.map(v => v.toFixed(2)).join(', ')} on the screen, past ${ACROSS} across or ${UPRIGHT.toFixed(2)} up`)
    const off = Math.max(Math.abs(at[0]) / ACROSS, Math.abs(at[1]) / UPRIGHT)
    const hid = B.through(p.pos, head)
    if (hid) throw new Error(`${where} ${name} is hidden from the camera by ${hid}`)
    const s = seen.get(shot) ?? { shot, from: d.e, to: d.e, near: dist, far: dist, off }
    Object.assign(s, { to: d.e, near: Math.min(s.near, dist), far: Math.max(s.far, dist), off: Math.max(s.off, off) })
    seen.set(shot, s)
  }
  return [...seen.values()]
}

if (import.meta.main) {
  write({ end: RECORD, ...HEADER, cast, cues: [] })
  const recorded = await record()
  const script = plan(recorded, land())
  write(script)
  for (const s of await frames(script, 1)) {
    console.log(`${s.shot.padEnd(11)} ${s.from.toFixed(2)}–${s.to.toFixed(2)}  car ${s.near.toFixed(0)}–${s.far.toFixed(0)} m, at most ${(s.off * 100).toFixed(0)}% of the way to the edge it may reach`)
  }
  console.log('intro.json', script.cues.length, 'cues, end', script.end)
}
