// mapgen's levels, made from recipes and a theme the test writes. Each algorithm is built over 1,000
// seeds, twice each, and every level is checked: the same seed makes the same map and actors; the map
// is the recipe's size on the theme's grid, ground on its ground layer and the rest on the other;
// every tile is of its cell's role, and tilemap's `blocked`, reading the map as the game does with
// the theme's collision, agrees with the roles on what is walkable; every cell draws the walls on its upper sides that stand between rock and ground, and the columns where they meet; everything
// walkable is reachable from the up stairs around every blocking object, and every blocking object
// stands beside a reachable cell; the stairs are the recipe's minimum apart by path; each object is on
// a cell of the kind its entry asks for, and no two share one; counts, `apart` and `away` hold. Then
// the masks, the weighted pick, the theme's collision and the set pieces each on their own.
import { expect, test } from 'vitest'
import { seeded } from '#engine/engine.ts'
import { readMap } from '#plugins/loader/loader.sim.ts'
import { blocked } from '#plugins/tilemap/tilemap.sim.ts'
import { ROLES, WALKABLE, autotile, build, palette, pick, type Floor, type Piece, type Recipe, type Role, type Theme } from './mapgen.sim.ts'
const PENTAGRAM = 98

// A tile's collision, as Tiled writes it: its whole picture.
const HIT = { objectgroup: { type: 'objectgroup', objects: [{ id: 1, x: 0, y: 0, width: 128, height: 64 }] } }
const hit = (type: string) => (WALKABLE.includes(type as Role) ? {} : HIT)

// Two tiles of every role, the first three times as likely, each nothing walks on with collision;
// one floor tile only a piece places, and a tile that is not mapgen's. An isometric grid of 128 by
// 64, a whole Tiled tileset the map can be read with.
const THEME: Theme & Record<string, unknown> = {
  type: 'tileset', name: 'test', tilewidth: 128, tileheight: 64, tilecount: 100, columns: 10,
  image: 't.png', imagewidth: 1280, imageheight: 640, grid: { orientation: 'isometric', width: 128, height: 64 },
  tiles: [
    ...ROLES.flatMap((type, i) => [{ id: 2 * i, type, probability: 3, ...hit(type) }, { id: 2 * i + 1, type, ...hit(type) }]),
    { id: PENTAGRAM, type: 'floor', probability: 0 },
    { id: 99 },
  ],
}
const SOURCE = '../tiles/test.tsj'
const ROLE_OF = new Map(THEME.tiles!.filter(t => t.type).map(t => [t.id, t.type]))

// A walled room of five cells square with the pentagram at its centre and an altar on it, painted
// with an embedded tileset of roles and the theme's own tileset: the room and a ring of solid round
// it land on rock or hazard.
const ALTAR: Piece = {
  width: 5, height: 5, tilewidth: 128, tileheight: 64, orientation: 'isometric',
  tilesets: [
    { firstgid: 1, tiles: [{ id: 0, type: 'floor' }, { id: 1, type: 'wall-n' }] },
    { firstgid: 100, source: 'test.tsj' },
  ],
  layers: [
    {
      type: 'tilelayer', name: 'roles', width: 5, height: 5,
      data: [2, 2, 2, 2, 2, 2, 1, 1, 1, 2, 2, 1, 100 + PENTAGRAM, 1, 2, 2, 1, 1, 1, 2, 2, 2, 2, 2, 2],
    },
    { type: 'objectgroup', name: 'things', objects: [{ type: 'altar', x: 2.5 * 64, y: 2.5 * 64, point: true, properties: [{ name: 'boss', value: 'lazarus' }] }] },
  ],
}

const common = {
  layer: 'standing', ground: { layer: 'ground', roles: ['floor'] as Role[] }, width: 1, tries: 30,
  stairs: { apart: 20, up: { is: 'stairs', way: 'up' }, down: { is: 'stairs', way: 'down' } },
  place: [
    { is: 'door', on: 'door' },
    { is: 'pack', on: 'floor', count: [3, 5], apart: 4, away: 8, pool: 'fallen' },
    { is: 'spawner', on: 'floor', count: 2, away: 8 },
    { is: 'chest', on: 'floor', count: 2, blocks: true },
    { is: 'barrel', on: 'floor', count: [4, 8], blocks: true, apart: 2 },
    { is: 'shrine', on: 'floor', count: 1, blocks: true },
    { is: 'torch', on: 'wall', count: 6, apart: 3, faces: ['s', 'e'] },
  ],
} satisfies Partial<Recipe>
const BLOCKING = ['chest', 'barrel', 'shrine']

