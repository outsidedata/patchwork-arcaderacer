// The in-memory wire: a page and the server's side of its seat in one process. It carries whatever
// the two ends say to each other, `U` up and `D` down, and knows nothing about what they are.
//
// `accept` is the server's side of one seat: handed the function that sends to the page, it gives
// back where the page's sends go and how the seat is let go. `loopback(accept)` is the page's side:
// a wire, which `link` in the scenemanager addon is handed, and which is made once for each seat.
// Without a network every send arrives in the same call, as `index.html`'s page and manager in one tab
// have it. With a `Net`, each way is a `Leg` in milliseconds of `time`, and each item is handed on at
// the very millisecond it arrives, whatever the steps are doing: the page's link holds it until the
// page's next frame takes it, and the server's inbox until its next step. `addons/simulator` runs
// pages on it against a server in time.
import { seeded } from '#engine/engine.ts'

export type Accept<U, D> = (send: (down: D) => void) => { take(up: U): void; close(): void }
export type Wire<U, D> = (fan: (down: D) => void) => { send(up: U): void; close(): void }

// A clock in milliseconds and a way to be called back on it: `performance.now` and `setTimeout` on
// a machine, or a clock someone else holds and moves, as `addons/simulator` does.
export type Time = { now(): number; after(ms: number, f: () => void): void }

// One way of a network in milliseconds, read live as `Lag` is. An item waits `delay`, and `jitter`
// more at most: an even spread from 0 to `jitter`, or with `tail`, a wait that is mostly short and
// now and then many times `jitter` (an exponential of mean `jitter`). The way keeps order, as TCP
// does: an item arrives no sooner than the one sent before it, unless `reorder`, the fraction of
// items let pass, lets it. `loss` is the fraction dropped, `dup` the fraction handed on twice at
// once, and `burst` the fraction held back and handed on with the next item, as TCP and a browser's
// task queue hand on two messages together. Every roll comes from `seed`, five to an item whatever
// the knobs say, so turning one knob moves no other roll. `wait`, when given, is asked for each item
// first, with the millisecond it is sent at: a number is that item's own wait in place of `delay` and
// `jitter`, null drops it, and undefined leaves it to the knobs, as a recording played again has
// each item arrive when it arrived.
export type Leg = { delay: number; jitter?: number; tail?: boolean; loss?: number; reorder?: number; dup?: number; burst?: number; wait?: (item: unknown, now: number) => number | null | undefined }
// `open` is the milliseconds the wire takes to open, as a socket's handshake does: the server's side
// of the seat is made only then, and whatever the page sends before waits for it and then crosses.
export type Net = { up: Leg; down: Leg; seed: number; open?: number }

export function loopback<U, D>(accept: Accept<U, D>): Wire<U, D>
export function loopback<U, D>(accept: Accept<U, D>, time: Time, net: Net): Wire<U, D>
export function loopback<U, D>(accept: Accept<U, D>, time?: Time, net?: Net): Wire<U, D> {
  if (time && net) return timed(accept, time, net)
  return fan => {
    const seat = accept(fan)
    let closed = false
    return { send: up => seat.take(up), close: () => { if (closed) return; closed = true; seat.close() } }
  }
}

function timed<U, D>(accept: Accept<U, D>, time: Time, net: Net): Wire<U, D> {
  return fan => {
    const die = seeded(net.seed)
    let closed = false
    // One way: `leg` names its knobs, `to` whoever it hands on to. `last` is when the item sent
    // before arrives, which a kept order holds the next behind; `held` the items a burst holds back.
    const way = <T>(leg: () => Leg, to: (item: T) => void) => {
      let last = -Infinity
      let held: T[] = []
      return (item: T) => {
        const l = leg()
        const [lose, spread, pass, hold, twice] = [die(), die(), die(), die(), die()]
        const own = l.wait?.(item, time.now())
        if (own === null || (own === undefined && lose < (l.loss ?? 0))) return
        const jitter = l.jitter ?? 0
        const wait = own ?? l.delay + (l.tail ? -Math.log(1 - spread) * jitter : spread * jitter)
        let at = time.now() + wait
        if (pass >= (l.reorder ?? 0)) at = Math.max(at, last)
        last = Math.max(last, at)
        if (hold < (l.burst ?? 0)) { held.push(item); return }
        const out = [...held, item, ...(twice < (l.dup ?? 0) ? [item] : [])]
        held = []
        time.after(at - time.now(), () => { if (!closed) for (const x of out) to(x) })
      }
    }
    const down = way<D>(() => net.down, fan)
    let seat: ReturnType<Accept<U, D>> | undefined
    const early: U[] = []
    const up = way<U>(() => net.up, u => seat!.take(u))
    const open = () => {
      if (closed) return
      seat = accept(down)
      for (const u of early.splice(0)) up(u)
    }
    if (net.open) time.after(net.open, open)
    else open()
    return {
      send: u => (seat ? up(u) : void early.push(u)),
      close: () => { if (closed) return; closed = true; seat?.close() },
    }
  }
}
