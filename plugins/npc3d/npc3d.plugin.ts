// npc3d, the browser half: what the NPCs sense and do, drawn on render3d's scene. Each view is on while
// its flag is true (a testbed turns them on; they start off):
//   cones   under every NPC (a row whose kind's definition gives `sight`) that looks at some kind (its
//           sight's `kinds` is not empty), two flat fans lying on the
//           ground where its feet stand, turned the way its eyes face (`eyes`, the way its body faces
//           turned by its head's `look`): its cone,
//           `range` metres out and `cone` degrees across, and fainter, its edge, made again when
//           those numbers change.
//   facts   for every row some NPC sees and is noticing or has noticed (its row's `noticing`), a ring
//           under its feet whose colour runs from AWARE to NOTICED as the most aware of them is of it;
//           and for every fact some NPC holds (its row's `facts`) from before this step, a dim ring at
//           its position, one for a fact many hold.
//   sounds  every sound on the `npc3d` row's ledger: a ring lying on the ground at its `position`, spreading
//           to its `loud` metres over its first SPREAD seconds and fading out over its `last`.
//   shots   every NPC's last shot (its row's `shot`), a line from where it left to where it ended, for
//           FLASH seconds after it was fired.
//   cards   over every NPC that chooses (its definition gives `behaviors`), at its definition's
//           `label` metres over its feet, the key it is doing (its row's `doing`).
//   routes  every NPC walking a route (its row's `route`, `npc3d.sim.ts`'s Routes): a line from its
//           feet through each place it has still to go to, each at its own height, a spline's along its
//           curve as shapes3d draws it, made again when the number of places changes.
// Each thing is made the first frame it is drawn and let go the first frame it is not. Where a row
// stands and faces is its body's (`bodyOf`, `npc3d.sim.ts`). A thing that goes with a row of a body
// that answers for any moment (`continuous`, a person's course) is placed at the moment render3d
// draws, `(n − 1 + between) × dt`, as crowd3d draws the person, with render3d's `userData.teleport`
// up so render3d does not draw it between the steps a second time; one that goes with a row of any
// other body (a walker) is placed where the step its row is of left it, `n × dt`, with the flag down,
// and render3d draws it between the steps as it draws that body; a thing that stands still (a sound,
// a place remembered, a shot) has the flag up, as a route's line does, its points written every frame. A fan's whole turn is set every frame. Listed
// before render3d.
import type * as THREE from 'three'
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import { bodyOf, eyes, type Fact, type Noticing, type Route, type Sound } from './npc3d.sim.ts'
import { drawn as pieced } from '#plugins/shapes3d/shapes3d.kinematics3d.ts'

// A ring's outer and inner radius, metres; how high the fans and rings lie over the feet, metres.
const RING = 0.55, HOLE = 0.42, LIFT = 0.02
// The colours: the cone, a row being noticed, and noticed; the fans' opacity, the edge's, a remembered
// ring's.
const CONE = '#3fa9ff', AWARE = '#ffd23f', NOTICED = '#ff3b3b', SOUND = '#c46bff', SHOT = '#fff2a8', ROUTE = '#ff8c1a'
const SHADE = 0.25, EDGE = 0.1, GHOST = 0.35
// Seconds a sound's ring takes to spread to its whole range, and the metres its edge is wide; seconds
// a shot's line is drawn.
const SPREAD = 0.6, BAND = 0.15, FLASH = 0.08
// A card's canvas: its width and height, and the metres of the world a pixel spans.
const WIDE = 256, HIGH = 56, METRE = 0.8 / WIDE

type Fan = { cone: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>; edge: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>; shape: string }
type Ring = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
type Line = THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
type Card = { sprite: THREE.Sprite; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; shows: string }