const RECIPES: Record<string, Recipe> = {
  rooms: { ...common, size: [40, 40], algorithm: 'rooms', rooms: { leaf: 9, room: [4, 7], door: 0.7 } },
  caves: { ...common, size: [40, 40], algorithm: 'caves', caves: { fill: 0.52, steps: 4, born: 5, stays: 4, keep: 20 } },
  halls: {
    ...common, size: [44, 44], algorithm: 'halls', halls: { count: [4, 6], room: [4, 7], gap: 2, door: 0.5 },
    pieces: [{ name: 'altar', where: 'solid' }],
  },
}

const SIDES = [['n', 0, -1], ['e', 1, 0], ['s', 0, 1], ['w', -1, 0]] as const
const cheb = (a: number[], b: number[]) => Math.max(Math.abs(Math.floor(a[0]) - Math.floor(b[0])), Math.abs(Math.floor(a[1]) - Math.floor(b[1])))

// Each cell's theme tile, -1 for none, from whichever layer holds it.
const tilesOf = (f: Floor) => Array.from({ length: f.map.height }, (_, r) => Array.from({ length: f.map.width }, (_, c) =>
  Math.max(...f.map.layers.map(l => l.data[r * f.map.width + c])) - 1))

// The map as the game reads it, the theme its tileset.
const read = (f: Floor) => readMap({ ...f.map, tilesets: [{ firstgid: 1, ...THEME }] }, '/level.tmj')

