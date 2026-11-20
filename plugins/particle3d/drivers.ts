// The drivers of particle3d and particle2d: named numbers of an effects file, and the expressions written
// of them. A driver is a number, or an expression of other drivers; a number field of a layer or of a
// force generator that holds a string holds an expression, and is that expression's value each frame
// (`particle3d.plugin.ts` and `plugins/particle2d/particle2d.plugin.ts`, Drivers). An expression is read
// once, when the file is, into a function of the drivers' values, and that function is run once a frame,
// never once a particle.
//
// An expression is made of:
//
//   numbers     12, 0.5, .5, 1e-3
//   names       a driver of the file, or `time`, the seconds this page's particle plugin has run
//   pi
//   + - * /     and a leading - or +, with ( ) round any part
//   == != < <= > >=      each 1 when it holds and 0 when it does not
//   and, or, not         of numbers, 0 is no and any other number is yes; each hands back 1 or 0
//   c ? a : b            a when c is not 0, else b
//   min(a, b, ...), max(a, b, ...), abs, floor, ceil, trunc, round, sin, cos, tan, asin, acos, atan,
//   atan2(y, x), exp, log, sqrt, pow(a, b), fmod(a, b), radians(degrees), degrees(radians),
//   lerp(a, b, k)        a + (b - a) * k
//   clamp(x, lo, hi)     x kept from lo to hi
//   smoothstep(lo, hi, x)   0 at or below lo, 1 at or above hi, eased between
//
// `expression(text, what)` reads one and hands back `{ run, names }`: `run(values)` its value for the
// numbers handed it by name, and `names` every name it reads. It throws, beginning with `what`, for text
// that is no expression, saying where. `plan(drivers, what)` reads a file's drivers, `what` naming the file
// in what it throws (particle3d's when left out), and hands back their
// names and `run(over, time)`, every driver's value this frame by name, with `time`: a driver named in
// `over` is that number in place of the file's. It throws for a driver whose name an expression could not
// read or that is one of an expression's own words, for an expression naming a driver there is none of,
// and for drivers that come back round to themselves.

export type Values = Record<string, number>
export type Compiled = (values: Values) => number

const FUNCTIONS: Record<string, { most: number; least: number; f: (...a: number[]) => number }> = {
  min: { least: 1, most: Infinity, f: Math.min },
  max: { least: 1, most: Infinity, f: Math.max },
  abs: { least: 1, most: 1, f: Math.abs },
  floor: { least: 1, most: 1, f: Math.floor },
  ceil: { least: 1, most: 1, f: Math.ceil },
  trunc: { least: 1, most: 1, f: Math.trunc },
  round: { least: 1, most: 1, f: Math.round },
  sin: { least: 1, most: 1, f: Math.sin },
  cos: { least: 1, most: 1, f: Math.cos },
  tan: { least: 1, most: 1, f: Math.tan },
  asin: { least: 1, most: 1, f: Math.asin },
  acos: { least: 1, most: 1, f: Math.acos },
  atan: { least: 1, most: 1, f: Math.atan },
  atan2: { least: 2, most: 2, f: Math.atan2 },
  exp: { least: 1, most: 1, f: Math.exp },
  log: { least: 1, most: 1, f: Math.log },
  sqrt: { least: 1, most: 1, f: Math.sqrt },
  pow: { least: 2, most: 2, f: Math.pow },
  fmod: { least: 2, most: 2, f: (a, b) => a % b },
  radians: { least: 1, most: 1, f: d => (d * Math.PI) / 180 },
  degrees: { least: 1, most: 1, f: r => (r * 180) / Math.PI },
  lerp: { least: 3, most: 3, f: (a, b, k) => a + (b - a) * k },
  clamp: { least: 3, most: 3, f: (x, lo, hi) => Math.min(hi, Math.max(lo, x)) },
  smoothstep: { least: 3, most: 3, f: (lo, hi, x) => {
    const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)))
    return t * t * (3 - 2 * t)
  } },
}
// What every expression may name besides the file's drivers.
export const GLOBALS = ['time'] as const
// The words of an expression, which no driver is named.
export const WORDS: readonly string[] = ['pi', 'and', 'or', 'not', ...GLOBALS, ...Object.keys(FUNCTIONS)]

