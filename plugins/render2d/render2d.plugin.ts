// Owns the pixi stage. Exposes pixi, the stage and the canvas to actors. Draws after every frame,
// once a page has mounted a canvas. It draws at the screen's own pixel density (the page's
// `devicePixelRatio`), so a canvas `width` × `height` CSS pixels is as sharp on a dense screen as on
// any other, and one CSS pixel is one pixel of everything below; a canvas fitted in whole pixels
// (`fit: "integer"`, below) draws one to one, each of its pixels a pixel of the renderer's.
// One of these per client, made when the seat arrives on its scene and closed when the seat leaves,
// so no scene draws on another's stage.
//
// The world. A scene whose things stand in a world of their own, rather than on the canvas's
// pixels, gives render2d its `world.render2d`, and render2d puts a `world` on the stage, drawn
// through a camera. It has no row, so these are read off the scene, never sent:
//
//   ground  where a step along the world's x and along its y goes on the stage, [[x, y], [x, y]]
//           in pixels, so [[1, 0], [0, 1]] is the stage itself, [[1, 0], [0, -1]] a world whose y
//           grows up the screen, and [[32, 16], [-32, 16]] an isometric one whose cells are diamonds
//           64 pixels across.
//   up      where a step of height goes on the stage, [x, y] in pixels: a point [x, y, h] is drawn
//           `h` steps of `up` from the ground point [x, y] under it.
//   zoom    screen pixels a stage pixel is drawn across, until `zoom` says another.
//   look    the world point in the middle of the canvas until `look` says another.
//   layers  the world's layers, bottom first: each a name, or `{ name, sort, parallax }` for one whose
//           things are drawn in the order of `depth`, the stage y of the ground point under each, so
//           a thing nearer the viewer is drawn over one further off whatever height either stands at
//           (`sort`), or one the camera moves at a factor of its own (`parallax`, [fx, fy], below).
//   fit     `"window"`: the canvas is the page's window, whatever size it is, and follows it as it
//           is resized, the looked-at point staying in its middle. `"integer"`: the canvas fills the
//           window at the largest whole multiple of the `engine` prefab's `width` × `height` that
//           fits (below). `"contain"`: the canvas fills the window at the largest multiple of the
//           `engine` prefab's `width` × `height` that fits, whole or not, drawn sharp (below). Left out, the canvas keeps the size the page made it, the `engine`
//           prefab's `width` and `height`, as big on the page as its pixels.
//   background  the colour the canvas is cleared to before each draw, `"#rrggbb"` or a number
//           0xRRGGBB, until `background` says another. Without it, the renderer's own: black.
//
// `ground()` is `world.render2d`'s `ground`, a copy, for a plugin that lays its own things out on it
// (a tilemap's cells) and so never reads render2d's table itself.
// `place` is where a world point is on the world, the point a thing standing there is put at on a
// layer; `depth` the sort key of one; and `along` the world direction, a unit vector or [0, 0], that
// goes the way a direction on the screen goes, so the page can turn the keys a seat holds into a way
// through the world; `turns` is the way on the screen, as a fraction of a turn counter-clockwise
// from right, that a world heading faces, a heading being an angle counter-clockwise from the
// world's x toward its −y. `project` is where a world point is on the canvas, in its pixels from the
// top left, placed by the camera the next draw uses: `{ x, y, behind }` in render3d's shape, with
// `behind` always false, since a flat world has nothing behind its camera. `unproject` goes back:
// the world point [x, y, h] at height `h` (0 when left out) that `project` puts at a canvas point, so
// a click on the canvas finds the ground under it, or the top of whatever stands `h` steps up there. `layer(name)` is the
// container of a layer, made the first time it is asked for, so a plugin listed before render2d
// can ask in its own `tick`; the first tick puts every layer in `world.render2d`'s order and throws on a
// name it does not give. `ground`, `place`, `project`, `depth`, `along` and `turns` read `world.render2d`,
// which the first tick reads, so they are asked in an actor's `tick`, a plugin's `afterTick`, or
// the `tick` of a plugin listed after render2d, not in a `setup`.
//
// The camera is two numbers this holds, starting from `world.render2d`'s at the first tick: the looked-at
// point, which `look(point)` sets, and the zoom, which `zoom(z)` sets to any positive number, a
// fraction too. `camera()` is `{ look, zoom }`, the camera the next draw uses. `zoom` and `camera`
// throw before the first tick, as `place` does, since that tick would put `world.render2d`'s over them.
// The camera is applied in `afterTick`, just before the draw, so a `look` or a `zoom` from an
// actor's `tick` is drawn the frame it is made: the world is scaled by the zoom and moved so that
// the looked-at point is in the middle of the canvas, on a whole screen pixel so pixel art does not
// shimmer, whatever the zoom.
// A scene with no `world.render2d` has no world: its actors draw on the stage in canvas pixels.
//
// Between steps. Each frame, just before it draws, every thing on the stage is put between where the
// last two steps left it, as far as the frame's wire says (`steps`, `engine/browser.ts`, Drawing
// between steps): its position in a straight line, its turn the short way round, its scale; the
// world and each layer, which the camera places, then go to the whole screen pixel nearest, as every
// draw puts them; and once the frame is drawn each thing is put back where it was set. A frame whose
// tick was not run, as a test that draws render2d alone runs it, draws everything where it is set.
//
// Parallax, as Tiled's layers have it. `parallax(name, fx, fy)` sets a layer's factor, across and
// down the screen, from the next draw on; `world.render2d`'s `parallax` is its starting value, and a
// layer given none has [1, 1]. When the camera's looked-at point moves some pixels on the screen, a
// layer moves that many times its factor: 1 moves with the world, 0 stays where it is on the
// screen, 0.5 moves half as far. Every layer lines up with the world when the camera looks at the
// world's origin, which is Tiled's parallax origin when a map does not move it. Each layer's
// origin is put on a whole screen pixel of its own, as the world's is. `place`, `project` and
// `depth` are the world's, at [1, 1]: a thing on a layer of another factor is drawn off the point
// `project` gives by that layer's offset.
//
// Fit. With `fit: "integer"`, a canvas pixel is drawn across a whole number of the screen's physical
// pixels, the most the window has room for and at least one: the canvas keeps its `engine` size in
// pixels and is sized on the page to that many physical pixels per canvas pixel, a CSS size of
// `width × k / devicePixelRatio`, drawn with `image-rendering: pixelated`. It refits when the window
// is resized and when the page moves to a screen of another pixel ratio. The page centres it, as
// every game's page centres its canvases, and mounts it as it mounts any other. `scale` is the CSS
// pixels one canvas pixel is drawn across, 1 without fit: the UI, which lies over the game's canvas
// in the same box, sizes its own canvas by it, and a click's page pixels are divided by it to reach
// the canvas's (`plugins/ui`, `plugins/player`).
// With `fit: "contain"`, the canvas keeps its `engine` size in pixels and is sized on the page to the
// largest multiple of it the window has room for, whole or not, as CSS's `object-fit: contain` sizes
// an image, so the window's longer side has room left over at either end; `scale` is that multiple.
// It is drawn at the screen's pixel ratio times `scale`, so a line drawn one pixel wide is as sharp
// at any size as without fit, and it refits as `"integer"` does.
//
// Mosaic, as a SNES draws it. `mosaic(size, names)` draws each named layer, from the next draw on,
// in squares of `size` × `size` canvas pixels, each square the colour of the pixel at its top left,
// the squares lined up with the canvas's top left whatever the camera looks at; `size` 1 draws the
// layers as they are. A layer not named keeps the size it had, so the things on one layer can stay
// sharp while the scenery under them breaks up, as a SNES's mosaic takes only the layers it is told.
// It is a PixiJS filter over the whole canvas on each such layer, one per size and shared by every
// layer at that size.
import * as PIXI from 'pixi.js'
import { mixing, steps, type Plugins } from '#engine/browser.ts'

