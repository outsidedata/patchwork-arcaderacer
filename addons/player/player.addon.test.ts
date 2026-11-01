// The player addon: a seat per slot the scene declares, a `player` row per seat that every seat is
// sent and only its own sees as `mine`, a slot a `player` row sits in taken, and the scene file's
// `security` block.
//
// The security tests boot a scene written here. Each seat's `player` row spawns one `token`, and
// each token spawns one `shot`, so a shot's owner is carried down two spawns. A `player` act calls
// the shared `table` row's `deal`, which spawns a `card` and writes the dealing player as its
// owner. The table's own `tick` spawns a `crumb`, which nobody owns. The block sends `secret` to
// the group `me`, `plan` and a card's `face` to the group `team`, and lists `open` nowhere.
//
// The vision tests boot a field of two sides written here, with a `world.vision` block and a
// `security` block. A seat's `player` row raises a `building` on its slot's `start`, and the
// building trains a `unit` beside it, so the unit is owned by the player two spawns down. Both see
// 2 cells of a 20 × 10 map of 10-unit cells; the starts, at (1, 1) and (18, 1), are always sent. The
// block sends a building's `queue`, `left` and `rally`, and a unit's `job`, `goal` and `target`, to
// the group `me`; `hp` is listed nowhere.
import { expect, test } from 'vitest'
import { boot, type Scene, type Sim } from '#engine/engine.ts'
import { sees } from '#addons/vision/vision.addon.ts'
import { free, join, leave, own, playtest, possessed, type Think } from './player.addon.ts'

const scene = (): Scene => ({
  world: {},
  prefabs: {
    engine: { dt: 1 / 60 },
    player: { seat: 0, token: 0, masks: [] },
    token: { secret: 1, plan: 2, open: 3, shot: 0 },
    shot: { secret: 4 },
    table: { crumbs: 0 },
    card: { face: 5 },
    crumb: { secret: 6 },
  },
  actors: [{ is: 'table' }],
  seats: 4,
  security: { token: { secret: 'me', plan: 'team' }, shot: { secret: 'me' }, card: { face: 'team' }, crumb: { secret: 'me' } },
})

const sim: Sim = {
  player: {
    before(me, _dt, w) { if (!me.data.token) me.data.token = w.spawn('token').id },
    acts: { deal: (me, w, seat) => w.call(w.find('table'), 'deal', seat, me.id) },
  },
  token: { before(me, _dt, w) { if (!me.data.shot) me.data.shot = w.spawn('shot').id } },
  shot: {},
  table: {
    tick(me, _dt, w) { if (!me.data.crumbs++) w.spawn('crumb') },
    acts: { deal: (_me, w, _seat, owner: number) => { w.spawn('card', { owner }) } },
  },
  card: {},
  crumb: {},
}

const start = (file = scene()) => {
  const truth = boot(file, sim)
  const seats = [join(truth), join(truth), join(truth), join(truth)]
  truth.step(1 / 60)
  truth.step(1 / 60)
  const player = (slot: number) => truth.rows.find(r => r.kind === 'player' && r.data.seat === slot)!
  const sent = (seat: number, kind: string) => truth.packet(seat).rows.filter(r => r.kind === kind)
  return { truth, seats, player, sent }
}

test('a me field goes only to the seat whose player row spawned the row, and the owner is a field on each row', () => {
  const { truth, seats, player, sent } = start()
  expect(truth.rows.filter(r => r.kind === 'token').length).toBe(4)
  expect(truth.rows.filter(r => r.kind === 'shot').length).toBe(4)
  for (const [slot, seat] of seats.entries()) {
    const me = player(slot)
    expect(me.data.owner).toBe(me.id)
    expect(me.data.masks).toEqual([`me/${me.id}`])
    const token = truth.rows.find(r => r.id === me.data.token)!
    const shot = truth.rows.find(r => r.id === token.data.shot)!
    expect([token.data.owner, shot.data.owner]).toEqual([me.id, me.id])
    expect(sent(seat, 'token').length).toBe(4)
    expect(sent(seat, 'shot').length).toBe(4)
    expect(sent(seat, 'token').filter(r => 'secret' in r.data).map(r => r.id)).toEqual([token.id])
    expect(sent(seat, 'shot').filter(r => 'secret' in r.data).map(r => r.id)).toEqual([shot.id])
    expect(sent(seat, 'token').every(r => r.data.open === 3)).toBe(true)
  }
  // The truth's own rows keep every field: only the packets are without them.
  expect(truth.rows.filter(r => r.kind === 'token').every(r => r.data.secret === 1)).toBe(true)
})