type Token = { kind: 'number'; value: number; at: number } | { kind: 'name'; text: string; at: number } | { kind: 'mark'; text: string; at: number }

const MARKS = ['==', '!=', '<=', '>=', '<', '>', '+', '-', '*', '/', '(', ')', ',', '?', ':']

export function expression(text: string, what: string): { run: Compiled; names: string[] } {
  const fail = (why: string): never => { throw new Error(`${what} is ${JSON.stringify(text)}, ${why}`) }
  const tokens: Token[] = []
  for (let i = 0; i < text.length;) {
    const rest = text.slice(i)
    const space = /^\s+/.exec(rest)
    if (space) { i += space[0].length; continue }
    const number = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(rest)
    if (number) { tokens.push({ kind: 'number', value: Number(number[0]), at: i }); i += number[0].length; continue }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest)
    if (name) { tokens.push({ kind: 'name', text: name[0], at: i }); i += name[0].length; continue }
    const mark = MARKS.find(m => rest.startsWith(m))
    if (!mark) return fail(`and ${JSON.stringify(rest[0])}, its character ${i + 1}, is in no expression`)
    tokens.push({ kind: 'mark', text: mark, at: i })
    i += mark.length
  }
  if (!tokens.length) fail('which is empty')

  const names = new Set<string>()
  let at = 0
  const peek = () => tokens[at] as Token | undefined
  const is = (text: string) => {
    const t = peek()
    return !!t && t.kind !== 'number' && t.text === text
  }
  const take = (text: string) => {
    if (!is(text)) return false
    at++
    return true
  }
  const need = (text: string) => {
    if (take(text)) return
    const t = peek()
    fail(t ? `which wants ${JSON.stringify(text)} at its character ${t.at + 1}` : `which ends where it wants ${JSON.stringify(text)}`)
  }
  const yes = (n: number) => n !== 0

  const ternary = (): Compiled => {
    const c = either()
    if (!take('?')) return c
    const a = ternary()
    need(':')
    const b = ternary()
    return v => (yes(c(v)) ? a(v) : b(v))
  }
  const either = (): Compiled => {
    let a = both()
    while (take('or')) {
      const l = a, r = both()
      a = v => (yes(l(v)) || yes(r(v)) ? 1 : 0)
    }
    return a
  }
  const both = (): Compiled => {
    let a = negated()
    while (take('and')) {
      const l = a, r = negated()
      a = v => (yes(l(v)) && yes(r(v)) ? 1 : 0)
    }
    return a
  }
  const negated = (): Compiled => {
    if (!take('not')) return compared()
    const a = negated()
    return v => (yes(a(v)) ? 0 : 1)
  }
  const compared = (): Compiled => {
    const l = sum()
    const op = ['==', '!=', '<=', '>=', '<', '>'].find(is)
    if (!op) return l
    at++
    const r = sum()
    if (op === '==') return v => (l(v) === r(v) ? 1 : 0)
    if (op === '!=') return v => (l(v) !== r(v) ? 1 : 0)
    if (op === '<=') return v => (l(v) <= r(v) ? 1 : 0)
    if (op === '>=') return v => (l(v) >= r(v) ? 1 : 0)
    if (op === '<') return v => (l(v) < r(v) ? 1 : 0)
    return v => (l(v) > r(v) ? 1 : 0)
  }
  const sum = (): Compiled => {
    let a = product()
    for (;;) {
      const l = a
      if (take('+')) { const r = product(); a = v => l(v) + r(v) }
      else if (take('-')) { const r = product(); a = v => l(v) - r(v) }
      else return a
    }
  }
  const product = (): Compiled => {
    let a = signed()
    for (;;) {
      const l = a
      if (take('*')) { const r = signed(); a = v => l(v) * r(v) }
      else if (take('/')) { const r = signed(); a = v => l(v) / r(v) }
      else return a
    }
  }
  const signed = (): Compiled => {
    if (take('-')) { const a = signed(); return v => -a(v) }
    if (take('+')) return signed()
    return atom()
  }
  const atom = (): Compiled => {
    const t = peek()
    if (!t) return fail('which ends where it wants a number or a name')
    at++
    if (t.kind === 'number') { const n = t.value; return () => n }
    if (t.kind === 'mark') {
      if (t.text !== '(') return fail(`which has ${JSON.stringify(t.text)} at its character ${t.at + 1}, where it wants a number or a name`)
      const inner = ternary()
      need(')')
      return inner
    }
    if (t.text === 'pi') return () => Math.PI
    if (['and', 'or', 'not'].includes(t.text)) return fail(`which has ${t.text} at its character ${t.at + 1}, where it wants a number or a name`)
    const fn = FUNCTIONS[t.text]
    if (!fn) {
      if (is('(')) return fail(`which calls ${t.text}, and an expression calls ${Object.keys(FUNCTIONS).join(', ')}`)
      const name = t.text
      names.add(name)
      return v => v[name]
    }
    need('(')
    const args: Compiled[] = []
    if (!is(')')) do args.push(ternary()); while (take(','))
    need(')')
    if (args.length < fn.least || args.length > fn.most)
      return fail(`which hands ${t.text} ${args.length} number${args.length === 1 ? '' : 's'}, and it takes ${fn.most === Infinity ? `${fn.least} or more` : fn.least}`)
    const f = fn.f
    if (args.length === 1) { const a = args[0]; return v => f(a(v)) }
    if (args.length === 2) { const [a, b] = args; return v => f(a(v), b(v)) }
    if (args.length === 3) { const [a, b, c] = args; return v => f(a(v), b(v), c(v)) }
    return v => f(...args.map(a => a(v)))
  }

  const run = ternary()
  const left = peek()
  if (left) fail(`which goes on past its end at its character ${left.at + 1}`)
  return { run, names: [...names] }
}

