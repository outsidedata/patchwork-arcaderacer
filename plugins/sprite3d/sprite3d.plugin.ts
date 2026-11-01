// Rows drawn as sprites: every row of a kind the table lists is a plane showing a frame of a sprite
// sheet (`plugins/loader`, type `sheet`), upright and turned about y to face the camera, a billboard
// that stands on the floor. It has no row: the table is the scene's `world.sprite3d`, read off the
// scene, which the rules of a kind read too (below); a scene the manager starts takes the manager's
// `world.sprite3d` when it gives none of its own.
//
// The table: `ppm`, pixels of a sheet per metre; `alphaTest`; and `kinds`, for each kind drawn,
// its `turn`, the facing of a whole turn.
//
// A kind whose every row looks one way gives that look once, in its entry of the table: `sheet`,
// `clip` and `facing`, any of the three, read there for every row of it and never sent, a monster's
// sheet say. Its rule reads them there too, as `w.world.sprite3d.kinds.<kind>`. A field its entry
// gives is read from the entry and one it does not from the row (`look`), and a row carrying a field
// its entry gives throws, naming both, so a field is only ever in one of the two places.
//
// A row of such a kind carries, where its entry does not give them, `sheet`, the loader name of its
// sheet; `clip`, the clip it plays, or
// null while it shows nothing yet, as a row whose rule picks its clip on its first step does in the
// packet a page is sent before that step; `frame`, the frame of that clip it shows, which its rule
// sets; `facing`, the way it heads, `facing` × a whole turn / `turn` counter-clockwise from +x seen
// from above; and `pos`. The run of the clip drawn is the one the camera sees. A sheet's runs face
// ways on the screen (`loader.sim.ts`), and a thing seen from in front faces down the screen, out at
// the viewer, and seen from a camera a quarter turn round to its left faces left: so eight rotations
// drawn 1 to 8, the camera an eighth of a turn further round to the thing's left for each, are runs
// facing from 3/4 of a turn by −1/8. A run the sheet mirrors is drawn flipped, and a clip of one run
// on a sheet that mirrors nothing is drawn the same from every side. The frame's anchor stands on
// `pos`, the frame `ppm` pixels to the metre: a monster's feet on the floor, a rocket's middle on its
// path. The plane spans the pixels the sheet kept, where they were in the whole frame, so a trimmed
// frame stands where it would untrimmed.
//
// The planes are placed in `afterTick`, after every actor has ticked, so a sprite faces the camera
// the seat's own actor moved this frame, and so this plugin is listed before `render3d`, whose
// `afterTick` draws; listed after it, every sprite would be drawn facing last frame's camera, and
// that throws. A sprite whose sheet the loader has not handed over yet is hidden, and its sheet is
// asked for. A row that ends takes its sprite with it, and `close` frees every plane and material;
// the sheets are the loader's and stay.
import type { Plugins } from '#engine/browser.ts'

export type Look = { sheet: string; clip: string | null; facing: number }
export type Spec = { turn: number } & Partial<Look>
export type Table = { ppm: number; alphaTest: number; kinds: Record<string, Spec> }

// A row's sheet, clip and facing: each from its kind's entry where the entry gives it, else the
// row's; a row carrying one its entry gives throws.
export function look(spec: Spec, row: { id: number; kind: string; data: Record<string, any> }): Look {
  const one = <K extends keyof Look>(k: K): Look[K] => {
    if (spec[k] === undefined) return row.data[k]
    if (k in row.data) throw new Error(`${row.kind} ${row.id} carries ${k}, which world.sprite3d gives for every ${row.kind}`)
    return spec[k] as Look[K]
  }
  return { sheet: one('sheet'), clip: one('clip'), facing: one('facing') }
}

// How far round to a thing's left, in turns, a camera at x, z stands, for a thing at `pos` heading
// `ahead` radians counter-clockwise from +x seen from above.
export function round(ahead: number, pos: number[], x: number, z: number): number {
  const toward = Math.atan2(-(z - pos[2]), x - pos[0])
  return (toward - ahead) / (2 * Math.PI)
}

