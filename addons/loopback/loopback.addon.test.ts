// The in-memory wire, on an accept written here that records what the page sends and hands back a
// function the test sends down with. Without a network every send arrives in the same call; with
// one, on a clock the test holds, every item is the millisecond it was sent at, so where it lands
// says how long it waited.
import { expect, test } from 'vitest'
import { loopback, type Leg, type Net } from './loopback.addon.ts'

test('with no network, every send arrives in the same call, both ways, and closing lets the seat go once', () => {
  const took: number[] = [], fanned: number[] = []
  let down!: (d: number) => void
  let closed = 0
  const page = loopback<number, number>(send => { down = send; return { take: u => { took.push(u) }, close: () => { closed++ } } })(d => fanned.push(d))
  page.send(1)
  down(2)
  expect([took, fanned]).toEqual([[1], [2]])
  page.close(); page.close()
  expect(closed).toBe(1)
})

// The millisecond network, on a clock the test holds: `after` queues a call at a time, and `to`
// runs every call due by then in time order, the one queued first first among equals. Every item
// here is the millisecond it was sent at, so where it lands says how long it waited.
function timed(net: Net) {
  let now = 0
  const queue: { at: number; k: number; f: () => void }[] = []
  let k = 0
  const time = { now: () => now, after: (ms: number, f: () => void) => { queue.push({ at: now + ms, k: k++, f }) } }
  const to = (t: number) => {
    for (;;) {
      queue.sort((a, b) => a.at - b.at || a.k - b.k)
      if (!queue.length || queue[0].at > t) break
      const e = queue.shift()!
      now = e.at
      e.f()
    }
    now = t
  }
  const took: [number, number][] = [] // [the millisecond it arrived at, the item]
  const fanned: [number, number][] = []
  let down!: (d: number) => void
  let closed = 0
  const accept = (send: (d: number) => void) => {
    down = send
    return { take: (u: number) => { took.push([now, u]) }, close: () => { closed++ } }
  }
  const page = loopback(accept, time, net)(d => fanned.push([now, d]))
  return { to, took, fanned, page, send: (d: number) => down(d), closes: () => closed, at: (t: number) => { now = t } }
}
const still: Leg = { delay: 0 }

test('an item arrives the very millisecond its way\'s delay says, each way its own', () => {
  const g = timed({ up: { delay: 37.5 }, down: { delay: 12.25 }, seed: 1 })
  g.at(3); g.page.send(3); g.send(3)
  g.to(100)
  expect(g.took).toEqual([[40.5, 3]])
  expect(g.fanned).toEqual([[15.25, 3]])
})

test('jitter spreads the wait over 0 to jitter more; with tail most waits are short and a few are many times it', () => {
  const even = timed({ up: still, down: { delay: 10, jitter: 20 }, seed: 3 })
  for (let t = 0; t < 4000; t += 10) { even.at(t); even.send(t) }
  even.to(1e9)
  // In order, an item waits behind the one before: so compare the spread without the kept order.
  const free = timed({ up: still, down: { delay: 10, jitter: 20, reorder: 1 }, seed: 3 })
  for (let t = 0; t < 4000; t += 10) { free.at(t); free.send(t) }
  free.to(1e9)
  const waits = free.fanned.map(([at, d]) => at - d)
  expect(Math.min(...waits)).toBeGreaterThanOrEqual(10)
  expect(Math.max(...waits)).toBeLessThan(30)
  expect(Math.max(...waits) - Math.min(...waits)).toBeGreaterThan(18)
  const tail = timed({ up: still, down: { delay: 10, jitter: 5, tail: true, reorder: 1 }, seed: 3 })
  for (let t = 0; t < 40000; t += 10) { tail.at(t); tail.send(t) }
  tail.to(1e9)
  const extra = tail.fanned.map(([at, d]) => at - d - 10).sort((a, b) => a - b)
  expect(extra[Math.floor(extra.length / 2)]).toBeLessThan(5)
  expect(extra[extra.length - 1]).toBeGreaterThan(5 * 5)
})

test('a way keeps order, as TCP does: an item never arrives before the one sent before it', () => {
  const g = timed({ up: still, down: { delay: 10, jitter: 40 }, seed: 5 })
  for (let t = 0; t < 2000; t += 5) { g.at(t); g.send(t) }
  g.to(1e9)
  const sent = g.fanned.map(([, d]) => d)
  expect(sent).toEqual([...sent].sort((a, b) => a - b))
  const arrived = g.fanned.map(([at]) => at)
  expect(arrived).toEqual([...arrived].sort((a, b) => a - b))
})