// A number field's expression, of the drivers `names` and `time`: its function, or a throw for one that
// names anything else.
export function driven(text: string, names: readonly string[], what: string): Compiled {
  const e = expression(text, what)
  for (const n of e.names)
    if (!names.includes(n) && !(GLOBALS as readonly string[]).includes(n))
      throw new Error(`${what} is ${JSON.stringify(text)}, which names ${n}, and the effects file's drivers are ${names.length ? names.join(', ') : 'none'}`)
  return e.run
}

export function plan(drivers: Record<string, number | string> = {}, what = 'particle3d\'s effects file') {
  const names = Object.keys(drivers)
  const runs = new Map<string, { run: Compiled; needs: string[] }>()
  for (const [name, d] of Object.entries(drivers)) {
    const it = `${what} driver ${name}`
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`${it} has a name no expression can read: a name is letters, digits and _, and begins with no digit`)
    if (WORDS.includes(name)) throw new Error(`${it} is named as one of an expression's own words: ${WORDS.join(', ')}`)
    if (typeof d === 'number') {
      if (!Number.isFinite(d)) throw new Error(`${it} is ${d}, and a driver is a finite number or an expression`)
      runs.set(name, { run: () => d, needs: [] })
      continue
    }
    if (typeof d !== 'string') throw new Error(`${it} is ${JSON.stringify(d)}, and a driver is a number or an expression`)
    const e = expression(d, it)
    for (const n of e.names)
      if (!names.includes(n) && !(GLOBALS as readonly string[]).includes(n)) throw new Error(`${it} is ${JSON.stringify(d)}, which names ${n}, and the effects file's drivers are ${names.join(', ')}`)
    runs.set(name, { run: e.run, needs: e.names.filter(n => names.includes(n)) })
  }
  // Each driver after every driver it reads.
  const order: string[] = []
  const walk = (name: string, path: string[]) => {
    if (order.includes(name)) return
    if (path.includes(name)) throw new Error(`${what} driver ${name} is driven by itself: ${[...path.slice(path.indexOf(name)), name].join(' > ')}`)
    for (const n of runs.get(name)!.needs) walk(n, [...path, name])
    order.push(name)
  }
  for (const name of names) walk(name, [])
  const steps = order.map(name => ({ name, run: runs.get(name)!.run }))
  return {
    names,
    run(over: Values, time: number): Values {
      const values: Values = { time }
      for (const s of steps) values[s.name] = over[s.name] ?? s.run(values)
      return values
    },
  }
}
