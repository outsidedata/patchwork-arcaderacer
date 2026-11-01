// cel3d: the scene drawn as cel animation is, light in flat bands and ink round every shape. It has
// no row and no server half: its numbers are the scene's `world.cel3d`, read off the page's own scene
// on its first tick, never again. It builds on render3d, which it takes out of `plugins`:
//
// The bands, a splice (render3d's `splice`, under `cel3d`) after `lights_fragment_end`, so it reaches
// every dressed material, standard, physical, Lambert and Phong alike, and lands on the light every
// earlier splice left, clouds3d's cloud shadow among them when the scene lists clouds3d first. L is
// the directional lights' colours added, and lit how much of L the direct diffuse light is:
// its luminance over the diffuse colour's Lambert term, over L's luminance, so 1 where a face looks
// straight at an unshadowed sun and 0 in shadow or facing away. Then:
//   bands   `[{ at, level }]`, `at` rising from 0: the band a fragment takes is the level of the last
//           band whose `at` it has reached, each step blended over ±`soft`. The direct diffuse light
//           becomes L times the Lambert term times that level, so a face is lit in flat steps.
//   shade   the colour the light from the sky is multiplied by where a fragment is out of the light,
//           mix(shade, 1, level), so shadows take a hue instead of only going dark.
//   spec    the direct specular light becomes L times `gloss` where its luminance over L's has
//           reached `spec`, over ±`soft`, and nothing elsewhere: one hard highlight.
//   rim     with `{ width, strength, colour }`, a band `width` wide where a face turns away from
//           the eye, smoothstep(1 − width − soft, 1 − width + soft, 1 − n·v), adds colour times
//           strength times L, so a silhouette catches the light.
// With no directional light the splice changes nothing.
//
// The ink, a pass render3d draws the frame through (its `pass`, under `cel3d`) with the depth the
// scene was drawn with. At each pixel the depth is turned to 1/distance along the view, which runs
// straight across the screen over any flat face, so its second difference over `width` pixels each
// way, across and down, against its own value, is nothing on a flat face, a little at a crease and a
// great deal where one shape stands in front of another. Where that reaches `depth` the pixel starts
// to be inked, wholly at twice `depth`, the line fading out over `fade` [near, far] metres from the
// eye; inked, its colour is multiplied by `ink` and by `colour`, so a line is a darker shade of what
// it outlines. The pass reads the depth as render3d drew it, reversed under render3d's `ao`, which
// three tells the pass's shader. With no `outline` there is no pass.
//
// Every number is checked on the first tick, and one the splice or the pass cannot draw throws, naming
// it. One of these per client, as render3d is; the pass is render3d's to dispose once handed over.
import type * as THREE from 'three'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'
import type { Plugins } from '#engine/browser.ts'

export type Settings = {
  bands: { at: number; level: number }[]
  soft: number
  shade: string
  spec: number
  gloss: string
  rim?: { width: number; strength: number; colour: string }
  outline?: { width: number; depth: number; ink: number; colour: string; fade: number[] }
}

const n6 = (v: number) => v.toFixed(6)
const LUMA = 'vec3(0.2126, 0.7152, 0.0722)'

// Throws naming the first number of `s` the splice or the pass cannot draw.
function checked(s: Settings | undefined): Settings {
  if (!s) throw new Error('the scene names cel3d but gives no world.cel3d')
  if (!s.bands?.length || s.bands[0].at !== 0) throw new Error('cel3d bands start with one at 0')
  s.bands.forEach((b, i) => {
    if (i > 0 && !(b.at > s.bands[i - 1].at)) throw new Error(`cel3d band ${i} is at ${b.at}, not above band ${i - 1}'s ${s.bands[i - 1].at}`)
  })
  if (!(s.soft >= 0)) throw new Error(`cel3d soft ${s.soft} is below 0`)
  if (s.rim && !(s.rim.width > 0 && s.rim.width < 1)) throw new Error(`cel3d rim width ${s.rim.width} is not between 0 and 1`)
  const o = s.outline
  if (o) {
    if (!(o.width > 0)) throw new Error(`cel3d outline width ${o.width} is not above 0`)
    if (!(o.depth > 0)) throw new Error(`cel3d outline depth ${o.depth} is not above 0`)
    if (!(o.fade?.length === 2 && o.fade[0] < o.fade[1])) throw new Error(`cel3d outline fade ${JSON.stringify(o.fade)} is not [near, far], near below far`)
  }
  return s
}

