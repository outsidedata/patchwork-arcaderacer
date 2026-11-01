// Rows drawn as sprites in render2d's world: every row of a kind the table lists is a frame of a
// sprite sheet (`plugins/loader`, type `sheet`) standing on the row's `pos`. It has no row: the
// table is the scene's `world.sprite2d`, read off the scene, which the rules of a kind read too
// (below).
//
// The table: `kinds`, for each kind drawn, its `layer`, the render2d layer its sprites go on; its
// `turn`, the facing of a whole turn; and, for a kind that casts one, its `shadow`: an ellipse
// reaching `size` [across, down] stage pixels out from the ground under the thing, so twice that
// wide and high, on the render2d layer
// `layer`, black at opacity `alpha` less `fade` for every step of height the thing stands above
// the ground, and none below 0. A shadow with a `clip` is that clip of the thing's own sheet in place
// of the ellipse, frame 0 of the run facing the thing's heading, mirrored as the sheet mirrors it,
// its anchor on the ground point: an aircraft's silhouette, turning as it turns; `size` is then
// not read.
//
// A kind whose every row looks one way gives that look once, in its entry of the table: `sheet`,
// `clip` and `facing`, any of the three, read there for every row of it and never sent, a coin
// say. Its rule reads them there too, as `w.world.sprite2d.kinds.<kind>`. A field its entry gives is
// read from the entry and one it does not from the row (`look`), and a row carrying a field its
// entry gives throws, naming both, so a field is only ever in one of the two places.
//
// A row of such a kind carries `sheet`, the loader name of its sheet; `clip`, the clip it plays;
// `frame`, the frame of that clip it shows, which its rule moves on (`play` in
// `plugins/loader/loader.sim.ts`), so every page and every rule agree on it, and which a row of a
// kind that never plays leaves out, showing the first (a crate standing on the floor); `facing`, the way it
// heads, `facing` × a whole turn / `turn` counter-clockwise from the world's x toward its −y; and
// `pos`, its point in the world, [x, y] on the ground or [x, y, h] at height `h`. It may carry
// `shadow`, a number its shadow's opacity is multiplied by: 0 casts none; `alpha`, from 0 to 1, how
// much of it shows, 1 when left out, a blink after a hit, say, or a fallen body fading; `flip`, true
// to draw it upside down in its frame's own place, a thing knocked over, its feet where its head
// was; and `palette`, the loader name of a `palette` entry to draw it in: colour k of the palette
// its sheet's catalogue entry names becomes colour k of this one, every pixel of exactly that
// colour, to within a 255th, the rounding of a pixel's alpha, and no other. A palette swaps at most
// 32 colours; the row's has at least as many as the sheet's. A row naming the sheet's own palette,
// or none (the field left out or null, as a prefab says none), is drawn as the sheet is. The swap
// is a PixiJS filter, one per pair of palettes this client draws, shared by every sprite drawn in
// that pair. It may carry `layer`, the render2d layer to draw it on in place of its kind's while it
// names one (left out or null, the kind's): a thing that goes behind the ground for a while, into a
// pipe say, and comes out in front again, or a fallen body lying on a layer under every living one.
// It may carry `rot`, [c, s], the way the thing's own x axis points in the world, a rotation as
// box2d writes a body's (`plugins/box2d`): the sprite is turned about its frame's anchor so that its
// x axis goes the way render2d's `place` carries that direction onto the stage, as box2d's browser
// half turns what it follows, so a tumbling body's sprite tumbles with it, mirrored and flipped as
// the row says before it is turned. Left out or null, it stands upright. Its shadow is not turned.
//
// The run drawn is the one the sheet has facing nearest the way the heading is drawn on the screen
// (render2d's `turns`), and a run the sheet mirrors is drawn flipped about the frame's anchor. The
// frame's anchor stands on the point `pos` is drawn at (render2d's `place`), on whole pixels for a
// sheet of pixel art. On a sorted layer a sprite is drawn in the order of the depth of the ground
// under it, so a jump lifts it without changing what it stands in front of, and of two at one depth
// the one whose kind the table lists later is drawn over.
//
// Sprites are placed in `afterTick`, after render2d's `tick` has read the world and every actor has
// ticked, and so this plugin is listed before `render2d`, whose `afterTick` draws. A sprite whose
// sheet, or either of whose palettes, the loader has not handed over yet is hidden, and what it
// lacks is asked for. A row that ends takes its sprite and its shadow with it, and `close` frees
// every one and every filter; the sheets and palettes are the loader's and stay.
import type { Plugins } from '#engine/browser.ts'

