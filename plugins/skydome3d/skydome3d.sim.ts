// The server half of skydome3d, the one sky: the day clock, the sun and the moon, the weather and
// the wind, and what the ground takes from them. One row of kind `skydome3d` per scene; the browser
// half (`skydome3d.plugin.ts`) draws from that row and the scene's `world.skydome3d` as they stand,
// and so does whatever else reads the weather: the sound, the HUD and the sea read `mix`.
//
// The row carries what changes and nothing else, since a row goes to every seat every step. Its
// prefab holds each of these, so the row carries each from step 0:
//   t, rate       the sky clock: `t` seconds into a `day` (below) of that many seconds, moving at
//                 dt·rate and wrapping at the day.
//   doy, lat      the day of the year and the latitude in degrees, north positive.
//   phase         the moon's phase φ in [0, 1): 0 new, 0.5 full. It moves on by dt·rate/(day·29.53),
//                 a lunar month of sky days.
//   to            the name of the weather the sky is going to; `from` the whole Weather it left.
//   blend, fade   how far the sky has gone from `from` to `to`, 0 to 1, moving by dt/fade.
//   mix           the Weather standing now: each of the 13 numbers from·(1 − s) + to·s, s the
//                 smoothstep of `blend`. The prefab holds one, so the row carries one before its
//                 first step.
//   wet, pack     the ground's wetness and snow cover, which lag the sky.
//   windDeg       the way the wind blows toward, in degrees clockwise from north: 0 toward −z, 90
//                 toward +x.
//   drift         [x, z], the integral of the wind vector in metres, which positions the clouds, their
//                 shadows and the falling things, so every seat, one that rejoins too, sees the same.
//   flash         the seconds left of the lightning flash in hand, 0 with none; `strike` [x, z] where
//                 it struck, in metres from whoever looks. The prefab's are their starting values.
//
// The fixed numbers are the scene's `world.skydome3d`, which a child scene inherits from the
// manager's (`addons/scenemanager`), and which no packet carries:
//   day           the seconds in a sky day.
//   weathers      the name of the weathers file in the scene's `loader` catalogue, a `json` entry
//                 read through the loader's `json`, the one import this half makes: a table of
//                 Weathers by name.
//   soak, dry     the time constants, in seconds, with which `wet` rises and falls.
//   lay, melt     the time constant with which `pack` lays under snow, and the melt's, which the sun
//                 shortens: melt/(0.35 + sunUp).
//   gusts         [a, b, c]: the gust's three sines, each a whole number of cycles a day.
//   bolt          { lasts: [lo, hi] seconds, out: [lo, hi] metres }: what a flash is rolled from.
//   biomes        optional, biome name to `{ scale?, add? }`, each part of a Weather: the weather in
//                 that biome of the land (terrain3d's biomes) is the scene's with each number n made
//                 n·scale + add (1 and 0 where either leaves it out), held to [0, 1] for cloud,
//                 cirrus, rain, snow, fog, gust and dust and to 0 or more for the rest (`local`). A
//                 biome this leaves out has the scene's weather. The browser half draws the weather
//                 standing under the camera (`here`); the server's `mix`, wind, drift, lightning, wet
//                 and pack stay the scene's.
// Its other keys are the browser half's.
//
// A Weather is 13 numbers: `cloud` (the deck's cover), `cirrus`, `base` and `top` (the deck's
// altitudes in metres), `dense`, `rain`, `snow`, `fog`, `haze`, `wind` (metres a second), `gust`,
// `thunder` (strikes a minute) and `dust`. A weather missing one throws where it is read.
//
// Each step:
//   the clock    t += dt·rate, wrapped into [0, day).
//   the sun      declination δ = 23.44°·sin(2π(doy − 80.5)/365.25), hour angle H = (t/day − 0.5)·2π,
//                at latitude φ: east −cos δ sin H, north cos φ sin δ − sin φ cos δ cos H, up sin φ sin δ
//                + cos φ cos δ cos H, with +x east, +y up and −z north (`sun`).
//   the moon     its hour angle is the sun's less 2π·φ and its declination the sun's a φ of a year on,
//                so it sits on the sun's path; it is lit (1 − cos 2πφ)/2 (`moon`, `moonLit`).
//   the weather  blend += dt/fade, to 1 (at once with a fade of 0), and `mix` is made again.
//   the ground   wet moves toward clamp(rain·1.5 + fog·0.25), with time constant `soak` rising and
//                `dry` falling; while snow ≥ 0.02, pack moves toward 0.35 + snow·0.75 with `lay`,
//                and otherwise toward 0 with melt/(0.35 + sunUp), sunUp the sine of the sun's
//                elevation, 0 below the horizon. Each moves 1 − exp(−dt/τ) of the way a step.
//   the wind     g = 0.5 + Σₖ sin(2π·gusts[k]·t/day + k)/6 (`gust`), so the wind meets itself at
//                midnight; its speed is wind·(1 − 0.45·gust + 0.9·gust·g) (`windSpeed`); windDeg wanders
//                by (g − 0.5)·dt·(2 + 0.6·wind), wrapped into [0, 360); and drift += the wind vector
//                (`wind`)·dt.
//   lightning    flash counts down by dt to 0. While mix.thunder is above 0 the die is rolled, in this
//                order: whether (a chance of thunder/60·dt), how long (bolt.lasts), the bearing, and
//                how far (bolt.out). So a scene whose weathers thunder declares a `seed`, and a sky
//                that never thunders needs none.
//
// The acts, all closed, so a game forwards them with `w.call`:
//   weather(name, fade)  snapshots the standing `mix` into `from`, so an interrupted fade carries on
//                        from where it was, and sets `to`, a blend of 0 and the fade. A fade of 0 is
//                        there at the next step. A name the table lacks throws.
//   time(hours)          t at that hour of the day, wrapped.
//   rate(x)              the clock's rate.
//   moon(phase)          the moon's phase, wrapped into [0, 1).
//   place(lat, doy)      the latitude and the day of the year.
import type { Kind, W } from '#engine/engine.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import * as math from '#plugins/math/math.sim.ts'