// Every check the 1,000-seed runs make of one level, as a list of what is wrong with it, so a run
// asks `expect` once a level.
function faults(f: Floor, k: Recipe): string[] {
  const bad: string[] = []
  const want = (ok: boolean, what: () => string) => { if (!ok) bad.push(what()) }
  const [w, h] = k.size
  const { map } = f
  want(map.orientation === 'isometric' && map.tilewidth === 128 && map.tileheight === 64 && map.width === w && map.height === h, () => 'the map is not the recipe size on the theme\'s grid')
  want(JSON.stringify(map.tilesets) === JSON.stringify([{ firstgid: 1, source: SOURCE }]), () => `tilesets ${JSON.stringify(map.tilesets)}`)
  want(JSON.stringify(map.layers.map(l => [l.name, l.data.length])) === JSON.stringify([[k.ground!.layer, w * h], [k.layer, w * h]]), () => `layers ${map.layers.map(l => l.name)}`)
  want(f.roles.length === h && f.roles.every(row => row.length === w), () => 'roles are not the recipe size')
  if (bad.length) return bad
  const tiles = tilesOf(f)
  for (let i = 0; i < w * h; i++) {
    const role = f.roles[Math.floor(i / w)][i % w], [g, s] = map.layers.map(l => l.data[i])
    want(!(g && s) && (!g || k.ground!.roles.includes(role)) && (!s || !k.ground!.roles.includes(role)), () => `[${i % w}, ${Math.floor(i / w)}] ${role} on the wrong layer`)
  }

  // What tilemap says blocks, and that it is what the roles say.
  const tiled = read(f)
  const open = new Uint8Array(w * h)
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) open[r * w + c] = blocked(tiled, {}, c, r) ? 0 : 1
  const walk = (c: number, r: number) => c >= 0 && r >= 0 && c < w && r < h && open[r * w + c] === 1

  // Rock, and everything beyond the map: what blocks and is no hazard. A wall stands on a side
  // between rock and ground, drawn by the cell below it or right of it, on that cell's upper side.
  const hazard = (c: number, r: number) => c >= 0 && r >= 0 && c < w && r < h && f.roles[r][c] === 'hazard'
  const solid = (c: number, r: number) => !walk(c, r) && !hazard(c, r)
  const wall = (c: number, r: number, d: number, s: number) => (solid(c, r) ? walk(d, s) : walk(c, r) && solid(d, s))
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const role = f.roles[r][c], at = `[${c}, ${r}] ${role}`
    want(ROLE_OF.get(tiles[r][c]) === role, () => `${at} holds tile ${tiles[r][c]}`)
    want(walk(c, r) === WALKABLE.includes(role), () => `${at}: tilemap disagrees on walking`)
    want(!walk(c, r) || (c > 0 && r > 0 && c < w - 1 && r < h - 1), () => `${at} is walkable on the edge`)
    if (role === 'hazard') continue
    const n = wall(c, r, c, r - 1), ws = wall(c, r, c - 1, r)
    const column = !n && !ws && wall(c - 1, r - 1, c, r - 1) && wall(c - 1, r - 1, c - 1, r)
    let draws: string
    if (role.startsWith('door-ew')) {
      // an arch on its w side, ground either side of it, in a wall of rock along y: the door's own
      // cell's rock, or the rock of the door's cell west of it
      draws = n ? 'door-ew-n' : 'door-ew'
      want(walk(c - 1, r) && ((solid(c, r - 1) && solid(c, r + 1)) || (solid(c - 1, r - 1) && solid(c - 1, r + 1))), () => `${at}: its arch is in no wall`)
    } else if (role.startsWith('door-ns')) {
      draws = ws ? 'door-ns-w' : 'door-ns'
      want(walk(c, r - 1) && ((solid(c - 1, r) && solid(c + 1, r)) || (solid(c - 1, r - 1) && solid(c + 1, r - 1))), () => `${at}: its arch is in no wall`)
    } else if (walk(c, r)) draws = n && ws ? 'floor-nw' : n ? 'floor-n' : ws ? 'floor-w' : column ? 'floor-c' : 'floor'
    else draws = n && ws ? 'wall-nw' : n ? 'wall-n' : ws ? 'wall-w' : column ? 'wall-c' : 'void'
    want(role === draws, () => `${at}: draws ${draws}`)
  }

  const cell = (o: { pos: number[] }) => Math.floor(o.pos[1]) * w + Math.floor(o.pos[0])
  want(new Set(f.actors.map(cell)).size === f.actors.length, () => 'two actors share a cell')

  // Reachable from the up stairs around the blocking objects.
  const blocker = new Set(f.actors.filter(o => BLOCKING.includes(o.is)).map(cell))
  const up = f.actors.find(o => o.is === 'stairs' && o.way === 'up')!
  const down = f.actors.find(o => o.is === 'stairs' && o.way === 'down')!
  const dist = new Int32Array(w * h).fill(-1), queue = [cell(up)]
  dist[cell(up)] = 0
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i] % w, r = Math.floor(queue[i] / w)
    for (const [, dc, dr] of SIDES) {
      const j = (r + dr) * w + c + dc
      if (walk(c + dc, r + dr) && !blocker.has(j) && dist[j] < 0) { dist[j] = dist[queue[i]] + 1; queue.push(j) }
    }
  }
  for (let i = 0; i < w * h; i++) want(!open[i] || blocker.has(i) || dist[i] >= 0, () => `[${i % w}, ${Math.floor(i / w)}] is out of reach`)
  for (const b of blocker) want(SIDES.some(([, dc, dr]) => dist[b + dr * w + dc] >= 0), () => `the blocker at ${b} has no free side`)
  want(dist[cell(down)] >= k.stairs.apart, () => `the stairs are ${dist[cell(down)]} apart`)

  // Each actor on a cell of the kind its entry asks for.
  for (const o of f.actors) {
    const c = Math.floor(o.pos[0]), r = Math.floor(o.pos[1]), role = f.roles[r][c], at = `${o.is} at [${c}, ${r}] on ${role}`
    if (o.is === 'torch') {
      // on rock with ground on one side only, the side it faces, which is no arch's
      const open = SIDES.filter(([, dc, dr]) => walk(c + dc, r + dr))
      want(solid(c, r) && open.length === 1 && open[0][0] === o.face && ['s', 'e'].includes(o.face as string) && !f.roles[r + open[0][2]][c + open[0][1]].startsWith('door'), () => at)
    } else if (o.is === 'door') want(role.startsWith('door-') && o.role === role.slice(0, 7), () => at)
    else if (o.is === 'altar') want(walk(c, r), () => at)
    else want(role.startsWith('floor') && !('role' in o), () => at)
  }
  const of = (kind: string) => f.actors.filter(o => o.is === kind)
  const between = (kind: string, lo: number, hi: number) => want(of(kind).length >= lo && of(kind).length <= hi, () => `${of(kind).length} ${kind}`)
  const doors = f.roles.flat().filter(r => r.startsWith('door-')).length
  between('door', doors, doors)
  between('pack', 3, 5)
  between('spawner', 2, 2)
  between('chest', 2, 2)
  between('barrel', 4, 8)
  between('shrine', 1, 1)
  between('torch', 6, 6)
  want(of('pack').every(o => o.pool === 'fallen' && !('count' in o) && !('apart' in o) && !('on' in o)), () => 'a pack carries a knob, or not its pool')
  for (const [kind, apart] of [['pack', 4], ['barrel', 2], ['torch', 3]] as const) {
    const list = of(kind)
    for (let i = 0; i < list.length; i++) for (let j = 0; j < i; j++) want(cheb(list[i].pos, list[j].pos) >= apart, () => `two ${kind} too near`)
  }
  for (const o of [...of('pack'), ...of('spawner')]) want(dist[cell(o)] >= 8, () => `a ${o.is} ${dist[cell(o)]} from the up stairs`)
  return bad
}

