// mapgen: a level made from a recipe and a seed. A scene is a tiled environment and actors, and
// mapgen makes both, from one set of rules: the room it carves is tiles of the map, and the chest,
// the door and the torch it puts in that room are actors. It has a server half only, and it is a
// library: whoever makes a level calls `build` and writes what comes back as the scene's two parts,
// a Tiled map (`.tmj`) and a list of `actors` entries, which the scene then loads as it would a map
// and actors drawn by hand. mapgen has no row and exports no Kind. It keeps nothing between calls
// and has no numbers of its own: every number is in the recipe, a data file of the game's, and the
// art is the theme's, a Tiled tileset; the caller reads both, and the set pieces, and hands them in.
//
// `build(die, recipe, theme, source, pieces)` → `{ map, actors, roles }`. `die` is a function
// handing out numbers in [0, 1), `seeded(seed)` of the engine's, say: the same die state and the
// same inputs make the same map, tile for tile, and the same actors. `source` is the path the map
// names its tileset by, the theme's `.tsj` from where the map will be written.
//
// The recipe:
//   size       [across, down] in cells. A cell is [c, r], c along a row and r down the rows, as in
//              tilemap. The cells of the outer ring are never walkable, so the map's edge is a wall.
//   layer      the name of the tile layer every cell's tile is on: the render2d layer it is drawn on.
//   ground     { layer, roles }, when a cell's tile is drawn on one of two layers: a cell whose role
//              `roles` lists (ground a thing stands on, drawn flat and first) on the tile layer
//              `layer` names, before the map's `layer`, and every other (walls, arches, columns,
//              whose tiles stand up out of their cells) on the map's `layer`, which render2d sorts
//              with the things.
//   width      cells: how wide every corridor, walkway and tunnel is. Doors form only where a
//              corridor one cell wide meets a room.
//   tries      how many maps are made before `build` gives up and throws. A map is thrown away, and
//              the next made from where the die now is, when a room, a set piece, the stairs or a
//              placement finds no place on it.
//   algorithm  `rooms`, `caves` or `halls`, with its knobs in a block of the same name:
//     rooms    { leaf, room: [least, most], door }. The map is split in two, across its longer side
//              at a rolled point, and each half again, while a side is at least 2 × `leaf` long, so
//              every leaf is `leaf` to 2 × `leaf` − 1 cells a side. Each leaf holds one room with
//              sides rolled from `room` and at least a cell of rock all round it inside the leaf.
//              Each split's two halves are joined by an L-shaped corridor, turning either way on a
//              roll, between a rolled cell of each of the two rooms, one from each half, whose
//              centres are nearest. `door` is the chance a corridor cell on a room's ring (the cells
//              beside its sides) is a door.
//     caves    { fill, steps, born, stays, keep }. Every inner cell is floor with chance `fill`; then
//              `steps` rounds of cellular automata over the 8 neighbours: a rock cell with at least
//              `born` floor neighbours turns floor and a floor cell with fewer than `stays` turns
//              rock. A region of floor under `keep` cells is filled in, and the rest are joined.
//     halls    { count: [least, most], room: [least, most], gap, door }. Rooms over a hazard:
//              every inner cell starts as hazard, which nothing walks on. `count` rooms, each with
//              sides rolled from `room`, a ring of wall round it and at least `gap` cells of hazard
//              between its ring and every other's, are put where they fit, each at a rolled place
//              among all the places it fits. Each room after the first is joined to the nearest
//              room put before it by a walkway across the hazard, as `rooms` joins its rooms, and
//              `door` is the chance a walkway cell on a ring is a door.
//   stairs     { apart, up, down }. `up` and `down` are the stairs' entries (below, with no `on`).
//              The up stairs go on a rolled floor cell and the down stairs on a rolled floor cell at
//              least `apart` steps from it by path. When no cell is that far, the up stairs move to
//              the floor cell furthest from where they were, and the down stairs are rolled again.
//   place      the actors, a list of entries, placed in order. An entry is an `actors` entry, `is`
//              and any fields, which each actor it places carries, with `{ on, count, apart, away,
//              blocks, faces }` beside them saying where: `is` names the actor's kind, which mapgen
//              never reads.
//                on      `floor` (a cell of ground, never an arch's), `door` (the cell of a door's
//                        arch; the actor carries `role`, `door-ns` or `door-ew`, the way its
//                        arch runs) or `wall` (rock with ground on exactly one of its sides, and
//                        not an arch's; the actor carries `face`, the side the ground is on, whose
//                        edge is the face of the wall).
//                count   how many: a number, or [least, most] rolled; left out, one on every cell
//                        that takes one, in order along the rows.
//                apart   cells: no two of this entry's objects nearer than this, across or
//                        diagonally (the larger of the two differences).
//                away    steps by path: no object nearer the up stairs than this. A wall object is
//                        measured from the ground it faces.
//                blocks  true for an object nothing walks through. One goes only where it leaves
//                        every walkable cell without a blocking object reachable from every other,
//                        and every blocking object beside a free cell.
//                faces   for `wall`: the sides the ground may be on, all four when left out.
//   pieces     the set pieces, `{ name, where }`, stamped in order: `name` is a key of the `pieces`
//              handed to `build`, and `where` is `floor` (the whole piece lands on floor) or `solid`
//              (the piece and a cell all round it land on cells nothing walks on, rock or hazard).
//
// Settling. Whatever an algorithm carved, the floor is then settled: first every rock cell whose wall
// (below) the theme draws no tile for is opened, then every region of walkable cells is joined to the largest by
// an L-shaped tunnel between its nearest cells, `width` wide and turning on a roll, and again until
// one region is left. Opening a wall cell makes it floor; one with no walkable side but walkable
// cells at two or more of its corners also opens, for each such corner, the side cell across to it,
// so an opening never leaves floor cut off. A wall on the outer ring is never opened: the cell inside
// it is. So every walkable cell of the floor is reachable from every other, moving across sides.
// Then a door is kept only where it stands between two walls with walkable cells on its other two
// sides, and the theme draws its arch as it stands (below); any other door is floor.
//
// Roles. With render2d's ground [[64, 32], [-64, 32]], a cell is a diamond on the screen, and its
// sides and corners are named by the grid: n (r − 1) is its upper right side, e (c + 1) its lower
// right, s (r + 1) its lower left, w (c − 1) its upper left; its corner ne is the diamond's right
// vertex, se its bottom, sw its left and nw its top.
//
// A wall stands on the side between rock and walkable ground, as an isometric dungeon's kit draws it:
// every picture of a wall stands on an upper side of its cell, its n side or its w side, with the
// cell's own diamond before it. So each wall is drawn by the cell below it or right of it, which
// ever that is: a room's back walls, to the north and west of its ground, by the ground's first
// cells, walked on right up to the wall; its front walls, to the south and east, by the rock beyond,
// on the rock's own n or w side. Every wall then stands exactly on the edge where walking stops, and
// a wall of rock one cell thick shows both its faces, one drawn by the rock and one by the ground.
// A cell's role is what it draws on its upper sides and its top corner:
//   floor              ground, bare.
//   floor-n, floor-w,  ground with a wall on that upper side, or on both, the rock beyond it: a
//   floor-nw           room's back wall.
//   floor-c            ground with a column at its top corner, where the two back walls of rock at
//                      its nw corner meet: the corner of a block of rock that points at the viewer.
//   door-ns, door-ew   an arch, ground on both sides of it, on the cell's n side in a wall along x
//                      (the way through along y), and on its w side in a wall along y.
//   door-ns-w,         an arch with a wall on the cell's other upper side, where the passage through
//   door-ew-n          the arch runs along the rock beside it.
//   hazard             lava, water, a pit: not walkable, and no wall stands against it.
//   void               rock with nothing on its upper sides. With no tile in the theme, a void cell
//                      holds no tile.
//   wall-n, wall-w,    rock with ground beyond that upper side, or both: a front wall.
//   wall-nw
//   wall-c             rock with a column at its top corner, where two front walls meet round the
//                      ground at its nw corner: a room's inner corner nearest the viewer.
// A column dresses a turn of two walls and holds nothing up: where the theme draws no column, the
// cell is drawn as void, or as floor.
// A door's arch stands on the front face of its wall, the e side of a door through a wall along y
// and the s side of one through a wall along x, where that face runs on past the door, so the arch
// is flush with its wall seen from the ground that face looks onto; its cell is then the one beyond
// the door, and the door's own cell a passage, with the walls of its sides. Else the arch stands on
// the door's own upper side, in the door's cell.
//
// The theme is a Tiled tileset (`.tsj`): each tile's `type` is its role and its `probability`,
// 1 when left out, how often it is picked among the tiles of that role. A cell's tile is picked by
// weight with the die. A tile with no type is not mapgen's; a type that is not a role throws. A
// role is drawn by the theme when it has a tile of probability above 0: tiles of probability 0 are
// only ever placed by id, by a set piece. What blocks is the tileset's to say, as Tiled writes a
// tile's collision, so the map blocks where tilemap reads it blocking: a tile of a walkable role
// (floor and door roles) with collision, or of any other role without, throws. The map's grid is
// the theme's `grid`, its orientation and cell size, or its tile size, orthogonal, when it has none.
//
// A set piece is a Tiled map (`.tmj`), fixed size, its tile layers in CSV and its tilesets either
// embedded or the theme itself. A tile from an embedded tileset is a role, its `type`: the cell
// becomes that ground (floor, door or hazard; any other role is rock) and gets its role and tile as
// every cell does. A tile from an external tileset (`source`, as Tiled writes a map painted with the
// theme's own `.tsj`) is that theme tile, by id: it stands on the cell as painted when the cell's
// role is that tile's, and otherwise the cell is tiled as any other. An empty cell leaves the map as
// it was. A flipped tile throws. Each object of an object layer is an actor: its `type` is its kind,
// `is`, its custom properties its fields, and its `pos` is its point, or its rectangle's centre, in cells
// from the piece's top-left cell: Tiled's pixels over `tileheight` on both axes in an isometric map,
// and over `tilewidth` and `tileheight` in any other. Group layers are read through; any other
// layer throws. Pieces are stamped after carving and before settling, so settling joins them.
//
// What comes back: `map`, a Tiled map as Tiled writes one, the recipe's size on the theme's grid,
// naming the theme as its one tileset (`source`, first gid 1), its tile layers in plain lists of
// gids, 0 for a cell with no tile, its ground layer first; `actors`, each `{ is, pos: [x, y],
// ...fields }`, an `actors` entry of a scene: the set pieces' first, then the up and the down
// stairs, then the recipe's entries in order, each at its cell's centre, no two in one cell; and
// `roles`, each cell's role, `roles[r][c]`.