test('a team field goes to the seats that share a team/<name> with the owner, as the masks are when the packet is made', () => {
  const { seats, player, sent } = start()
  player(0).data.masks.push('team/red')
  player(1).data.masks.push('team/red', 'team/blue')
  player(2).data.masks.push('team/blue')
  // Slot 3 is on no team.
  const plans = (seat: number) => sent(seat, 'token').filter(r => 'plan' in r.data).map(r => r.id).sort()
  const token = (slot: number) => player(slot).data.token
  expect(plans(seats[0])).toEqual([token(0), token(1)].sort())
  expect(plans(seats[1])).toEqual([token(0), token(1), token(2)].sort())
  expect(plans(seats[2])).toEqual([token(1), token(2)].sort())
  expect(plans(seats[3])).toEqual([])
  player(2).data.masks.push('team/red')
  expect(plans(seats[0])).toEqual([token(0), token(1), token(2)].sort())
})

test('an owner the spawning code writes is kept, and a row spawned by a row with no owner has none', () => {
  const { truth, seats, player, sent } = start()
  player(0).data.masks.push('team/red')
  player(1).data.masks.push('team/red')
  player(2).data.masks.push('team/blue')
  truth.inbox(seats[0], { seq: 1, n: truth.n, id: player(0).id, action: 'deal', args: [] })
  truth.step(1 / 60)
  expect(truth.rows.find(r => r.kind === 'card')!.data.owner).toBe(player(0).id)
  expect(seats.map(s => sent(s, 'card').length)).toEqual([1, 1, 1, 1])
  expect(seats.map(s => sent(s, 'card').filter(r => 'face' in r.data).length)).toEqual([1, 1, 0, 0])
  expect('owner' in truth.rows.find(r => r.kind === 'crumb')!.data).toBe(false)
  expect(seats.map(s => sent(s, 'crumb').filter(r => r.data.secret === 6).length)).toEqual([1, 1, 1, 1])
})

test('a row whose owner has left sends its listed fields to no seat', () => {
  const { truth, seats, player, sent } = start()
  const gone = player(3)
  leave(truth, seats[3])
  expect(seats.slice(0, 3).map(s => sent(s, 'token').filter(r => r.id === gone.data.token && 'secret' in r.data).length)).toEqual([0, 0, 0])
})

test('a scene with no security block writes no owner and sends every field', () => {
  const plain = scene()
  delete plain.security
  const { truth, seats, player, sent } = start(plain)
  expect(player(0).data.masks).toEqual([])
  expect(truth.rows.some(r => 'owner' in r.data)).toBe(false)
  expect(seats.map(s => sent(s, 'token').filter(r => r.data.secret === 1 && r.data.plan === 2).length)).toEqual([4, 4, 4, 4])
})

test('a group with a /, a player prefab with no masks list, and a player row whose masks is not a list throw', () => {
  const slashed = scene()
  ;(slashed.security as any).token.plan = 'team/red'
  expect(() => start(slashed)).toThrow('security token.plan is "team/red": a group is a name without a /')
  const maskless = scene()
  delete maskless.prefabs.player.masks
  expect(() => start(maskless)).toThrow('a scene with a security block gives its player prefab a masks list')
  const { seats, player, truth } = start()
  delete player(1).data.masks
  expect(() => truth.packet(seats[0])).toThrow(`player row ${player(1).id} has no masks list`)
})

test('every seat is sent every player row, and only its own carries mine', () => {
  const { seats, player, sent } = start()
  for (const [slot, seat] of seats.entries()) {
    const players = sent(seat, 'player')
    expect(players.map(r => r.data.seat).sort()).toEqual([0, 1, 2, 3])
    expect(players.filter(r => 'mine' in r.data).map(r => r.id)).toEqual([player(slot).id])
    expect(possessed(players)?.id).toBe(player(slot).id)
  }
})