for (const [name, recipe] of Object.entries(RECIPES)) {
  test(`${name}: over 1,000 seeds, each floor is the same twice, sound, and reachable from the up stairs`, () => {
    const seen = new Set<Role>()
    for (let seed = 0; seed < 1000; seed++) {
      const f = build(seeded(seed), recipe, THEME, SOURCE, { altar: ALTAR })
      const again = build(seeded(seed), recipe, THEME, SOURCE, { altar: ALTAR })
      if (JSON.stringify(again) !== JSON.stringify(f)) expect(again, `seed ${seed}`).toEqual(f)
      const bad = faults(f, recipe)
      if (name === 'halls') {
        // The altar's room: the pentagram under the altar, on the one cell it is placed.
        const altar = f.actors.find(o => o.is === 'altar')!
        const [c, r] = altar.pos.map(Math.floor)
        if (altar.boss !== 'lazarus' || altar.pos[0] !== c + 0.5 || altar.pos[1] !== r + 0.5) bad.push(`the altar ${JSON.stringify(altar)}`)
        if (tilesOf(f).flat().filter(t => t === PENTAGRAM).length !== 1 || tilesOf(f)[r][c] !== PENTAGRAM) bad.push('the pentagram')
      } else if (tilesOf(f).flat().includes(PENTAGRAM)) bad.push('a pentagram with no piece')
      if (bad.length) expect(bad, `seed ${seed}`).toEqual([])
      for (const r of f.roles.flat()) seen.add(r)
    }
    // What makes each algorithm its own.
    expect(['door-ns', 'door-ew', 'hazard'].filter(r => seen.has(r as Role))).toEqual(
      name === 'rooms' ? ['door-ns', 'door-ew'] : name === 'caves' ? [] : ['door-ns', 'door-ew', 'hazard'])
    for (const r of ['floor', 'floor-n', 'floor-w', 'floor-nw', 'floor-c', 'void', 'wall-n', 'wall-w', 'wall-nw', 'wall-c'] as Role[]) {
      expect(seen.has(r), r).toBe(true)
    }
  }, 60_000)
}

test('different seeds make different floors', () => {
  for (const recipe of Object.values(RECIPES)) {
    const a = build(seeded(1), recipe, THEME, SOURCE, { altar: ALTAR }), b = build(seeded(2), recipe, THEME, SOURCE, { altar: ALTAR })
    expect(a.roles).not.toEqual(b.roles)
  }
})

// ---------------------------------------------------------------- masks