import * as math from '#plugins/math/math.sim.ts'

type Die = () => number
type Span = [number, number]
type Side = 'n' | 'e' | 's' | 'w'

export const ROLES = [
  'floor', 'floor-n', 'floor-w', 'floor-nw', 'floor-c',
  'door-ns', 'door-ew', 'door-ns-w', 'door-ew-n',
  'hazard', 'void',
  'wall-n', 'wall-w', 'wall-nw', 'wall-c',
] as const
export type Role = typeof ROLES[number]
export const WALKABLE: readonly Role[] = ['floor', 'floor-n', 'floor-w', 'floor-nw', 'floor-c', 'door-ns', 'door-ew', 'door-ns-w', 'door-ew-n']
// The roles of rock that draw a wall, which settling opens where the theme draws no tile for one; and
// what a column is drawn as where the theme draws no tile for one: the ground or rock under it.
const WALLS: readonly Role[] = ['wall-n', 'wall-w', 'wall-nw']
const BARE: Partial<Record<Role, Role>> = { 'wall-c': 'void', 'floor-c': 'floor' }

export type Entry = { is: string; [field: string]: unknown }
export type Place = Entry & { on: 'floor' | 'door' | 'wall'; count?: number | Span; apart?: number; away?: number; blocks?: boolean; faces?: Side[] }
type Common = {
  size: Span; layer: string; ground?: { layer: string; roles: Role[] }; width: number; tries: number
  stairs: { apart: number; up: Entry; down: Entry }
  place?: Place[]
  pieces?: { name: string; where: 'floor' | 'solid' }[]
}
export type Recipe = Common & (
  | { algorithm: 'rooms'; rooms: { leaf: number; room: Span; door: number } }
  | { algorithm: 'caves'; caves: { fill: number; steps: number; born: number; stays: number; keep: number } }
  | { algorithm: 'halls'; halls: { count: Span; room: Span; gap: number; door: number } }
)