test('a slot is free while fewer seats than the scene declares are taken, and join throws once none is', () => {
  const truth = boot(scene(), sim)
  const seats: number[] = []
  for (let i = 0; i < 4; i++) {
    expect(free(truth)).toBe(true)
    seats.push(join(truth))
  }
  expect(free(truth)).toBe(false)
  expect(() => join(truth)).toThrow('no seat free: 4 declared')
  leave(truth, seats[1])
  expect(free(truth)).toBe(true)
})

// Two playtesters on the addon: seats the server drives itself, no browser, no client files. Each
// reads the rows its seat is sent and climbs its own `player` row to the top, one press a step, and
// then presses nothing. Each is sent both `player` rows and climbs the one that is `mine`.
test('two playtesters on the addon each play their own seat off the rows it is sent', () => {
  const ladder: Scene = { world: {}, seats: 2, prefabs: { engine: { dt: 1 / 60 }, player: { seat: 0, rung: 0, top: 10 } }, actors: [] }
  const climb: Think = rows => {
    expect(rows.filter(r => r.kind === 'player').length).toBe(2)
    const me = possessed(rows)!
    if (me.data.rung < me.data.top) return ['climb']
  }
  const truth = boot(ladder, { player: { acts: { climb(me) { me.data.rung++ } } } })
  const pipes = [0, 1].map(() => playtest(truth, climb))
  for (let n = 0; n < 60; n++) truth.step(1 / 60)
  const rungs = truth.rows.filter(r => r.kind === 'player').map(r => r.data.rung)
  pipes.forEach(p => p.close())
  expect(rungs).toEqual([10, 10])
  expect(truth.rows.some(r => r.kind === 'player')).toBe(false)
})

const field = (): Scene => ({
  world: { vision: { cell: 10, size: [20, 10], at: 'pos', slot: 'slot', sight: { building: 2, unit: 2 }, always: ['start'] } },
  prefabs: {
    player: { seat: 0, masks: [], building: 0 },
    start: { slot: 0, pos: [0, 0] },
    building: { slot: 0, pos: [0, 0], unit: 0, queue: ['unit'], left: 3, rally: [0, 0], hp: 100 },
    unit: { slot: 0, pos: [0, 0], job: 'gather', goal: [0, 0], target: 0, hp: 40 },
  },
  actors: [{ is: 'start', slot: 0, pos: [15, 15] }, { is: 'start', slot: 1, pos: [185, 15] }],
  seats: 2,
  security: { building: { queue: 'me', left: 'me', rally: 'me' }, unit: { job: 'me', goal: 'me', target: 'me' } },
})

const sides: Sim = {
  player: {
    before(me, _dt, w) {
      if (me.data.building) return
      const at = w.find('start', s => s.data.slot === me.data.seat).data.pos
      me.data.building = w.spawn('building', { slot: me.data.seat, pos: [...at], rally: [at[0] + 10, at[1]] }).id
    },
  },
  building: { before(me, _dt, w) { if (!me.data.unit) me.data.unit = w.spawn('unit', { slot: me.data.slot, pos: [me.data.pos[0], me.data.pos[1] + 10] }).id } },
  start: {},
  unit: {},
}

const war = (file = field()) => {
  const truth = boot(file, sides)
  const seats = [join(truth), join(truth)]
  // The first step raises the buildings, the second trains their units.
  truth.step(1 / 60)
  truth.step(1 / 60)
  const mine = (kind: string, slot: number) => truth.rows.find(r => r.kind === kind && r.data.slot === slot)!
  // What a seat is sent: each row as `<kind><slot>`, or its kind alone for one with no slot.
  const sent = (seat: number) => truth.packet(seat).rows.map(r => `${r.kind}${r.data.slot ?? r.data.seat ?? ''}`).sort()
  return { truth, seats, mine, sent }
}

