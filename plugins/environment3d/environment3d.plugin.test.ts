// environment3d on scenes this test writes itself, built on a render3d with no canvas: the sun, the
// sky light, the ambient light, the other lights and the floor come from its prefab, each only when
// the prefab has one; the sun's shadow box follows render3d's camera; and `close` takes them off
// render3d's scene and disposes them.
import { expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { environment3d } from './environment3d.plugin.ts'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'

const full = {
  sun: { at: [5, 10, 4], color: '#ffeedd', power: 2 },
  sky: { color: 10469631, ground: 9075299, power: 0.7 },
  floor: { size: 21, color: 3949648 },
}
const built = (prefab: any) => {
  const plugins = { wire: { scene: { prefabs: { engine: { width: 800, height: 600 }, environment3d: prefab } }, rows: [] }, render3d: render3d() } as any
  const me = environment3d()
  me.tick(plugins)
  me.tick(plugins)
  return { me, scene: plugins.render3d.scene as THREE.Scene, plugins }
}

test('the sun, the sky light and the floor come from the prefab, built once', () => {
  const { scene, plugins } = built(full)
  expect(scene.children.map(o => o.type)).toEqual(['DirectionalLight', 'HemisphereLight', 'Mesh'])
  const [sun, sky, floor] = scene.children as [THREE.DirectionalLight, THREE.HemisphereLight, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial>]
  expect(sun.color.getHexString()).toBe('ffeedd')
  expect(sun.intensity).toBe(2)
  expect(sun.position.toArray()).toEqual([5, 10, 4])
  expect([sky.color.getHex(), sky.groundColor.getHex(), sky.intensity]).toEqual([10469631, 9075299, 0.7])
  expect([floor.geometry.parameters.width, floor.geometry.parameters.height]).toEqual([21, 21])
  expect(floor.material.color.getHex()).toBe(3949648)
  expect(floor.rotation.x).toBeCloseTo(-Math.PI / 2)
  // It places no camera: that is render3d's.
  expect(plugins.render3d.camera).toBeUndefined()
})

test('a piece the prefab does not give is not built', () => {
  const { scene } = built({ sun: full.sun, sky: full.sky })
  expect(scene.children.map(o => o.type)).toEqual(['DirectionalLight', 'HemisphereLight'])
  expect(built({}).scene.children).toEqual([])
  expect(() => environment3d().tick({ wire: { scene: { prefabs: {} } } } as any)).toThrow('the scene names environment3d but gives no environment3d prefab')
  expect(() => environment3d().tick({ wire: { scene: { prefabs: { environment3d: full } } } } as any)).toThrow('environment3d needs render3d, which this scene does not name')
})

test('close takes everything it built off the scene and disposes it', () => {
  const { me, scene } = built(full)
  const [sun, sky, floor] = scene.children as [THREE.DirectionalLight, THREE.HemisphereLight, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial>]
  const other = new THREE.Object3D()
  scene.add(other)
  const freed = [vi.spyOn(sun, 'dispose'), vi.spyOn(sun.shadow, 'dispose'), vi.spyOn(sky, 'dispose'), vi.spyOn(floor.geometry, 'dispose'), vi.spyOn(floor.material, 'dispose')]
  me.close()
  for (const f of freed) expect(f).toHaveBeenCalledTimes(1)
  expect(scene.children).toEqual([other])
})

test('the ambient light and each of the other lights come from the prefab, after the sun and the sky', () => {
  const { scene } = built({ ...full, ambient: { color: 0x2c3f5e, power: 0.75 }, lights: [{ at: [-1, 2, 60], color: 0x5b86c9, power: 1.5 }, { at: [0, -5, 0], color: 0xff0000, power: 0.2 }] })
  expect(scene.children.map(o => o.type)).toEqual(['DirectionalLight', 'HemisphereLight', 'AmbientLight', 'DirectionalLight', 'DirectionalLight', 'Mesh'])
  const [, , ambient, shine, under] = scene.children as [THREE.Light, THREE.Light, THREE.AmbientLight, THREE.DirectionalLight, THREE.DirectionalLight]
  expect([ambient.color.getHex(), ambient.intensity]).toEqual([0x2c3f5e, 0.75])
  expect([shine.color.getHex(), shine.intensity, shine.position.toArray(), shine.castShadow]).toEqual([0x5b86c9, 1.5, [-1, 2, 60], false])
  expect([under.color.getHex(), under.intensity]).toEqual([0xff0000, 0.2])
})

test('the sun\'s shadow box is the prefab\'s, centred on the camera snapped to whole texels across the light, with the light its distance sunward', () => {
  const shadow = { map: 2048, half: 260, near: 400, far: 1500, distance: 900, bias: -0.004, normalBias: 0.15 }
  const { me, scene, plugins } = built({ sun: { ...full.sun, at: [0.6, 0.46, -0.65], shadow } })
  const sun = scene.children.find(o => o.type === 'DirectionalLight') as THREE.DirectionalLight
  expect(sun.castShadow).toBe(true)
  expect(scene.children).toContain(sun.target)
  expect([sun.shadow.mapSize.x, sun.shadow.camera.left, sun.shadow.camera.right, sun.shadow.camera.top, sun.shadow.camera.bottom, sun.shadow.camera.near, sun.shadow.camera.far, sun.shadow.normalBias]).toEqual([2048, -260, 260, 260, -260, 400, 1500, 0.15])
  const toward = new THREE.Vector3(0.6, 0.46, -0.65).normalize()
  const texel = 520 / 2048
  for (const at of [[0, 0, 0], [5250.3, 945.1, 1876.7], [-37.2, 12.9, 400.04]]) {
    plugins.render3d.camera = new THREE.PerspectiveCamera()
    plugins.render3d.camera.position.fromArray(at)
    me.afterTick(plugins)
    expect(sun.shadow.bias).toBe(-0.004)
    const centre = sun.target.position
    // Along the light the centre is the camera's; across it, within half a texel of it, on whole texels.
    const off = centre.clone().sub(new THREE.Vector3().fromArray(at))
    expect(off.dot(toward)).toBeCloseTo(0, 6)
    expect(off.length()).toBeLessThanOrEqual(texel * Math.SQRT1_2 + 1e-9)
    expect(sun.position.clone().sub(centre).toArray().map(v => v / 900)).toEqual(toward.toArray().map(v => expect.closeTo(v, 9)))
  }
  const target = sun.target
  me.close()
  expect(scene.children).not.toContain(target)
})