type TsjTile = { id: number; type?: string; probability?: number; objectgroup?: { objects?: unknown[] } }
export type Theme = { name: string; tilewidth: number; tileheight: number; grid?: { orientation: 'orthogonal' | 'isometric'; width: number; height: number }; tiles?: TsjTile[] }
type TmjObject = { type?: string; class?: string; x: number; y: number; width?: number; height?: number; point?: boolean; properties?: { name: string; value: unknown }[] }
type TmjLayer = { type: string; name: string; width?: number; height?: number; data?: number[] | string; objects?: TmjObject[]; layers?: TmjLayer[] }
export type Piece = {
  width: number; height: number; tilewidth: number; tileheight: number; orientation?: string
  tilesets: ({ firstgid: number; source: string } | { firstgid: number; tiles?: TsjTile[] })[]
  layers: TmjLayer[]
}

export type Actor = { is: string; pos: number[]; [field: string]: unknown }
// A tile layer of a Tiled map as Tiled writes it, and the map.
export type TmjTiles = { type: 'tilelayer'; id: number; name: string; width: number; height: number; x: 0; y: 0; opacity: 1; visible: true; data: number[] }
export type Tmj = {
  type: 'map'; version: string; tiledversion: string; orientation: 'orthogonal' | 'isometric'; renderorder: 'right-down'
  width: number; height: number; tilewidth: number; tileheight: number; infinite: false; compressionlevel: -1
  nextlayerid: number; nextobjectid: 1; tilesets: [{ firstgid: 1; source: string }]; layers: TmjTiles[]
}
export type Floor = { map: Tmj; actors: Actor[]; roles: Role[][] }

// ---------------------------------------------------------------- the grid

const ROCK = 0, FLOOR = 1, DOOR = 2, HAZARD = 3
type Ground = 'rock' | 'floor' | 'door' | 'hazard'
const GROUNDS: Ground[] = ['rock', 'floor', 'door', 'hazard']
type G = { w: number; h: number; g: Uint8Array }
type Rect = { x: number; y: number; w: number; h: number }

const SIDES: [Side, number, number][] = [['n', 0, -1], ['e', 1, 0], ['s', 0, 1], ['w', -1, 0]]
const CORNERS: [string, number, number][] = [['ne', 1, -1], ['se', 1, 1], ['sw', -1, 1], ['nw', -1, -1]]

const at = (m: G, c: number, r: number) => c < 0 || r < 0 || c >= m.w || r >= m.h ? ROCK : m.g[r * m.w + c]
const walk = (m: G, c: number, r: number) => { const v = at(m, c, r); return v === FLOOR || v === DOOR }
const roll = (die: Die, [lo, hi]: Span) => lo + Math.floor(die() * (hi - lo + 1))

// Whether a wall stands on the side two cells share: one of them rock, the other walked on.
const wallOn = (m: G, c: number, r: number, d: number, s: number) =>
  at(m, c, r) === ROCK ? walk(m, d, s) : walk(m, c, r) && at(m, d, s) === ROCK

// The walls a cell draws, on its n side and its w side, and whether it draws a column at its top
// corner: there two walls meet, round the cell at its nw corner, that neither upper side carries.
function upper(m: G, c: number, r: number) {
  const n = wallOn(m, c, r, c, r - 1), w = wallOn(m, c, r, c - 1, r)
  return { n, w, column: !n && !w && wallOn(m, c - 1, r - 1, c, r - 1) && wallOn(m, c - 1, r - 1, c - 1, r) }
}

// A rock cell's role.
function rock(m: G, c: number, r: number): Role {
  const { n, w, column } = upper(m, c, r)
  return n && w ? 'wall-nw' : n ? 'wall-n' : w ? 'wall-w' : column ? 'wall-c' : 'void'
}

// A door's way through: `door-ns` between rock on its e and w sides, `door-ew` between rock on
// its n and s, and `floor` for a door between no two walls.
function doorway(m: G, c: number, r: number): 'door-ns' | 'door-ew' | 'floor' {
  const [n, e, s, w] = SIDES.map(([, dc, dr]) => at(m, c + dc, r + dr))
  const way = (v: number) => v === FLOOR || v === DOOR
  if (way(n) && way(s) && e === ROCK && w === ROCK) return 'door-ns'
  if (way(e) && way(w) && n === ROCK && s === ROCK) return 'door-ew'
  return 'floor'
}

// Every door's arch, by the cell it is drawn in: the way it runs, and the door's own cell. An arch
// stands on the front face of its wall, the e side of a door through a wall along y and the s side of
// one through a wall along x, where that face runs on past it: the ground beyond the door goes on
// beside its wall there, in the cell whose w side (or n side) is the arch's, and that cell is floor.
// Else it stands on the door's own back side, in the door's cell.
type Arch = { way: 'door-ns' | 'door-ew'; door: number }
function arches(m: G): Map<number, Arch> {
  const out = new Map<number, Arch>()
  for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) {
    const i = r * m.w + c
    if (m.g[i] !== DOOR) continue
    const way = doorway(m, c, r)
    if (way === 'floor') continue
    const [fc, fr] = way === 'door-ew' ? [c + 1, r] : [c, r + 1]
    const on = way === 'door-ew' ? walk(m, c + 1, r - 1) : walk(m, c - 1, r + 1)
    const front = fr * m.w + fc
    out.set(on && at(m, fc, fr) === FLOOR && !out.has(front) ? front : i, { way, door: i })
  }
  return out
}

