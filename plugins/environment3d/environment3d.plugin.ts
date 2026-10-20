// environment3d: the lights and the floor of a 3D scene. It has no row and no server half: its
// prefab is read off the scene, as `ui` reads its own, so the numbers reach every page once, in the
// scene file the page already has. Its first tick builds them on render3d's scene and never reads
// the prefab again. Each is built only when the prefab has one:
//   sun      a directional light of `color` and `power` shining from `at` toward the origin.
//            With `shadow` it casts one (below).
//   sky      a hemisphere light of `color` over `ground` at `power`.
//   ambient  an ambient light of `color` at `power`, the same from every side.
//   lights   more directional lights, each `{ at, color, power }` shining from its `at` toward the
//            origin and casting no shadow: a moon, a planet's shine, a bounce off a wall.
//   floor    a square of `size` in `color` lying on y = 0.
//
// The sun's shadow, `sun.shadow`: `{ map, half, near, far, distance, bias, normalBias }`, a map of
// `map` texels on a side covering a box `half` metres each way across the light, `near` to `far`
// along it from the light, which stands `distance` metres sunward of the box's centre. The centre
// is render3d's camera, snapped to whole texels (2·half/map) across the light so the shadow's edges
// do not crawl as it moves, and it is placed in this plugin's `afterTick`, after every actor and
// every plugin's tick has placed the camera; so a scene lists environment3d before render3d, whose
// `afterTick` draws, and after anything that places the camera in its own `afterTick`. Only what
// casts (`castShadow`) and receives (`receiveShadow`) a shadow takes part, and only with render3d's
// `shadows` on. Three's PCF shadow adds the bias to the receiver's depth with no reversed branch,
// while under reversed depth (render3d's `ao`) its map compares the other way, so there the light is
// handed −bias.
//
// It takes render3d out of `plugins`, never by importing it, because the scene it must build on is
// the one belonging to the client it is ticking for. `close` takes what it built off that scene and
// disposes it.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'

type Shadow = { map: number; half: number; near: number; far: number; distance: number; bias: number; normalBias: number }

export function environment3d() {
  let built = false
  let scene: THREE.Scene | undefined
  const lights: THREE.Light[] = []
  let ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial> | undefined
  let sunlit: { light: THREE.DirectionalLight; toward: THREE.Vector3; shadow: Shadow } | undefined
  return {
    tick(plugins: Plugins) {
      if (built) return
      const prefab = plugins.wire.scene.prefabs.environment3d
      if (!prefab) throw new Error('the scene names environment3d but gives no environment3d prefab')
      const render3d = plugins.render3d
      if (!render3d) throw new Error('environment3d needs render3d, which this scene does not name')
      const { THREE } = render3d as { THREE: typeof import('three') }
      const on: THREE.Scene = render3d.scene
      scene = on
      built = true
      const { sun, sky, ambient, floor } = prefab
      const directional = (l: { at: number[]; color: THREE.ColorRepresentation; power: number }) => {
        const light = new THREE.DirectionalLight(l.color, l.power)
        light.position.fromArray(l.at)
        lights.push(light)
        on.add(light)
        return light
      }
      if (sun) {
        const light = directional(sun)
        if (sun.shadow) {
          const sh: Shadow = sun.shadow
          light.castShadow = true
          light.shadow.mapSize.set(sh.map, sh.map)
          const cam = light.shadow.camera
          cam.left = cam.bottom = -sh.half
          cam.right = cam.top = sh.half
          cam.near = sh.near
          cam.far = sh.far
          cam.updateProjectionMatrix()
          light.shadow.normalBias = sh.normalBias
          on.add(light.target)
          sunlit = { light, toward: new THREE.Vector3().fromArray(sun.at).normalize(), shadow: sh }
        }
      }
      if (sky) {
        const light = new THREE.HemisphereLight(sky.color, sky.ground, sky.power)
        lights.push(light)
        on.add(light)
      }
      if (ambient) {
        const light = new THREE.AmbientLight(ambient.color, ambient.power)
        lights.push(light)
        on.add(light)
      }
      for (const l of prefab.lights ?? []) directional(l)
      if (floor) {
        ground = new THREE.Mesh(new THREE.PlaneGeometry(floor.size, floor.size), new THREE.MeshLambertMaterial({ color: floor.color }))
        ground.rotation.x = -Math.PI / 2
        on.add(ground)
      }
    },
    // The sun's shadow box, centred on the camera where it stands this frame.
    afterTick(plugins: Plugins) {
      const camera: THREE.Camera | undefined = plugins.render3d?.camera
      if (!sunlit || !camera) return
      const { light, toward, shadow: sh } = sunlit
      const { THREE } = plugins.render3d as { THREE: typeof import('three') }
      const renderer: THREE.WebGLRenderer | undefined = plugins.render3d.renderer
      const turned = !!renderer && renderer.state.buffers.depth.getReversed() && renderer.shadowMap.type === THREE.PCFShadowMap
      light.shadow.bias = turned ? -sh.bias : sh.bias
      camera.updateMatrixWorld()
      const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld)
      const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3()
      new THREE.Matrix4().lookAt(toward, new THREE.Vector3(), light.shadow.camera.up).extractBasis(X, Y, Z)
      const texel = (2 * sh.half) / sh.map
      const snap = (v: number) => Math.round(v / texel) * texel
      const centre = X.multiplyScalar(snap(eye.dot(X))).add(Y.multiplyScalar(snap(eye.dot(Y)))).add(Z.multiplyScalar(eye.dot(Z)))
      light.target.position.copy(centre)
      light.position.copy(centre).addScaledVector(toward, sh.distance)
      light.target.updateMatrixWorld()
    },
    close() {
      for (const light of lights.splice(0)) {
        scene?.remove(light)
        light.dispose()
      }
      if (sunlit) scene?.remove(sunlit.light.target)
      sunlit = undefined
      if (ground) {
        scene?.remove(ground)
        ground.geometry.dispose()
        ground.material.dispose()
        ground = undefined
      }
    },
  }
}
