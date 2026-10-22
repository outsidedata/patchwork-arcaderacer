// The server half of weather3d, the weather: the weathers and the fades between them, the wind, the
// lightning, and what the ground takes from them. One row of kind `weather3d` per scene; the browser
// half (`weather3d.plugin.ts`) draws from that row and the scene's `world.weather3d` as they stand,
// and so does whatever else reads the weather: the sky, the clouds, the sound, the HUD and the sea read
// `mix`.
//
// It stands under a sky: the gusts run on the sky's clock and the snow melts faster under its sun,
// both through the `sky` mod, `world.weather3d.mods: { sky: '<a>' }` (skydome3d's,
// `skydome3d.weather3d.ts`): `sky(w)` is `{ t, day, sun }`, the sky clock's seconds into a day of `day`
// seconds and the unit way toward the sun. A scene that names none throws on the first step.
//
// The row carries what changes and nothing else, since a row goes to every seat every step. Its
// prefab holds each of these, so the row carries each from step 0:
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
// The fixed numbers are the scene's `world.weather3d`, which a child scene inherits from the
// manager's (`addons/scenemanager`), and which no packet carries:
//   weathers      the name of the weathers file in the scene's `loader` catalogue, a `json` entry
//                 read through the loader's `json`, the one import this half makes: a table of
//                 Weathers by name.
//   soak, dry     the time constants, in seconds, with which `wet` rises and falls.
//   lay, melt     the time constant with which `pack` lays under snow, and the melt's, which the sun
//                 shortens: melt/(0.35 + sunUp).
//   gusts         [a, b, c]: the gust's three sines, each a whole number of cycles a sky day.
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
// The act, closed, so a game forwards it with `w.call`:
//   weather(name, fade)  snapshots the standing `mix` into `from`, so an interrupted fade carries on
//                        from where it was, and sets `to`, a blend of 0 and the fade. A fade of 0 is
//                        there at the next step. A name the table lacks throws.
import type { Kind, W } from '#engine/engine.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import * as math from '#plugins/math/math.sim.ts'

export const fields = ['cloud', 'cirrus', 'base', 'top', 'dense', 'rain', 'snow', 'fog', 'haze', 'wind', 'gust', 'thunder', 'dust'] as const
export type Weather = Record<(typeof fields)[number], number>
// The row.
export type Weathered = {
  to: string; from: Weather; mix: Weather; blend: number; fade: number
  wet: number; pack: number; windDeg: number; flash: number; strike: [number, number]; drift: [number, number]
}
// How one biome's weather differs from the scene's.
export type Biome = { scale?: Partial<Weather>; add?: Partial<Weather> }
// The server half's keys of `world.weather3d`.
export type Table = {
  weathers: string; soak: number; dry: number; lay: number; melt: number; gusts: [number, number, number]
  bolt: { lasts: [number, number]; out: [number, number] }
  biomes?: Record<string, Biome>
}
// What the `sky` mod hands back: the sky clock and the sun.
export type SkyClock = { t: number; day: number; sun: [number, number, number] }
export type Sky = (w: Pick<W, 'find' | 'world'>) => SkyClock

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

const wrap = (x: number, span: number) => ((x % span) + span) % span
const smoothstep = (x: number) => x * x * (3 - 2 * x)

type Gusting = Pick<SkyClock, 't' | 'day'> & Pick<Table, 'gusts'>
export const gust = (s: Gusting) => 0.5 + s.gusts.reduce((g, n, k) => g + math.sin((2 * Math.PI * n * s.t) / s.day + k) / 6, 0)
export const windSpeed = (s: Gusting & Pick<Weathered, 'mix'>) => s.mix.wind * (1 - 0.45 * s.mix.gust + 0.9 * s.mix.gust * gust(s))
// The wind as a vector [x, z] in metres a second, blowing toward windDeg.
export const wind = (s: Gusting & Pick<Weathered, 'mix' | 'windDeg'>): [number, number] => {
  const v = windSpeed(s), a = s.windDeg * (Math.PI / 180)
  return [v * math.sin(a), -v * math.cos(a)]
}

// The sky the weather stands under, through the `sky` mod.
export function skyOf(w: Pick<W, 'find' | 'world'>): SkyClock {
  const sky = mod<Sky>(w.world, 'weather3d', 'sky')
  if (!sky) throw new Error('weather3d names no world.weather3d.mods.sky')
  return sky(w)
}

// The weather `name` in the scene's weathers file, whole.
function weatherOf(w: W, name: string): Weather {
  const table = json(w, (w.world.weather3d as Table).weathers) as Record<string, Weather>
  const got = Object.hasOwn(table, name) ? table[name] : undefined
  if (!got) throw new Error(`weather3d has no weather ${name}`)
  for (const f of fields) if (typeof got[f] !== 'number') throw new Error(`weather3d weather ${name} has no ${f}`)
  return got
}

// 1 − exp(−dt/τ) of the way from `from` to `to`.
const lag = (from: number, to: number, dt: number, tau: number) => from + (to - from) * (1 - math.exp(-dt / tau))

export const weather3d: Kind = {
  tick(me, dt, w) {
    const s = me.data as Weathered, k = w.world.weather3d as Table
    const clock = skyOf(w)

    s.blend = s.fade > 0 ? Math.min(1, s.blend + dt / s.fade) : 1
    const to = weatherOf(w, s.to), e = smoothstep(s.blend)
    const mix = {} as Weather
    for (const f of fields) mix[f] = s.from[f] * (1 - e) + to[f] * e
    s.mix = mix

    const wetTo = Math.min(1, Math.max(0, mix.rain * 1.5 + mix.fog * 0.25))
    s.wet = lag(s.wet, wetTo, dt, wetTo > s.wet ? k.soak : k.dry)
    const sunUp = Math.max(0, clock.sun[1])
    s.pack = mix.snow >= 0.02 ? lag(s.pack, 0.35 + mix.snow * 0.75, dt, k.lay) : lag(s.pack, 0, dt, k.melt / (0.35 + sunUp))

    const at = { ...k, t: clock.t, day: clock.day }
    s.windDeg = wrap(s.windDeg + (gust(at) - 0.5) * dt * (2 + 0.6 * mix.wind), 360)
    const v = wind({ ...s, ...at })
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
      const s = me.data as Weathered
      s.from = { ...s.mix }
      s.to = name
      s.blend = 0
      s.fade = fade
    },
  },
}