export function npc3d() {
  const fans = new Map<number, Fan>()
  const marks = new Map<string, Ring>()
  const rings = new Map<number, Ring>()
  const lines = new Map<number, Line>()
  const cards = new Map<number, Card>()
  const paths = new Map<number, Line>()
  // Up, which a fan turns about, made the first frame.
  let up: THREE.Vector3 | undefined

  // A thing put on render3d's scene, placed by this plugin at the moment drawn and never between.
  const put = <O extends THREE.Object3D>(plugins: Plugins, o: O): O => {
    o.userData.teleport = true
    plugins.render3d.scene.add(o)
    return o
  }

  const gone = (plugins: Plugins, o: THREE.Mesh | THREE.Line | THREE.Sprite) => {
    plugins.render3d.scene.remove(o)
    if ('geometry' in o) o.geometry.dispose()
    ;(o.material as THREE.Material).dispose()
  }

  // A fan `range` metres out and `cone` degrees across, centred on +z, lying flat: three's circle is
  // drawn from +x toward +y, which lies toward −z once it is turned down, so +z is −π/2.
  function fanGeometry(T: typeof THREE, cone: number, range: number) {
    const across = (Math.min(cone, 360) * Math.PI) / 180
    const g = new T.CircleGeometry(range, 64, -Math.PI / 2 - across / 2, across)
    g.rotateX(-Math.PI / 2)
    return g
  }

  function ring(plugins: Plugins, colour: string, opacity: number): Ring {
    const T = plugins.render3d.THREE as typeof THREE
    const r = new T.Mesh(new T.RingGeometry(HOLE, RING, 40), new T.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false }))
    r.rotateX(-Math.PI / 2)
    return put(plugins, r)
  }

  function drawCard(T: typeof THREE, card: Card, text: string) {
    card.canvas.width = WIDE
    card.canvas.height = HIGH
    const g = card.canvas.getContext('2d')!
    g.fillStyle = 'rgba(10, 8, 16, 0.75)'
    g.fillRect(0, 0, WIDE, HIGH)
    g.fillStyle = '#f2ecff'
    g.font = 'bold 36px monospace'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, WIDE / 2, HIGH / 2 + 2)
    card.texture.dispose()
    card.texture = new T.CanvasTexture(card.canvas)
    ;(card.sprite.material as THREE.SpriteMaterial).map = card.texture
    ;(card.sprite.material as THREE.SpriteMaterial).needsUpdate = true
    card.sprite.scale.set(WIDE * METRE, HIGH * METRE, 1)
    card.sprite.center.set(0.5, 0)
  }

  const me = {
    cones: false,
    facts: false,
    sounds: false,
    shots: false,
    cards: false,
    routes: false,
    tick(plugins: Plugins) {
      const wire = plugins.wire
      const T = plugins.render3d.THREE as typeof THREE
      const defs = json(wire, wire.scene.world!.defs)
      // The moment render3d draws, and the time of the step the rows are of.
      const dt = wire.scene.prefabs.engine.dt
      const drawn = (wire.between === undefined ? wire.n : wire.n - 1 + wire.between) * dt
      const time = wire.n * dt
      const rows = wire.rows as Row[]
      const byId = new Map(rows.map(r => [r.id, r]))
      // The time `o`, which goes with `row`, is placed at: the moment drawn, with render3d's teleport
      // up, for a body that answers for any moment; the step's, eased by render3d, for any other.
      const follow = (o: THREE.Object3D, row: Row) => {
        const continuous = bodyOf(row.kind, defs[row.kind]).continuous
        o.userData.teleport = continuous
        return continuous ? drawn : time
      }
      const where = (o: THREE.Object3D, row: Row) => bodyOf(row.kind, defs[row.kind]).where(row, follow(o, row))
      const npcs = rows.filter(r => defs[r.kind]?.sight)

      const fanned = new Set<number>()
      if (me.cones) for (const row of npcs) {
        const s = defs[row.kind].sight
        if (!s.kinds.length) continue
        const shape = JSON.stringify([s.cone, s.range, s.edge?.cone ?? 0, s.edge?.range ?? 0])
        fanned.add(row.id)
        let fan = fans.get(row.id)
        if (fan && fan.shape !== shape) {
          gone(plugins, fan.cone)
          gone(plugins, fan.edge)
          fan = undefined
        }
        if (!fan) {
          const cone = new T.Mesh(fanGeometry(T, s.cone, s.range), new T.MeshBasicMaterial({ color: CONE, transparent: true, opacity: SHADE, depthWrite: false }))
          const edge = new T.Mesh(fanGeometry(T, s.edge?.cone ?? 0, s.edge?.range ?? 0), new T.MeshBasicMaterial({ color: CONE, transparent: true, opacity: EDGE, depthWrite: false }))
          fan = { cone: put(plugins, cone), edge: put(plugins, edge), shape }
          fans.set(row.id, fan)
        }
        const body = bodyOf(row.kind, defs[row.kind])
        const at = follow(fan.cone, row)
        follow(fan.edge, row)
        const [x, y, z] = body.where(row, at)
        const look = eyes(row, body, at)
        for (const m of [fan.cone, fan.edge]) {
          m.position.set(x, y + LIFT, z)
          // The whole turn, every frame: render3d turns a walker's fan between the steps by writing
          // its quaternion, and three reads a turn past a quarter back as a half turn on x and z, so a
          // fan given its y alone would be drawn upside down.
          m.quaternion.setFromAxisAngle(up ??= new T.Vector3(0, 1, 0), look)
        }
        fan.edge.position.y = y + LIFT / 2
      }
      for (const id of [...fans.keys()]) if (!fanned.has(id)) {
        gone(plugins, fans.get(id)!.cone)
        gone(plugins, fans.get(id)!.edge)
        fans.delete(id)
      }

      // Each row seen: the most any NPC seeing it is aware of it; and each fact held from before this
      // step, once however many hold it.
      const marked = new Set<string>()
      if (me.facts) {
        const seen = new Map<number, number>()
        const held = new Map<string, Fact>()
        for (const row of npcs) {
          for (const [key, it] of Object.entries(row.data.noticing as Record<string, Noticing>)) {
            const id = Number(key)
            if (row.data.seen.includes(id)) seen.set(id, Math.max(seen.get(id) ?? 0, it.aware))
          }
          for (const f of row.data.facts as Fact[]) if (time - f.time > dt / 2) held.set(`${f.type} ${f.time} ${f.position.join(' ')}`, f)
        }
        for (const [id, aware] of seen) {
          const row = byId.get(id)
          if (!row) continue
          const key = `seen ${id}`
          marked.add(key)
          let r = marks.get(key)
          if (!r) marks.set(key, r = ring(plugins, AWARE, 0.9))
          r.material.color.set(AWARE).lerp(new T.Color(NOTICED), aware)
          const [x, y, z] = where(r, row)
          r.position.set(x, y + LIFT * 2, z)
        }
        for (const [name, f] of held) {
          const key = `fact ${name}`
          marked.add(key)
          let r = marks.get(key)
          if (!r) marks.set(key, r = ring(plugins, NOTICED, GHOST))
          r.position.set(f.position[0], f.position[1] + LIFT * 2, f.position[2])
        }
      }
      for (const key of [...marks.keys()]) if (!marked.has(key)) {
        gone(plugins, marks.get(key)!)
        marks.delete(key)
      }

      const live = new Set<number>()
      if (me.sounds) {
        const ledger = rows.find(r => r.kind === 'npc3d')
        for (const s of (ledger?.data.sounds ?? []) as Sound[]) {
          live.add(s.id)
          let r = rings.get(s.id)
          if (!r) {
            r = new T.Mesh(new T.RingGeometry(1 - BAND / s.loud, 1, 64), new T.MeshBasicMaterial({ color: SOUND, transparent: true, depthWrite: false, side: T.DoubleSide }))
            r.rotateX(-Math.PI / 2)
            r.position.set(s.position[0], s.position[1] + LIFT * 1.5, s.position[2])
            rings.set(s.id, put(plugins, r))
          }
          const age = Math.max(0, drawn - s.time)
          const reach = Math.max(0.001, s.loud * Math.min(1, age / SPREAD))
          r.scale.set(reach, reach, 1)
          r.material.opacity = Math.max(0, 1 - age / s.last)
        }
      }
      for (const id of [...rings.keys()]) if (!live.has(id)) {
        gone(plugins, rings.get(id)!)
        rings.delete(id)
      }

      const shot = new Set<number>()
      if (me.shots) for (const row of npcs) {
        const s = row.data.shot
        if (!s || drawn - s.time > FLASH) continue
        shot.add(row.id)
        let line = lines.get(row.id)
        if (!line) {
          line = put(plugins, new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: SHOT })))
          lines.set(row.id, line)
        }
        line.geometry.setFromPoints([new T.Vector3(...s.from), new T.Vector3(...s.to)])
      }
      for (const id of [...lines.keys()]) if (!shot.has(id)) {
        gone(plugins, lines.get(id)!)
        lines.delete(id)
      }

      const carded = new Set<number>()
      if (me.cards) for (const row of npcs) {
        const k = defs[row.kind]
        if (!k.behaviors || !row.data.doing) continue
        carded.add(row.id)
        let card = cards.get(row.id)
        if (!card) {
          const canvas = document.createElement('canvas')
          const texture = new T.CanvasTexture(canvas)
          card = { sprite: put(plugins, new T.Sprite(new T.SpriteMaterial({ map: texture, depthWrite: false }))), canvas, texture, shows: '' }
          cards.set(row.id, card)
        }
        if (card.shows !== row.data.doing) {
          card.shows = row.data.doing
          drawCard(T, card, row.data.doing)
        }
        const [x, y, z] = where(card.sprite, row)
        card.sprite.position.set(x, y + k.label, z)
      }
      for (const id of [...cards.keys()]) if (!carded.has(id)) {
        const card = cards.get(id)!
        card.texture.dispose()
        gone(plugins, card.sprite)
        cards.delete(id)
      }

      const routed = new Set<number>()
      if (me.routes) for (const row of npcs) {
        const r: Route | null = row.data.route
        if (!r) continue
        routed.add(row.id)
        let line = paths.get(row.id)
        // Each place to go to, a spline's along its curve as shapes3d draws it.
        const ahead = r.points.slice(r.leg).flatMap(l => (Array.isArray(l) ? [l] : 'spline' in l ? pieced(l.spline).pts.slice(1) : [l.at]))
        const count = 1 + ahead.length
        if (line && line.geometry.getAttribute('position').count !== count) {
          gone(plugins, line)
          line = undefined
        }
        if (!line) {
          line = put(plugins, new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: ROUTE })))
          paths.set(row.id, line)
        }
        const [x, y, z] = where(line, row)
        // The line's points are written where they are every frame, so render3d never eases it.
        line.userData.teleport = true
        const lift = LIFT * 3
        line.geometry.setFromPoints([new T.Vector3(x, y + lift, z), ...ahead.map(p => new T.Vector3(p[0], p[1] + lift, p[2]))])
        line.geometry.getAttribute('position').needsUpdate = true
        line.geometry.computeBoundingSphere()
      }
      for (const id of [...paths.keys()]) if (!routed.has(id)) {
        gone(plugins, paths.get(id)!)
        paths.delete(id)
      }
    },
    close(plugins: Plugins) {
      for (const fan of fans.values()) {
        gone(plugins, fan.cone)
        gone(plugins, fan.edge)
      }
      for (const r of marks.values()) gone(plugins, r)
      for (const r of rings.values()) gone(plugins, r)
      for (const l of lines.values()) gone(plugins, l)
      for (const c of cards.values()) {
        c.texture.dispose()
        gone(plugins, c.sprite)
      }
      for (const l of paths.values()) gone(plugins, l)
      paths.clear()
      fans.clear()
      marks.clear()
      rings.clear()
      lines.clear()
      cards.clear()
    },
  }
  return me
}
