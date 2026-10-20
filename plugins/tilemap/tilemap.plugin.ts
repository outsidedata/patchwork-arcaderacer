// The browser half of tilemap. Once the tilemap row is in the packet it asks the loader for the
// file the scene's `world.tilemap` names (`tilemap.sim.ts` says what it holds), and draws it in render2d's world once
// it has landed. Drawing is done in `afterTick`, after render2d's first `tick` has put its layers in
// order, and so this plugin is listed before `render2d`. `close` frees every sprite it made; the
// files are the loader's and stay.
//
// A Tiled map, a `tilemap` entry, is drawn with its row's `edits` in it:
//
// - render2d's `ground` must lay the map's cells out as Tiled does, [[w, 0], [0, h]] for an
//   orthogonal map of w × h pixel tiles and [[w/2, h/2], [-w/2, h/2]] for an isometric one, or it
//   throws: the scene says `ground` and the map says its orientation, and this is where the two
//   meet.
// - Each tile layer and image layer is drawn on the render2d layer its Tiled `name` names, in the
//   map's order and, within a tile layer, in its `renderorder`, with its opacity and tint; an
//   object layer is for rules and is not drawn, and nor is a layer that is hidden, itself or by a
//   group it is in: no sprite and no container is made for it and render2d is asked for no layer
//   of its name, so a layer of a million cells that only states where a thing may walk costs the
//   page nothing and needs no place on the stage. On a render2d layer that sorts, each tile
//   is drawn in the order of the depth of a point of its cell, so a thing standing in front of a wall
//   is drawn over it, and an image under everything: its cell's middle, or the point its tile's
//   Tiled property `sort` names, that fraction of the way from the cell's top left corner [c, r]
//   to its bottom right [c + 1, r + 1]. A picture that stands against its cell's upper sides, with
//   ground before it that things stand on, is sorted near its top corner, so whatever stands in the
//   cell is drawn over it. A `sort` that is not a number from 0 to 1 throws. On a layer that does
//   not sort, each Tiled layer is a container of its own, in the map's order.
// - A tile's picture stands as Tiled stands it: its bottom left on its cell's bottom left in an
//   orthogonal map, its bottom middle on its cell's bottom corner in an isometric one, moved by its
//   tileset's offset and its layer's; flipped across its diagonal, then along x and along y, as its
//   cell's flip bits say; on whole pixels when the entry is `nearest`.
// - A tile with a Tiled `animation` shows the frame the step counter has reached, `plugins.wire.n`
//   steps into it, round and round, so every seat shows the same frame at the same step and nothing
//   is added to a row. A tile changes only at a step, so each frame shows for its duration in whole
//   steps of the scene's `engine.dt`, the nearest and at least one: 133 ms at 60 steps a second is
//   8 steps, and a loop of four such frames comes round every 32 steps for as long as it plays,
//   where counting its milliseconds would drift a step off every 13 loops.
// - An image layer is its image with its top left at its offset from the map's top left; one that
//   repeats along x or y is a PixiJS TilingSprite, reaching past the map by the canvas's width or
//   height each way along that axis (render2d's `size` over its camera's `zoom` as the map is drawn),
//   and past it by as much again for each time faster than the camera its parallax moves it, so it
//   covers what the camera can see. render2d's `ground()` and the loader's `catalogued(name)` are how
//   it asks them for their numbers: it reads neither's table.
// - The map's `backgroundcolor` goes to `render2d.background`, and each drawn layer's parallax
//   factors to `render2d.parallax` for the render2d layer it is drawn on, and two Tiled layers on
//   one render2d layer that move at two factors throw.
// - When the row's `edits` change, each cell whose edit changed is drawn again, in its place in its
//   layer's order; when the loader has had the map or a tileset of it written (its `version`), the
//   whole map is drawn again.
import type { Plugins } from '#engine/browser.ts'
import type { DecodedMap } from '#plugins/loader/loader.plugin.ts'
import type { ImageLayer, TileLayer } from '#plugins/loader/loader.sim.ts'
import type { Edits } from './tilemap.sim.ts'

type M = [number, number, number, number]
const mul = (a: M, b: M): M => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3]]