function classify(m: G): Role[][] {
  const arch = arches(m)
  return Array.from({ length: m.h }, (_, r) => Array.from({ length: m.w }, (_, c) => {
    const v = m.g[r * m.w + c]
    if (v === HAZARD) return 'hazard'
    if (v === ROCK) return rock(m, c, r)
    const { n, w, column } = upper(m, c, r)
    const a = arch.get(r * m.w + c)
    if (a?.way === 'door-ew') return n ? 'door-ew-n' : 'door-ew'
    if (a?.way === 'door-ns') return w ? 'door-ns-w' : 'door-ns'
    return n && w ? 'floor-nw' : n ? 'floor-n' : w ? 'floor-w' : column ? 'floor-c' : 'floor'
  }))
}

// Every cell's role, for a grid of grounds, `ground[r][c]`. A door that is not between two walls is
// floor.
export function autotile(ground: Ground[][]): Role[][] {
  const m: G = { w: ground[0].length, h: ground.length, g: new Uint8Array(ground.flat().map(v => GROUNDS.indexOf(v))) }
  return classify(m)
}

// ---------------------------------------------------------------- the theme

export type Palette = { name: string; role: Map<number, Role>; picks: Map<Role, { ids: number[]; weights: number[]; total: number }> }

export function palette(theme: Theme): Palette {
  const role = new Map<number, Role>()
  const picks: Palette['picks'] = new Map()
  for (const t of theme.tiles ?? []) {
    if (t.type === undefined || t.type === '') continue
    if (!(ROLES as readonly string[]).includes(t.type)) throw new Error(`mapgen: theme ${theme.name}: tile ${t.id} has type ${t.type}, which is no role`)
    const p = t.probability ?? 1
    if (!(p >= 0)) throw new Error(`mapgen: theme ${theme.name}: tile ${t.id} has probability ${p}, below 0`)
    const walks = WALKABLE.includes(t.type as Role), hits = !!t.objectgroup?.objects?.length
    if (walks === hits) throw new Error(`mapgen: theme ${theme.name}: tile ${t.id} is ${t.type}, ${walks ? 'which is walked on, and has collision' : 'which blocks, and has no collision'}`)
    role.set(t.id, t.type as Role)
    if (p === 0) continue
    const pick = picks.get(t.type as Role) ?? { ids: [], weights: [], total: 0 }
    pick.ids.push(t.id); pick.weights.push(p); pick.total += p
    picks.set(t.type as Role, pick)
  }
  return { name: theme.name, role, picks }
}

// A tile of `role` picked by weight: -1 for `void` when the theme draws none.
export function pick(die: Die, pal: Palette, role: Role): number {
  const p = pal.picks.get(role)
  if (!p) {
    if (role === 'void') return -1
    throw new Error(`mapgen: theme ${pal.name} has no tile for ${role}`)
  }
  let left = die() * p.total
  for (let i = 0; i < p.ids.length; i++) if ((left -= p.weights[i]) < 0) return p.ids[i]
  return p.ids[p.ids.length - 1]
}

// ---------------------------------------------------------------- set pieces

type Stamp = { name: string; w: number; h: number; cells: ({ role: Role; id?: number } | null)[]; objects: Actor[] }

function decode(name: string, p: Piece, pal: Palette): Stamp {
  const cells: Stamp['cells'] = new Array(p.width * p.height).fill(null)
  const objects: Actor[] = []
  const [ux, uy] = p.orientation === 'isometric' ? [p.tileheight, p.tileheight] : [p.tilewidth, p.tileheight]
  const sets = [...p.tilesets].sort((a, b) => b.firstgid - a.firstgid)
  const read = (layers: TmjLayer[]) => {
    for (const l of layers) {
      if (l.type === 'group') { read(l.layers ?? []); continue }
      if (l.type === 'objectgroup') {
        for (const o of l.objects ?? []) {
          const is = o.type || o.class
          if (!is) throw new Error(`mapgen: piece ${name}: an object of layer ${l.name} has no type`)
          const box = !o.point && o.width && o.height
          const x = box ? o.x + o.width! / 2 : o.x, y = box ? o.y + o.height! / 2 : o.y
          objects.push({ ...Object.fromEntries((o.properties ?? []).map(q => [q.name, q.value])), is, pos: [x / ux, y / uy] })
        }
        continue
      }
      if (l.type !== 'tilelayer') throw new Error(`mapgen: piece ${name}: layer ${l.name} is a ${l.type}, which a piece cannot hold`)
      if (!Array.isArray(l.data) || l.width !== p.width || l.height !== p.height) {
        throw new Error(`mapgen: piece ${name}: layer ${l.name} is not the map's size in CSV`)
      }
      l.data.forEach((gid, i) => {
        if (gid === 0) return
        if (gid > 0x0fffffff) throw new Error(`mapgen: piece ${name}: layer ${l.name} flips a tile, which a map cannot draw`)
        const set = sets.find(s => s.firstgid <= gid)
        if (!set) throw new Error(`mapgen: piece ${name}: tile ${gid} is in no tileset`)
        const id = gid - set.firstgid
        if ('source' in set) {
          const role = pal.role.get(id)
          if (!role) throw new Error(`mapgen: piece ${name}: tile ${id} has no role in theme ${pal.name}`)
          cells[i] = { role, id }
        } else {
          const type = set.tiles?.find(t => t.id === id)?.type
          if (!type || !(ROLES as readonly string[]).includes(type)) throw new Error(`mapgen: piece ${name}: tile ${id} of an embedded tileset has no role for a type`)
          cells[i] = { role: type as Role }
        }
      })
    }
  }
  read(p.layers)
  return { name, w: p.width, h: p.height, cells, objects }
}

const groundOf = (role: Role) => role.startsWith('floor') ? FLOOR : role.startsWith('door') ? DOOR : role === 'hazard' ? HAZARD : ROCK