// The bands, the shade, the highlight and the rim, as GLSL after `lights_fragment_end`.
export function lighting(s: Settings, THREE: typeof import('three')): string {
  const rgb = (c: string) => { const k = new THREE.Color(c); return `vec3(${n6(k.r)}, ${n6(k.g)}, ${n6(k.b)})` }
  const level = [
    n6(s.bands[0].level),
    ...s.bands.slice(1).map((b, i) => `${n6(b.level - s.bands[i].level)} * smoothstep(${n6(b.at - s.soft)}, ${n6(b.at + s.soft)}, celLit)`),
  ].join(' + ')
  return [
    '{',
    '  vec3 celL = vec3(0.0);',
    '  #if NUM_DIR_LIGHTS > 0',
    '  for (int i = 0; i < NUM_DIR_LIGHTS; i++) celL += directionalLights[i].color;',
    '  #endif',
    `  float celRef = dot(celL, ${LUMA});`,
    '  if (celRef > 0.0) {',
    '    vec3 celAlbedo = max(material.diffuseColor, vec3(1e-4)) * RECIPROCAL_PI;',
    `    float celLit = dot(reflectedLight.directDiffuse / celAlbedo, ${LUMA}) / celRef;`,
    `    float celLevel = ${level};`,
    '    reflectedLight.directDiffuse = celL * celAlbedo * celLevel;',
    `    reflectedLight.indirectDiffuse *= mix(${rgb(s.shade)}, vec3(1.0), clamp(celLevel, 0.0, 1.0));`,
    `    float celSpec = dot(reflectedLight.directSpecular, ${LUMA}) / celRef;`,
    `    reflectedLight.directSpecular = celL * ${rgb(s.gloss)} * smoothstep(${n6(s.spec - s.soft)}, ${n6(s.spec + s.soft)}, celSpec);`,
    ...(s.rim ? [
      `    float celRim = smoothstep(${n6(1 - s.rim.width - s.soft)}, ${n6(1 - s.rim.width + s.soft)}, 1.0 - max(dot(normal, geometryViewDir), 0.0));`,
      `    reflectedLight.directSpecular += celL * ${rgb(s.rim.colour)} * ${n6(s.rim.strength)} * celRim;`,
    ] : []),
    '  }',
    '}',
  ].join('\n')
}

// The ink round every shape, drawn over the frame as the scene left it.
export class Outline extends Pass {
  depth: THREE.DepthTexture | null = null
  material: THREE.ShaderMaterial
  quad: FullScreenQuad

  constructor(private camera: THREE.PerspectiveCamera, o: NonNullable<Settings['outline']>, THREE: typeof import('three')) {
    super()
    const k = new THREE.Color(o.colour)
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
      },
      vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        '#include <packing>',
        'uniform sampler2D tColor;',
        'uniform sampler2D tDepth;',
        'uniform vec2 resolution;',
        'uniform float cameraNear;',
        'uniform float cameraFar;',
        'varying vec2 vUv;',
        // 1/distance along the view, straight across the screen over a flat face.
        'float inv(vec2 uv) { return -1.0 / perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar); }',
        'void main() {',
        '  vec4 c = texture2D(tColor, vUv);',
        `  vec2 px = ${n6(o.width)} / resolution;`,
        '  float m = inv(vUv);',
        '  float across = inv(vUv - vec2(px.x, 0.0)) + inv(vUv + vec2(px.x, 0.0)) - 2.0 * m;',
        '  float down = inv(vUv - vec2(0.0, px.y)) + inv(vUv + vec2(0.0, px.y)) - 2.0 * m;',
        '  float edge = (abs(across) + abs(down)) / m;',
        `  float line = smoothstep(${n6(o.depth)}, ${n6(2 * o.depth)}, edge) * (1.0 - smoothstep(${n6(o.fade[0])}, ${n6(o.fade[1])}, 1.0 / m));`,
        `  gl_FragColor = vec4(mix(c.rgb, c.rgb * ${n6(o.ink)} * vec3(${n6(k.r)}, ${n6(k.g)}, ${n6(k.b)}), line), c.a);`,
        '}',
      ].join('\n'),
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.material)
  }

  setSize(width: number, height: number) {
    this.material.uniforms.resolution.value.set(width, height)
  }

  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    const u = this.material.uniforms
    u.tColor.value = read.texture
    u.tDepth.value = this.depth
    u.cameraNear.value = this.camera.near
    u.cameraFar.value = this.camera.far
    renderer.setRenderTarget(this.renderToScreen ? null : write)
    this.quad.render(renderer)
  }

  dispose() {
    this.material.dispose()
    this.quad.dispose()
  }
}

export function cel3d() {
  let done = false
  return {
    tick(plugins: Plugins) {
      if (done) return
      const render3d = plugins.render3d
      if (!render3d) throw new Error('cel3d needs render3d, which this scene does not name')
      if (!render3d.camera) return
      const s = checked(plugins.wire.scene.world?.cel3d as Settings | undefined)
      const THREE = render3d.THREE as typeof import('three')
      render3d.splice('cel3d', { fragment: { lights_fragment_end: lighting(s, THREE) } })
      if (s.outline) render3d.pass('cel3d', new Outline(render3d.camera, s.outline, THREE))
      done = true
    },
  }
}
