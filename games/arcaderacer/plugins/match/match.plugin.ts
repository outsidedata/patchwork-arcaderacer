// The browser half of match: what a page shows of the match, drawn from the scene's `match` row (the
// header of `match.sim.ts`), loaded by `shipped`, which is listed after `ui`. Every word, place and
// number is the `match` definition's.
//
// In the lobby, the title, on the `title` panel, once the title's intro (its `cutscene` row) is done,
// and nothing while it plays:
//   message    the row's `message` worded by `messages`, in { at, anchor, style }: "waiting for match
//              to finish" while a match runs, and that the leader disconnected.
//   lobby      { at, anchor, text, style }, while the match is in the lobby, to every seat but the
//              leader's, whose screen is the title card's course select.
//   spectate   { at, label }: a button in the `button` style, while a match runs, to a `waiting`
//              connection; pressed, it sends `spectate` at the row.
// On a course:
//   A spectator (its own `player` row's `watch` not null) is shown one thing, on the `watch` panel: a
//   button in the `button` style for the free camera, `watch.free`, and one for each car a racer holds
//   (`driven`), named as the `car` definition's `name` with {grid}, its grid place counted from 1, a line
//   `watch.step` pixels under the last from `watch.at`; pressed, it sends `watch` at the seat's own row.
//   The page claims render3d's camera. Free (`free`): it looks as the mouse drags it, `turn` radians a
//   pixel, and flies `speed` metres a second where it looks with w and s, across with a and d, up with e
//   and down with q, `fast` times as fast with shift held; it starts where following the first car a
//   racer holds would stand, looking along its heading (where the camera stood, with no car). Following
//   (`watch` a car's id): it stands `back` metres behind the car along its `cam` heading and `high` over it,
//   looking `ahead` metres along that heading and `aim` over it.
//   Once the race row's `phase` is `results`, every seat is shown `results` on the `results` panel,
//   which `world.ui` makes modal: over a box `back` { at, size, radius, colour, alpha }, a line `step`
//   pixels down per racer in the race's order, its three cells `columns` pixels right of `at`: `place`
//   with {place}, the name (the car the seat holds `you`, another the kind's `name` with {grid}) and its
//   finishing time, or `racing` while it is still racing; the seat's own line in the style `mine`, the
//   rest in `style`. The leader is shown the button `exit` { at, label }; pressed, it sends `exit` at the
//   row.
import type * as PIXI from 'pixi.js'
import type * as THREE from 'three'
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { def } from '#plugins/loader/loader.sim.ts'
import { holding, possessed } from '#plugins/player/player.plugin.ts'
import { clock, fill } from '../dash/dash.plugin.ts'
import { driven, entryOf, leads } from './match.sim.ts'

const OWNER = 'match'