function stamp(die: Die, m: G, s: Stamp, where: 'floor' | 'solid', fixed: Map<number, number>, objects: Actor[]): string | undefined {
  const fits: number[][] = []
  for (let r0 = 0; r0 + s.h <= m.h; r0++) for (let c0 = 0; c0 + s.w <= m.w; c0++) {
    let ok = true
    if (where === 'floor') {
      for (let r = r0; ok && r < r0 + s.h; r++) for (let c = c0; ok && c < c0 + s.w; c++) ok = at(m, c, r) === FLOOR
    } else {
      ok = c0 >= 1 && r0 >= 1 && c0 + s.w <= m.w - 1 && r0 + s.h <= m.h - 1
      for (let r = r0 - 1; ok && r <= r0 + s.h; r++) for (let c = c0 - 1; ok && c <= c0 + s.w; c++) ok = !walk(m, c, r)
    }
    if (ok) fits.push([c0, r0])
  }
  if (!fits.length) return `piece ${s.name} fits nowhere`
  const [c0, r0] = fits[Math.floor(die() * fits.length)]
  s.cells.forEach((cell, i) => {
    if (!cell) return
    const j = (r0 + Math.floor(i / s.w)) * m.w + c0 + (i % s.w)
    m.g[j] = groundOf(cell.role)
    if (cell.id !== undefined) fixed.set(j, cell.id)
  })
  for (const o of s.objects) objects.push({ ...o, pos: [o.pos[0] + c0, o.pos[1] + r0] })
}

// ---------------------------------------------------------------- carving

function fill(m: G, q: Rect, v: number) {
  for (let r = q.y; r < q.y + q.h; r++) for (let c = q.x; c < q.x + q.w; c++) m.g[r * m.w + c] = v
}

// An L from cell a to cell b, `width` wide, turning either way on a roll. It stays off the outer
// ring, and a door on its way stays a door.
function carve(die: Die, m: G, a: number[], b: number[], width: number) {
  const across = die() < 0.5
  const bend = across ? [b[0], a[1]] : [a[0], b[1]]
  for (const [p, q] of [[a, bend], [bend, b]]) {
    const n = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1])
    for (let i = 0; i <= n; i++) {
      const c = p[0] + Math.sign(q[0] - p[0]) * i, r = p[1] + Math.sign(q[1] - p[1]) * i
      for (let dr = 0; dr < width; dr++) for (let dc = 0; dc < width; dc++) {
        const x = c + dc, y = r + dr
        if (x > 0 && y > 0 && x < m.w - 1 && y < m.h - 1 && !walk(m, x, y)) m.g[y * m.w + x] = FLOOR
      }
    }
  }
}

const inside = (die: Die, q: Rect) => [q.x + Math.floor(die() * q.w), q.y + Math.floor(die() * q.h)]
const centre = (q: Rect) => [q.x + q.w / 2, q.y + q.h / 2]
const apartSq = (a: Rect, b: Rect) => { const [p, q] = [centre(a), centre(b)]; return math.pow(p[0] - q[0], 2) + math.pow(p[1] - q[1], 2) }

// Corridor cells on a room's ring become doors on a roll. A ring is rock until a corridor crosses it,
// so every walkable cell on one is a corridor's.
function doors(die: Die, m: G, rooms: Rect[], chance: number) {
  for (const q of rooms) {
    const ring: number[][] = []
    for (let c = q.x; c < q.x + q.w; c++) ring.push([c, q.y - 1], [c, q.y + q.h])
    for (let r = q.y; r < q.y + q.h; r++) ring.push([q.x - 1, r], [q.x + q.w, r])
    for (const [c, r] of ring) if (at(m, c, r) === FLOOR && die() < chance) m.g[r * m.w + c] = DOOR
  }
}

type Node = { rect: Rect; kids?: [Node, Node]; room?: Rect }

function split(die: Die, rect: Rect, leaf: number, room: Span): Node {
  const wide = rect.w >= 2 * leaf, tall = rect.h >= 2 * leaf
  if (!wide && !tall) {
    const w = roll(die, [room[0], Math.min(room[1], rect.w - 2)]), h = roll(die, [room[0], Math.min(room[1], rect.h - 2)])
    const x = rect.x + 1 + Math.floor(die() * (rect.w - 1 - w)), y = rect.y + 1 + Math.floor(die() * (rect.h - 1 - h))
    return { rect, room: { x, y, w, h } }
  }
  const across = wide && (!tall || rect.w >= rect.h)
  const cut = leaf + Math.floor(die() * ((across ? rect.w : rect.h) - 2 * leaf + 1))
  const [a, b]: Rect[] = across
    ? [{ ...rect, w: cut }, { ...rect, x: rect.x + cut, w: rect.w - cut }]
    : [{ ...rect, h: cut }, { ...rect, y: rect.y + cut, h: rect.h - cut }]
  return { rect, kids: [split(die, a, leaf, room), split(die, b, leaf, room)] }
}

const roomsOf = (n: Node): Rect[] => n.room ? [n.room] : n.kids!.flatMap(roomsOf)

function rooms(die: Die, m: G, k: { leaf: number; room: Span; door: number }, width: number) {
  const tree = split(die, { x: 0, y: 0, w: m.w, h: m.h }, k.leaf, k.room)
  const all = roomsOf(tree)
  for (const q of all) fill(m, q, FLOOR)
  const join = (n: Node) => {
    if (!n.kids) return
    n.kids.forEach(join)
    let best: [Rect, Rect] | undefined, d = Infinity
    for (const a of roomsOf(n.kids[0])) for (const b of roomsOf(n.kids[1])) if (apartSq(a, b) < d) { d = apartSq(a, b); best = [a, b] }
    carve(die, m, inside(die, best![0]), inside(die, best![1]), width)
  }
  join(tree)
  doors(die, m, all, k.door)
}

function halls(die: Die, m: G, k: { count: Span; room: Span; gap: number; door: number }, width: number): string | undefined {
  fill(m, { x: 1, y: 1, w: m.w - 2, h: m.h - 2 }, HAZARD)
  const placed: Rect[] = []
  const n = roll(die, k.count)
  for (let i = 0; i < n; i++) {
    const w = roll(die, k.room), h = roll(die, k.room)
    const fits: Rect[] = []
    for (let y = 2; y + h <= m.h - 2; y++) for (let x = 2; x + w <= m.w - 2; x++) {
      if (placed.every(p => x - 1 - k.gap > p.x + p.w || x + w + k.gap < p.x - 1 || y - 1 - k.gap > p.y + p.h || y + h + k.gap < p.y - 1)) fits.push({ x, y, w, h })
    }
    if (!fits.length) return `halls: room ${i + 1} of ${n} fits nowhere`
    const q = fits[Math.floor(die() * fits.length)]
    fill(m, { x: q.x - 1, y: q.y - 1, w: q.w + 2, h: q.h + 2 }, ROCK)
    fill(m, q, FLOOR)
    placed.push(q)
  }
  placed.forEach((q, i) => {
    if (i === 0) return
    let near = 0
    for (let j = 1; j < i; j++) if (apartSq(q, placed[j]) < apartSq(q, placed[near])) near = j
    carve(die, m, inside(die, q), inside(die, placed[near]), width)
  })
  doors(die, m, placed, k.door)
}

