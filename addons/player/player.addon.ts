// The server half of the player. Owns the seats the scene declares and the channel up. A
// connection takes the lowest slot below the scene's `seats` that no seat holds and no `player` row
// sits in, and gets a `player` row holding that slot in its `seat` field; the seat possesses that row,
// so a message names an act on the player and truth runs it there. A `player` row spawned by
// something else, the editor fielding a side no seat plays, keeps its slot: a connection that comes
// after takes another.
//
// The slot is not the seat's number. The `seat` an act is handed is the truth's seat number, which
// counts every seat the truth has opened, so a connection that leaves and comes back gets a higher
// one. A rule about who is who — whose turn, which pad, which side — reads the slot off the
// `player` row and passes that on.
//
// Every seat is sent every `player` row, so the `player` row is the thing its seat plays as: the car,
// the gun, the body. A page running the scene ahead draws its own seat's row from its copy
// (`addons/predict`), so what the player drives answers the key on the next frame. A field only its
// own seat may read is listed in the scene's `security` block (below). Each `player` row its own
// seat is sent carries `mine: true`, a field every other seat is sent without, so a page finds the
// row it plays as with `possessed(rows)`, and a `player` row's look (`player.client.ts`) binds keys
// and moves the camera only for the row that is `mine`. Where it starts is a `start` actor per slot,
// which the `player` row's `before` finds by the slot, never a number in code. A row every seat
// shares and none owns is an `actors` entry, which the `player` row's acts reach with the slot. A
// kind reached only through the `player` row lists no `open`, so a seat cannot send its acts at it
// directly: `w.call` runs them without the check, because the `player` act that called it already
// passed one.
//
// When the scene file has a top-level `security` block, it also decides which fields of a row each
// seat is sent. The block names, for each kind, the group of each listed field. A row's `owner` is
// the id of a player row: a player row owns itself, and a row spawned by a hook or act of a row
// with an owner gets that owner unless the code spawning it wrote one. A row spawned in an act that
// `w.call` reached is spawned by the called row, so a shared row that spawns something for a player
// writes that player's id as its `owner` itself. A listed field of an owned row is sent to a seat
// when its player row's `masks` list and the owner's hold the same `<group>/<name>`; `join` puts
// `me/<row id>` in every player row's `masks`, so `me` is a group of one: `own(id, masks)` is what a
// player row of that id holds of its own, its `owner` and its `masks`, which `join` writes, and so
// does anything else that spawns a player row, the editor fielding a side through its recorder. Any server code may push
// onto a `masks` list, such as `team/red`, and each packet reads the lists as they are when it is
// made. A row with no owner, and a field nobody listed, is sent to every seat, and so is every field
// of a scene with no `security` block. A row whose owner has left is sent to every seat without its
// listed fields. In the browser a field the seat was not sent is not a key of the row's `data`, so
// an actor that reads one tests for it with `in`.
//
// When the scene's `world` has a `vision` block, each seat is also sent only the rows its team sees
// (`addons/vision`), its team read off the slot this addon gave it.
import type { Msg, Row, Snapshot, Truth } from '#engine/engine.ts'
import { vision } from '#addons/vision/vision.addon.ts'
import { onRestore, rewinding } from '#addons/rewind/rewind.addon.ts'

const seated = new WeakMap<Truth, Map<number, number>>() // truth seat index -> seat slot

function slots(truth: Truth): Map<number, number> {
  let m = seated.get(truth)
  if (m) return m
  seated.set(truth, (m = new Map()))
  const mine = m
  // A truth put back to a save (`addons/rewind`) holds the seats the save held.
  onRestore(truth, s => mirror(truth, s.seats))
  const rules = security(truth)
  const player = (seat: number) => truth.rows.find(r => r.kind === 'player' && r.data.seat === mine.get(seat))
  if (truth.world.vision !== undefined) vision(truth, seat => mine.get(seat))
  truth.attach({
    show: () => true,
    hide: (seat, row) => {
      // `mine` is sent only to the seat that plays the row.
      const others = row.kind === 'player' && row.data.seat !== mine.get(seat) ? ['mine'] : []
      const listed = rules?.get(row.kind)
      if (!listed || row.data.owner === undefined) return others
      const owner = truth.rows.find(r => r.id === row.data.owner)
      const theirs = owner ? masks(owner) : []
      const me = player(seat)
      const held = me ? masks(me) : []
      return [...others, ...listed.filter(([, group]) => !theirs.some(m => m.startsWith(`${group}/`) && held.includes(m))).map(([field]) => field)]
    },
    accept: () => true,
    advance: () => true,
    spawn: (row, by) => {
      if (rules && row.data.owner === undefined && by?.data.owner !== undefined) row.data.owner = by.data.owner
    },
  })
  return m
}

