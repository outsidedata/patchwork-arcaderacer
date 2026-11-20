// lights3d's shadows: the lights that cast one given tiles of the atlases, nearest first while the tiles last; each
// light new to its tiles drawn once into the still atlas from what never moves, within the budget; each face whose view
// holds something moving drawn each frame into the moving atlas from what moves alone; and each tile's matrices
// written (step 2 of `lights3d.plugin.ts`, its `shadows`).
import type * as THREE from 'three'
import { MATRIX, ROW } from './lights3d.glsl.ts'
import { farOf, isRect, nearOf, room, type Ctx, type Light } from './lights3d.lights.ts'

// A point light's six faces: the way each looks, and its up.
const FACES: [number, number, number, number, number, number][] = [
  [1, 0, 0, 0, 1, 0], [-1, 0, 0, 0, 1, 0], [0, 1, 0, 0, 0, 1], [0, -1, 0, 0, 0, -1], [0, 0, 1, 0, 1, 0], [0, 0, -1, 0, 1, 0],
]

export function makeShadows(ctx: Ctx) {
  // The tiles given last frame, and each tile's shadow camera, its projection times its view, so a
  // camera the probes capture through reads the same shadows.
  let lastGiven = new Map<Light, [number, number]>()
  const tileView: THREE.Matrix4[] = []
  // Each moving tile's shadow camera, drawn this frame, or none where nothing that moves was drawn in it.
  let movedView: (THREE.Matrix4 | undefined)[] = []

  // Each tile's matrices, from the view space of the camera the scene is drawn through to the tile's
  // clip space, in both atlases: the still tile's shadow camera, kept from when it was drawn, and the
  // moving tile's, from when it was drawn this frame, each times this camera's place. A moving tile with
  // nothing drawn in it this frame is given a matrix of zeros, which no point falls inside, so it shadows
  // nothing.
  function rematrix(camera: THREE.Camera) {
    const b = ctx.built, T = b.T
    let last = -1
    for (const [first, faces] of lastGiven.values()) last = Math.max(last, first + faces - 1)
    if (last < 0) return
    const clip = new T.Matrix4()
    const write = (key: 'tiles' | 'moved', uniform: string, views: (THREE.Matrix4 | undefined)[]) => {
      const tiles = room(ctx, key, uniform, MATRIX * Math.ceil((last + 1) / ROW))
      const td = tiles.image.data as Float32Array
      for (const [first, faces] of lastGiven.values()) {
        for (let t = first; t < first + faces; t++) {
          const view = views[t]
          if (view) clip.multiplyMatrices(view, camera.matrixWorld)
          else clip.elements.fill(0)
          const e = clip.elements, row = Math.floor(t / ROW) * MATRIX, col = t % ROW
          for (let c = 0; c < 4; c++) {
            const o = ((row + c) * ROW + col) * 4
            td[o] = e[c * 4]; td[o + 1] = e[c * 4 + 1]; td[o + 2] = e[c * 4 + 2]; td[o + 3] = e[c * 4 + 3]
          }
        }
      }
      tiles.needsUpdate = true
    }
    write('tiles', 'uLights3dTiles', tileView)
    write('moved', 'uLights3dMoved', movedView)
  }

  // The tiles each shadowed light holds, kept from frame to frame.
  const held = new Map<Light, { first: number; faces: number }>()
  // Each light's faces owed a drawing that the budget has not reached yet.
  const owed = new Map<Light, Set<number>>()

  // The tiles each shadowed light is given this frame, its first and how many, by step 2's order; the
  // tiles of each light new to its tiles drawn into the still atlas, once, from what never moves; each
  // face whose view holds something moving drawn into the moving atlas, from what moves alone; and
  // every tile's matrices written. Nothing that moves draws a still tile again.
  function shadows(renderer: THREE.WebGLRenderer, camera: THREE.Camera, found: Light[]) {
    const b = ctx.built, T = b.T, a = b.atlas
    if (ctx.capturing) {
      // the atlas as the last frame drew it, each tile's matrix from this camera's view space
      rematrix(camera)
      return lastGiven
    }
    const given = new Map<Light, [number, number]>()
    lastGiven = given
    ctx.me.shadowed = 0
    ctx.me.tiles = 0
    ctx.me.redrawn = 0
    ctx.me.moving = 0
    movedView = []
    if (!a) return given
    const frustum = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    const eye = new T.Vector3().setFromMatrixPosition(camera.matrixWorld)
    const at = new T.Vector3(), sphere = new T.Sphere()
    const wanted: { light: Light; near: number }[] = []
    for (const light of found) {
      if (!light.castShadow) continue
      at.setFromMatrixPosition(light.matrixWorld)
      sphere.set(at, farOf(ctx, light))
      if (!frustum.intersectsSphere(sphere)) continue
      wanted.push({ light, near: at.distanceTo(eye) - sphere.radius })
    }
    wanted.sort((p, q) => p.near - q.near)
    // the lights given tiles, nearest first, while the tiles last; a light no longer among them lets
    // its tiles go
    const room_ = a.across * a.across
    const chosen = new Set<Light>()
    let count = 0
    for (const { light } of wanted) {
      const faces = (light as THREE.SpotLight).isSpotLight || isRect(light) ? 1 : 6
      if (count + faces > room_) continue
      chosen.add(light)
      count += faces
    }
    for (const light of [...held.keys()]) if (!chosen.has(light)) held.delete(light)
    // each newly chosen light takes the first run of free tiles it fits; where the free tiles are too
    // broken up for it, every light is given its tiles afresh, and every one is drawn again
    const free = new Uint8Array(room_).fill(1)
    for (const h of held.values()) free.fill(0, h.first, h.first + h.faces)
    const run = (faces: number) => {
      for (let t = 0, n = 0; t < room_; t++) {
        n = free[t] ? n + 1 : 0
        if (n === faces) return t - faces + 1
      }
      return -1
    }
    const fresh = new Set<Light>()
    for (const light of chosen) {
      if (held.has(light)) continue
      const faces = (light as THREE.SpotLight).isSpotLight || isRect(light) ? 1 : 6
      let first = run(faces)
      if (first < 0) {
        held.clear()
        free.fill(1)
        for (const l of chosen) fresh.add(l)
        let next = 0
        for (const l of chosen) {
          const f = (l as THREE.SpotLight).isSpotLight || isRect(l) ? 1 : 6
          held.set(l, { first: next, faces: f })
          next += f
        }
        break
      }
      free.fill(0, first, first + faces)
      held.set(light, { first, faces })
      fresh.add(light)
    }
    for (const [light, h] of held) given.set(light, [h.first, h.faces])
    ctx.me.shadowed = given.size
    ctx.me.tiles = count
    if (!given.size) return given
    // the faces of each light owed a drawing, kept from frame to frame until drawn: every face of a
    // light new to its tiles, and nothing else
    for (const light of [...owed.keys()]) if (!held.has(light)) owed.delete(light)
    for (const [light, h] of held) {
      if (!fresh.has(light)) continue
      const faces = owed.get(light) ?? new Set<number>()
      for (let f = 0; f < h.faces; f++) faces.add(f)
      owed.set(light, faces)
    }
    // the faces drawn this frame, no more than the budget: a light never drawn first, so nothing new is
    // lit without its shadow for long, then the nearest the camera; the rest wait for the next frame
    const order = [...owed.keys()].sort((p, q) => {
      const np = tileView[held.get(p)!.first] === undefined ? 0 : 1, nq = tileView[held.get(q)!.first] === undefined ? 0 : 1
      if (np !== nq) return np - nq
      return at.setFromMatrixPosition(p.matrixWorld).distanceTo(eye) - at.setFromMatrixPosition(q.matrixWorld).distanceTo(eye)
    })
    const dirty = new Map<Light, number[]>()
    let room = a.settings.budget
    for (const light of order) {
      if (room <= 0) break
      const faces = [...owed.get(light)!].slice(0, room)
      dirty.set(light, faces)
      room -= faces.length
      const left = owed.get(light)!
      for (const f of faces) left.delete(f)
      if (!left.size) owed.delete(light)
    }
    ctx.me.owed = [...owed.values()].reduce((n, s) => n + s.size, 0)
    // the casters: what never moves, drawn into the still atlas, and what the plugin that moves it marks
    // moving (`userData.moving`), drawn into the moving one; what casts no shadow is hidden from both
    const still: THREE.Object3D[] = []
    const moving: THREE.Object3D[] = []
    const hidden: THREE.Object3D[] = []
    b.scene.traverseVisible(o => {
      if (!((o as THREE.Mesh).isMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints)) return
      if (!o.castShadow) hidden.push(o)
      else if (o.userData.moving === true) moving.push(o)
      else still.push(o)
    })
    // where each moving thing is, a sphere of the world; none for one drawn wherever it is (frustumCulled
    // false, crowd3d's people placed on the GPU), which is in reach of every light
    const spheres = moving.map(o => {
      if (!o.frustumCulled) return null
      const m = o as THREE.Mesh & { boundingSphere?: THREE.Sphere | null; computeBoundingSphere?: () => void }
      if (m.computeBoundingSphere && 'boundingSphere' in m) {
        if (!m.boundingSphere) m.computeBoundingSphere()
        return m.boundingSphere!.clone().applyMatrix4(o.matrixWorld)
      }
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere()
      return m.geometry.boundingSphere!.clone().applyMatrix4(o.matrixWorld)
    })
    // the lights a moving thing is in reach of, every face of each, whose moving tiles are drawn this
    // frame where the face's view holds one
    const reached = new Map<Light, number[]>()
    movedView = []
    if (moving.length) {
      for (const [light, h] of held) {
        at.setFromMatrixPosition(light.matrixWorld)
        sphere.set(at, farOf(ctx, light))
        if (!spheres.some(s => !s || s.intersectsSphere(sphere))) continue
        reached.set(light, Array.from({ length: h.faces }, (_, f) => f))
      }
    }
    if (!dirty.size && !reached.size) {
      rematrix(camera)
      return given
    }
    for (const o of hidden) o.visible = false
    // every caster drawn in its own distance material where it has one (`customDistanceMaterial`: a
    // mesh posed in its shader, crowd3d's people, is posed there too), else in lights3d's; each put back
    // after. Three fills a distance material's numbers from the light it is drawn for, so each is told
    // the light, and the light's shadow camera its near and far, before the light's tiles are drawn.
    const worn = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>()
    const own = new Set<THREE.Material>()
    for (const o of [...still, ...moving]) {
      const m = o as THREE.Mesh
      worn.set(o, m.material)
      const custom = m.customDistanceMaterial
      if (custom) own.add(custom)
      m.material = custom ?? a.material
    }
    const background = b.scene.background
    b.scene.background = null
    // the target the frame draws into, with its cube face and mip level, put back after: a cube camera
    // drawing its faces is drawing into one face of its target, and that face is lost without them
    const was = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), level = renderer.getActiveMipmapLevel()
    const clear = renderer.getClearColor(new T.Color()), alpha = renderer.getClearAlpha()
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.setClearColor(0xffffff, 1)
    a.target.scissorTest = true
    a.moving.scissorTest = true
    ctx.shadowing = true
    const cam = a.camera, tile = a.settings.tile, look = new T.Vector3()
    cam.layers.mask = camera.layers.mask
    const view = new T.Frustum()
    // each light's faces drawn into `target` from what is visible, each face's camera kept in `views`;
    // with `only`, a face whose view holds none of the spheres (a null one held by every view) is left
    // undrawn
    const pass = (target: THREE.WebGLRenderTarget, faces: Map<Light, number[]>, views: (THREE.Matrix4 | undefined)[], only?: (THREE.Sphere | null)[]) => {
      for (const [light, redraw] of faces) {
        const [first] = given.get(light)!
        at.setFromMatrixPosition(light.matrixWorld)
        const near = nearOf(ctx, light), far = farOf(ctx, light)
        a.material.uniforms.referencePosition.value.copy(at)
        a.material.uniforms.nearDistance.value = near
        a.material.uniforms.farDistance.value = far
        // a lamp's shadow camera, which three fills a distance material's numbers from; a rectangle has none
        if (!isRect(light)) {
          light.shadow.camera.near = near
          light.shadow.camera.far = far
          for (const m of own) (renderer.properties.get(m) as { light?: Light }).light = light
        }
        cam.near = near
        cam.far = far
        cam.position.copy(at)
        const spot = light as THREE.SpotLight
        for (const f of redraw) {
          if (isRect(light)) {
            // the way it shines, its own −z, an `angle` from its aim to its edge
            cam.fov = (2 * ctx.areas!.angle * 180) / Math.PI
            cam.up.set(0, 1, 0)
            look.set(0, 0, -1).transformDirection(light.matrixWorld).add(at)
            if (Math.abs(look.clone().sub(at).normalize().y) > 0.999) cam.up.set(0, 0, 1)
          } else if (spot.isSpotLight) {
            cam.fov = Math.min(170, (2 * spot.angle * 180) / Math.PI)
            cam.up.set(0, 1, 0)
            look.setFromMatrixPosition(spot.target.matrixWorld)
            if (Math.abs(look.clone().sub(at).normalize().y) > 0.999) cam.up.set(0, 0, 1)
          } else {
            const [lx, ly, lz, ux, uy, uz] = FACES[f]
            cam.fov = 90
            cam.up.set(ux, uy, uz)
            look.set(at.x + lx, at.y + ly, at.z + lz)
          }
          cam.lookAt(look)
          cam.updateProjectionMatrix()
          cam.updateMatrixWorld()
          const t = first + f
          const shot = new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
          if (only) {
            view.setFromProjectionMatrix(shot)
            if (!only.some(s => !s || view.intersectsSphere(s))) continue
          }
          const x = (t % a.across) * tile, y = Math.floor(t / a.across) * tile
          // the tile's square of the atlas, set on the target itself, which three draws into whole
          target.viewport.set(x, y, tile, tile)
          target.scissor.set(x, y, tile, tile)
          renderer.setRenderTarget(target)
          renderer.clear(true, true, false)
          renderer.render(b.scene, cam)
          // the tile's own camera, read by every frame's camera until it is drawn again
          views[t] = shot
        }
      }
    }
    try {
      // what never moves, into the still atlas, for the faces owed it
      if (dirty.size) {
        for (const o of moving) o.visible = false
        for (const redraw of dirty.values()) ctx.me.redrawn += redraw.length
        pass(a.target, dirty, tileView)
        for (const o of moving) o.visible = true
      }
      // what moves, into the moving atlas, for the faces whose view holds it
      if (reached.size) {
        for (const o of still) o.visible = false
        pass(a.moving, reached, movedView, spheres)
        for (const o of still) o.visible = true
        ctx.me.moving = movedView.filter(Boolean).length
      }
    } finally {
      for (const o of [...still, ...moving]) o.visible = true
      ctx.shadowing = false
      for (const o of hidden) o.visible = true
      for (const [o, m] of worn) (o as THREE.Mesh).material = m
      b.scene.background = background
      renderer.setClearColor(clear, alpha)
      renderer.setRenderTarget(was, face, level)
      renderer.autoClear = autoClear
    }
    rematrix(camera)
    return given
  }

  return { shadows }
}