type Shadow = { layer: string; size?: [number, number]; clip?: string; alpha: number; fade: number }
export type Look = { sheet: string; clip: string; facing: number }
export type Spec = { layer: string; turn: number; shadow?: Shadow } & Partial<Look>
export type Table = { kinds: Record<string, Spec> }

// A row's sheet, clip and facing: each from its kind's entry where the entry gives it, else the
// row's; a row carrying one its entry gives throws.
export function look(spec: Spec, row: { id: number; kind: string; data: Record<string, any> }): Look {
  const one = <K extends keyof Look>(k: K): Look[K] => {
    if (spec[k] === undefined) return row.data[k]
    if (k in row.data) throw new Error(`${row.kind} ${row.id} carries ${k}, which world.sprite2d gives for every ${row.kind}`)
    return spec[k] as Look[K]
  }
  return { sheet: one('sheet'), clip: one('clip'), facing: one('facing') }
}

// Of two things at one depth, how much nearer each place further down the table's kinds counts.
const TIE = 1 / 1024

// The most colours a palette swaps.
export const SWAPS = 32

const fragment = `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uFrom[${SWAPS}];
uniform vec4 uTo[${SWAPS}];
uniform float uCount;

void main(void)
{
    vec4 c = texture(uTexture, vTextureCoord);
    if (c.a > 0.0) {
        vec3 rgb = c.rgb / c.a;
        for (int i = 0; i < ${SWAPS}; i++) {
            if (float(i) >= uCount) break;
            if (all(lessThan(abs(rgb - uFrom[i].rgb), vec3(1.0 / 255.0)))) {
                rgb = uTo[i].rgb;
                break;
            }
        }
        c = vec4(rgb * c.a, c.a);
    }
    finalColor = c;
}
`

const wgsl = `struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};

struct SwapUniforms {
  uFrom:array<vec4<f32>, ${SWAPS}>,
  uTo:array<vec4<f32>, ${SWAPS}>,
  uCount:f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> swap: SwapUniforms;

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
  var c = textureSample(uTexture, uSampler, uv);
  if (c.a > 0.0) {
    var rgb = c.rgb / c.a;
    for (var i = 0; i < ${SWAPS}; i++) {
      if (f32(i) >= swap.uCount) { break; }
      if (all(abs(rgb - swap.uFrom[i].rgb) < vec3<f32>(1.0 / 255.0))) {
        rgb = swap.uTo[i].rgb;
        break;
      }
    }
    c = vec4<f32>(rgb * c.a, c.a);
  }
  return c;
}
`