// How a sprite turns and scales to draw a tile flipped by Tiled's bits: 4 along x, 2 along y and 1
// across its diagonal, the diagonal first. A PixiJS sprite scales and then turns, so each of the
// eight ways a square can lie is a scale of 1 or -1 along each axis and then a quarter turn, the
// fewest turns first: a tile flipped along x or y is only scaled.
export function flipped(bits: number): { rotation: number; scale: [number, number] } {
  const d: M = [0, 1, 1, 0], h: M = [-1, 0, 0, 1], v: M = [1, 0, 0, -1]
  let m: M = [1, 0, 0, 1]
  if (bits & 1) m = mul(d, m)
  if (bits & 4) m = mul(h, m)
  if (bits & 2) m = mul(v, m)
  for (let k = 0; k < 4; k++) for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const c = Math.round(Math.cos((k * Math.PI) / 2)), s = Math.round(Math.sin((k * Math.PI) / 2))
    const r: M = [c * sx, -s * sy, s * sx, c * sy]
    if (r.every((x, i) => x === m[i])) return { rotation: (k * Math.PI) / 2, scale: [sx, sy] }
  }
  throw new Error(`flip bits ${bits} make no way a tile can lie`)
}

// The order a map's `renderorder` draws a layer's cells in: a key that grows along it.
const orderOf = (renderorder: string) => {
  const right = renderorder.startsWith('right'), down = renderorder.endsWith('down')
  return (c: number, r: number) => (down ? r : -r) * 2 ** 26 + (right ? c : -c)
}