export function sprite3d() {
  const drawn = new Map<number, any>()
  const materials = new Map<any, any>() // a page to the material that draws it

  const material = (plugins: Plugins, table: Table, page: any) => {
    const { THREE } = plugins.render3d
    let m = materials.get(page)
    if (!m) materials.set(page, (m = new THREE.MeshBasicMaterial({ map: page, alphaTest: table.alphaTest })))
    return m
  }

  const drop = (plugins: Plugins, id: number) => {
    const mesh = drawn.get(id)
    plugins.render3d.scene.remove(mesh)
    mesh.geometry.dispose()
    drawn.delete(id)
  }

  return {
    afterTick(plugins: Plugins) {
      const { scene } = plugins.wire
      const table = scene.world?.sprite3d as Table | undefined
      if (!table) throw new Error('the scene names sprite3d but gives no world.sprite3d')
      const order = scene.plugins!
      if (order.indexOf('render3d') < order.indexOf('sprite3d'))
        throw new Error('sprite3d is listed after render3d, which would draw every sprite before it is turned')
      const { THREE, camera } = plugins.render3d
      // A sprite's turn is set whole, about y, so render3d blends it between the steps the short way.
      const up = new THREE.Vector3(0, 1, 0)
      const here = new Set<number>()
      for (const row of plugins.wire.rows) {
        const spec = table.kinds[row.kind]
        if (!spec) continue
        here.add(row.id)
        const d = row.data
        const { sheet: sheetName, clip, facing } = look(spec, row)
        let mesh = drawn.get(row.id)
        if (!mesh) {
          mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1))
          mesh.visible = false
          plugins.render3d.scene.add(mesh)
          drawn.set(row.id, mesh)
        }
        if (clip === null) {
          mesh.visible = false
          continue
        }
        const sheet = plugins.loader.get(sheetName)
        if (!sheet) {
          plugins.loader.load(sheetName)
          mesh.visible = false
          continue
        }
        const heading = (facing * 2 * Math.PI) / spec.turn
        const { run, mirror } = sheet.pick(clip, 0.75 - round(heading, d.pos, camera.position.x, camera.position.z))
        const f = sheet.frameOf(clip, run, d.frame)
        const page = sheet.pages[f.page]
        mesh.material = material(plugins, table, page)
        mesh.visible = true
        mesh.position.fromArray(d.pos)
        mesh.quaternion.setFromAxisAngle(up, Math.atan2(camera.position.x - d.pos[0], camera.position.z - d.pos[2]))
        // PlaneGeometry holds its corners top-left, top-right, bottom-left, bottom-right.
        const [tx, ty, tw, th] = f.trim, [ax, ay] = f.anchor, ppm = table.ppm
        const left = (tx - ax) / ppm, right = (tx + tw - ax) / ppm, top = (ay - ty) / ppm, bottom = (ay - ty - th) / ppm
        const corners = mesh.geometry.attributes.position
        corners.setXYZ(0, left, top, 0)
        corners.setXYZ(1, right, top, 0)
        corners.setXYZ(2, left, bottom, 0)
        corners.setXYZ(3, right, bottom, 0)
        corners.needsUpdate = true
        mesh.geometry.computeBoundingSphere()
        // The picture's corners in the same order; a mirrored frame is its picture read right to
        // left.
        const c = sheet.uv(f.id)
        const at = mirror ? [1, 0, 3, 2] : [0, 1, 2, 3]
        const uv = mesh.geometry.attributes.uv
        at.forEach((k, corner) => uv.setXY(corner, c[2 * k], c[2 * k + 1]))
        uv.needsUpdate = true
      }
      for (const id of [...drawn.keys()]) if (!here.has(id)) drop(plugins, id)
    },
    close(plugins: Plugins) {
      for (const id of [...drawn.keys()]) drop(plugins, id)
      for (const m of materials.values()) m.dispose()
      materials.clear()
    },
  }
}
