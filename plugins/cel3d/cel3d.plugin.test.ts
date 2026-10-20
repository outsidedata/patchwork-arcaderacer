// cel3d on render3d with no canvas, in node: the splice it hands every dressed material, written
// from `world.cel3d`, and the outline pass it hands render3d, drawn through a renderer that writes
// down what it was asked to draw. Node has no WebGL, so the GLSL is read, not run.
import { expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import { cel3d, Outline, type Settings } from './cel3d.plugin.ts'

const CEL: Settings = {
  bands: [{ at: 0, level: 0.25 }, { at: 0.3, level: 0.7 }, { at: 0.75, level: 1 }],
  soft: 0.02,
  shade: '#6a6ab0',
  spec: 0.4,
  gloss: '#ffffff',
  rim: { width: 0.2, strength: 0.6, colour: '#ffe8c0' },
  outline: { width: 1.5, depth: 0.04, ink: 0.3, colour: '#ffffff', fade: [80, 400] },
}

function page(world: Record<string, unknown> = { cel3d: CEL }) {
  const plugins: any = {
    wire: { rows: [], scene: { world, prefabs: { engine: { width: 320, height: 200 }, render3d: { camera: { fov: 60, near: 0.15, far: 3000, at: [0, 2, 5], look: [0, 0, 0] } } } } },
    render3d: render3d(),
  }
  const me = cel3d()
  const frame = () => { me.tick(plugins); plugins.render3d.tick(plugins) }
  return { plugins, me, frame }
}

// A dressed material's fragment shader, as render3d's dress puts it together.
const fragment = (m: THREE.Material) => {
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <lights_fragment_end>' }
  m.onBeforeCompile(shader as any, undefined as any)
  return shader.fragmentShader
}

test('every dressed material takes the bands, the shade, the hard highlight and the rim after the light is added up, once render3d has a camera', () => {
  const { plugins, frame } = page()
  const pass = vi.spyOn(plugins.render3d, 'pass')
  const before = plugins.render3d.dress(new THREE.MeshStandardMaterial())
  frame()
  // The first frame render3d had no camera yet: nothing is handed over till the next.
  expect(pass).not.toHaveBeenCalled()
  frame()
  expect(pass).toHaveBeenCalledTimes(1)
  frame()
  expect(pass).toHaveBeenCalledTimes(1)
  for (const m of [before, plugins.render3d.dress(new THREE.MeshLambertMaterial())]) {
    const glsl = fragment(m)
    const after = glsl.slice(glsl.indexOf('#include <lights_fragment_end>'))
    expect(after).toContain('for (int i = 0; i < NUM_DIR_LIGHTS; i++) celL += directionalLights[i].color;')
    expect(after).toContain('float celLevel = 0.250000 + 0.450000 * smoothstep(0.280000, 0.320000, celLit) + 0.300000 * smoothstep(0.730000, 0.770000, celLit);')
    expect(after).toContain('reflectedLight.directDiffuse = celL * celAlbedo * celLevel;')
    const shade = new THREE.Color('#6a6ab0')
    expect(after).toContain(`reflectedLight.indirectDiffuse *= mix(vec3(${shade.r.toFixed(6)}, ${shade.g.toFixed(6)}, ${shade.b.toFixed(6)}), vec3(1.0), clamp(celLevel, 0.0, 1.0));`)
    expect(after).toContain('smoothstep(0.380000, 0.420000, celSpec)')
    expect(after).toContain('smoothstep(0.780000, 0.820000, 1.0 - max(dot(normal, geometryViewDir), 0.0))')
    expect(after).toContain('* 0.600000 * celRim;')
  }
})

test('with no rim the splice draws none, and with no outline there is no pass', () => {
  const { plugins, frame } = page({ cel3d: { ...CEL, rim: undefined, outline: undefined } })
  const pass = vi.spyOn(plugins.render3d, 'pass')
  frame()
  frame()
  expect(pass).not.toHaveBeenCalled()
  expect(fragment(plugins.render3d.dress(new THREE.MeshStandardMaterial()))).not.toContain('celRim')
})

test('a cel3d it cannot draw throws on its first tick, naming what is wrong', () => {
  const bad = (cel: unknown) => { const { frame } = page({ cel3d: cel }); frame(); return frame }
  expect(bad(undefined)).toThrow('the scene names cel3d but gives no world.cel3d')
  expect(bad({ ...CEL, bands: [{ at: 0.1, level: 1 }] })).toThrow('cel3d bands start with one at 0')
  expect(bad({ ...CEL, bands: [{ at: 0, level: 0.3 }, { at: 0.5, level: 0.6 }, { at: 0.5, level: 1 }] })).toThrow('cel3d band 2 is at 0.5, not above band 1\'s 0.5')
  expect(bad({ ...CEL, soft: -1 })).toThrow('cel3d soft -1 is below 0')
  expect(bad({ ...CEL, rim: { ...CEL.rim!, width: 1 } })).toThrow('cel3d rim width 1 is not between 0 and 1')
  expect(bad({ ...CEL, outline: { ...CEL.outline!, width: 0 } })).toThrow('cel3d outline width 0 is not above 0')
  expect(bad({ ...CEL, outline: { ...CEL.outline!, fade: [400, 80] } })).toThrow('cel3d outline fade [400,80] is not [near, far], near below far')
  expect(() => cel3d().tick({ wire: { scene: { world: { cel3d: CEL } } } } as any)).toThrow('cel3d needs render3d, which this scene does not name')
})

test('the outline pass reads the frame and the depth render3d hands it, with the camera\'s near and far, and draws into the next target or the canvas', () => {
  const camera = new THREE.PerspectiveCamera(60, 1.6, 0.15, 3000)
  const pass = new Outline(camera, CEL.outline!, THREE)
  pass.setSize(640, 400)
  const drawn: { target: unknown; material: unknown }[] = []
  let target: unknown = 'none'
  const renderer = { setRenderTarget: (t: unknown) => { target = t }, render: (mesh: THREE.Mesh) => drawn.push({ target, material: mesh.material }) } as unknown as THREE.WebGLRenderer
  const read = new THREE.WebGLRenderTarget(640, 400), write = new THREE.WebGLRenderTarget(640, 400)
  const depth = new THREE.DepthTexture(640, 400)
  pass.depth = depth
  camera.far = 2500
  pass.render(renderer, write, read)
  const u = pass.material.uniforms
  expect([u.tColor.value, u.tDepth.value, u.cameraNear.value, u.cameraFar.value]).toEqual([read.texture, depth, 0.15, 2500])
  expect(u.resolution.value.toArray()).toEqual([640, 400])
  expect(drawn).toEqual([{ target: write, material: pass.material }])
  pass.renderToScreen = true
  pass.render(renderer, write, read)
  expect(drawn[1].target).toBeNull()
  const glsl = pass.material.fragmentShader
  expect(glsl).toContain('vec2 px = 1.500000 / resolution;')
  expect(glsl).toContain('smoothstep(0.040000, 0.080000, edge) * (1.0 - smoothstep(80.000000, 400.000000, 1.0 / m))')
  expect(glsl).toContain('c.rgb * 0.300000 * vec3(1.000000, 1.000000, 1.000000)')
  const freed = vi.fn()
  pass.material.addEventListener('dispose', freed)
  pass.dispose()
  expect(freed).toHaveBeenCalledTimes(1)
})