export function tilemap() {
  let asked = false
  // ---- a Tiled map
  let tiled: DecodedMap | undefined
  let nearest = false
  let version = -1
  let edits: Edits = {}
  // Each tile drawn, by `<layer>:<c>,<r>`: its sprite, its gid, and its place in its layer's order.
  const cells = new Map<string, { sprite: any; gid: number; key: number }>()
  // Each Tiled layer's container on a render2d layer that does not sort, and the order key of each
  // of its tiles, in the order they are in it.
  const boxes = new Map<object, { box: any; keys: number[] }>()
  const images: any[] = []

  // ---- drawing a Tiled map

  const sorted = (plugins: Plugins, name: string) => plugins.render2d.layer(name).sortableChildren

  // The frame a tile shows at this step: its own, or its animation's.
  const showing = (plugins: Plugins, gid: number) => {
    const anim = tiled!.map.tiles[gid]?.animation
    if (!anim) return gid
    const step = plugins.wire.scene.prefabs.engine.dt * 1000
    const steps = anim.map(a => Math.max(1, Math.round(a.duration / step)))
    let t = plugins.wire.n % steps.reduce((s, k) => s + k, 0)
    for (let i = 0; i < anim.length; i++) {
      if (t < steps[i]) return anim[i].tile
      t -= steps[i]
    }
    return anim[anim.length - 1].tile
  }

  const cellOf = (l: TileLayer, c: number, r: number): [number, number] => {
    const e = edits[`${l.name}:${c},${r}`]
    if (e !== undefined) return [e < 0 ? 0 : e, 0]
    const i = c - l.x, j = r - l.y
    if (i < 0 || j < 0 || i >= l.width || j >= l.height) return [0, 0]
    return [l.data[j * l.width + i], l.flips[j * l.width + i]]
  }

  // One cell of a tile layer drawn as it now is, in its place in its layer's order.
  const drawCell = (plugins: Plugins, l: TileLayer, c: number, r: number) => {
    const { render2d } = plugins, { PIXI } = render2d
    const at = `${l.name}:${c},${r}`
    const had = cells.get(at)
    if (had) {
      const it = boxes.get(l)
      if (it) it.keys.splice(it.box.getChildIndex(had.sprite), 1)
      had.sprite.destroy()
      cells.delete(at)
    }
    const [gid, flip] = cellOf(l, c, r)
    if (!gid || !l.visible) return
    const { map } = tiled!
    const tile = map.tiles[gid], ts = map.tilesets[tile.tileset], [, , w, h] = tile.box
    const iso = map.orientation === 'isometric'
    const [bx, by] = render2d.place([c + (iso ? 1 : 0) + l.shift[0], r + 1 + l.shift[1]])
    const left = bx - (iso ? w / 2 : 0) + ts.offset[0], top = by - h + ts.offset[1]
    const round = (v: number) => (nearest ? Math.round(v) : v)
    const sprite = new PIXI.Sprite({ texture: tiled!.texture(showing(plugins, gid)), roundPixels: nearest })
    const { rotation, scale } = flipped(flip)
    sprite.anchor.set(0.5)
    sprite.rotation = rotation
    sprite.scale.set(...scale)
    sprite.position.set(round(left) + w / 2, round(top) + h / 2)
    sprite.alpha = l.opacity
    sprite.tint = l.tint ?? 0xffffff
    const key = orderOf(map.renderorder)(c, r)
    if (sorted(plugins, l.name)) {
      const k = tile.properties.sort ?? 0.5
      if (typeof k !== 'number' || !(k >= 0 && k <= 1)) throw new Error(`tile ${tile.id} of ${map.url}'s tileset sorts at ${JSON.stringify(k)}, not a fraction of its cell from 0 to 1`)
      sprite.zIndex = render2d.depth([c + k + l.shift[0], r + k + l.shift[1]])
      render2d.layer(l.name).addChild(sprite)
    } else {
      // In its place among the cells its layer has drawn.
      const { box, keys } = boxes.get(l)!
      let lo = 0, hi = keys.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (keys[mid] < key) lo = mid + 1
        else hi = mid
      }
      keys.splice(lo, 0, key)
      box.addChildAt(sprite, lo)
    }
    cells.set(at, { sprite, gid, key })
  }

  // How far the map reaches on the stage, in pixels: [width, height] from its top left.
  const extent = (): [number, number] => {
    const { map } = tiled!
    const tiles = map.layers.filter((l): l is TileLayer => l.kind === 'tiles')
    const cols = map.infinite ? Math.max(0, ...tiles.map(l => l.x + l.width)) : map.width
    const rows = map.infinite ? Math.max(0, ...tiles.map(l => l.y + l.height)) : map.height
    if (map.orientation === 'isometric') return [((cols + rows) * map.tilewidth) / 2, ((cols + rows) * map.tileheight) / 2]
    return [cols * map.tilewidth, rows * map.tileheight]
  }

  const drawImage = (plugins: Plugins, l: ImageLayer) => {
    const { PIXI, layer } = plugins.render2d
    const { map } = tiled!
    const texture = tiled!.image(l.image)
    // Tiled's top left of an isometric map is left of cell [0, 0]'s top corner by its rows' half widths.
    const ox = (map.orientation === 'isometric' ? -(map.height * map.tilewidth) / 2 : 0) + l.offset[0], oy = l.offset[1]
    const [w, h] = plugins.render2d.size, { zoom } = plugins.render2d.camera()
    const size = extent(), view = [w / zoom, h / zoom]
    let sprite: any
    if (l.repeat[0] || l.repeat[1]) {
      // Along an axis it repeats: from the canvas's size before the map to as far after it, each
      // times the parallax where it moves faster than the camera.
      const span = (k: 0 | 1) => {
        const faster = Math.max(1, l.parallax[k])
        return { from: -view[k] * faster, length: (size[k] + 2 * view[k]) * faster }
      }
      const [x, y] = [l.repeat[0] ? span(0).from : ox, l.repeat[1] ? span(1).from : oy]
      const width = l.repeat[0] ? span(0).length : texture.width, height = l.repeat[1] ? span(1).length : texture.height
      sprite = new PIXI.TilingSprite({ texture, width, height, roundPixels: nearest })
      sprite.position.set(x, y)
      // Its tiles lie where the one at its offset lies.
      sprite.tilePosition.set(ox - x, oy - y)
    } else {
      sprite = new PIXI.Sprite({ texture, roundPixels: nearest })
      sprite.position.set(ox, oy)
    }
    sprite.alpha = l.opacity
    sprite.tint = l.tint ?? 0xffffff
    if (sorted(plugins, l.name)) {
      sprite.zIndex = -Infinity
      layer(l.name).addChild(sprite)
    } else boxes.get(l)!.box.addChild(sprite)
    images.push(sprite)
  }

  const clearTiled = () => {
    for (const { sprite } of cells.values()) sprite.destroy()
    cells.clear()
    for (const s of images.splice(0)) s.destroy()
    for (const { box } of boxes.values()) box.destroy()
    boxes.clear()
  }

  const drawTiled = (plugins: Plugins) => {
    const { map } = tiled!
    const { render2d } = plugins
    const ground = render2d.ground()
    const [tw, th] = [map.tilewidth, map.tileheight]
    const want = map.orientation === 'isometric' ? [[tw / 2, th / 2], [-tw / 2, th / 2]] : [[tw, 0], [0, th]]
    if (JSON.stringify(ground) !== JSON.stringify(want))
      throw new Error(`tilemap ${map.url} is ${map.orientation} with tiles ${tw} by ${th} pixels, which render2d's ground ${JSON.stringify(ground)} does not lay out: that is ${JSON.stringify(want)}`)
    const factors = new Map<string, [number, number]>()
    for (const l of map.layers) {
      if (l.kind === 'objects' || !l.visible) continue
      const had = factors.get(l.name)
      if (had && (had[0] !== l.parallax[0] || had[1] !== l.parallax[1]))
        throw new Error(`tilemap ${map.url} draws two layers on render2d's ${l.name} at two parallax factors, ${had.join(', ')} and ${l.parallax.join(', ')}`)
      factors.set(l.name, l.parallax)
      if (!sorted(plugins, l.name)) {
        const box = new render2d.PIXI.Container()
        render2d.layer(l.name).addChild(box)
        boxes.set(l, { box, keys: [] })
      }
      if (l.kind === 'image') drawImage(plugins, l)
      else {
        const keys = new Set<string>()
        for (let r = l.y; r < l.y + l.height; r++) for (let c = l.x; c < l.x + l.width; c++) keys.add(`${c},${r}`)
        for (const k of Object.keys(edits)) if (k.startsWith(`${l.name}:`)) keys.add(k.slice(l.name.length + 1))
        for (const k of keys) {
          const [c, r] = k.split(',').map(Number)
          drawCell(plugins, l, c, r)
        }
      }
    }
    if (map.background !== null) render2d.background(map.background)
    for (const [name, [fx, fy]] of factors) render2d.parallax(name, fx, fy)
  }

  return {
    tick(plugins: Plugins) {
      if (asked) return
      const row = plugins.wire.rows.find(r => r.kind === 'tilemap')
      if (!row) return
      asked = true
      const file = plugins.wire.scene.world?.tilemap?.file
      const entry = plugins.loader.catalogued(file)
      if (entry?.type !== 'tilemap') throw new Error(`world.tilemap names ${file}, which is no tilemap entry of the loader's catalogue`)
      nearest = !!entry.nearest
      plugins.loader.on(file, (got: DecodedMap) => { tiled = got })
    },
    afterTick(plugins: Plugins) {
      if (!tiled) return
      const row = plugins.wire.rows.find(r => r.kind === 'tilemap')
      const now: Edits = row?.data.edits ?? {}
      if (tiled.version !== version) {
        edits = { ...now }
        clearTiled()
        drawTiled(plugins)
        // Only once it is drawn: a map that cannot be drawn throws every frame.
        version = tiled.version
      } else {
        const changed = new Set([...Object.keys(edits), ...Object.keys(now)].filter(k => edits[k] !== now[k]))
        edits = { ...now }
        for (const k of changed) {
          const [name, at] = [k.slice(0, k.lastIndexOf(':')), k.slice(k.lastIndexOf(':') + 1)]
          const l = tiled.map.layers.find((l): l is TileLayer => l.kind === 'tiles' && l.name === name)
          if (!l) throw new Error(`the tilemap's edits name ${name}, which is no tile layer of ${tiled.map.url}`)
          const [c, r] = at.split(',').map(Number)
          drawCell(plugins, l, c, r)
        }
      }
      for (const { sprite, gid } of cells.values()) if (tiled.map.tiles[gid].animation) sprite.texture = tiled.texture(showing(plugins, gid))
    },
    close() {
      clearTiled()
    },
  }
}