test('reorder lets an item pass the one before; loss drops, dup hands on twice at once', () => {
  const passed = timed({ up: still, down: { delay: 10, jitter: 40, reorder: 1 }, seed: 5 })
  for (let t = 0; t < 2000; t += 5) { passed.at(t); passed.send(t) }
  passed.to(1e9)
  const sent = passed.fanned.map(([, d]) => d)
  expect(sent).not.toEqual([...sent].sort((a, b) => a - b))

  const lost = timed({ up: { delay: 1, loss: 1 }, down: { delay: 1, loss: 1 }, seed: 1 })
  for (let i = 0; i < 5; i++) { lost.page.send(i); lost.send(i) }
  lost.to(100)
  expect([lost.took, lost.fanned]).toEqual([[], []])

  const twice = timed({ up: { delay: 4, dup: 1 }, down: still, seed: 1 })
  twice.page.send(1); twice.page.send(2)
  twice.to(100)
  expect(twice.took).toEqual([[4, 1], [4, 1], [4, 2], [4, 2]])
})

test('a burst holds an item back and hands it on with the next one', () => {
  const net: Net = { up: still, down: { delay: 10, burst: 1 }, seed: 1 }
  const g = timed(net)
  g.at(0); g.send(0)
  g.at(16); g.send(16)
  g.to(20)
  expect(g.fanned).toEqual([])
  net.down.burst = 0
  g.at(33); g.send(33)
  g.to(100)
  expect(g.fanned).toEqual([[43, 0], [43, 16], [43, 33]])
})

test('one seed rolls one network: the same sends land on the same milliseconds', () => {
  const run = () => {
    const g = timed({ up: { delay: 20, jitter: 15, loss: 0.1, dup: 0.1 }, down: { delay: 30, jitter: 25, tail: true, burst: 0.2, reorder: 0.1 }, seed: 9 })
    for (let t = 0; t < 1000; t += 7) { g.at(t); g.page.send(t); g.send(t) }
    g.to(1e9)
    return [g.took, g.fanned]
  }
  expect(run()).toEqual(run())
})

test('the knobs are read live: a leg turned carries what is sent after it its new way', () => {
  const net: Net = { up: { delay: 1 }, down: still, seed: 1 }
  const g = timed(net)
  g.page.send(0)
  net.up.delay = 4
  g.page.send(0)
  g.to(100)
  expect(g.took).toEqual([[1, 0], [4, 0]])
})

test('a wire that takes open ms to open makes the seat only then, and what the page sent before waits for it', () => {
  let made = -1
  let now = 0
  const queue: { at: number; f: () => void }[] = []
  const time = { now: () => now, after: (ms: number, f: () => void) => { queue.push({ at: now + ms, f }) } }
  const took: [number, number][] = []
  const page = loopback<number, number>(() => { made = now; return { take: u => { took.push([now, u]) }, close: () => {} } }, time, { up: { delay: 2 }, down: still, seed: 1, open: 30 })(() => {})
  page.send(7)
  expect(made).toBe(-1)
  const run = () => { while (queue.length) { queue.sort((a, b) => a.at - b.at); const e = queue.shift()!; now = e.at; e.f() } }
  run()
  expect(made).toBe(30)
  expect(took).toEqual([[32, 7]])
})

test('a leg\'s wait gives an item its own wait, or drops it, and leaves the rest to the knobs', () => {
  const waits = new Map<number, number | null>([[1, 50], [2, null]])
  // Each item here is the millisecond it was sent at, and its own wait is kept by that.
  const g = timed({ up: still, down: { delay: 10, wait: d => waits.get(d as number) }, seed: 1 })
  g.at(5); g.send(1); g.send(2); g.send(3)
  g.to(1000)
  // 3 waits its 10 ms and then behind 1, which arrives at 55, as the way keeps order.
  expect(g.fanned).toEqual([[55, 1], [55, 3]])
})

test('closing a timed wire lets the seat go once and hands on nothing still on the way', () => {
  const g = timed({ up: { delay: 5 }, down: { delay: 5 }, seed: 1 })
  g.page.send(0); g.send(0)
  g.page.close(); g.page.close()
  g.to(100)
  expect(g.closes()).toBe(1)
  expect([g.took, g.fanned]).toEqual([[], []])
})