// Labels of the walkable regions, joined across sides: -1 for a cell nothing walks on.
function regions(m: G): { label: Int32Array; sizes: number[] } {
  const label = new Int32Array(m.w * m.h).fill(-1), sizes: number[] = []
  for (let i = 0; i < label.length; i++) {
    if (label[i] >= 0 || !walk(m, i % m.w, Math.floor(i / m.w))) continue
    const id = sizes.length, queue = [i]
    label[i] = id
    for (let k = 0; k < queue.length; k++) {
      const c = queue[k] % m.w, r = Math.floor(queue[k] / m.w)
      for (const [, dc, dr] of SIDES) {
        const j = (r + dr) * m.w + c + dc
        if (walk(m, c + dc, r + dr) && label[j] < 0) { label[j] = id; queue.push(j) }
      }
    }
    sizes.push(queue.length)
  }
  return { label, sizes }
}

function caves(die: Die, m: G, k: { fill: number; steps: number; born: number; stays: number; keep: number }): string | undefined {
  for (let r = 1; r < m.h - 1; r++) for (let c = 1; c < m.w - 1; c++) m.g[r * m.w + c] = die() < k.fill ? FLOOR : ROCK
  for (let s = 0; s < k.steps; s++) {
    const next = new Uint8Array(m.g.length)
    for (let r = 1; r < m.h - 1; r++) for (let c = 1; c < m.w - 1; c++) {
      let n = 0
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dc || dr) && walk(m, c + dc, r + dr)) n++
      next[r * m.w + c] = n >= (walk(m, c, r) ? k.stays : k.born) ? FLOOR : ROCK
    }
    m.g = next
  }
  const { label, sizes } = regions(m)
  for (let i = 0; i < label.length; i++) if (label[i] >= 0 && sizes[label[i]] < k.keep) m.g[i] = ROCK
  if (sizes.every(s => s < k.keep)) return `caves: no region of ${k.keep} cells`
}

// ---------------------------------------------------------------- settling

// Opens every rock cell whose role is in `lacking`, a wall the theme draws no tile for, until none is
// left; one on the map's edge opens the cell inside it. Each opening adds a walkable cell, so it
// ends, and a rock on the edge whose cell inside is already walked on throws, since nothing opening
// can change it.
function fit(m: G, lacking: Set<Role>) {
  for (let changed = true; changed;) {
    changed = false
    for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) {
      const role = rock(m, c, r)
      if (m.g[r * m.w + c] !== ROCK || !lacking.has(role)) continue
      const x = Math.min(Math.max(c, 1), m.w - 2), y = Math.min(Math.max(r, 1), m.h - 2)
      if (walk(m, x, y)) throw new Error(`mapgen: the theme draws no tile for ${role}, which the rock at [${c}, ${r}] on the map's edge needs`)
      open(m, x, y)
      changed = true
    }
  }
}

// A cell with no walkable side is joined to each walkable corner through the side cell across to it,
// which is on the inner map because the corner and the cell both are.
function open(m: G, c: number, r: number) {
  const bare = SIDES.every(([, dc, dr]) => !walk(m, c + dc, r + dr))
  m.g[r * m.w + c] = FLOOR
  if (bare) for (const [, dc, dr] of CORNERS) if (walk(m, c + dc, r + dr)) m.g[r * m.w + c + dc] = FLOOR
}

function settle(die: Die, m: G, lacking: Set<Role>, width: number) {
  for (;;) {
    fit(m, lacking)
    const { label, sizes } = regions(m)
    if (sizes.length <= 1) return
    const main = sizes.indexOf(Math.max(...sizes))
    // Out from every cell of the largest region at once, over the inner map, to the first cell of
    // another region: that is its nearest cell, and `from` is where the way to it started.
    const from = new Int32Array(label.length).fill(-1), queue: number[] = []
    for (let i = 0; i < label.length; i++) if (label[i] === main) { from[i] = i; queue.push(i) }
    let pair: number[] | undefined
    for (let k = 0; !pair && k < queue.length; k++) {
      const c = queue[k] % m.w, r = Math.floor(queue[k] / m.w)
      for (const [, dc, dr] of SIDES) {
        const x = c + dc, y = r + dr, j = y * m.w + x
        if (x < 1 || y < 1 || x > m.w - 2 || y > m.h - 2 || from[j] >= 0) continue
        from[j] = from[queue[k]]
        if (label[j] >= 0) { pair = [from[j], j]; break }
        queue.push(j)
      }
    }
    const [a, b] = pair!
    carve(die, m, [a % m.w, Math.floor(a / m.w)], [b % m.w, Math.floor(b / m.w)], width)
  }
}

// ---------------------------------------------------------------- placing

// Steps by path from `start` to every walkable cell, across sides: -1 where none reaches.
function reach(m: G, start: number): Int32Array {
  const d = new Int32Array(m.w * m.h).fill(-1), queue = [start]
  d[start] = 0
  for (let k = 0; k < queue.length; k++) {
    const c = queue[k] % m.w, r = Math.floor(queue[k] / m.w)
    for (const [, dc, dr] of SIDES) {
      const j = (r + dr) * m.w + c + dc
      if (walk(m, c + dc, r + dr) && d[j] < 0) { d[j] = d[queue[k]] + 1; queue.push(j) }
    }
  }
  return d
}

const RING = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] // n, ne, e, … round

type Board = { m: G; roles: Role[][]; taken: Uint8Array; blocked: Uint8Array; objects: Actor[] }

const free = (b: Board, c: number, r: number) => walk(b.m, c, r) && !b.blocked[r * b.m.w + c]

