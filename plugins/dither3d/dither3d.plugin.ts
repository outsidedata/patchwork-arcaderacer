// dither3d: the frame drawn as the PlayStation drew it, an ordered dither over too few colours, at
// too few pixels, each a hard square. It has no row and no server half: its numbers are the scene's
// `world.dither3d`, read off the page's own scene on its first tick. It builds on render3d, which it
// takes out of `plugins`, and throws when the scene does not name it.
//
//   on      whether it draws at first.
//   bits    the bits each of red, green and blue keeps, from 1 to 8: the PlayStation's 15-bit
//           colour keeps 5.
//   matrix  the 4×4 ordered dither, 16 offsets in steps of 1/255 of full scale, row by row from the
//           canvas's top left: what is added to each pixel by where it falls in its 4×4 tile before
//           its colour is cut down to `bits`. The PlayStation's is
//           [-4, 0, -3, 1,  2, -2, 3, -1,  -3, 1, -4, 0,  3, -1, 2, -2].
//   ratio   the pixels render3d draws per canvas pixel while it is on (render3d's `ratio`, as
//           `blocks`), so the dither's tile is 4 drawn pixels and each is shown as a hard square:
//           0.25 draws a 1280×720 canvas at 320×180. Left out, the resolution is render3d's own.
//
// The dither is a pass after render3d's tone mapping (its `finish`, under `dither3d`), on the
// colours the screen shows, in sRGB, as the PlayStation's GPU dithered the 24-bit colour it had lit
// a pixel with before writing it to its 15-bit frame buffer. Each channel is rounded to 8 bits, the
// pixel's offset added and the sum held between 0 and 255, then cut to `bits`: its whole steps of
// 256 / 2^bits, the top step shown as full scale. With every offset 0 it is a plain cut to `bits`
// with no dither.
//
// The pass is handed to render3d the first time it is on, never before, so a scene that names
// dither3d and starts with it off draws as it would without it until it is turned on. From then on
// turning it off passes it over (`enabled`), and goes back to render3d's prefab resolution where it
// set one. `on`, `bits` and `ratio` are read and written live on what this hands back, each written
// value checked as the scene's are; a read or a write before the first tick throws. One of these per client,
// as render3d is; the pass is render3d's to dispose once handed over.
import type * as THREE from 'three'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'
import type { Plugins } from '#engine/browser.ts'
import type { render3d as Render3d } from '#plugins/render3d/render3d.plugin.ts'

export type Settings = { on: boolean; bits: number; matrix: number[]; ratio?: number }

const bitsOk = (b: number) => Number.isInteger(b) && b >= 1 && b <= 8
const ratioOk = (r: number | undefined) => r === undefined || r > 0

// Throws naming the first number of `s` the pass cannot draw.
function checked(s: Settings | undefined): Settings {
  if (!s) throw new Error('the scene names dither3d but gives no world.dither3d')
  if (typeof s.on !== 'boolean') throw new Error(`dither3d on ${s.on} is not true or false`)
  if (!bitsOk(s.bits)) throw new Error(`dither3d bits ${s.bits} is not a whole number from 1 to 8`)
  if (!(Array.isArray(s.matrix) && s.matrix.length === 16 && s.matrix.every(Number.isFinite))) throw new Error(`dither3d matrix ${JSON.stringify(s.matrix)} is not 16 numbers`)
  if (!ratioOk(s.ratio)) throw new Error(`dither3d ratio ${s.ratio} is not above 0`)
  return { on: s.on, bits: s.bits, matrix: [...s.matrix], ratio: s.ratio }
}

// The dither, drawn over the tone-mapped frame.
export class Dither extends Pass {
  material: THREE.ShaderMaterial
  quad: FullScreenQuad

  constructor(s: Settings, THREE: typeof import('three')) {
    super()
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        height: { value: 1 },
        levels: { value: 2 ** s.bits },
        matrix: { value: [...s.matrix] },
      },
      vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform sampler2D tDiffuse;',
        'uniform float height;',
        'uniform float levels;',
        'uniform float matrix[16];',
        'varying vec2 vUv;',
        'void main() {',
        '  vec4 c = texture2D(tDiffuse, vUv);',
        // The pixel's place in its 4×4 tile, counted from the top left as the matrix is.
        '  int x = int(mod(floor(gl_FragCoord.x), 4.0));',
        '  int y = int(mod(floor(height - gl_FragCoord.y), 4.0));',
        '  float offset = matrix[y * 4 + x];',
        '  vec3 c8 = clamp(floor(clamp(c.rgb, 0.0, 1.0) * 255.0 + 0.5) + offset, 0.0, 255.0);',
        '  vec3 q = floor(c8 / (256.0 / levels));',
        '  gl_FragColor = vec4(q / (levels - 1.0), c.a);',
        '}',
      ].join('\n'),
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.material)
  }

  set bits(b: number) { this.material.uniforms.levels.value = 2 ** b }

  setSize(_width: number, height: number) {
    this.material.uniforms.height.value = height
  }

  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    this.material.uniforms.tDiffuse.value = read.texture
    renderer.setRenderTarget(this.renderToScreen ? null : write)
    this.quad.render(renderer)
  }

  dispose() {
    this.material.dispose()
    this.quad.dispose()
  }
}

export function dither3d() {
  let s: Settings | undefined
  let r3: ReturnType<typeof Render3d> | undefined
  let pass: Dither | undefined
  let lowered = false

  // render3d made to draw as `s` says now.
  const apply = () => {
    if (!s || !r3) return
    if (s.on && !pass) {
      pass = new Dither(s, r3.THREE)
      r3.finish('dither3d', pass)
    }
    if (pass) pass.enabled = s.on
    if (s.on && s.ratio !== undefined) {
      r3.ratio(s.ratio, 'blocks')
      lowered = true
    } else if (lowered) {
      r3.ratio()
      lowered = false
    }
  }
  const ticked = (what: string) => {
    if (!s) throw new Error(`dither3d has not ticked yet, so it has no ${what}`)
    return s
  }

  return {
    get on() { return ticked('on').on },
    set on(v: boolean) {
      ticked('on').on = v
      apply()
    },
    get bits() { return ticked('bits').bits },
    set bits(b: number) {
      const now = ticked('bits')
      if (!bitsOk(b)) throw new Error(`dither3d bits ${b} is not a whole number from 1 to 8`)
      now.bits = b
      if (pass) pass.bits = b
    },
    get ratio() { return ticked('ratio').ratio },
    set ratio(r: number | undefined) {
      const now = ticked('ratio')
      if (!ratioOk(r)) throw new Error(`dither3d ratio ${r} is not above 0`)
      now.ratio = r
      apply()
    },
    tick(plugins: Plugins) {
      if (s) return
      const render3d = plugins.render3d as ReturnType<typeof Render3d> | undefined
      if (!render3d) throw new Error('dither3d needs render3d, which this scene does not name')
      s = checked(plugins.wire.scene.world?.dither3d as Settings | undefined)
      r3 = render3d
      apply()
    },
  }
}