const GROUND = { '#': 'rock', '.': 'floor', '+': 'door', '~': 'hazard' } as const
const ground = (rows: string[]) => rows.map(row => [...row].map(ch => GROUND[ch as keyof typeof GROUND]))
// A letter per role: ground with a wall on its n side, its w side or both a b c, and with a column
// o; rock with a wall on its n side, its w side or both N W L, and with a column C; arches : and =,
// with a wall on the cell's other upper side ; and \.
const LEGEND: Record<string, Role> = {
  '.': 'floor', a: 'floor-n', b: 'floor-w', c: 'floor-nw', o: 'floor-c',
  ':': 'door-ns', '=': 'door-ew', ';': 'door-ns-w', '\\': 'door-ew-n', '~': 'hazard', ' ': 'void',
  N: 'wall-n', W: 'wall-w', L: 'wall-nw', C: 'wall-c',
}
const roles = (rows: string[]) => rows.map(row => [...row].map(ch => LEGEND[ch]))

const ROOM = [
  '##########',
  '#........#',
  '#.#......#',
  '#....##..#',
  '#....##..#',
  '#........#',
  '###+######',
  '###.~~~~~#',
  '##########',
]
const SPLIT = [
  '#######', '#.....#', '#..#..#', '#..#..#', '#..#..#', '#..+..#', '#..#..#', '#..#..#', '#..#..#', '#.....#', '#######',
]

test('a room, a block of one rock, a block of four, a door onto a ledge over a hazard: each wall on the side between rock and ground, drawn by the cell below it or right of it', () => {
  expect(autotile(ground(ROOM))).toEqual(roles([
    '          ',
    ' caaaaaaaW',
    ' bLb.....W',
    ' bao.LNb.W',
    ' b...W b.W',
    ' b...aao.W',
    ' NN;LNNNNC',
    '   b~~~~~ ',
    '   N      ',
  ]))
})

test('a wall of rock one cell thick shows both its faces, and the arch of the door through it stands on its front face, the door\'s own cell a passage', () => {
  const t = autotile(ground(SPLIT))
  // the west face drawn by the rock, the east face by the ground east of it
  expect([t[3][3], t[3][4], t[2][3], t[8][3], t[9][3]]).toEqual(['wall-w', 'floor-w', 'wall-nw', 'wall-w', 'floor-n'])
  // the arch on the east face, in the cell east of the door; the door's cell with the rock over it
  expect([t[5][4], t[5][3], t[4][4], t[6][4], t[6][3]]).toEqual(['door-ew', 'floor-n', 'floor-w', 'floor-w', 'wall-nw'])
})

test('an arch stands in the door\'s own cell, beside the wall its passage runs along, where its wall has no front face past it', () => {
  // a door through a room's east wall, a corridor on from it: no ground east of the wall past the door
  const t = autotile(ground(['#######', '#...###', '#...+.#', '#...###', '#######']))
  expect([t[2][4], t[1][4], t[3][4], t[2][5]]).toEqual(['door-ew-n', 'wall-w', 'wall-nw', 'floor-n'])
})

// Turning a map over its diagonal swaps n with w and e with s: every role turns with it.
const TURN: Record<string, Role> = {
  'floor-n': 'floor-w', 'floor-w': 'floor-n', 'wall-n': 'wall-w', 'wall-w': 'wall-n',
  'door-ns': 'door-ew', 'door-ew': 'door-ns', 'door-ns-w': 'door-ew-n', 'door-ew-n': 'door-ns-w',
}
const turned = (role: Role) => TURN[role] ?? role
const transpose = <T>(g: T[][]) => g[0].map((_, c) => g.map(row => row[c]))

test('a map turned over its diagonal gets the same roles turned', () => {
  for (const map of [ROOM, SPLIT, ['#######', '#...###', '#...+.#', '#...###', '#######']]) {
    const t = autotile(transpose(ground(map)))
    expect(t).toEqual(transpose(autotile(ground(map))).map(row => row.map(turned)))
  }
  expect(autotile(transpose(ground(SPLIT)))[4][5]).toBe('door-ns')
})

test('a door not between two walls is floor', () => {
  expect(autotile(ground(['#####', '#...#', '#.+.#', '#...#', '#####']))[2][2]).toBe('floor')
})

