// Darkness over render2d's world, and the lights that cut through it. It has no row and no server
// half: its numbers are the scene's `world.light2d`, read off the scene, as sprite2d reads its own,
// which a child scene takes from the manager's unless it gives its own.
//
// The darkness is a picture the size of the canvas laid over every world layer under it and
// multiplied into them: where it is white the world shows as drawn, where it is black nothing shows.
// It starts each frame as the ambient colour, and every light is added onto it, brightest at its
// middle and falling off to nothing at its radius, so a world lit by nothing is drawn at the ambient
// level and a light can bring it back up to as drawn, never past. It is drawn on the render2d layer
// `world.light2d` names, which the scene lists last, over every layer it darkens.
//
// `world.light2d`:
//
//   layer    the render2d layer the darkness is drawn on.
//   ambient  `{ colour, level }`: the darkness is `colour` × `level`, each channel, so level 0 is
//            black and level 1 is `colour` itself. A colour is an sRGB number, as a PixiJS tint is.
//            An actor may set another for the next draw alone (`ambient`), in its tick, as it sets
//            render2d's look: a dark room the seat stands in, say, every frame it stands there.
//   kinds    kind → its light: every row of a listed kind gives light, and no other row does. Its
//            entry is the light every row of it gives, and a row's own `light` field, when it has
//            one, is written over that field by field; so a torch, whose light never changes, carries
//            none, and a row whose light does change (a lantern turned down, a spell's glow) carries
//            what changes. A light is `{ colour, radius, intensity, flicker? }`: its colour; the
//            world distance along the ground, in steps of the world's x and y, at which it has fallen
//            to nothing; how much of its colour it adds at its middle, 0 to 1; and, for one that
//            flickers, `flicker`, `true` or `{ rate?, depth? }`, either left out being the table's.
//            An intensity of 0 gives no light.
//   budget   the most lights drawn at once: those whose middles are drawn nearest the middle of the
//            canvas, where the camera looks, and of two as near the one of the lower row id, a row's
//            before one a mod hands over, and of two a mod hands over the one of the earlier key.
//   falloff  `{ size, core, power }`: a light's brightness at a fraction `d` of its radius from its
//            middle is 1 out to `d` = `core`, then (1 − (d − core) / (1 − core))^power down to 0 at
//            the radius. It is drawn once per client into a picture `size` pixels across, which
//            every light is stretched from.
//   flicker  `{ rate, depth }`: a flickering light's intensity is multiplied by 1 − depth × a
//            smooth noise between 0 and 1 that takes a new value `rate` times a second.
//   mods     `{ lights: [...] }`: the plugins that hand over lights of their own (below).
//
// Lights from other plugins. The plugins `world.light2d.mods.lights` lists (`addons/scenemanager`'s
// mods), each exporting `lights(plugins)`, asked once a frame, each hand back their lights this frame,
// a list of `{ key, at, colour, radius, intensity }`: what the light is, the same every frame it is
// there; its middle, a point of the stage, where render2d's `place` puts things, rather than of the
// world; its colour, its radius along the ground as a row's is, and how much of its colour it adds at
// its middle, 0 to 1, as its plugin has flickered it, since light2d flickers none of them. particle2d's
// (`particle2d.light2d.ts`) is every lamp of its effects. light2d reads what each made earlier that
// frame, so each is listed before it, and one listed after it, or not listed, throws.
//
// A light stands on its row's `pos`, [x, y] on the ground or [x, y, h] at height h, drawn where
// render2d draws that point (`place`), so a torch on a wall lights around its flame. Its radius is
// laid along the ground as render2d lays the world's x and y on the stage, so its edge is every
// ground point `radius` from it: a circle in a world seen from above, and in an isometric one an
// ellipse the shape of the ground's diamonds.
//
// Flicker is on the game's time, the packet's step × the scene's `engine.dt`, and each light's
// noise is its own, seeded by its row id, so every page shows every light flickering alike. It moves
// once a step: neither render2d nor anything else here keeps a clock between steps that pages would
// agree on.
//
// The darkness is a container on the layer holding the ambient, a sprite covering the canvas, and
// over it the lights, each a sprite of the falloff picture added onto it; the container is drawn
// into a picture of its own and that is multiplied onto the world (a filter doing nothing else, with
// the `multiply` blend). All of it is placed in `afterTick`, after every actor has ticked and moved
// the camera, and so this plugin is listed before `render2d`, whose `afterTick` draws; listed after
// it, the darkness would lag the camera by a frame, and that throws. `lights` is what was drawn last:
// each light's row id and `pos` (or for one a mod handed over, its `key`, its plugin's name and its
// own key), its middle on the stage `at`, its radius, colour and flickered intensity, and its sprite,
// which a pass that shades lights (a shadow cast against the tilemap) masks. `close` frees every sprite, the
// falloff picture and the filter, whole also after render2d's `close`, which the page runs first
// (plugins close in the reverse of the scene's order) and which destroys the darkness with the stage.
import type { Plugins } from '#engine/browser.ts'
import { seeded } from '#engine/engine.ts'
import { ahead, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'

type Flicker = { rate: number; depth: number }
export type Light = { colour: number; radius: number; intensity: number; flicker?: true | Partial<Flicker> }
type Table = {
  layer: string
  ambient: { colour: number; level: number }
  kinds: Record<string, Partial<Light>>
  budget: number
  falloff: { size: number; core: number; power: number }
  flicker: Flicker
  mods?: { lights?: string | string[] }
}
// A light a mod hands over (the header, Lights from other plugins), and what a `lights` mod exports.
export type Handed = { key: string; at: number[]; colour: number; radius: number; intensity: number }
export type Lights = (plugins: Plugins) => readonly Handed[]
// A light as drawn this frame: a row's, by its id and `pos`, or a mod's, by its `key`.
export type Lit = { id?: number; pos?: number[]; key?: string; at: number[]; radius: number; colour: number; intensity: number; sprite: any }

const scale = (colour: number, k: number) => {
  const c = (s: number) => Math.round(((colour >> s) & 255) * k) << s
  return c(16) | c(8) | c(0)
}

// A smooth noise between 0 and 1 at `x`, its own for each `id`: a value rolled at each whole x,
// eased from one to the next.
const noise = (id: number, x: number) => {
  const i = Math.floor(x), f = x - i
  const at = (k: number) => seeded(Math.imul(id, 0x9e3779b1) + k)()
  const s = f * f * (3 - 2 * f)
  return at(i) + (at(i + 1) - at(i)) * s
}

export function light2d() {
  let dark: any
  let filter: any
  let ambient: any
  let next: Table['ambient'] | undefined
  let falloff: any
  let checked = false
  // Each lit row's sprite, by `#` and its row id, and each light a mod hands over's, by its plugin and
  // key, kept while it stays lit: render2d draws a thing between where the last two steps put it and
  // knows it by its sprite, so a sprite handed from one light to another would be drawn part way
  // between the two.
  let sprites = new Map<string, any>()
  let lit: Lit[] = []

  // The falloff picture: white, its opacity the light's brightness at each pixel, premultiplied.
  const picture = (PIXI: any, { size, core, power }: Table['falloff']) => {
    const data = new Uint8Array(size * size * 4)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2)
        const v = d <= core ? 1 : d >= 1 ? 0 : (1 - (d - core) / (1 - core)) ** power
        data.fill(Math.round(v * 255), (y * size + x) * 4, (y * size + x) * 4 + 4)
      }
    return new PIXI.Texture({ source: new PIXI.BufferImageSource({ resource: data, width: size, height: size, alphaMode: 'premultiplied-alpha' }) })
  }

  // Every light a row of a listed kind gives, its fields its kind's written over by its row's.
  const gather = (plugins: Plugins, table: Table, t: number) => {
    const out: (Light & { id: number; pos: number[] })[] = []
    for (const row of plugins.wire.rows) {
      const kind = table.kinds[row.kind]
      if (!kind) continue
      const l = { ...kind, ...row.data.light }
      for (const f of ['colour', 'radius', 'intensity'] as const)
        if (typeof l[f] !== 'number') throw new Error(`light2d: row ${row.id} of kind ${row.kind} gives light with no ${f}`)
      if (!Array.isArray(row.data.pos)) throw new Error(`light2d: row ${row.id} of kind ${row.kind} gives light and has no pos`)
      let intensity = l.intensity!
      if (l.flicker) {
        const { rate, depth } = { ...table.flicker, ...(l.flicker === true ? {} : l.flicker) }
        intensity *= 1 - depth * noise(row.id, t * rate)
      }
      if (intensity > 0) out.push({ id: row.id, pos: row.data.pos, colour: l.colour!, radius: l.radius!, intensity: Math.min(1, intensity) })
    }
    return out
  }

  return {
    get lights(): readonly Lit[] { return lit },
    // The ambient of the next draw, over the table's, for that draw alone.
    ambient(a: Table['ambient']) { next = a },
    afterTick(plugins: Plugins) {
      const { scene } = plugins.wire
      const table = scene.world?.light2d as Table | undefined
      if (!table) throw new Error('the scene names light2d but gives no world.light2d')
      if (!checked) {
        checked = true
        const order = scene.plugins!
        if (order.indexOf('render2d') < order.indexOf('light2d'))
          throw new Error('light2d is listed after render2d, which would draw the darkness a frame behind the camera')
      }
      const { width, height, dt } = scene.prefabs.engine ?? {}
      if (!dt) throw new Error('scene has no engine prefab with dt')
      const { render2d } = plugins
      const { PIXI, place, project } = render2d
      if (!dark) {
        dark = new PIXI.Container()
        filter = new PIXI.AlphaFilter({ alpha: 1, blendMode: 'multiply' })
        dark.filters = [filter]
        ambient = new PIXI.Sprite(PIXI.Texture.WHITE)
        dark.addChild(ambient)
        falloff = picture(PIXI, table.falloff)
        render2d.layer(table.layer).addChild(dark)
      }

      // The canvas, on the stage: the camera draws stage point s at o + zoom × s.
      const gx = place([1, 0]), gy = place([0, 1])
      const o = project([0, 0]), e = project([1, 0])
      const zoom = Math.hypot(e.x - o.x, e.y - o.y) / Math.hypot(gx[0], gx[1])
      ambient.position.set(-o.x / zoom, -o.y / zoom)
      ambient.width = width / zoom
      ambient.height = height / zoom
      const { colour, level } = next ?? table.ambient
      next = undefined
      ambient.tint = scale(colour, level)

      // Every light this frame, the rows' and each mod's, its middle on the stage and how far that is
      // drawn from the middle of the canvas; a row's sprite known by its id, a mod's by its plugin and key.
      const far = (x: number, y: number) => Math.hypot(x - width / 2, y - height / 2)
      type Candidate = { id?: number; pos?: number[]; key?: string; name: string; at: number[]; colour: number; radius: number; intensity: number; d: number }
      const rowed: Candidate[] = gather(plugins, table, plugins.wire.n * dt).map(l => {
        const c = project(l.pos)
        return { ...l, name: `#${l.id}`, at: place(l.pos), d: far(c.x, c.y) }
      })
      ahead(scene, 'light2d', 'lights')
      const from = table.mods?.lights === undefined ? [] : typeof table.mods.lights === 'string' ? [table.mods.lights] : table.mods.lights
      const handed: Candidate[] = modsOf<Lights>(scene.world!, 'light2d', 'lights').flatMap((f, i) =>
        f(plugins).filter(l => l.intensity > 0).map(l => ({
          key: `${from[i]}:${l.key}`, name: `${from[i]}:${l.key}`, at: l.at, colour: l.colour, radius: l.radius, intensity: Math.min(1, l.intensity),
          d: far(o.x + zoom * l.at[0], o.y + zoom * l.at[1]),
        })))
      const chosen = [...rowed, ...handed]
        .sort((a, b) => a.d - b.d || (a.id !== undefined && b.id !== undefined ? a.id - b.id : a.id !== undefined ? -1 : b.id !== undefined ? 1 : a.key! < b.key! ? -1 : a.key! > b.key! ? 1 : 0))
        .slice(0, table.budget)

      // Each light's sprite: the falloff picture, its middle on the light's point, its edge along
      // the ground `radius` from it.
      const k = (r: number) => r / (table.falloff.size / 2)
      for (const l of lit) l.sprite.removeFromParent()
      const kept = new Map<string, any>()
      lit = chosen.map(l => {
        const sprite = sprites.get(l.name) ?? new PIXI.Sprite({ texture: falloff, anchor: 0.5, blendMode: 'add' })
        kept.set(l.name, sprite)
        const [x, y] = l.at, s = k(l.radius)
        sprite.setFromMatrix(new PIXI.Matrix(gx[0] * s, gx[1] * s, gy[0] * s, gy[1] * s, x, y))
        sprite.tint = l.colour
        sprite.alpha = l.intensity
        dark.addChild(sprite)
        const which = l.id !== undefined ? { id: l.id, pos: l.pos } : { key: l.key }
        return { ...which, at: [x, y], radius: l.radius, colour: l.colour, intensity: l.intensity, sprite }
      })
      for (const [name, s] of sprites) if (!kept.has(name)) s.destroy()
      sprites = kept
    },
    close() {
      for (const s of sprites.values()) s.destroy()
      sprites = new Map()
      lit = []
      if (!dark) return
      filter.destroy()
      if (!dark.destroyed) dark.destroy({ children: true })
      falloff.destroy(true)
      dark = ambient = falloff = filter = undefined
    },
  }
}