export function match() {
  // the free camera: where it stands and looks, the keys held, and the mouse dragging it
  let free: { pos: number[]; yaw: number; pitch: number } | undefined
  const held = new Set<string>()
  let drag: { x: number; y: number } | undefined
  let listening = false
  let last = 0
  let ui: Plugins['ui'] | undefined

  const down = (e: KeyboardEvent) => held.add(e.key.toLowerCase())
  const up = (e: KeyboardEvent) => held.delete(e.key.toLowerCase())
  const press = (e: PointerEvent) => { if (!ui?.hit(e.offsetX, e.offsetY)) drag = { x: e.clientX, y: e.clientY } }
  const release = () => { drag = undefined }
  const move = (e: PointerEvent) => {
    if (!drag || !free || !ui) return
    free.yaw -= (e.clientX - drag.x) * turn
    free.pitch = Math.max(-1.5, Math.min(1.5, free.pitch - (e.clientY - drag.y) * turn))
    drag = { x: e.clientX, y: e.clientY }
  }
  let turn = 0
  const listen = () => {
    if (listening) return
    listening = true
    addEventListener('keydown', down)
    addEventListener('keyup', up)
    addEventListener('pointerdown', press)
    addEventListener('pointerup', release)
    addEventListener('pointermove', move)
  }
  const deafen = () => {
    if (!listening) return
    listening = false
    removeEventListener('keydown', down)
    removeEventListener('keyup', up)
    removeEventListener('pointerdown', press)
    removeEventListener('pointerup', release)
    removeEventListener('pointermove', move)
  }

  function lobby(p: Plugins, m: Row) {
    const { wire } = p
    const intro = wire.rows.find(r => r.kind === 'cutscene')
    if (intro && !intro.data.done) return
    const T = p.ui.PIXI as typeof PIXI
    const D = def(wire, m.kind)
    if (m.data.message) {
      const t = p.ui.show('title', 'match.message', () => new T.Text({ text: '', style: p.ui.style(D.message.style) })) as PIXI.Text
      t.anchor.set(D.message.anchor[0], D.message.anchor[1])
      t.position.set(D.message.at[0], D.message.at[1])
      t.text = D.messages[m.data.message]
    }
    if (m.data.match === 'lobby') {
      if (leads(wire.rows)) return
      const t = p.ui.show('title', 'match.lobby', () => new T.Text({ text: D.lobby.text, style: p.ui.style(D.lobby.style) })) as PIXI.Text
      t.anchor.set(D.lobby.anchor[0], D.lobby.anchor[1])
      t.position.set(D.lobby.at[0], D.lobby.at[1])
      return
    }
    if (entryOf(wire.rows)?.mode !== 'waiting') return
    const b = p.ui.show('title', 'match.spectate', () => p.ui.button({ ...p.ui.style(D.button), label: D.spectate.label }).on('pointertap', () => wire.send(m.id, 'spectate'))) as PIXI.Container
    b.position.set(D.spectate.at[0], D.spectate.at[1])
  }

  function watching(p: Plugins, m: Row, own: Row) {
    const { wire, render3d } = p
    const D = def(wire, m.kind)
    const active = driven(wire.rows)
    const choices: [string, number, string][] = [['free', -1, D.watch.free], ...active.map(r => [`car.${r.id}`, r.id, fill(def(wire, r.kind).name, { grid: r.data.grid + 1 })] as [string, number, string])]
    choices.forEach(([key, target, label], k) => {
      const b = p.ui.show('watch', `match.watch.${key}`, () => p.ui.button({ ...p.ui.style(D.button), label }).on('pointertap', () => wire.send(own.id, 'watch', target))) as PIXI.Container
      b.position.set(D.watch.at[0], D.watch.at[1] + k * D.watch.step)
    })
    const camera = render3d?.camera as THREE.PerspectiveCamera | undefined
    if (!camera || !render3d.claim(OWNER)) return
    const now = performance.now()
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
    last = now
    const car = own.data.watch >= 0 ? wire.rows.find(r => r.kind === 'car' && r.id === own.data.watch) : undefined
    if (car) {
      const F = D.follow
      const { pos, cam } = car.data
      const fx = Math.sin(cam), fz = Math.cos(cam)
      camera.position.set(pos[0] - fx * F.back, pos[1] + F.high, pos[2] - fz * F.back)
      camera.up.set(0, 1, 0)
      camera.lookAt(pos[0] + fx * F.ahead, pos[1] + F.aim, pos[2] + fz * F.ahead)
      free = undefined
      return
    }
    const F = D.free
    turn = F.turn
    if (!free) {
      // where the follow camera stands behind the first active car, looking along its heading
      const first = active[0]
      if (first) {
        const { pos, cam } = first.data
        free = { pos: [pos[0] - Math.sin(cam) * D.follow.back, pos[1] + D.follow.high, pos[2] - Math.cos(cam) * D.follow.back], yaw: cam, pitch: 0 }
      } else {
        const look = camera.getWorldDirection(new (camera.position.constructor as typeof THREE.Vector3)())
        free = { pos: camera.position.toArray(), yaw: Math.atan2(look.x, look.z), pitch: Math.asin(Math.max(-1, Math.min(1, look.y))) }
      }
    }
    const speed = F.speed * (held.has('shift') ? F.fast : 1) * dt
    const fwd = [Math.sin(free.yaw) * Math.cos(free.pitch), Math.sin(free.pitch), Math.cos(free.yaw) * Math.cos(free.pitch)]
    const side = [-Math.cos(free.yaw), 0, Math.sin(free.yaw)]
    const go = (dir: number[], by: number) => { free!.pos = free!.pos.map((v, k) => v + dir[k] * by) }
    if (held.has('w')) go(fwd, speed)
    if (held.has('s')) go(fwd, -speed)
    if (held.has('d')) go(side, speed)
    if (held.has('a')) go(side, -speed)
    if (held.has('e')) go([0, 1, 0], speed)
    if (held.has('q')) go([0, 1, 0], -speed)
    camera.position.set(free.pos[0], free.pos[1], free.pos[2])
    camera.up.set(0, 1, 0)
    camera.lookAt(free.pos[0] + fwd[0], free.pos[1] + fwd[1], free.pos[2] + fwd[2])
  }

  function results(p: Plugins, m: Row, race: Row, car: Row | undefined) {
    const { wire } = p
    const T = p.ui.PIXI as typeof PIXI
    const Rs = def(wire, m.kind).results
    const back = p.ui.show('results', 'match.results', () => new T.Graphics()) as PIXI.Graphics
    back.clear().roundRect(Rs.back.at[0], Rs.back.at[1], Rs.back.size[0], Rs.back.size[1], Rs.back.radius).fill({ color: Rs.back.colour, alpha: Rs.back.alpha })
    ;(race.data.order as number[]).forEach((id, i) => {
      const r = wire.rows.find(o => o.id === id)
      if (!r) return
      const mine = r.id === car?.id
      const name = mine ? Rs.you : fill(def(wire, r.kind).name, { grid: r.data.grid + 1 })
      const cells: [string, string][] = [['place', fill(Rs.place, { place: i + 1 })], ['name', name], ['time', r.data.done >= 0 ? clock(r.data.done) : Rs.racing]]
      cells.forEach(([cell, value], k) => {
        const t = p.ui.show('results', `match.result.${id}.${cell}`, () => new T.Text({ text: '', style: p.ui.style(mine ? Rs.mine : Rs.style) })) as PIXI.Text
        t.position.set(Rs.at[0] + Rs.columns[k], Rs.at[1] + i * Rs.step)
        t.text = value
      })
    })
    if (!leads(wire.rows)) return
    const b = p.ui.show('results', 'match.exit', () => p.ui.button({ ...p.ui.style(def(wire, m.kind).button), label: Rs.exit.label }).on('pointertap', () => wire.send(m.id, 'exit'))) as PIXI.Container
    b.position.set(Rs.exit.at[0], Rs.exit.at[1])
  }

  return {
    tick(p: Plugins) {
      ui = p.ui
      const { wire } = p
      const m = wire.rows.find(r => r.kind === 'match')
      if (!m) return
      const own = possessed(wire.rows)
      if (!own) return lobby(p, m)
      if (own.data.watch !== null) {
        listen()
        watching(p, m, own)
      }
      const race = wire.rows.find(r => r.kind === 'race')
      if (race?.data.phase === 'results') results(p, m, race, holding(wire.rows))
    },
    close(p: Plugins) {
      deafen()
      p.render3d?.release(OWNER)
    },
  }
}