test('rock and ground meeting only at a corner draw as they meet: the column where two walls turn, and ground that touches ground only at a corner', () => {
  expect(autotile(ground(['#####', '#.###', '###.#', '#####']))).toEqual(roles([
    '     ',
    ' cW  ',
    ' NCcW',
    '   NC',
  ]))
})

// ---------------------------------------------------------------- the theme

test('a tile is picked by its probability, never one of probability 0, and a void with no tile is none', () => {
  const pal = palette({ name: 'p', tilewidth: 128, tileheight: 64, tiles: [{ id: 1, type: 'floor', probability: 3 }, { id: 2, type: 'floor' }, { id: 3, type: 'floor', probability: 0 }, { id: 4, type: 'wall-n', ...HIT }, { id: 5 }] })
  const die = seeded(7), n = 40_000, got = new Map<number, number>()
  for (let i = 0; i < n; i++) { const id = pick(die, pal, 'floor'); got.set(id, (got.get(id) ?? 0) + 1) }
  expect(Math.abs(got.get(1)! / n - 0.75)).toBeLessThan(0.01)
  expect([...got.keys()].sort()).toEqual([1, 2])
  expect(pick(die, pal, 'void')).toBe(-1)
  expect(() => pick(die, pal, 'wall-w')).toThrow('theme p has no tile for wall-w')
  expect(() => palette({ name: 'p', tilewidth: 128, tileheight: 64, tiles: [{ id: 1, type: 'lava' }] })).toThrow('tile 1 has type lava, which is no role')
})

test('a tile of a role walked on has no collision, and every other tile of a role has some', () => {
  const theme = (tile: { id: number; type?: string; objectgroup?: { objects: unknown[] } }): Theme => ({ name: 'p', tilewidth: 128, tileheight: 64, tiles: [tile] })
  for (const type of ['door-ns', 'floor-nw', 'door-ew-n']) expect(() => palette(theme({ id: 1, type, ...HIT }))).toThrow(`theme p: tile 1 is ${type}, which is walked on, and has collision`)
  for (const type of ['wall-n', 'hazard', 'void']) expect(() => palette(theme({ id: 2, type }))).toThrow(`theme p: tile 2 is ${type}, which blocks, and has no collision`)
  expect(() => palette(theme({ id: 3, type: 'wall-c', objectgroup: { objects: [] } }))).toThrow('tile 3 is wall-c, which blocks, and has no collision')
  expect(() => palette(theme({ id: 4, ...HIT }))).not.toThrow()
})

test('a recipe with no ground lays every tile on its one layer, and a theme with no grid is an orthogonal grid of its tile size', () => {
  const { ground: _, ...flat } = RECIPES.rooms
  const { grid: __, ...square } = THEME
  const f = build(seeded(4), flat, square, SOURCE)
  expect([f.map.orientation, f.map.tilewidth, f.map.tileheight, f.map.nextlayerid]).toEqual(['orthogonal', 128, 64, 2])
  expect(f.map.layers.map(l => l.name)).toEqual(['standing'])
  expect(tilesOf(f)).toEqual(tilesOf(build(seeded(4), RECIPES.rooms, THEME, SOURCE)))
})

test('a theme with no columns of rock and no arches gets none: the rock that would need one is opened, and doors are floor', () => {
  const none: Role[] = ['wall-c', 'door-ns', 'door-ew', 'door-ns-w', 'door-ew-n']
  const lean: Theme = { ...THEME, name: 'lean', tiles: THEME.tiles!.filter(t => !none.includes(t.type as Role)) }
  for (const recipe of Object.values(RECIPES)) for (let seed = 0; seed < 50; seed++) {
    const f = build(seeded(seed), recipe, lean, SOURCE, { altar: ALTAR })
    expect(f.roles.flat().filter(r => none.includes(r))).toEqual([])
    expect(f.actors.filter(o => o.is === 'door')).toEqual([])
  }
  // a theme with no arch beside a wall keeps the doors whose arch stands on a front face
  const plain: Theme = { ...THEME, name: 'plain', tiles: THEME.tiles!.filter(t => !['door-ns-w', 'door-ew-n'].includes(t.type ?? '')) }
  let doors = 0
  for (let seed = 0; seed < 50; seed++) {
    const f = build(seeded(seed), RECIPES.rooms, plain, SOURCE)
    expect(f.roles.flat().filter(r => r === 'door-ns-w' || r === 'door-ew-n')).toEqual([])
    doors += f.actors.filter(o => o.is === 'door').length
  }
  expect(doors).toBeGreaterThan(0)
})