// Whether a blocking object on cell i leaves the free cells joined and every blocking object beside
// a free cell. The free cells round it, in order, fall into runs that touch across sides; when the
// free side cells all lie in one run, any way through the cell goes round it inside that run.
function blockable(b: Board, i: number): boolean {
  const c = i % b.m.w, r = Math.floor(i / b.m.w)
  const f = RING.map(([dc, dr]) => free(b, c + dc, r + dr))
  if (![0, 2, 4, 6].some(k => f[k])) return false
  // Round the ring from just past a slot that is not free, closing a run at each such slot.
  const start = f.indexOf(false)
  let runs = 0, inRun = false, side = false
  if (start >= 0) for (let s = 1; s <= 8; s++) {
    const k = (start + s) % 8
    if (f[k]) { inRun = true; side ||= k % 2 === 0 }
    else { if (inRun && side) runs++; inRun = side = false }
  }
  if (runs > 1) return false
  for (const [, dc, dr] of SIDES) {
    const x = c + dc, y = r + dr
    if (!walk(b.m, x, y) || !b.blocked[y * b.m.w + x]) continue
    const open = SIDES.filter(([, ec, er]) => free(b, x + ec, y + er) && !(x + ec === c && y + er === r)).length
    if (open === 0) return false
  }
  return true
}

function candidates(b: Board, on: Place['on'], faces: Side[]): { cell: number; face?: Side; ground: number }[] {
  const out: { cell: number; face?: Side; ground: number }[] = []
  const { m } = b
  for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) {
    const i = r * m.w + c, role = b.roles[r][c]
    if (on === 'floor' && role.startsWith('floor')) out.push({ cell: i, ground: i })
    else if (on === 'door' && role.startsWith('door')) out.push({ cell: i, ground: i })
    else if (on === 'wall' && m.g[i] === ROCK) {
      // rock with ground on one side only, and that the ground of no arch
      const open = SIDES.filter(([, dc, dr]) => walk(m, c + dc, r + dr))
      if (open.length !== 1 || !faces.includes(open[0][0])) continue
      const [face, dc, dr] = open[0], ground = (r + dr) * m.w + c + dc
      if (!b.roles[r + dr][c + dc].startsWith('door')) out.push({ cell: i, face, ground })
    }
  }
  return out
}

function put(b: Board, cell: number, e: Entry, face?: Side) {
  const c = cell % b.m.w, r = Math.floor(cell / b.m.w), role = b.roles[r][c]
  b.taken[cell] = 1
  b.objects.push({ ...e, ...(face ? { face } : {}), ...(role.startsWith('door') ? { role: role.slice(0, 7) } : {}), pos: [c + 0.5, r + 0.5] })
}

function place(die: Die, b: Board, e: Place, dist: Int32Array): string | undefined {
  const { is, on, count, apart = 0, away = 0, blocks = false, faces = ['n', 'e', 's', 'w'], ...fields } = e
  const list = candidates(b, on, faces).filter(x => dist[x.ground] >= away)
  const mine: number[] = []
  const w = b.m.w
  const ok = (x: { cell: number }) =>
    !b.taken[x.cell]
    && mine.every(j => Math.max(Math.abs(j % w - x.cell % w), Math.abs(Math.floor(j / w) - Math.floor(x.cell / w))) >= apart)
    && (!blocks || on === 'wall' || blockable(b, x.cell))
  const take = (x: { cell: number; face?: Side }) => {
    put(b, x.cell, { is, ...fields }, x.face)
    mine.push(x.cell)
    if (blocks && on !== 'wall') b.blocked[x.cell] = 1
  }
  if (count === undefined) { for (const x of list) if (ok(x)) take(x); return }
  const want = typeof count === 'number' ? count : roll(die, count)
  while (mine.length < want) {
    if (!list.length) return `no room for ${want} ${is}`
    const k = Math.floor(die() * list.length), x = list[k]
    list[k] = list[list.length - 1]; list.pop()
    if (ok(x)) take(x)
  }
}

function stairs(die: Die, b: Board, s: Common['stairs']): Int32Array | string {
  const floor = candidates(b, 'floor', []).map(x => x.cell).filter(i => !b.taken[i])
  if (!floor.length) return 'no floor for the stairs'
  let up = floor[Math.floor(die() * floor.length)], dist = reach(b.m, up)
  let far = floor.filter(i => dist[i] >= s.apart)
  if (!far.length) {
    up = floor.reduce((a, i) => dist[i] > dist[a] ? i : a, floor[0])
    dist = reach(b.m, up)
    far = floor.filter(i => dist[i] >= s.apart)
    if (!far.length) return `no two floor cells ${s.apart} steps apart`
  }
  const down = far[Math.floor(die() * far.length)]
  put(b, up, s.up)
  put(b, down, s.down)
  return dist
}

// ---------------------------------------------------------------- build