type V2 = [number, number]
type Layer = string | { name: string; sort?: boolean; parallax?: V2 }
type Table = { ground: [V2, V2]; up: V2; zoom: number; look: number[]; layers: Layer[]; fit?: 'window' | 'integer' | 'contain'; background?: string | number }

// `world.render2d`'s background, `"#rrggbb"` or a number 0xRRGGBB, as a number.
const colour = (c: string | number): number => {
  if (typeof c === 'number') {
    if (!Number.isInteger(c) || c < 0 || c > 0xffffff) throw new Error(`render2d background ${c} is not a colour 0xRRGGBB`)
    return c
  }
  if (!/^#[0-9a-f]{6}$/i.test(c)) throw new Error(`render2d background ${c} is not "#rrggbb"`)
  return parseInt(c.slice(1), 16)
}
const named = (l: Layer) => (typeof l === 'string' ? { name: l, sort: false, parallax: undefined } : { name: l.name, sort: !!l.sort, parallax: l.parallax })

// The mosaic: the canvas pixel a fragment is at, found from where the filter's frame lies on the
// canvas, rounded down to its square's top left, and that pixel's colour. The frame's uniforms are
// PixiJS's own, which its vertex shader declares `highp`; declared here at the fragment's lower
// default precision they would not link, and the layer would draw nothing.
const mosaicFragment = `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uInputClamp;
uniform highp vec4 uOutputFrame;
uniform float uSize;

void main(void)
{
    vec2 canvas = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
    vec2 corner = floor(canvas / uSize) * uSize + 0.5;
    vec2 coord = (corner - uOutputFrame.xy) * uInputSize.zw;
    finalColor = texture(uTexture, clamp(coord, uInputClamp.xy, uInputClamp.zw));
}
`

const mosaicWgsl = `struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};

struct MosaicUniforms {
  uSize:f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> mosaic: MosaicUniforms;

struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return VSOutput(vec4(position, 0.0, 1.0), aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw));
}

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let canvas = uv * gfu.uInputSize.xy + gfu.uOutputFrame.xy;
  let corner = floor(canvas / mosaic.uSize) * mosaic.uSize + 0.5;
  let coord = (corner - gfu.uOutputFrame.xy) * gfu.uInputSize.zw;
  return textureSample(uTexture, uSampler, clamp(coord, gfu.uInputClamp.xy, gfu.uInputClamp.zw));
}
`

export function render2d() {
  const stage = new PIXI.Container()
  const layers = new Map<string, PIXI.Container>()
  let table: Table | undefined
  let world: PIXI.Container | undefined
  let size: V2 = [0, 0]
  let at: number[] = [0, 0]
  let zoom = 1
  let renderer: PIXI.Renderer | undefined
  let closed = false
  const factors = new Map<string, V2>() // each layer's parallax, once `world.render2d` or `parallax` gives one
  let clear: number | undefined // the background, once `world.render2d` or `background` gives one
  let scale = 1 // CSS pixels a canvas pixel is drawn across on the page
  let fitted: HTMLCanvasElement | undefined // the canvas `fit` sizes, once it has sized one
  let ratio: MediaQueryList | undefined // true at the page's pixel ratio, until it changes
  const squares = new Map<string, number>() // each layer's mosaic size, once `mosaic` gives one
  const mosaics = new Map<number, PIXI.Filter>() // the mosaic filter of each size drawn
  let wire: Plugins['wire'] | undefined // the wire as this frame's tick found it
  // Every thing's position, turn and scale on the stage after the last two steps (Between steps).
  const between = steps<PIXI.Container>(
    c => [c.position.x, c.position.y, c.rotation, c.scale.x, c.scale.y],
    (c, p) => { c.position.set(p[0], p[1]); c.rotation = p[2]; c.scale.set(p[3], p[4]) },
    mixing([2]),
    (c, on) => { if (on !== undefined) c.visible = on; return c.visible },
  )
  // The stage and everything on it.
  const all = (c: PIXI.Container, out: PIXI.Container[] = []) => {
    out.push(c)
    for (const child of c.children) all(child, out)
    return out
  }
  // The mosaic filter of a size, made the first time a layer is drawn at it.
  const crush = (size: number) => {
    let f = mosaics.get(size)
    if (f) return f
    f = new PIXI.Filter({
      glProgram: PIXI.GlProgram.from({ vertex: PIXI.defaultFilterVert, fragment: mosaicFragment, name: 'mosaic-filter' }),
      gpuProgram: PIXI.GpuProgram.from({ vertex: { source: mosaicWgsl, entryPoint: 'mainVertex' }, fragment: { source: mosaicWgsl, entryPoint: 'mainFragment' } }),
      resources: { mosaic: new PIXI.UniformGroup({ uSize: { value: size, type: 'f32' } }) },
      resolution: 1,
    })
    mosaics.set(size, f)
    return f
  }

  const view = () => {
    if (!table) throw new Error('render2d has no world: it has not ticked, or the scene gives no world.render2d')
    return table
  }
  const place = (pos: number[]): V2 => {
    const { ground: [gx, gy], up } = view(), h = pos[2] ?? 0
    return [pos[0] * gx[0] + pos[1] * gy[0] + h * up[0], pos[0] * gx[1] + pos[1] * gy[1] + h * up[1]]
  }
  // Where the world's origin goes on the canvas while the camera looks at `at`, on a layer the camera
  // moves at the factor `f`: the world is scaled by `zoom` and moved so the looked-at point is in
  // the middle, a layer `f` times as far as the world, each on a whole screen pixel.
  const origin = ([fx, fy]: V2 = [1, 1]): V2 => {
    const [x, y] = place(at)
    return [Math.round(size[0] / 2 - fx * x * zoom), Math.round(size[1] / 2 - fy * y * zoom)]
  }
  // The fitted canvas at the largest whole number of physical pixels per canvas pixel the window has
  // room for, at least one, or, contained, at the largest multiple of its size the window has room for.
  const refit = () => {
    if (!fitted) return
    const [w, h] = size
    if (table?.fit === 'contain') scale = Math.min(innerWidth / w, innerHeight / h)
    else {
      const k = Math.max(1, Math.floor(Math.min((innerWidth * devicePixelRatio) / w, (innerHeight * devicePixelRatio) / h)))
      scale = k / devicePixelRatio
      fitted.style.imageRendering = 'pixelated'
    }
    fitted.style.width = `${w * scale}px`
    fitted.style.height = `${h * scale}px`
    ratio?.removeEventListener('change', refit)
    ratio = matchMedia(`(resolution: ${devicePixelRatio}dppx)`)
    ratio.addEventListener('change', refit)
  }

  const me = {
    PIXI,
    stage,
    canvas: undefined as HTMLCanvasElement | undefined,
    get world() { return world },
    get scale() { return scale },
    // The canvas's size in its own pixels, [width, height]: the `engine` prefab's, or the window's
    // with `fit: "window"`. The UI lays its canvas over the game's at this size (`plugins/ui`).
    get size(): V2 { return [size[0], size[1]] },
    // The canvas is hidden until the first `afterTick`, which runs only once the client has been
    // sent a packet, so a canvas with nothing drawn on it is never shown.
    mount(canvas: HTMLCanvasElement) {
      me.canvas = canvas
      canvas.style.display = 'none'
      const resolution = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1
      PIXI.autoDetectRenderer({ canvas, width: canvas.width, height: canvas.height, resolution, autoDensity: true }).then(
        r => {
          if (closed) r.destroy()
          else renderer = r
        },
        // One that fails once the client has closed is nobody's: its canvas is off the page.
        e => {
          if (!closed) throw e
        },
      )
    },
    tick(plugins: Plugins) {
      wire = plugins.wire
      if (world || table) return
      const scene = plugins.wire.scene
      const p = scene.world?.render2d as Table | undefined
      if (!p) {
        if (layers.size) throw new Error(`render2d was asked for the layer ${[...layers.keys()][0]}, and the scene gives no world.render2d`)
        return
      }
      if (p.fit !== undefined && p.fit !== 'window' && p.fit !== 'integer' && p.fit !== 'contain') throw new Error(`render2d fit ${JSON.stringify(p.fit)} is none of "window", "integer" and "contain"`)
      if (clear === undefined && p.background !== undefined) clear = colour(p.background)
      table = p
      size = [scene.prefabs.engine.width, scene.prefabs.engine.height]
      at = [...p.look]
      zoom = p.zoom
      world = new PIXI.Container()
      stage.addChildAt(world, 0)
      const given = p.layers.map(named)
      for (const name of layers.keys()) if (!given.some(l => l.name === name)) throw new Error(`render2d has no layer ${name}`)
      for (const { name, sort, parallax } of given) {
        const c = me.layer(name)
        c.sortableChildren = sort
        world.addChild(c)
        // A factor `parallax` set before this first tick was set after `world.render2d`'s starting one.
        if (parallax && !factors.has(name)) factors.set(name, [parallax[0], parallax[1]])
      }
    },
    layer(name: string): PIXI.Container {
      let c = layers.get(name)
      if (!c) {
        if (table && !table.layers.some(l => named(l).name === name)) throw new Error(`render2d has no layer ${name}`)
        layers.set(name, (c = new PIXI.Container()))
      }
      return c
    },
    place,
    ground(): [V2, V2] {
      const [gx, gy] = view().ground
      return [[gx[0], gx[1]], [gy[0], gy[1]]]
    },
    project(pos: number[]): { x: number; y: number; behind: boolean } {
      const [ox, oy] = origin(), [x, y] = place(pos)
      return { x: ox + x * zoom, y: oy + y * zoom, behind: false }
    },
    unproject(x: number, y: number, h = 0): [number, number, number] {
      const { ground: [gx, gy], up } = view()
      const [ox, oy] = origin()
      const sx = (x - ox) / zoom - h * up[0], sy = (y - oy) / zoom - h * up[1]
      const det = gx[0] * gy[1] - gy[0] * gx[1]
      return [(sx * gy[1] - sy * gy[0]) / det, (sy * gx[0] - sx * gx[1]) / det, h]
    },
    depth: (pos: number[]) => place([pos[0], pos[1]])[1],
    along(dir: number[]): V2 {
      const { ground: [gx, gy] } = view()
      const det = gx[0] * gy[1] - gy[0] * gx[1]
      const x = (dir[0] * gy[1] - dir[1] * gy[0]) / det, y = (dir[1] * gx[0] - dir[0] * gx[1]) / det
      const len = Math.hypot(x, y)
      return len === 0 ? [0, 0] : [x / len, y / len]
    },
    turns(heading: number): number {
      const a = heading * 2 * Math.PI
      const [x, y] = place([Math.cos(a), -Math.sin(a)])
      return Math.atan2(-y, x) / (2 * Math.PI)
    },
    look(point: number[]) { at = [...point] },
    zoom(z: number) {
      view()
      if (!(z > 0 && Number.isFinite(z))) throw new Error(`render2d's zoom is a positive number, not ${z}`)
      zoom = z
    },
    camera(): { look: number[]; zoom: number } {
      view()
      return { look: [...at], zoom }
    },
    // The camera moves the layer `name` `fx` times as far across the screen as the world and `fy`
    // times as far down it, from the next draw on.
    parallax(name: string, fx: number, fy: number) {
      me.layer(name)
      factors.set(name, [fx, fy])
    },
    // The colour, 0xRRGGBB, the canvas is cleared to from the next draw on.
    background(color: number) { clear = color },
    // Each of the layers `names` drawn in squares of `size` canvas pixels from the next draw on, 1
    // as they are.
    mosaic(size: number, names: string[]) {
      if (!Number.isInteger(size) || size < 1) throw new Error(`render2d mosaic ${size} is not a whole number of pixels, 1 or more`)
      for (const name of names) {
        me.layer(name)
        squares.set(name, size)
      }
    },
    afterTick() {
      if (table?.fit === 'window' && typeof innerWidth === 'number') {
        size = [innerWidth, innerHeight]
        if (renderer && (renderer.screen.width !== innerWidth || renderer.screen.height !== innerHeight)) renderer.resize(innerWidth, innerHeight)
      }
      if (world) {
        const [ox, oy] = origin()
        world.scale.set(zoom)
        world.position.set(ox, oy)
        // A layer is on the world, so its position is its own origin's offset from the world's, in
        // the world's pixels.
        for (const [name, f] of factors) {
          const [lx, ly] = origin(f)
          layers.get(name)!.position.set((lx - ox) / zoom, (ly - oy) / zoom)
        }
        // A mosaic's filter covers the canvas, which is where the canvas is in the layer's own
        // pixels.
        for (const [name, n] of squares) {
          const c = layers.get(name)!
          if (n === 1) {
            c.filters = null
            continue
          }
          c.filters = [crush(n)]
          c.filterArea = new PIXI.Rectangle(-ox / zoom - c.position.x, -oy / zoom - c.position.y, size[0] / zoom, size[1] / zoom)
        }
      }
      if (!me.canvas) return
      const fits = table?.fit === 'integer' || table?.fit === 'contain'
      if (fits && fitted !== me.canvas) {
        if (!fitted) addEventListener('resize', refit)
        fitted = me.canvas
        refit()
      }
      // A canvas fitted in whole pixels draws a canvas pixel to one pixel of its own, whatever the
      // screen's density, and a contained one at the screen's density times its scale: the
      // renderer, made at the screen's density before `world.render2d` was read, is made at that, and the
      // page's size of the canvas, which that resets, fitted again.
      const resolution = table?.fit === 'integer' ? 1 : table?.fit === 'contain' ? devicePixelRatio * scale : undefined
      if (renderer && resolution !== undefined && renderer.resolution !== resolution) {
        renderer.resize(size[0], size[1], resolution)
        refit()
      }
      me.canvas.style.display = ''
      if (!renderer) return
      if (clear !== undefined) renderer.background.color = clear
      if (wire) {
        between.place(all(stage), wire)
        // The camera between two steps stays on a whole screen pixel, the world's and each layer's.
        if (world) {
          const z = world.scale.x
          world.position.set(Math.round(world.position.x), Math.round(world.position.y))
          for (const c of layers.values()) c.position.set((Math.round(world.position.x + z * c.position.x) - world.position.x) / z, (Math.round(world.position.y + z * c.position.y) - world.position.y) / z)
        }
      }
      try {
        renderer.render(stage)
      } finally {
        between.restore()
      }
    },
    // The renderer and its WebGL context go, with the mosaic filters, and the canvas leaves the page.
    // A renderer still being made when the client closes is destroyed the moment it arrives, and
    // one that fails to be made then is let go.
    close() {
      closed = true
      if (fitted) removeEventListener('resize', refit)
      ratio?.removeEventListener('change', refit)
      renderer?.destroy()
      renderer = undefined
      stage.destroy({ children: true })
      for (const f of mosaics.values()) f.destroy()
      mosaics.clear()
      me.canvas?.remove()
    },
  }
  return me
}