test('a scene whose world has a vision block sends each seat what its slot\'s side sees, and one without sends every seat every row', () => {
  const { truth, seats, mine, sent } = war()
  // A player row has no place, so vision sends every seat both.
  expect(sent(seats[0])).toEqual(['building0', 'player0', 'player1', 'start0', 'start1', 'unit0'])
  expect(sent(seats[1])).toEqual(['building1', 'player0', 'player1', 'start0', 'start1', 'unit1'])
  // Slot 1's unit walks to (3, 2), two cells from slot 0's unit at (1, 2): slot 0's side sees it.
  mine('unit', 1).data.pos = [35, 25]
  truth.step(1 / 60)
  expect(sent(seats[0])).toEqual(['building0', 'player0', 'player1', 'start0', 'start1', 'unit0', 'unit1'])
  // The side is the slot's, not the seat's number: slot 0 left and taken again by a later seat,
  // a higher number, is sent slot 0's side and what it sees.
  leave(truth, seats[0])
  const again = join(truth)
  expect(again).not.toBe(seats[0])
  truth.step(1 / 60)
  expect(sent(again).filter(r => r !== 'building0')).toEqual(['player0', 'player1', 'start0', 'start1', 'unit0', 'unit1'])
  expect(sent(again).includes('building1')).toBe(false)

  const plain = field()
  delete plain.world!.vision
  const open = war(plain)
  for (const seat of open.seats) expect(open.sent(seat).filter(r => !r.startsWith('player'))).toEqual(['building0', 'building1', 'start0', 'start1', 'unit0', 'unit1'])
  // No vision is attached to its world, so a rule's `sees` says yes to every row.
  expect(open.truth.rows.every(r => sees(open.truth.world, 0, r))).toBe(true)
})

test('a vision block of the wrong shape throws when the first seat joins', () => {
  const file = field()
  file.world!.vision.sight = { tower: 3 }
  const truth = boot(file, sides)
  expect(() => join(truth)).toThrow('vision.sight is {"tower":3}: tower is a kind with a prefab, seeing a number of cells')
})

test('an enemy building\'s queue, left and rally and an enemy unit\'s orders are never sent to the seat that sees them', () => {
  const { truth, seats, mine } = war()
  // Each side's unit walks up to the other's building: each seat sees the other side's building and unit.
  mine('unit', 0).data.pos = [165, 15]
  mine('unit', 1).data.pos = [35, 15]
  truth.step(1 / 60)
  const rows = (seat: number, kind: string) => truth.packet(seat).rows.filter(r => r.kind === kind).sort((a, b) => a.data.slot - b.data.slot)
  for (const [slot, seat] of seats.entries()) {
    const [own, enemy] = [slot, 1 - slot]
    const buildings = rows(seat, 'building'), units = rows(seat, 'unit')
    expect(buildings.map(b => b.data.slot)).toEqual([0, 1])
    expect(units.map(u => u.data.slot)).toEqual([0, 1])
    expect(buildings[own].data).toMatchObject({ queue: ['unit'], left: 3, hp: 100 })
    expect(Object.keys(buildings[own].data)).toEqual(expect.arrayContaining(['queue', 'left', 'rally']))
    expect(Object.keys(buildings[enemy].data).filter(k => ['queue', 'left', 'rally'].includes(k))).toEqual([])
    expect(buildings[enemy].data.hp).toBe(100)
    expect(units[own].data).toMatchObject({ job: 'gather', target: 0, hp: 40 })
    expect('goal' in units[own].data).toBe(true)
    expect(Object.keys(units[enemy].data).filter(k => ['job', 'goal', 'target'].includes(k))).toEqual([])
    expect(units[enemy].data.hp).toBe(40)
  }
})

test('a slot a player row sits in is taken, though no seat holds it, and that row holds of its own what a seat\'s does', () => {
  const truth = boot(scene(), sim)
  // a player row for slot 0 spawned as the editor fields a side, owning itself as join has a row own itself
  const fielded = truth.spawn('player', { seat: 0 })
  Object.assign(fielded.data, own(fielded.id, fielded.data.masks))
  expect(fielded.data).toMatchObject({ owner: fielded.id, masks: [`me/${fielded.id}`] })
  const seat = join(truth)
  const mine = truth.rows.find(r => r.kind === 'player' && r.id !== fielded.id)!
  expect(mine.data.seat).toBe(1)
  expect(mine.data).toMatchObject({ owner: mine.id, masks: [`me/${mine.id}`] })
  truth.step(1 / 60)
  // each is its own: the seat is sent both, and only its own is mine
  expect(truth.packet(seat).rows.filter(r => r.kind === 'player').map(r => r.id).sort()).toEqual([fielded.id, mine.id].sort())
  expect(possessed(truth.packet(seat).rows)?.id).toBe(mine.id)
  expect(truth.packet(seat).rows.find(r => r.id === fielded.data.token)?.data).not.toHaveProperty('secret')
})