// The scene file's `security` block as kind -> [field, group] pairs, or nothing when it has none.
function security(truth: Truth): Map<string, [field: string, group: string][]> | undefined {
  const block = truth.scene.security
  if (block === undefined) return undefined
  if (!Array.isArray(truth.scene.prefabs.player?.masks)) throw new Error('a scene with a security block gives its player prefab a masks list')
  const rules = new Map<string, [string, string][]>()
  for (const [kind, fields] of Object.entries(block as Record<string, Record<string, unknown>>)) {
    rules.set(kind, Object.entries(fields).map(([field, group]) => {
      if (typeof group !== 'string' || group === '' || group.includes('/'))
        throw new Error(`security ${kind}.${field} is ${JSON.stringify(group)}: a group is a name without a /`)
      return [field, group]
    }))
  }
  return rules
}

function masks(player: Row): string[] {
  if (!Array.isArray(player.data.masks)) throw new Error(`player row ${player.id} has no masks list`)
  return player.data.masks
}

// What a player row holds of its own in a scene with a `security` block: it owns itself, and
// `me/<its id>` is one of its masks.
export const own = (id: number, masks: string[]) => ({ owner: id, masks: [...masks, `me/${id}`] })

// The `player` row a seat plays as, among the rows it was sent: the one that is `mine`.
export const possessed = (rows: Row[]): Row | undefined => rows.find(r => r.kind === 'player' && r.data.mine === true)

// The lowest slot no seat holds and no `player` row sits in, and the slots the scene declares.
function lowest(truth: Truth): { slot: number; seats: number } {
  const seats = truth.scene.seats
  if (seats === undefined) throw new Error('scene declares no seats')
  const taken = new Set([...slots(truth).values(), ...truth.rows.filter(r => r.kind === 'player').map(r => r.data.seat as number)])
  let slot = 0
  while (taken.has(slot)) slot++
  return { slot, seats }
}

// Whether one more connection finds a slot free: whether `join` would seat it.
export function free(truth: Truth): boolean {
  const { slot, seats } = lowest(truth)
  return slot < seats
}

export function join(truth: Truth): number {
  const { slot, seats } = lowest(truth)
  if (slot >= seats) throw new Error(`no seat free: ${seats} declared`)
  const row = truth.spawn('player', { seat: slot, mine: true })
  if (truth.scene.security !== undefined) Object.assign(row.data, own(row.id, masks(row)))
  const seat = truth.open(row.id)
  slots(truth).set(seat, slot)
  return seat
}

// A truth a page runs ahead of its server (`addons/predict`), loaded from a snapshot whose
// `seats` it was handed: each open seat that possesses a `player` row is given that row's slot, so
// the copy shows, hides and spawns as the server's truth does.
export function mirror(truth: Truth, seats: Snapshot['seats']) {
  const m = slots(truth)
  m.clear()
  seats.forEach((s, i) => {
    if (s.closed || s.possess === null) return
    const row = truth.rows.find(r => r.id === s.possess && r.kind === 'player')
    if (row) m.set(i, row.data.seat)
  })
}

export function leave(truth: Truth, seat: number) {
  const slot = slots(truth).get(seat)
  if (slot === undefined) throw new Error(`seat ${seat} never joined`)
  const row = truth.rows.find(r => r.kind === 'player' && r.data.seat === slot)
  if (!row) throw new Error(`no player row for seat ${seat}`)
  truth.end(row)
  truth.close(seat)
  slots(truth).delete(seat)
}

// A playtester: a seat the server drives itself. Every step the think reads the rows this seat
// sees and names a press or nothing; the press is sent at the seat's player row like a hand's. A
// step a server that rewinds runs again (`addons/rewind`) thinks nothing: the press it made on that
// step the first time is taken again there.
export type Think = (rows: Row[]) => [action: string, ...args: any[]] | undefined

export function playtest(truth: Truth, think: Think) {
  const seat = join(truth)
  let seq = 0, closed = false
  truth.onStep(() => {
    if (closed || rewinding(truth)) return
    const rows = truth.packet(seat).rows
    const press = think(rows)
    if (!press) return
    const me = possessed(rows)
    if (!me) throw new Error('no player row on this seat')
    truth.inbox(seat, { seq: ++seq, n: truth.n, id: me.id, action: press[0], args: press.slice(1) })
  })
  return {
    send: (msg: Msg) => truth.inbox(seat, msg),
    close() { closed = true; leave(truth, seat) },
  }
}