export const fields = ['cloud', 'cirrus', 'base', 'top', 'dense', 'rain', 'snow', 'fog', 'haze', 'wind', 'gust', 'thunder', 'dust'] as const
export type Weather = Record<(typeof fields)[number], number>
// The row.
export type Sky = {
  t: number; rate: number; doy: number; lat: number; phase: number
  to: string; from: Weather; mix: Weather; blend: number; fade: number
  wet: number; pack: number; windDeg: number; flash: number; strike: [number, number]; drift: [number, number]
}
// How one biome's weather differs from the scene's.
export type Biome = { scale?: Partial<Weather>; add?: Partial<Weather> }
// The server half's keys of `world.skydome3d`.
export type Table = {
  day: number; weathers: string; soak: number; dry: number; lay: number; melt: number; gusts: [number, number, number]
  bolt: { lasts: [number, number]; out: [number, number] }
  biomes?: Record<string, Biome>
}

const UNIT: readonly string[] = ['cloud', 'cirrus', 'rain', 'snow', 'fog', 'gust', 'dust']
// The weather in a biome: the scene's `mix`, each number n·scale + add, held to its range.
export function local(mix: Weather, b: Biome): Weather {
  const out = {} as Weather
  for (const f of fields) {
    const v = mix[f] * (b.scale?.[f] ?? 1) + (b.add?.[f] ?? 0)
    out[f] = UNIT.includes(f) ? Math.min(1, Math.max(0, v)) : Math.max(0, v)
  }
  return out
}
// The weather at a place of `shares`, each biome's share by name: Σ share·(that biome's `local`
// weather, or the scene's for one `biomes` leaves out). With no shares, the scene's.
export function here(mix: Weather, biomes: Record<string, Biome> | undefined, shares: Record<string, number>): Weather {
  const entries = Object.entries(shares)
  if (!entries.length) return mix
  const out = Object.fromEntries(fields.map(f => [f, 0])) as Weather
  for (const [name, share] of entries) {
    const m = biomes && Object.hasOwn(biomes, name) ? local(mix, biomes[name]) : mix
    for (const f of fields) out[f] += share * m[f]
  }
  return out
}
// The row with the fixed numbers beside it, what the sun, the moon and the wind are worked out from.
type Both = Sky & Table

const TILT = 23.44 * (Math.PI / 180)
const wrap = (x: number, span: number) => ((x % span) + span) % span
const smoothstep = (x: number) => x * x * (3 - 2 * x)

export const declination = (doy: number) => TILT * math.sin((2 * Math.PI * (doy - 80.5)) / 365.25)
export const hourAngle = (t: number, day: number) => (t / day - 0.5) * 2 * Math.PI

// The unit direction toward a body of declination δ at hour angle H, seen from latitude `lat`.
const toward = (lat: number, d: number, H: number): [number, number, number] => {
  const p = lat * (Math.PI / 180)
  const east = -math.cos(d) * math.sin(H)
  const north = math.cos(p) * math.sin(d) - math.sin(p) * math.cos(d) * math.cos(H)
  const up = math.sin(p) * math.sin(d) + math.cos(p) * math.cos(d) * math.cos(H)
  return [east, up, -north]
}

