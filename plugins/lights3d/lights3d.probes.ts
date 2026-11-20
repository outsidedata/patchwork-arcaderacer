// lights3d's probes: the scene captured round each place into a cube, lit by every lamp with its shadow,
// prefiltered as three prefilters an envMap and packed into one texture array, a face at a time when `refresh` asks
// (`lights3d.plugin.ts` says how a scene gives them, `world.lights3d.probes`; `lights3d.glsl.ts` their shader code).
import type * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import type { Probes } from './lights3d.plugin.ts'
import { PROBE, PROBE_MAPS } from './lights3d.glsl.ts'
import type { Ctx } from './lights3d.lights.ts'

// The probes made for `settings`: their uniforms put on the shared ones and their shader code handed back for the
// splice, the cubes they are drawn into, the camera, the prefilter, the array they are packed in and the quad that
// packs them; whether they have been captured since asked, and the frames drawn since.
export function makeProbes(ctx: Ctx, p: Probes) {
  const T = ctx.built.T
  const stand = new T.DataArrayTexture(new Uint8Array(4), 1, 1, 1)
  stand.needsUpdate = true
  const cubes = p.places.map(() => new T.WebGLCubeRenderTarget(p.size, { type: T.HalfFloatType, generateMipmaps: false }))
  const copy = new T.ShaderMaterial({
    uniforms: { src: { value: null } },
    vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D src;\nvarying vec2 vUv;\nvoid main() { gl_FragColor = texture2D(src, vUv); }',
    depthTest: false,
    depthWrite: false,
  })
  const probes: {
    settings: Probes
    cubes: THREE.WebGLCubeRenderTarget[]
    camera: THREE.CubeCamera
    // the probe and the face `refresh` draws next
    next: [number, number]
    pmrem?: THREE.PMREMGenerator
    array?: THREE.WebGLArrayRenderTarget
    copy: THREE.ShaderMaterial
    quad: FullScreenQuad
    blank: THREE.DataArrayTexture
    captured: boolean
    frames: number
  } = { settings: p, cubes, camera: new T.CubeCamera(p.near, p.far, cubes[0]), next: [0, 0], copy, quad: new FullScreenQuad(copy), blank: stand, captured: false, frames: 0 }
  const v3 = (a: number[]) => new T.Vector3(a[0], a[1], a[2])
  Object.assign(ctx.uniforms, {
    uLights3dProbes: { value: stand },
    uLights3dProbesOn: { value: 0 },
    uLights3dProbeIntensity: { value: p.intensity },
    uLights3dProbeAt: { value: p.places.map(q => v3(q.at)) },
    uLights3dProbeLo: { value: p.places.map(q => v3(q.box.slice(0, 3))) },
    uLights3dProbeHi: { value: p.places.map(q => v3(q.box.slice(3))) },
  })

  // One face of probe `i`'s cube drawn: the scene round its point, lit by every lamp with its shadow
  // and with no probe's light, through the cube camera's face `f` (three's own faces and their -90°
  // field of view, set for the renderer's coordinate system the first time).
  function face(renderer: THREE.WebGLRenderer, i: number, f: number) {
    const p = probes, b = ctx.built
    const at = p.settings.places[i].at
    if (p.camera.coordinateSystem !== renderer.coordinateSystem) {
      p.camera.coordinateSystem = renderer.coordinateSystem
      p.camera.updateCoordinateSystem()
    }
    p.camera.position.set(at[0], at[1], at[2])
    p.camera.updateMatrixWorld()
    renderer.setRenderTarget(p.cubes[i], f)
    renderer.render(b.scene, p.camera.children[f] as THREE.Camera)
  }

  // Probe `i`'s cube prefiltered as three prefilters an envMap (its PMREM) and copied into its layer of
  // the array, the array made the size of the prefiltered picture the first time.
  function pack(renderer: THREE.WebGLRenderer, i: number) {
    const p = probes, T = ctx.built.T
    p.pmrem ??= new T.PMREMGenerator(renderer)
    const filtered = p.pmrem.fromCubemap(p.cubes[i].texture)
    if (!p.array) {
      p.array = new T.WebGLArrayRenderTarget(filtered.width, filtered.height, p.settings.places.length, { type: T.HalfFloatType, minFilter: T.LinearFilter, magFilter: T.LinearFilter, generateMipmaps: false, depthBuffer: false })
    }
    p.copy.uniforms.src.value = filtered.texture
    renderer.setRenderTarget(p.array, i)
    p.quad.render(renderer)
    filtered.dispose()
    ctx.me.packed++
  }

  // Draws as a probe is drawn: `capturing` set, so the scene is lit by the shadows the last frame drew
  // and no probe captures again, the probes' light off, and the frame's own target put back after.
  function probing(renderer: THREE.WebGLRenderer, work: () => void) {
    const was = renderer.getRenderTarget(), cubeFace = renderer.getActiveCubeFace(), level = renderer.getActiveMipmapLevel()
    ctx.capturing = true
    ctx.uniforms.uLights3dProbesOn.value = 0
    try {
      work()
    } finally {
      ctx.capturing = false
      renderer.setRenderTarget(was, cubeFace, level)
    }
    if (probes.array) {
      ctx.uniforms.uLights3dProbes.value = probes.array.texture
      ctx.uniforms.uLights3dProbesOn.value = 1
    }
  }

  // Every probe captured whole: its six faces, then its picture packed.
  function capture(renderer: THREE.WebGLRenderer) {
    const p = probes
    probing(renderer, () => {
      p.settings.places.forEach((_, i) => {
        for (let f = 0; f < 6; f++) face(renderer, i, f)
        pack(renderer, i)
      })
    })
    p.captured = true
    p.next = [0, 0]
    ctx.me.captures++
  }

  // `refresh` faces drawn again, going round every probe's six faces in turn, each probe's picture
  // packed again as its sixth face is drawn, so what moves shows in the reflections a round late.
  function refresh(renderer: THREE.WebGLRenderer) {
    const p = probes
    probing(renderer, () => {
      for (let k = 0; k < p.settings.refresh; k++) {
        const [i, f] = p.next
        face(renderer, i, f)
        if (f === 5) pack(renderer, i)
        p.next = f === 5 ? [(i + 1) % p.settings.places.length, 0] : [i, f + 1]
      }
    })
  }

  return {
    // the shader code the splice adds: the probes' own after `common`, their light where three's envMap light goes
    common: PROBE(p.places.length, p.size),
    maps: PROBE_MAPS,
    // Before the frame is lit: captured from the second frame on, once what the scene holds has been put in it, and
    // again after each `capture()`; with `refresh`, faces drawn again every frame after.
    before(renderer: THREE.WebGLRenderer) {
      if (ctx.capturing) return
      if (!probes.captured) { if (probes.frames++ >= 2) capture(renderer) }
      else if (probes.settings.refresh > 0) refresh(renderer)
    },
    // Captured again before the next frame.
    again() { probes.captured = false },
    dispose() {
      for (const c of probes.cubes) c.dispose()
      probes.pmrem?.dispose()
      probes.array?.dispose()
      probes.copy.dispose()
      probes.quad.dispose()
      probes.blank.dispose()
    },
  }
}
