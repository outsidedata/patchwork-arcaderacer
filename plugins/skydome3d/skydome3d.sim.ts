// The server half of skydome3d, the one sky: the day clock, the sun and the moon. One row of kind
// `skydome3d` per scene; the browser half (`skydome3d.plugin.ts`) draws from that row and the scene's
// `world.skydome3d` as they stand. The weather is weather3d's and the clouds clouds3d's, each a plugin
// of its own that a scene lists when it wants them.
//
// The row carries what changes and nothing else, since a row goes to every seat every step. Its
// prefab holds each of these, so the row carries each from step 0:
//   t, rate       the sky clock: `t` seconds into a `day` (below) of that many seconds, moving at
//                 dt·rate and wrapping at the day.
//   doy, lat      the day of the year and the latitude in degrees, north positive.
//   phase         the moon's phase φ in [0, 1): 0 new, 0.5 full. It moves on by dt·rate/(day·29.53),
//                 a lunar month of sky days.
//
// The fixed numbers are the scene's `world.skydome3d`, which a child scene inherits from the
// manager's (`addons/scenemanager`), and which no packet carries:
//   day           the seconds in a sky day.
// Its other keys are the browser half's.
//
// Each step:
//   the clock    t += dt·rate, wrapped into [0, day).
//   the sun      declination δ = 23.44°·sin(2π(doy − 80.5)/365.25), hour angle H = (t/day − 0.5)·2π,
//                at latitude φ: east −cos δ sin H, north cos φ sin δ − sin φ cos δ cos H, up sin φ sin δ
//                + cos φ cos δ cos H, with +x east, +y up and −z north (`sun`).
//   the moon     its hour angle is the sun's less 2π·φ and its declination the sun's a φ of a year on,
//                so it sits on the sun's path; it is lit (1 − cos 2πφ)/2 (`moon`, `moonLit`).
//
// The acts, all closed, so a game forwards them with `w.call`:
//   time(hours)          t at that hour of the day, wrapped.
//   rate(x)              the clock's rate.
//   moon(phase)          the moon's phase, wrapped into [0, 1).
//   place(lat, doy)      the latitude and the day of the year.
import type { Kind } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'

// The row.
export type Sky = { t: number; rate: number; doy: number; lat: number; phase: number }
// The server half's keys of `world.skydome3d`.
export type Table = { day: number }
type Both = Sky & Table

const TILT = 23.44 * (Math.PI / 180)
const wrap = (x: number, span: number) => ((x % span) + span) % span

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

export const skydome3d: Kind = {
  tick(me, dt, w) {
    const s = me.data as Sky, k = w.world.skydome3d as Table
    s.t = wrap(s.t + dt * s.rate, k.day)
    s.phase = wrap(s.phase + (dt * s.rate) / (k.day * 29.53), 1)
  },
  acts: {
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