// Colours as 0xRRGGBB, as a list of [r, g, b, 1] from 0 to 1, room for every colour a palette swaps.
const channels = (colours: number[]) => {
  const out = new Float32Array(SWAPS * 4)
  colours.slice(0, SWAPS).forEach((c, i) => out.set([((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, 1], i * 4))
  return out
}

export function sprite2d() {
  const drawn = new Map<number, { sprite: any; shadow?: any }>()
  // The filter of each pair of palettes, by `<from>><to>`.
  const swaps = new Map<string, any>()

  const drop = (id: number) => {
    const it = drawn.get(id)!
    it.sprite.destroy()
    it.shadow?.destroy()
    drawn.delete(id)
  }

  // The filter that draws palette `from` in palette `to`, made the first time the pair is drawn.
  const swap = (PIXI: any, from: string, base: number[], to: string, target: number[]) => {
    const key = `${from}>${to}`
    let f = swaps.get(key)
    if (f) return f
    if (base.length > SWAPS) throw new Error(`palette ${from} has ${base.length} colours, more than the ${SWAPS} a swap takes`)
    if (target.length < base.length) throw new Error(`palette ${to} has ${target.length} colours, fewer than the ${base.length} of ${from}`)
    f = new PIXI.Filter({
      glProgram: PIXI.GlProgram.from({ vertex: PIXI.defaultFilterVert, fragment, name: 'palette-swap-filter' }),
      gpuProgram: PIXI.GpuProgram.from({ vertex: { source: wgsl, entryPoint: 'mainVertex' }, fragment: { source: wgsl, entryPoint: 'mainFragment' } }),
      resources: {
        swap: new PIXI.UniformGroup({
          uFrom: { value: channels(base), type: 'vec4<f32>', size: SWAPS },
          uTo: { value: channels(target), type: 'vec4<f32>', size: SWAPS },
          uCount: { value: base.length, type: 'f32' },
        }),
      },
    })
    swaps.set(key, f)
    return f
  }

  return {
    afterTick(plugins: Plugins) {
      const table = plugins.wire.scene.world?.sprite2d as Table | undefined
      if (!table) throw new Error('the scene names sprite2d but gives no world.sprite2d')
      const { render2d, loader } = plugins
      const { PIXI } = render2d
      const order = Object.keys(table.kinds)
      const here = new Set<number>()
      // A thing the loader has, or undefined, asked for, while it has not.
      const got = (name: string) => {
        const it = loader.get(name)
        if (!it) loader.load(name)
        return it
      }
      for (const row of plugins.wire.rows) {
        const spec = table.kinds[row.kind]
        if (!spec) continue
        here.add(row.id)
        const d = row.data
        const { sheet: sheetName, clip, facing } = look(spec, row)
        let it = drawn.get(row.id)
        if (!it) {
          const sprite = new PIXI.Sprite()
          let shadow
          if (spec.shadow) {
            if (spec.shadow.clip) shadow = new PIXI.Sprite()
            else {
              const [rx, ry] = spec.shadow.size!
              shadow = new PIXI.Graphics().ellipse(0, 0, rx, ry).fill({ color: 0 })
            }
            render2d.layer(spec.shadow.layer).addChild(shadow)
          }
          drawn.set(row.id, (it = { sprite, shadow }))
        }
        const layer = render2d.layer(d.layer ?? spec.layer)
        if (it.sprite.parent !== layer) layer.addChild(it.sprite)
        const sheet = got(sheetName)
        // The sheet's palette and the row's, when the row swaps one for the other.
        const base: string | undefined = sheet?.data.palette
        const swapped = sheet && d.palette != null && d.palette !== base
        if (swapped && base === undefined) throw new Error(`${row.kind} ${row.id} draws its sheet ${sheetName} in palette ${d.palette}, and the sheet's entry names no palette of its own`)
        const from = swapped ? got(base!) : undefined, to = swapped ? got(d.palette) : undefined
        const ready = !!sheet && (!swapped || (!!from && !!to))
        it.sprite.visible = ready
        if (it.shadow) {
          const { alpha, fade } = spec.shadow!
          const [x, y] = render2d.place([d.pos[0], d.pos[1]])
          it.shadow.position.set(x, y)
          it.shadow.alpha = Math.max(0, alpha - fade * (d.pos[2] ?? 0)) * (d.shadow ?? 1)
          it.shadow.visible = ready
        }
        if (!ready) continue
        const turns = render2d.turns(facing / spec.turn)
        if (it.shadow && spec.shadow!.clip) {
          const at = sheet.pick(spec.shadow!.clip, turns)
          const f = sheet.frameOf(spec.shadow!.clip, at.run, 0)
          it.shadow.texture = sheet.texture(f.id)
          it.shadow.anchor.set(f.anchor[0] / f.size[0], f.anchor[1] / f.size[1])
          it.shadow.scale.x = at.mirror ? -1 : 1
        }
        const { run, mirror } = sheet.pick(clip, turns)
        const frame = sheet.frameOf(clip, run, d.frame ?? 0)
        const [w, h] = frame.size
        const nearest = sheet.data.nearest
        const [x, y] = render2d.place(d.pos)
        it.sprite.texture = sheet.texture(frame.id)
        it.sprite.anchor.set(frame.anchor[0] / w, d.flip ? 1 - frame.anchor[1] / h : frame.anchor[1] / h)
        it.sprite.scale.set(mirror ? -1 : 1, d.flip ? -1 : 1)
        const [ax, ay] = d.rot ? render2d.place(d.rot) : [1, 0]
        it.sprite.rotation = Math.atan2(ay, ax)
        it.sprite.alpha = d.alpha ?? 1
        it.sprite.filters = swapped ? [swap(PIXI, base!, from, d.palette, to)] : null
        it.sprite.roundPixels = nearest
        it.sprite.position.set(nearest ? Math.round(x) : x, nearest ? Math.round(y) : y)
        it.sprite.zIndex = render2d.depth(d.pos) + order.indexOf(row.kind) * TIE
      }
      for (const id of [...drawn.keys()]) if (!here.has(id)) drop(id)
    },
    close() {
      for (const id of [...drawn.keys()]) drop(id)
      for (const f of swaps.values()) f.destroy()
      swaps.clear()
    },
  }
}
