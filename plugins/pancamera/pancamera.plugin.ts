// pancamera: the spectator's camera over render2d's world. It moves the point render2d looks at by
// the pointer at the canvas's edge and by held keys, and steps render2d's zoom with the wheel,
// inside bounds. It has no row and no server half: its numbers are the scene's `world.pancamera`, read off
// the scene.
//
//   speed   world units a second the looked-at point moves while it pans.
//   edge    canvas pixels: the pointer this near a side of the canvas pans toward that side, and
//           this near two sides, in a corner, toward both.
//   keys    `{ left, right, up, down }`, each a key or a list of keys in `player`'s names, any of
//           which pans that way on the screen while it is held.
//   zooms   the zooms the wheel steps through, any positive numbers. Each `notch` pixels the wheel
//           turns down steps render2d's zoom to the next smaller in the list, and each it turns up
//           to the next larger; past the last one either way it stays.
//   notch   pixels of the wheel's turn that make one step. What turns less is kept toward the next.
//   bounds  [[x0, y0], [x1, y1]] in world units: the looked-at point is held inside, x between x0
//           and x1 and y between y0 and y1.
//   look    the world point it looks at first; without it, the one `world.render2d` gives.
//
// A way on the screen, x right and y down, each -1, 0 or 1 from the edge and the keys together,
// goes through the world the way render2d's `along` says, at `speed`, for the page's time since the
// last frame, so a display drawing twice as often moves it half as far a frame. It moves rigidly:
// no easing, no speed carried from one frame to the next. Each frame it starts from the point
// render2d looks at, so a `look` an actor makes is where the pan goes on from, holds it inside
// `bounds`, and hands render2d the point with `look`, the first frame too, so the first point drawn
// is inside. A zoom is stepped from the one render2d draws with (`camera()`), so a zoom not in
// the list steps to the nearest in the list the way the wheel turned.
//
// `look(plugins, point)` moves the camera to look at a world point, held inside `bounds`, as a
// minimap does when it is clicked: the pan goes on from there.
//
// The keys and the wheel are read through `player`'s bind table: `binds(plugins)` is the part of a
// table that is the camera's, made from `world.pancamera`'s `keys`, which the seat's actor hands
// `player.bind` in its setup, alone or with its own:
//
//   const cam = plugins.pancamera.binds(plugins)
//   plugins.player.bind({ ...cam, press: { ...cam.press, … } })
//
// Each of `keys` is in its `press`, doing nothing when pressed, so `player` holds it and cancels its
// browser default: an arrow does not scroll the page. Its `every` reads which are held, the frame
// `player` asks, and its `wheel` adds up the pixels turned. So a key or the wheel is the camera's
// under the rules `player` keeps for a table: the UI takes a click or a key first, a modal lets
// every key go, and the wheel under Control, Command or Alt zooms the browser too. An actor that has
// an `every` or a `wheel` of its own calls the camera's from it. On a frame `player` did not ask, as
// when the table in force is not one with the camera's in it, no key pans.
//
// The pointer is the page's last `mousemove`, measured against render2d's canvas's box and
// scaled to the canvas's own pixels, as `project` measures. There is no pointer, and so no edge
// pan, before it moves, after it leaves the page or the page loses the focus, while the page holds
// the pointer lock (the pointer is then not on the canvas), while a modal of the scene's `ui` has the
// input, on a frame with no canvas mounted, and where there is no page to listen on, as in node.
// `close` takes its listeners off the page.
//
// It is listed after `render2d`, whose first tick puts `world.render2d`'s camera over any set before
// it, and after `player` when the scene lists one, whose tick asks `every` and `wheel`, so this
// frame's keys and wheel move this frame's camera:
//
//   "plugins": [..., "player", "render2d", "pancamera"]
//
// Listed otherwise, or in a scene with no `world.render2d`, its tick throws. All of it happens in its
// `tick`, before any `afterTick`, so render2d's draw is placed by it.
import type { Plugins } from '#engine/browser.ts'

type V2 = [number, number]
type Keys = string | string[]
export type Table = {
  speed: number
  edge: number
  keys: { left: Keys; right: Keys; up: Keys; down: Keys }
  zooms: number[]
  notch: number
  bounds: [V2, V2]
  look?: number[]
}