function check(k: Recipe) {
  const need = (ok: boolean, what: string) => { if (!ok) throw new Error(`mapgen: ${what}`) }
  const whole = (v: number, lo: number) => Number.isInteger(v) && v >= lo
  const span = (s: Span, lo: number, what: string) =>
    need(whole(s[0], lo) && whole(s[1], s[0]), `${what} must be [least, most], whole numbers with least at least ${lo} and most at least least`)
  const chance = (v: number, what: string) => need(v >= 0 && v <= 1, `${what} must be a chance from 0 to 1`)
  const [w, h] = k.size
  need(whole(w, 3) && whole(h, 3), 'size must be two whole numbers of cells, 3 or more')
  need(whole(k.tries, 1), 'tries must be a whole number, 1 or more')
  need(whole(k.width, 1), 'width must be a whole number of cells, 1 or more')
  need(whole(k.stairs.apart, 1), 'stairs.apart must be a whole number of steps, 1 or more')
  if (k.algorithm === 'rooms') {
    span(k.rooms.room, 1, 'rooms.room')
    need(whole(k.rooms.leaf, k.rooms.room[0] + 2), 'rooms.leaf must be a whole number, the least room side + 2 or more')
    need(w >= k.rooms.leaf && h >= k.rooms.leaf, 'rooms.leaf must be no longer than a side of the map')
    chance(k.rooms.door, 'rooms.door')
  } else if (k.algorithm === 'caves') {
    chance(k.caves.fill, 'caves.fill')
    need(whole(k.caves.steps, 0), 'caves.steps must be a whole number, 0 or more')
    for (const v of ['born', 'stays'] as const) need(whole(k.caves[v], 0) && k.caves[v] <= 8, `caves.${v} must be a whole number of neighbours, 0 to 8`)
    need(whole(k.caves.keep, 1), 'caves.keep must be a whole number of cells, 1 or more')
  } else if (k.algorithm === 'halls') {
    span(k.halls.count, 1, 'halls.count')
    span(k.halls.room, 1, 'halls.room')
    need(whole(k.halls.gap, 0), 'halls.gap must be a whole number of cells, 0 or more')
    chance(k.halls.door, 'halls.door')
  } else throw new Error(`mapgen: no algorithm ${(k as { algorithm: string }).algorithm}`)
  for (const e of k.place ?? []) {
    need(['floor', 'door', 'wall'].includes(e.on), `${e.is}: on must be floor, door or wall`)
    if (typeof e.count === 'number') need(whole(e.count, 0), `${e.is}: count must be a whole number, 0 or more`)
    else if (e.count) span(e.count, 0, `${e.is}: count`)
    need(whole(e.apart ?? 0, 0) && whole(e.away ?? 0, 0), `${e.is}: apart and away must be whole numbers, 0 or more`)
    need((e.faces ?? []).every(f => ['n', 'e', 's', 'w'].includes(f)), `${e.is}: faces must be sides, n, e, s or w`)
  }
  if (k.ground) need(k.ground.roles.every(r => (ROLES as readonly string[]).includes(r)), 'ground.roles must be roles')
  for (const p of k.pieces ?? []) need(p.where === 'floor' || p.where === 'solid', `piece ${p.name}: where must be floor or solid`)
}

function attempt(die: Die, k: Recipe, pal: Palette, stamps: { s: Stamp; where: 'floor' | 'solid' }[]): { tiles: number[][]; actors: Actor[]; roles: Role[][] } | string {
  const [w, h] = k.size
  const m: G = { w, h, g: new Uint8Array(w * h) }
  const why = k.algorithm === 'rooms' ? rooms(die, m, k.rooms, k.width)
    : k.algorithm === 'caves' ? caves(die, m, k.caves)
    : halls(die, m, k.halls, k.width)
  if (why) return why
  const fixed = new Map<number, number>(), objects: Actor[] = []
  for (const { s, where } of stamps) {
    const miss = stamp(die, m, s, where, fixed, objects)
    if (miss) return miss
  }
  const drawn = (r: Role) => pal.picks.has(r)
  settle(die, m, new Set(WALLS.filter(r => !drawn(r))), k.width)
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (m.g[r * w + c] === DOOR && doorway(m, c, r) === 'floor') m.g[r * w + c] = FLOOR
  // A door whose arch the theme draws no tile for, the way it stands, is floor, until every arch is drawn.
  let roles = classify(m)
  for (;;) {
    const bare = [...arches(m)].filter(([i]) => !drawn(roles[Math.floor(i / w)][i % w]))
    if (!bare.length) break
    for (const [, a] of bare) m.g[a.door] = FLOOR
    roles = classify(m)
  }
  roles = roles.map(row => row.map(role => (BARE[role] && !drawn(role) ? BARE[role]! : role)))
  const b: Board = { m, roles, taken: new Uint8Array(w * h), blocked: new Uint8Array(w * h), objects }
  for (const o of objects) b.taken[Math.floor(o.pos[1]) * w + Math.floor(o.pos[0])] = 1
  const dist = stairs(die, b, k.stairs)
  if (typeof dist === 'string') return dist
  for (const e of k.place ?? []) {
    const miss = place(die, b, e, dist)
    if (miss) return miss
  }
  const tiles = roles.map((row, r) => row.map((role, c) => {
    const id = fixed.get(r * w + c)
    return id !== undefined && pal.role.get(id) === role ? id : pick(die, pal, role)
  }))
  return { tiles, actors: b.objects, roles }
}

// The map: the theme's grid, the one tileset the theme is, named by `source`, and the tile layers,
// each cell's tile's gid, 0 for none.
function tmj(k: Recipe, theme: Theme, source: string, tiles: number[][], roles: Role[][]): Tmj {
  const [w, h] = k.size
  const grid = theme.grid ?? { orientation: 'orthogonal', width: theme.tilewidth, height: theme.tileheight }
  const on = (ground: boolean | null) => tiles.flatMap((row, r) => row.map((t, c) =>
    t < 0 || (ground !== null && k.ground!.roles.includes(roles[r][c]) !== ground) ? 0 : t + 1))
  const layer = (id: number, name: string, data: number[]): TmjTiles =>
    ({ type: 'tilelayer', id, name, width: w, height: h, x: 0, y: 0, opacity: 1, visible: true, data })
  const layers = k.ground ? [layer(1, k.ground.layer, on(true)), layer(2, k.layer, on(false))] : [layer(1, k.layer, on(null))]
  return {
    type: 'map', version: '1.10', tiledversion: '1.10.2', orientation: grid.orientation, renderorder: 'right-down',
    width: w, height: h, tilewidth: grid.width, tileheight: grid.height, infinite: false, compressionlevel: -1,
    nextlayerid: layers.length + 1, nextobjectid: 1, tilesets: [{ firstgid: 1, source }], layers,
  }
}

export function build(die: Die, recipe: Recipe, theme: Theme, source: string, pieces: Record<string, Piece> = {}): Floor {
  check(recipe)
  const pal = palette(theme)
  const stamps = (recipe.pieces ?? []).map(({ name, where }) => {
    if (!(name in pieces)) throw new Error(`mapgen: the recipe names piece ${name}, which was not handed in`)
    return { s: decode(name, pieces[name], pal), where }
  })
  let why = ''
  for (let t = 0; t < recipe.tries; t++) {
    const made = attempt(die, recipe, pal, stamps)
    if (typeof made !== 'string') return { map: tmj(recipe, theme, source, made.tiles, made.roles), actors: made.actors, roles: made.roles }
    why = made
  }
  throw new Error(`mapgen: no floor in ${recipe.tries} tries; the last: ${why}`)
}
