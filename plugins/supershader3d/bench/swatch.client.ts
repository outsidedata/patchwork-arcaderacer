// The swatch drawn: a floor 400 m square on y = 0, facing up, its uv in metres, every vertex tagged
// with the material the row names (`lookId`, and `lookInfo` the material, the row and part 0), drawn
// with supershader3d's material of that material's call; or, for `none`, a plain unlit grey
// (three's MeshBasicMaterial), the bench's baseline. The frame the row's `material` changes, the
// floor changes with it. A name the looks file does not hold throws, naming it.
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'

const SIDE = 400

let mesh: any
let flat: any
let worn: string | undefined

export function setup(_row: Row, plugins: Plugins) {
  const { THREE, scene } = plugins.render3d
  const geo = new THREE.PlaneGeometry(SIDE, SIDE)
  geo.rotateX(-Math.PI / 2)
  const uv = geo.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * SIDE, uv.getY(i) * SIDE)
  geo.setAttribute('lookId', new THREE.Float32BufferAttribute(new Float32Array(uv.count), 1))
  geo.setAttribute('lookInfo', new THREE.Float32BufferAttribute(new Float32Array(uv.count * 3), 3))
  flat = new THREE.MeshBasicMaterial({ color: 0x808080 })
  mesh = new THREE.Mesh(geo, flat)
  mesh.name = 'swatch'
  mesh.frustumCulled = false
  scene.add(mesh)
}

export function tick(row: Row, plugins: Plugins) {
  const name = row.data.material as string
  if (name === worn) return
  const s = plugins.supershader3d
  if (name === 'none') {
    mesh.material = flat
    worn = name
    return
  }
  const call = s.callOf(name), id = s.idOf(name)
  if (call === undefined || id === undefined) {
    if (!s.looks()) return
    throw new Error(`the swatch wears ${name}, which the looks file does not hold`)
  }
  const material = s.material(call)
  if (!material) return
  const ids = mesh.geometry.getAttribute('lookId'), info = mesh.geometry.getAttribute('lookInfo')
  for (let i = 0; i < ids.count; i++) { ids.setX(i, id); info.setXYZ(i, id, row.id, 0) }
  ids.needsUpdate = true
  info.needsUpdate = true
  mesh.material = material
  worn = name
}

export function remove(plugins: Plugins) {
  if (!mesh) return
  plugins.render3d.scene.remove(mesh)
  mesh.geometry.dispose()
  flat.dispose()
  mesh = undefined
  worn = undefined
}