// ---------------------------------------------------------------- set pieces

// A block of one rock in a ring of floor, painted in roles, with a statue on its top-left cell.
const PILLAR: Piece = {
  width: 3, height: 3, tilewidth: 64, tileheight: 64,
  tilesets: [{ firstgid: 1, tiles: [{ id: 0, type: 'floor' }, { id: 1, type: 'wall-nw' }] }],
  layers: [
    { type: 'group', name: 'g', layers: [{ type: 'tilelayer', name: 'roles', width: 3, height: 3, data: [1, 1, 1, 1, 2, 1, 1, 1, 1] }] },
    { type: 'objectgroup', name: 'things', objects: [{ type: 'statue', x: 0, y: 0, width: 64, height: 64 }] },
  ],
}

test('a piece stamped on floor stands where it was painted, its actor on its cell', () => {
  const recipe: Recipe = { ...RECIPES.halls, pieces: [{ name: 'pillar', where: 'floor' }, { name: 'altar', where: 'solid' }] }
  for (let seed = 0; seed < 100; seed++) {
    const f = build(seeded(seed), recipe, THEME, SOURCE, { pillar: PILLAR, altar: ALTAR })
    expect(faults(f, recipe)).toEqual([])
    const statue = f.actors.find(o => o.is === 'statue')!
    const [c, r] = [statue.pos[0] - 0.5, statue.pos[1] - 0.5]
    expect(Number.isInteger(c) && Number.isInteger(r)).toBe(true)
    // the rock, its faces toward the viewer drawn by the ground below it and right of it, and the
    // column at its corner that points at the viewer
    expect([f.roles[r + 1][c + 1], f.roles[r + 1][c + 2], f.roles[r + 2][c + 1], f.roles[r + 2][c + 2]]).toEqual(['wall-nw', 'floor-w', 'floor-n', 'floor-c'])
    // the rest walked on, a door's arch among them where one opens onto it
    for (const [dc, dr] of [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]]) expect(WALKABLE).toContain(f.roles[r + dr][c + dc])
  }
})

test('a piece the recipe names but was not handed, a flipped tile, a tile the theme has no role for and a place too small all throw', () => {
  expect(() => build(seeded(1), RECIPES.halls, THEME, SOURCE, {})).toThrow('piece altar, which was not handed in')
  const flipped = structuredClone(ALTAR);
  (flipped.layers[0].data as number[])[0] = 2 + 0x80000000
  expect(() => build(seeded(1), RECIPES.halls, THEME, SOURCE, { altar: flipped })).toThrow('flips a tile')
  const stray = structuredClone(ALTAR);
  (stray.layers[0].data as number[])[0] = 100 + 99
  expect(() => build(seeded(1), RECIPES.halls, THEME, SOURCE, { altar: stray })).toThrow('tile 99 has no role in theme test')
  const tiny: Recipe = { ...RECIPES.halls, size: [9, 9], tries: 3 }
  expect(() => build(seeded(1), tiny, THEME, SOURCE, { altar: ALTAR })).toThrow(/no floor in 3 tries; the last: /)
})

test('a recipe out of range throws a sentence naming the knob', () => {
  expect(() => build(seeded(1), { ...RECIPES.rooms, rooms: { leaf: 5, room: [4, 7], door: 0.5 } } as Recipe, THEME, SOURCE)).toThrow('rooms.leaf must be')
  expect(() => build(seeded(1), { ...RECIPES.caves, caves: { fill: 1.5, steps: 4, born: 5, stays: 4, keep: 20 } } as Recipe, THEME, SOURCE)).toThrow('caves.fill must be a chance')
  expect(() => build(seeded(1), { ...RECIPES.rooms, stairs: { ...common.stairs, apart: 0 } }, THEME, SOURCE)).toThrow('stairs.apart')
})