type Place = Pick<Both, 't' | 'day' | 'doy' | 'lat'>
export const sun = (s: Place) => toward(s.lat, declination(s.doy), hourAngle(s.t, s.day))
export const moon = (s: Place & Pick<Both, 'phase'>) => toward(s.lat, declination(s.doy + s.phase * 365.25), hourAngle(s.t, s.day) - 2 * Math.PI * s.phase)
export const moonLit = (s: Pick<Sky, 'phase'>) => (1 - math.cos(2 * Math.PI * s.phase)) / 2

export const gust = (s: Pick<Both, 't' | 'day' | 'gusts'>) => 0.5 + s.gusts.reduce((g, n, k) => g + math.sin((2 * Math.PI * n * s.t) / s.day + k) / 6, 0)
export const windSpeed = (s: Pick<Both, 't' | 'day' | 'gusts' | 'mix'>) => s.mix.wind * (1 - 0.45 * s.mix.gust + 0.9 * s.mix.gust * gust(s))
// The wind as a vector [x, z] in metres a second, blowing toward windDeg.
export const wind = (s: Pick<Both, 't' | 'day' | 'gusts' | 'mix' | 'windDeg'>): [number, number] => {
  const v = windSpeed(s), a = s.windDeg * (Math.PI / 180)
  return [v * math.sin(a), -v * math.cos(a)]
}

// The weather `name` in the scene's weathers file, whole.
function weatherOf(w: W, name: string): Weather {
  const table = json(w, (w.world.skydome3d as Table).weathers) as Record<string, Weather>
  const got = Object.hasOwn(table, name) ? table[name] : undefined
  if (!got) throw new Error(`skydome3d has no weather ${name}`)
  for (const f of fields) if (typeof got[f] !== 'number') throw new Error(`skydome3d weather ${name} has no ${f}`)
  return got
}

// 1 − exp(−dt/τ) of the way from `from` to `to`.
const lag = (from: number, to: number, dt: number, tau: number) => from + (to - from) * (1 - math.exp(-dt / tau))

export const skydome3d: Kind = {
  tick(me, dt, w) {
    const s = me.data as Sky, k = w.world.skydome3d as Table
    s.t = wrap(s.t + dt * s.rate, k.day)
    s.phase = wrap(s.phase + (dt * s.rate) / (k.day * 29.53), 1)

    s.blend = s.fade > 0 ? Math.min(1, s.blend + dt / s.fade) : 1
    const to = weatherOf(w, s.to), e = smoothstep(s.blend)
    const mix = {} as Weather
    for (const f of fields) mix[f] = s.from[f] * (1 - e) + to[f] * e
    s.mix = mix

    const wetTo = Math.min(1, Math.max(0, mix.rain * 1.5 + mix.fog * 0.25))
    s.wet = lag(s.wet, wetTo, dt, wetTo > s.wet ? k.soak : k.dry)
    const sunUp = Math.max(0, sun({ ...s, day: k.day })[1])
    s.pack = mix.snow >= 0.02 ? lag(s.pack, 0.35 + mix.snow * 0.75, dt, k.lay) : lag(s.pack, 0, dt, k.melt / (0.35 + sunUp))

    s.windDeg = wrap(s.windDeg + (gust({ ...s, ...k }) - 0.5) * dt * (2 + 0.6 * mix.wind), 360)
    const v = wind({ ...s, ...k })
    s.drift = [s.drift[0] + v[0] * dt, s.drift[1] + v[1] * dt]

    s.flash = Math.max(0, s.flash - dt)
    if (mix.thunder > 0 && w.die() < (mix.thunder / 60) * dt) {
      const { lasts, out } = k.bolt
      s.flash = lasts[0] + w.die() * (lasts[1] - lasts[0])
      const bearing = w.die() * 2 * Math.PI
      const far = out[0] + w.die() * (out[1] - out[0])
      s.strike = [math.sin(bearing) * far, -math.cos(bearing) * far]
    }
  },
  acts: {
    weather(me, w, _seat, name: string, fade: number) {
      weatherOf(w, name)
      const s = me.data as Sky
      s.from = { ...s.mix }
      s.to = name
      s.blend = 0
      s.fade = fade
    },
    time(me, w, _seat, hours: number) {
      const { day } = w.world.skydome3d as Table
      me.data.t = wrap((hours / 24) * day, day)
    },
    rate(me, _w, _seat, x: number) { me.data.rate = x },
    moon(me, _w, _seat, phase: number) { me.data.phase = wrap(phase, 1) },
    place(me, _w, _seat, lat: number, doy: number) {
      me.data.lat = lat
      me.data.doy = doy
    },
  },
}