export function pancamera() {
  let started = false
  let listening = false
  let last: number | undefined // the page's clock at the last frame
  let pointer: V2 | undefined // the page's last pointer, in client pixels
  let way: V2 = [0, 0] // the way the held keys pan, as `every` last read it
  let turned = 0 // the wheel's pixels down not yet stepped

  const tableOf = (plugins: Plugins) => {
    const p = plugins.wire.scene.world?.pancamera as Table | undefined
    if (!p) throw new Error('the scene gives pancamera no world.pancamera')
    return p
  }
  const onMove = (e: MouseEvent) => { pointer = [e.clientX, e.clientY] }
  // `relatedTarget` is null when the pointer left for no element of the page: it is off the page.
  const onOut = (e: MouseEvent) => { if (!e.relatedTarget) pointer = undefined }
  const onBlur = () => { pointer = undefined }

  // The way the pointer pans: -1, 0 or 1 across and down, by how near it is to each side.
  function edgeWay(plugins: Plugins, p: Table): V2 {
    const canvas: HTMLCanvasElement | undefined = plugins.render2d.canvas
    if (!pointer || !canvas || plugins.ui?.modal()) return [0, 0]
    if (typeof document !== 'undefined' && document.pointerLockElement) return [0, 0]
    const box = canvas.getBoundingClientRect()
    if (!box.width || !box.height) return [0, 0]
    const x = ((pointer[0] - box.left) * canvas.width) / box.width, y = ((pointer[1] - box.top) * canvas.height) / box.height
    if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) return [0, 0]
    const side = (at: number, size: number) => (at <= p.edge ? -1 : at >= size - p.edge ? 1 : 0)
    return [side(x, canvas.width), side(y, canvas.height)]
  }

  const hold = (p: Table, point: number[]) => {
    const [[x0, y0], [x1, y1]] = p.bounds
    return [Math.max(x0, Math.min(x1, point[0])), Math.max(y0, Math.min(y1, point[1])), ...point.slice(2)]
  }

  const me = {
    look(plugins: Plugins, point: number[]) {
      plugins.render2d.look(hold(tableOf(plugins), point))
    },
    // The camera's part of `player`'s bind table.
    binds(plugins: Plugins) {
      const { left, right, up, down } = tableOf(plugins).keys
      const each = (k: Keys) => (typeof k === 'string' ? [k] : k)
      return {
        press: Object.fromEntries([left, right, up, down].flatMap(each).map(k => [k, () => {}])),
        every(held: (key: string) => boolean): undefined {
          const any = (k: Keys) => each(k).some(held)
          way = [(any(right) ? 1 : 0) - (any(left) ? 1 : 0), (any(down) ? 1 : 0) - (any(up) ? 1 : 0)]
        },
        wheel(dy: number): undefined { turned += dy },
      }
    },
    tick(plugins: Plugins) {
      const scene = plugins.wire.scene
      const order = scene.plugins!
      const mine = order.indexOf('pancamera')
      if (!order.includes('render2d')) throw new Error('pancamera moves render2d\'s camera, and the scene does not list render2d')
      if (order.indexOf('render2d') > mine) throw new Error('pancamera is listed before render2d, whose first tick would put its camera over the one placed')
      if (order.includes('player') && order.indexOf('player') > mine) throw new Error('pancamera is listed before player, so it would move the camera on the keys and wheel of the frame before')
      const p = tableOf(plugins)
      const render2d = plugins.render2d
      const camera = render2d.camera() as { look: number[]; zoom: number }
      if (!listening && typeof addEventListener === 'function') {
        listening = true
        addEventListener('mousemove', onMove)
        addEventListener('mouseout', onOut)
        addEventListener('blur', onBlur)
      }

      const now = performance.now()
      const dt = last === undefined ? 0 : (now - last) / 1000
      last = now

      // The wheel turned down steps out to the next smaller zoom, up in to the next larger.
      let zoom = camera.zoom
      const out = () => p.zooms.filter(z => z < zoom), inward = () => p.zooms.filter(z => z > zoom)
      for (; turned >= p.notch; turned -= p.notch) if (out().length) zoom = Math.max(...out())
      for (; turned <= -p.notch; turned += p.notch) if (inward().length) zoom = Math.min(...inward())
      if (zoom !== camera.zoom) render2d.zoom(zoom)

      const look = started || !p.look ? camera.look : [...p.look]
      started = true
      const [ex, ey] = edgeWay(plugins, p)
      const clamp1 = (v: number) => Math.max(-1, Math.min(1, v))
      const [dx, dy] = render2d.along([clamp1(ex + way[0]), clamp1(ey + way[1])]) as V2
      way = [0, 0]
      render2d.look(hold(p, [look[0] + dx * p.speed * dt, look[1] + dy * p.speed * dt, ...look.slice(2)]))
    },
    close() {
      if (!listening) return
      listening = false
      removeEventListener('mousemove', onMove)
      removeEventListener('mouseout', onOut)
      removeEventListener('blur', onBlur)
    },
  }
  return me
}
