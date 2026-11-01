// The benchmarks, looked at: a server on this machine whose page lists every benchmark run in
// `benchmarks/` at the repo's root, and lays out any one, or any two compared, from their files, so a
// run is looked at and two are compared without running anything again.
//   node --experimental-strip-types scripts/benchmarkPage.ts [--port <port>] [<run folder>]…
// It prints the address it serves (5190, or the next port free). A run is a folder `bench.mjs` or a
// profiler alone writes (`.claude/skills/benchmarking-a-game/`), `benchmarks/<game>/<when>` unless told
// otherwise: `run.json` naming the scenes, when `bench.mjs` made it, and each scene's
// `<scene>.ticks.json`, `<scene>.cpu.json` and `<scene>.gpu.json`. A folder named on the command line is
// listed beside them. The folders are read on every request, so a run made while it serves is there.
//
// A run's page opens on every scene's frame as one bar to the same scale: the CPU's work in it, split by
// who did it (kinds, plugins, addons, the engine, the browser), and the rest of the frame, which is
// spare at 60 frames a second and otherwise waited on the GPU; so what holds each scene is read at a
// glance (the CPU when its work is three quarters of the frame or more, else the GPU). Compared, what
// changed past noise comes next, each change a line from before to after. Then each scene: its numbers;
// who eats its CPU, each owner a bar (every millisecond Chrome's profiler sampled, given to the kind,
// plugin, addon or engine whose file ran it, `owners.mjs`), each opening on its rules and page half or
// look, the libraries it spent time in, a kind's cost a row and its costliest functions; each frame's
// CPU work over the run against a frame at 60; the slowest frames, each a bar of who took it; what the
// GPU saves with each pass, the shadows and each material (each group of things, on a 2D page) taken
// away; the systems as timed where each is called; the rules alone on node. Compared, every bar has the
// before's beside it, and a change is one only past what one run differs from the next by (`noise`).
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type Repo = { commit: string; branch: string; dirty: boolean }
export type Made = { tool: string; at: string; core: Repo; games: Repo; machine: string; settings: Record<string, unknown> }
export type Fn = { name: string; ms: number }
export type Owner = { who: string; group: string; name: string; side: string; ms: number; via: Record<string, number>; functions: Fn[] }
export type System = { name: string; ms: number; share: number; rows?: number }
export type Cpu = Made & {
  game: string; scene: string; drawn: string; others: string[]; threw: { count: number; first?: string }
  frames: number; seconds: number; rate: number; work: number; times: number[]
  systems: System[]; slow: { frame: number; top: Fn[] }[]
  owners: { busy: number; idle: number; list: Owner[] }
}
export type Taken = { label: string; kind: string; fps: number; ms: number; saved: number; least: number; most: number; meshes?: number; threw: number; first?: string }
export type Gpu = Made & {
  game: string; scene: string; drawn: string; others: string[]
  drawing?: { triangles: number; calls: number }; meshes: Record<string, number>
  asIs: { ms: number; fps: number; runs: { ms: number }[] }; taken: Taken[]
}
export type Ticks = Made & {
  game: string; scene: string; rows: number; steps: number; seconds: number; wall: number
  step: { mean: number; p95: number; most: number }
  systems: System[]; owners: { busy: number; list: Owner[] }
}
export type Scene = { scene: string; ticks?: Ticks; cpu?: Cpu; gpu?: Gpu }
export type Run = { dir: string; game: string; made?: Made; mode: string; scenes: Scene[] }

const FRAME = 1000 / 60
// A frame's CPU work this share of the frame or more: the CPU holds it.
const CPU_HELD = 0.75

// A run folder read: its scenes in the order run.json names them, else every scene a data file names.
export function load(dir: string): Run {
  const read = <T>(f: string): T | undefined => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as T } catch { return undefined } }
  const index = read<Made & { game: string; scenes: { scene: string }[]; settings: { deep?: boolean; playtest?: boolean } }>('run.json')
  const names = index ? index.scenes.map(s => s.scene) : [...new Set(fs.readdirSync(dir).map(f => f.match(/^(.+)\.(ticks|cpu|gpu)\.json$/)?.[1]).filter((s): s is string => !!s))].sort()
  if (!names.length) throw new Error(`${dir} holds no run: no run.json and no <scene>.ticks.json, .cpu.json or .gpu.json`)
  const scenes = names.map(scene => ({ scene, ticks: read<Ticks>(`${scene}.ticks.json`), cpu: read<Cpu>(`${scene}.cpu.json`), gpu: read<Gpu>(`${scene}.gpu.json`) }))
  const any = scenes.flatMap(s => [s.cpu, s.gpu, s.ticks]).find(Boolean)
  const played = index ? index.settings.playtest : scenes.some(s => s.cpu?.settings.playtest || s.gpu?.settings.playtest)
  return {
    dir, game: index?.game ?? any?.game ?? path.basename(dir), made: index ?? any, scenes,
    mode: `${index ? (index.settings.deep ? 'Deep run' : 'Basic run') : 'Profiled alone'}, ${played ? 'played by its playtester' : 'its seat sitting still'}`,
  }
}

// What one run differs from the next by. A sampled owner, or a timed system, moved less than 0.05 ms or
// a tenth of itself has not changed. A frame counted over a window of `each` seconds reads to one frame
// in it, `ms² / (1000 · each)` ms, so a frame time or a GPU saving moved less than that, or one whose
// least..most of the two runs overlap, has not changed. A step on node moved less than 0.01 ms or a
// twentieth has not.
export const noise = {
  cpu: (a: number, b: number) => Math.abs(b - a) >= Math.max(0.05, 0.1 * Math.max(a, b)),
  frame: (a: number, b: number, each: number) => Math.abs(b - a) > Math.max(a, b) ** 2 / (1000 * each),
  saved: (a: Taken, b: Taken, ms: number, each: number) => Math.abs(b.saved - a.saved) > ms ** 2 / (1000 * each) && (a.most < b.least || b.most < a.least),
  step: (a: number, b: number) => Math.abs(b - a) >= Math.max(0.01, 0.05 * Math.max(a, b)),
}

export type Verdict = { held: 'none' | 'cpu' | 'gpu'; fps: number; frame: number; work?: number; says: string }
// What holds a scene's frame, off the GPU profile's frame as it is and the CPU profile's work.
export function verdict(s: Scene): Verdict | undefined {
  const fps = s.gpu?.asIs.fps ?? s.cpu?.rate
  if (fps === undefined) return undefined
  const frame = 1000 / fps, work = s.cpu?.work
  if (fps >= 58) return { held: 'none', fps, frame, work, says: 'Runs at 60' }
  if (work === undefined) return { held: 'gpu', fps, frame, says: 'Under 60, no CPU profile to say why' }
  return work >= CPU_HELD * frame
    ? { held: 'cpu', fps, frame, work, says: 'Held by the CPU' }
    : { held: 'gpu', fps, frame, work, says: 'Held by the GPU' }
}

// Every owner of one name together: a kind's rules and its look, a plugin's rules and page half.
export type Who = { key: string; group: string; name: string; ms: number; sides: Record<string, number>; via: Record<string, number>; functions: Fn[]; rows?: number }
export function whos(list: Owner[] = [], systems: System[] = []): Who[] {
  const by = new Map<string, Who>()
  for (const o of list) {
    const key = `${o.group} ${o.name}`
    const w = by.get(key) ?? { key, group: o.group, name: o.name, ms: 0, sides: {}, via: {}, functions: [] }
    w.ms += o.ms
    w.sides[o.side] = (w.sides[o.side] ?? 0) + o.ms
    for (const [k, v] of Object.entries(o.via)) w.via[k] = (w.via[k] ?? 0) + v
    w.functions = [...w.functions, ...o.functions].sort((a, b) => b.ms - a.ms).slice(0, 10)
    by.set(key, w)
  }
  for (const s of systems) {
    const kind = s.rows !== undefined ? s.name.match(/^look ([^.]+)\./)?.[1] : undefined
    const w = kind ? by.get(`kind ${kind}`) : undefined
    if (w && s.rows !== undefined) w.rows = s.rows
  }
  return [...by.values()].sort((a, b) => b.ms - a.ms)
}

// A system's timed name as it reads on the page, and whose it is: `page render3d.afterTick` is
// render3d's draw, `rules box3d.tick` box3d's rules, `look weld.tick` the weld kind's look.
export function plain(name: string, plugins: Set<string>): { label: string; group: string } {
  let m
  if ((m = name.match(/^page ([^.]+)\.(\w+)$/))) return { label: m[1] === 'render3d' && m[2] === 'afterTick' ? 'render3d draw' : `${m[1]} ${m[2] === 'input' ? 'input' : 'page'}`, group: 'plugin' }
  if ((m = name.match(/^rules ([^. ]+) act (\S+)$/))) return { label: `${m[1]} ${m[2]}`, group: plugins.has(m[1]) ? 'plugin' : 'kind' }
  if ((m = name.match(/^rules ([^. ]+)\./))) return { label: `${m[1]} rules`, group: plugins.has(m[1]) ? 'plugin' : 'kind' }
  if ((m = name.match(/^look ([^.]+)\./))) return { label: `${m[1]} look`, group: 'kind' }
  return { label: name.startsWith('engine: truth') ? 'engine rules' : name.startsWith('engine:') ? 'engine page' : name, group: 'engine' }
}

// ---- the page

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
// milliseconds as they read: three places under 0.1 ms, two under 10, one past
const num = (v: number) => (Math.abs(v) < 0.1 ? v.toFixed(3) : Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1))
const ms = (v: number) => `${num(v)} ms`
const pct = (v: number) => `${(100 * v).toFixed(v < 0.1 ? 1 : 0)}%`
const signed = (v: number, unit = ' ms') => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${num(Math.abs(v))}${unit}`

// The owners' groups, in the order their colours are given, and the names they are read by.
const GROUPS = ['plugin', 'kind', 'addon', 'engine', 'playtester', 'browser', 'page'] as const
const NAMED: Record<string, string> = { plugin: 'Plugins', kind: 'Kinds', addon: 'Addons', engine: 'Engine', playtester: 'Playtester', browser: 'Browser', page: 'The page' }
const groupOf = (g: string) => (GROUPS as readonly string[]).includes(g) ? g : 'browser'

// A change shown: worse (more time) or better, or none when it is within `real`.
const change = (a: number | undefined, b: number | undefined, real: boolean, unit = ' ms', more = 'worse') => {
  if (a === undefined || b === undefined) return `<span class="d quiet">${a === undefined ? 'new' : 'gone'}</span>`
  if (Math.abs(b - a) < 0.0005) return '<span class="d quiet">no change</span>'
  if (!real) return `<span class="d quiet">${signed(b - a, unit)}</span>`
  const worse = more === 'worse' ? b > a : b < a
  return `<span class="d ${worse ? 'worse' : 'better'}">${worse ? '▲' : '▼'} ${signed(b - a, unit)}</span>`
}

// Ticks for an axis from 0 to past `max`: a step of 1, 2 or 5 of a power of ten, four to six of them.
export function ticks(max: number): number[] {
  const raw = Math.max(max, 1e-6) / 4
  const p = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map(k => k * p).find(s => s >= raw)!
  const out = [0]
  while (out[out.length - 1] < max) out.push(+(out[out.length - 1] + step).toFixed(10))
  return out
}

// A horizontal bar chart in milliseconds: each row a label, its bar from one baseline with its value at
// the tip, the before's bar under it when compared, and a hairline grid of the axis's ticks.
type Bar = { label: string; sub?: string; value: number; group: string; before?: number; range?: [number, number]; faint?: boolean; change?: string; open?: string }
// The rows a chart shows before its tail is folded: those of 1% of the whole or more, at least six.
const kept = (rows: Bar[]) => {
  const whole = rows.reduce((n, r) => n + r.value, 0)
  return Math.max(6, rows.filter(r => r.value >= 0.01 * whole).length)
}
function bars(rows: Bar[], { compared = false, floor = 0, keep = rows.length }: { compared?: boolean; floor?: number; keep?: number } = {}) {
  const top = Math.max(floor, ...rows.flatMap(r => [r.value, r.before ?? 0, r.range?.[1] ?? 0]))
  const axis = ticks(top * 1.18)
  const end = axis[axis.length - 1]
  const x = (v: number) => `${((100 * Math.max(0, v)) / end).toFixed(2)}%`
  const grid = axis.map(t => `<i style="left:${x(t)}"></i>`).join('')
  const row = (r: Bar) => {
    const head = `<div class="bl"><span class="bn">${r.label}</span>${r.sub ? ` <span class="bs">${r.sub}</span>` : ''}</div>
      <div class="bp"><div class="grid">${grid}</div>
        ${r.before !== undefined ? `<div class="was" style="width:${x(r.before)}"></div>` : ''}
        <div class="fill g-${r.group}" style="width:${x(r.value)}"></div>
        ${r.range ? `<div class="whisk" style="left:${x(r.range[0])};width:calc(${x(r.range[1])} - ${x(r.range[0])})"></div>` : ''}
        <span class="tip" style="left:${x(Math.max(r.value, r.before ?? 0, r.range?.[1] ?? 0))}">${num(r.value)}${r.range ? ` <span class="quiet">${num(r.range[0])} to ${num(r.range[1])}</span>` : ''}</span>
      </div>
      ${compared ? `<div class="bc">${r.change ?? ''}</div>` : ''}`
    return r.open
      ? `<details class="br${r.faint ? ' faint' : ''}${compared ? ' cmp' : ''}"><summary>${head}</summary><div class="open">${r.open}</div></details>`
      : `<div class="br${r.faint ? ' faint' : ''}${compared ? ' cmp' : ''}">${head}</div>`
  }
  const tail = rows.slice(keep)
  return `<div class="bars">${rows.slice(0, keep).map(row).join('')}
    ${tail.length ? `<details class="tail"><summary>${tail.length} more, ${ms(tail.reduce((n, r) => n + r.value, 0))} together</summary>${tail.map(row).join('')}</details>` : ''}
    <div class="br axis${compared ? ' cmp' : ''}"><div class="bl unit">ms a frame</div><div class="bp">${axis.map(t => `<span style="left:${x(t)}">${t === 0 ? '0' : num(t)}</span>`).join('')}</div>${compared ? '<div class="bc"></div>' : ''}</div>
  </div>`
}

const legend = (groups: string[], extra = '') =>
  `<div class="legend">${groups.map(g => `<span><i class="sw g-${g}"></i>${NAMED[g]}</span>`).join('')}${extra}</div>`

// The CPU's work in a frame by group, as sampled.
const byGroup = (c?: Cpu) => {
  const out = new Map<string, number>()
  for (const o of c?.owners.list ?? []) out.set(groupOf(o.group), (out.get(groupOf(o.group)) ?? 0) + o.ms)
  return out
}

// One frame as a bar: the CPU's work in it split by group, then the rest of it, spare or waited on.
function frameBar(s: Scene, end: number, tag?: string) {
  const v = verdict(s)
  if (!v) return `<div class="fb"><span class="quiet">Not measured</span></div>`
  const parts = byGroup(s.cpu)
  const busy = [...parts.values()].reduce((a, b) => a + b, 0)
  const x = (w: number) => `${((100 * w) / end).toFixed(2)}%`
  const rest = Math.max(0, v.frame - busy)
  const restLabel = v.held === 'none' ? 'spare' : v.held === 'gpu' ? 'waiting on the GPU' : 'not sampled'
  return `<div class="fb${tag ? ' tagged' : ''}">
    ${tag ? `<span class="tag">${tag}</span>` : ''}
    <div class="stack"><i class="budget" style="left:${x(FRAME)}"></i>${GROUPS.filter(g => (parts.get(g) ?? 0) > 0).map(g => `<span class="seg g-${g}" style="width:${x(parts.get(g)!)}"></span>`).join('')}<span class="seg rest ${v.held}" style="width:${x(rest)}"></span></div>
    <div class="fbl"><b>${num(v.frame)} ms</b> a frame · CPU ${s.cpu ? num(busy) : '?'} ms · ${num(rest)} ms ${restLabel}</div>
  </div>`
}

function header(a: Run, b?: Run) {
  const runs = b ? [['Before', a], ['After', b]] as const : [['', a]] as const
  const made = (m?: Made) => !m ? '' : `${esc(new Date(m.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))}, core ${esc(m.core.commit)}${m.core.dirty ? ' with changes' : ''}, games ${esc(m.games.commit)}${m.games.dirty ? ' with changes' : ''}, ${esc(m.machine)}`
  return `<header class="top">
  <h1>${esc((b ?? a).game)}</h1>
  <div class="runs">${runs.map(([k, r]) => `<div class="run">${k ? `<span class="tag ${k.toLowerCase()}">${k}</span>` : ''}<span><b>${esc(r.mode)}</b>. ${made(r.made)}.</span><span class="path">${esc(r.dir)}</span></div>`).join('')}</div>
</header>`
}

// Every scene's frame to one scale, before over after when compared.
function overview(a: Run, b?: Run) {
  const now = b ?? a
  const all = [...a.scenes, ...(b?.scenes ?? [])].map(verdict).filter((v): v is Verdict => !!v)
  const end = Math.max(FRAME, ...all.map(v => v.frame)) * 1.04
  const groups = GROUPS.filter(g => [...a.scenes, ...(b?.scenes ?? [])].some(s => (byGroup(s.cpu).get(g) ?? 0) > 0))
  const rows = now.scenes.map(s => {
    const was = b ? a.scenes.find(x => x.scene === s.scene) : undefined
    const v = verdict(s)
    return `<a class="ov" href="#scene-${esc(s.scene)}">
      <div class="ovn"><b>${esc(s.scene)}</b>${v ? `<span class="pill ${v.held}">${esc(v.says)}</span>` : ''}</div>
      <div class="ovb">${was ? frameBar(was, end, 'before') : ''}${frameBar(s, end, was ? 'after' : undefined)}</div>
    </a>`
  })
  return `<section class="over">
  <h2>Every scene's frame</h2>
  <p class="note">Each bar is one frame, to the same scale. The colours are the CPU's work in it, by who did it; the grey is the rest of the frame: spare when the scene runs at 60, else waiting on the GPU. The line is a frame at 60 a second, ${ms(FRAME)}.</p>
  ${legend(groups, '<span><i class="sw rest none"></i>Spare</span><span><i class="sw rest gpu"></i>Waiting on the GPU</span>')}
  <div class="ovs">${rows.join('')}</div>
</section>`
}

const short = (label: string) => label.length > 64 ? label.slice(0, 61) + '…' : label

// The changes past noise over every scene, biggest first, each a line from before to after.
function changes(a: Run, b: Run) {
  const list: { scene: string; what: string; a: number; b: number }[] = []
  for (const s of b.scenes) {
    const was = a.scenes.find(x => x.scene === s.scene)
    if (!was) continue
    const before = new Map(whos(was.cpu?.owners.list).map(w => [w.key, w]))
    for (const w of whos(s.cpu?.owners.list)) {
      const o = before.get(w.key)
      if (o && noise.cpu(o.ms, w.ms)) list.push({ scene: s.scene, what: `${w.name} on the CPU`, a: o.ms, b: w.ms })
    }
    if (s.gpu && was.gpu) {
      const each = Number(s.gpu.settings.each ?? 3)
      if (noise.frame(was.gpu.asIs.ms, s.gpu.asIs.ms, each)) list.push({ scene: s.scene, what: 'the frame as it is', a: was.gpu.asIs.ms, b: s.gpu.asIs.ms })
      for (const t of s.gpu.taken) {
        const o = was.gpu.taken.find(x => x.label === t.label)
        if (o && noise.saved(o, t, Math.max(was.gpu.asIs.ms, s.gpu.asIs.ms), each)) list.push({ scene: s.scene, what: `${short(taken(t).label)} on the GPU`, a: o.saved, b: t.saved })
      }
    }
    if (s.ticks && was.ticks && noise.step(was.ticks.step.mean, s.ticks.step.mean)) list.push({ scene: s.scene, what: 'a step on node', a: was.ticks.step.mean, b: s.ticks.step.mean })
  }
  list.sort((x, y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a))
  const end = ticks(Math.max(...list.flatMap(c => [c.a, c.b]), 1e-6) * 1.1)
  const last = end[end.length - 1]
  const x = (v: number) => `${((100 * v) / last).toFixed(2)}%`
  const many = new Set(list.map(c => c.scene)).size > 1
  const row = (c: typeof list[number]) => {
    const worse = c.b > c.a
    return `<div class="dm">
      <div class="dml">${many ? `<a href="#scene-${esc(c.scene)}">${esc(c.scene)}</a> ` : ''}${esc(c.what)}</div>
      <div class="dmp"><div class="grid">${end.map(t => `<i style="left:${x(t)}"></i>`).join('')}</div>
        <span class="dmline ${worse ? 'worse' : 'better'}" style="left:${x(Math.min(c.a, c.b))};width:calc(${x(Math.max(c.a, c.b))} - ${x(Math.min(c.a, c.b))})"></span>
        <span class="dot before" style="left:${x(c.a)}"></span><span class="dot after ${worse ? 'worse' : 'better'}" style="left:${x(c.b)}"></span>
      </div>
      <div class="dmv">${num(c.a)} → <b>${num(c.b)}</b> ${change(c.a, c.b, true)}</div>
    </div>`
  }
  return `<section>
  <h2>What changed</h2>
  <p class="note">Only what moved more than one run differs from the next: a CPU owner by 0.05 ms or a tenth of itself; a frame or a GPU saving by one frame of its window, with the two runs' spreads apart; a step on node by 0.01 ms or a twentieth. A GPU saving that grows means that thing costs more.</p>
  ${list.length ? `<div class="legend"><span><i class="dotk before"></i>Before</span><span><i class="dotk worse"></i>After, more time</span><span><i class="dotk better"></i>After, less time</span></div>
  <div class="dms">${list.slice(0, 40).map(row).join('')}
    <div class="dm axis"><div class="dml unit">ms</div><div class="dmp">${end.map(t => `<span style="left:${x(t)}">${t === 0 ? '0' : num(t)}</span>`).join('')}</div><div class="dmv"></div></div>
  </div>` : '<p class="quiet">Nothing moved past noise.</p>'}
</section>`
}

// The scene's own numbers, each a figure with its change.
function figures(s: Scene, was?: Scene) {
  const v = verdict(s), w = was && verdict(was)
  const each = Number(s.gpu?.settings.each ?? 3)
  const tile = (label: string, value: string, unit: string, delta = '') => `<div class="fig"><span class="fl">${label}</span><span class="fv">${value}<small>${unit}</small></span>${delta}</div>`
  return `<div class="figs">
    ${v ? tile('Frames a second', v.fps.toFixed(1), '', w ? change(w.fps, v.fps, noise.frame(w.frame, v.frame, each), '', 'better') : '') : ''}
    ${v ? tile('A frame', num(v.frame), ' ms', w ? change(w.frame, v.frame, noise.frame(w.frame, v.frame, each)) : '') : ''}
    ${s.cpu ? tile("The CPU's work a frame", num(s.cpu.owners.busy), ' ms', was?.cpu ? change(was.cpu.owners.busy, s.cpu.owners.busy, noise.cpu(was.cpu.owners.busy, s.cpu.owners.busy)) : '') : ''}
    ${s.gpu?.drawing ? tile('Triangles a frame', s.gpu.drawing.triangles.toLocaleString('en-GB'), '', '') : ''}
    ${s.ticks ? tile('A step on node', num(s.ticks.step.mean), ' ms', was?.ticks ? change(was.ticks.step.mean, s.ticks.step.mean, noise.step(was.ticks.step.mean, s.ticks.step.mean)) : '') : ''}
  </div>`
}

// Who eats the CPU: every owner a bar, each opening on what it is made of.
function cpuOwners(s: Scene, was?: Scene) {
  if (!s.cpu) return ''
  const list = whos(s.cpu.owners.list, s.cpu.systems).filter(w => w.ms >= 0.0005)
  const before = new Map(whos(was?.cpu?.owners.list, was?.cpu?.systems).map(w => [w.key, w]))
  const busy = s.cpu.owners.busy
  const open = (w: Who) => {
    const sides = Object.entries(w.sides).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${ms(v)}`).join(' · ')
    const via = Object.entries(w.via).sort((x, y) => y[1] - x[1]).filter(([, v]) => v >= 0.001).map(([k, v]) => `${esc(k)} ${ms(v)}`).join(' · ')
    return `<dl class="facts">
      <dt>Made of</dt><dd>${esc(sides)}</dd>
      ${w.rows !== undefined ? `<dt>Rows drawn</dt><dd>${w.rows.toFixed(1)} rows drawn, its look ${ms((w.sides.look ?? 0) / Math.max(w.rows, 1e-9))} a row</dd>` : ''}
      ${via ? `<dt>Spent inside</dt><dd>in ${via}</dd>` : ''}
    </dl>
    <table class="fns"><thead><tr><th class="n">ms a frame</th><th>Function, and the file and line it is at</th></tr></thead><tbody>${w.functions.map(f => {
      const [fn, at] = f.name.split('  ')
      return `<tr><td class="n">${num(f.ms)}</td><td><code>${esc(fn)}</code>${at ? `<span class="at">${esc(at)}</span>` : ''}</td></tr>`
    }).join('')}</tbody></table>`
  }
  const rows: Bar[] = list.map(w => {
    const o = before.get(w.key)
    return {
      label: esc(w.name), sub: `${esc(w.group)}, ${pct(w.ms / busy)}`, value: w.ms, group: groupOf(w.group),
      before: was ? o?.ms ?? 0 : undefined, change: was ? change(o?.ms, w.ms, o ? noise.cpu(o.ms, w.ms) : true) : undefined, open: open(w),
    }
  })
  const groups = GROUPS.filter(g => list.some(w => groupOf(w.group) === g))
  return `<div class="part">
  <h3>Who eats the CPU</h3>
  <p class="note">Every millisecond of a frame Chrome's profiler sampled, ${ms(busy)} a frame in all, given to the kind, plugin, addon or engine whose file ran it. Time spent inside a library such as three or pixi counts for whoever called it. Open a row for what it is made of and its costliest functions.</p>
  ${legend(groups, was ? '<span><i class="sw wask"></i>Before</span>' : '')}
  ${bars(rows, { compared: !!was, keep: kept(rows) })}
</div>`
}

// Each frame's CPU work over the run, against a frame at 60.
function frames(s: Scene, was?: Scene) {
  if (!s.cpu?.times?.length) return ''
  const W = 1000, H = 200
  const all = [...s.cpu.times, ...(was?.cpu?.times ?? [])]
  const axis = ticks(Math.max(FRAME, ...all) * 1.05)
  const top = axis[axis.length - 1]
  const y = (v: number) => H - (v / top) * H
  const line = (t: number[]) => {
    const step = Math.max(1, Math.ceil(t.length / 500))
    const pts: string[] = []
    for (let i = 0; i < t.length; i += step) pts.push(`${((i / Math.max(t.length - 1, 1)) * W).toFixed(1)},${y(Math.max(...t.slice(i, i + step))).toFixed(1)}`)
    return pts.join(' ')
  }
  const sorted = [...s.cpu.times].sort((x, z) => x - z)
  const p = (q: number) => sorted[Math.floor(q * (sorted.length - 1))]
  const ypc = (v: number) => `${((100 * y(v)) / H).toFixed(2)}%`
  return `<div class="part">
  <h3>Each frame's CPU work</h3>
  <p class="note">${s.cpu.frames} frames over ${s.cpu.seconds.toFixed(1)} s, each frame's work in the order they came. Half were under ${ms(p(0.5))}, 95 in 100 under ${ms(p(0.95))}, and the slowest took ${ms(sorted[sorted.length - 1])}.</p>
  ${was ? '<div class="legend"><span><i class="lk now"></i>After</span><span><i class="lk before"></i>Before</span></div>' : ''}
  <div class="lc">
    <div class="ly"><span class="unit yu">ms</span>${axis.map(t => `<span style="top:${ypc(t)}">${t === 0 ? '0' : num(t)}</span>`).join('')}</div>
    <div class="lp">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="each frame's CPU work in milliseconds, over the run">
        ${axis.map(t => `<line class="gl" x1="0" x2="${W}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`).join('')}
        <line class="budget" x1="0" x2="${W}" y1="${y(FRAME).toFixed(1)}" y2="${y(FRAME).toFixed(1)}"/>
        ${was?.cpu?.times?.length ? `<polyline class="before" points="${line(was.cpu.times)}"/>` : ''}
        <polyline class="now" points="${line(s.cpu.times)}"/>
      </svg>
      <span class="bud" style="top:${ypc(FRAME)}">A frame at 60 a second</span>
    </div>
  </div>
  <div class="lx"><span>The first frame timed</span><span>The last</span></div>
</div>`
}

// The slowest frames, each a bar of who took its time. The timer reads to 0.1 ms, so less is left out.
function slowest(s: Scene) {
  const cpu = s.cpu
  if (!cpu?.slow.length) return ''
  const plugins = new Set(cpu.owners.list.filter(o => o.group === 'plugin').map(o => o.name))
  const axis = ticks(Math.max(...cpu.slow.map(f => f.frame), FRAME) * 1.02)
  const end = axis[axis.length - 1]
  const x = (w: number) => `${((100 * w) / end).toFixed(2)}%`
  const seen = new Set<string>()
  const rows = cpu.slow.map(f => {
    const parts = new Map<string, { group: string; ms: number }>()
    for (const t of f.top) {
      const p = plain(t.name, plugins)
      const e = parts.get(p.label) ?? { group: p.group, ms: 0 }
      e.ms += t.ms
      parts.set(p.label, e)
    }
    const shown = [...parts].filter(([, p]) => p.ms >= 0.1).sort((a, b) => b[1].ms - a[1].ms)
    for (const [, p] of shown) seen.add(p.group)
    const rest = Math.max(0, f.frame - shown.reduce((n, [, p]) => n + p.ms, 0))
    return `<div class="sf">
      <div class="sft">${f.frame.toFixed(1)} ms</div>
      <div class="sfp"><div class="grid">${axis.map(t => `<i style="left:${x(t)}"></i>`).join('')}</div><i class="budget" style="left:${x(FRAME)}"></i>
        <div class="stack thin" style="width:${x(f.frame)}">${shown.map(([, p]) => `<span class="seg g-${p.group}" style="flex:${p.ms} 0 0"></span>`).join('')}${rest > 0 ? `<span class="seg rest" style="flex:${rest} 0 0"></span>` : ''}</div>
      </div>
      <div class="sfl">${shown.slice(0, 3).map(([k, p]) => `<span><i class="sw g-${p.group}"></i>${esc(k)} <b>${p.ms.toFixed(1)}</b></span>`).join('')}${rest >= 0.1 ? `<span><i class="sw rest"></i>Untimed <b>${rest.toFixed(1)}</b></span>` : ''}</div>
    </div>`
  })
  return `<details class="part fold"><summary><h3>The five slowest frames</h3><span class="quiet">${cpu.slow.map(f => f.frame.toFixed(1)).join(', ')} ms</span></summary>
  <p class="note">Each bar is one frame, split by who took its time, biggest first. Untimed is the browser's and the engine's own work between the timed calls. Anything under 0.1 ms, the finest the browser's timer reads, is left out.</p>
  ${rows.join('')}
  <div class="sf axis"><div class="sft unit">ms</div><div class="sfp">${axis.map(t => `<span style="left:${x(t)}">${t === 0 ? '0' : num(t)}</span>`).join('')}</div></div>
</details>`
}

// A thing the GPU profile took away, as it reads: its name, and what it is. A material is named by the
// plugin that made it, else its own name, else its mesh's, else its geometry's.
export function taken(t: Taken, word = 'material'): { label: string; sub: string } {
  const count = t.meshes !== undefined ? `, ${t.meshes} ${word === 'material' ? (t.meshes === 1 ? 'mesh' : 'meshes') : (t.meshes === 1 ? 'thing' : 'things')}` : ''
  if (t.kind === 'pass') {
    const p = t.label.replace(/^pass (\d+ )?_?/, '').replace(/Pass$/, '')
    return { label: p.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), sub: 'a pass of the composer' }
  }
  if (t.kind === 'shadows') return { label: 'shadows', sub: 'every shadow map' }
  if (t.kind === 'thing') {
    const m = t.label.match(/^thing (\S+)(?: (.+?))?(?: \(layer (.+)\))?$/)
    return { label: m?.[2] ?? m?.[1] ?? t.label, sub: `${m?.[1] ?? ''}${m?.[3] ? ` on layer ${m[3]}` : ''}${count}` }
  }
  // a material's label: its own name, its type, `{the plugin's userData}`, `(its first mesh)` or `<its geometry>`
  const m = t.label.match(/^material (?:(.+?) )?(\w+Material)(?: canyon3d ground look)?(?: \{([^}]*)\})?(?: \((.*)\))?(?: <(\w+)>)?$/)
  if (!m) return { label: t.label.replace(/^material /, ''), sub: `material${count}` }
  const [, own, type, tags, mesh, geometry] = m
  const label = tags ? tags.split(', ')[0] : own ?? mesh ?? geometry ?? type
  return { label, sub: `${[own && own !== label ? own : '', mesh && mesh !== label ? mesh : '', type].filter(Boolean).join(', ')}${count}` }
}

// What the GPU saves when each thing is taken away: what saved more than one frame of its window charted,
// the rest named.
function gpu(s: Scene, was?: Scene) {
  const g = s.gpu
  if (!g) return ''
  const each = Number(g.settings.each ?? 3), runs = Number(g.settings.runs ?? 1)
  const q = g.asIs.ms ** 2 / (1000 * each)
  const before = new Map((was?.gpu?.taken ?? []).map(t => [t.label, t]))
  const word = g.taken.some(t => t.kind === 'thing') ? 'thing' : 'material'
  const every = g.taken.find(t => t.kind === 'every')
  const parts = g.taken.filter(t => t.kind !== 'every')
  const held = g.asIs.fps < 58
  const counted = parts.filter(t => t.saved >= q || (before.get(t.label)?.saved ?? 0) >= q)
  const rest = parts.filter(t => !counted.includes(t))
  const name = (t: Taken) => taken(t, word)
  const rows: Bar[] = counted.map(t => {
    const o = before.get(t.label), n = name(t)
    return {
      label: esc(n.label) + (t.threw ? ` <span class="warnc">the page threw ${t.threw} times</span>` : ''), sub: esc(n.sub), value: Math.max(0, t.saved), group: 'gpu',
      range: runs > 1 ? [Math.max(0, t.least), Math.max(0, t.most)] : undefined,
      before: was ? Math.max(0, o?.saved ?? 0) : undefined,
      change: was ? change(o?.saved, t.saved, o && was.gpu ? noise.saved(o, t, Math.max(g.asIs.ms, was.gpu.asIs.ms), each) : true) : undefined,
    }
  })
  const how = `${each} s with each thing taken away${runs > 1 ? `, ${runs} runs: the bar is the middle run and the range the least and most` : ', one run'}`
  return `<div class="part">
  <h3>What the GPU saves</h3>
  ${held
    ? `<p class="note">A frame takes ${ms(g.asIs.ms)}${g.drawing ? `, ${g.drawing.triangles.toLocaleString('en-GB')} triangles in ${g.drawing.calls} draw calls` : ''}${g.drawn ? `, ${esc(g.drawn)}` : ''}. Each bar is how much shorter the frame got with one thing taken away: each pass switched off, the shadows let go, each ${word === 'material' ? 'material drawn in one plain colour' : 'group of things left out of the draw'}; ${how}.${every ? ` With every ${word === 'material' ? 'material flat' : 'thing hidden'} at once, the frame is ${ms(every.saved)} shorter.` : ''}</p>
  ${rows.length ? `${legend([], `<span><i class="sw g-gpu"></i>Time saved</span>${was ? '<span><i class="sw wask"></i>Before</span>' : ''}`)}${bars(rows, { compared: !!was, floor: q })}` : ''}
  ${rest.length ? `<p class="quiet">Saved less than one frame of its window, ${ms(q)}, which the count cannot tell from nothing: ${rest.map(t => esc(name(t).label)).join(', ')}.</p>` : ''}`
    : `<p class="note">This scene makes 60 frames a second${g.drawing ? `, ${g.drawing.triangles.toLocaleString('en-GB')} triangles in ${g.drawing.calls} draw calls` : ''}, so the GPU has time to spare and taking things away cannot make it faster. To find what the GPU spends, run it heavier: more of what it draws, a bigger screen (<code>--dpr 2</code>), a higher tier.</p>`}
</div>`
}

// The systems as each is timed where it is called.
function systems(s: Scene, was?: Scene) {
  if (!s.cpu) return ''
  const plugins = new Set(s.cpu.owners.list.filter(o => o.group === 'plugin').map(o => o.name))
  const before = new Map((was?.cpu?.systems ?? []).map(x => [x.name, x]))
  const list = s.cpu.systems.filter(x => x.ms >= 0.0005)
  const rows: Bar[] = list.map(x => {
    const p = plain(x.name, plugins), o = before.get(x.name)
    return {
      label: esc(p.label), sub: x.rows !== undefined ? `${x.rows.toFixed(1)} rows, ${ms(x.ms / Math.max(x.rows, 1e-9))} a row` : undefined, value: x.ms, group: p.group,
      before: was ? o?.ms ?? 0 : undefined, change: was ? change(o?.ms, x.ms, o ? noise.cpu(o.ms, x.ms) : true) : undefined,
    }
  })
  return `<details class="part fold"><summary><h3>Each system, timed where it is called</h3><span class="quiet">${list.length} systems</span></summary>
  <p class="note">The same frames timed a second way: each kind's rules and look and each plugin's page half, timed around its call. Engine page is what is left of the frame, engine rules what is left of each step past the kinds'.</p>
  ${bars(rows, { compared: !!was, keep: kept(rows) })}
</details>`
}

function rules(s: Scene, was?: Scene) {
  const t = s.ticks
  if (!t) return ''
  const w = was?.ticks
  const list = whos(t.owners.list).filter(x => x.ms >= 0.0005)
  const before = new Map(whos(w?.owners.list).map(x => [x.key, x]))
  const rows: Bar[] = list.map(x => {
    const o = before.get(x.key)
    return { label: esc(x.name), sub: esc(x.group), value: x.ms, group: groupOf(x.group), before: w ? o?.ms ?? 0 : undefined, change: w ? change(o?.ms, x.ms, o ? noise.cpu(o.ms, x.ms) : true) : undefined }
  })
  return `<details class="part fold"><summary><h3>The rules alone, on node</h3><span class="quiet">${ms(t.step.mean)} a step</span></summary>
  <p class="note">The scene's rules with no page, no draw and no wire: ${t.rows} rows, ${t.steps} steps (${t.seconds} s of game) in ${t.wall.toFixed(2)} s. A step took ${ms(t.step.mean)} on average, 95 in 100 under ${ms(t.step.p95)}, the slowest ${ms(t.step.most)}.</p>
  ${bars(rows, { compared: !!w, keep: kept(rows) }).replace('ms a frame', 'ms a step')}
</details>`
}

function scene(s: Scene, was?: Scene) {
  const v = verdict(s)
  const warn = [
    ...(s.cpu?.threw.count ? [`The page threw ${s.cpu.threw.count} times while its CPU was timed, so those frames stopped part way and read less work than they are: <code>${esc(s.cpu.threw.first ?? '')}</code>`] : []),
    ...((s.cpu?.others.length || s.gpu?.others.length) ? [`Another Chrome was drawing on this GPU while it was measured (${esc([...new Set([...(s.cpu?.others ?? []), ...(s.gpu?.others ?? [])])].join(', '))}), so its frames may be slower than the scene alone.`] : []),
  ]
  return `<section class="scene" id="scene-${esc(s.scene)}">
  <header class="sh"><h2>${esc(s.scene)}</h2>${v ? `<span class="pill ${v.held}">${esc(v.says)}</span>` : '<span class="quiet">Not measured</span>'}</header>
  ${warn.map(w => `<p class="warn">${w}</p>`).join('')}
  ${figures(s, was)}
  ${cpuOwners(s, was)}
  ${frames(s, was)}
  ${gpu(s, was)}
  ${slowest(s)}
  ${systems(s, was)}
  ${rules(s, was)}
</section>`
}

// Layout: one column, left aligned, 1040px at most; each scene a section of figures, then charts that
// share one bar grammar (label left, bar from one baseline, value at the tip, hairline ticks below).
const STYLE = `
:root {
  --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink2: #52514e; --muted: #898781;
  --grid: #e1e0d9; --axis: #c3c2b7; --ring: rgba(11,11,11,0.10); --wash: rgba(11,11,11,0.035);
  --plugin: #2a78d6; --kind: #eb6834; --addon: #1baf7a; --engine: #eda100; --playtester: #e87ba4;
  --browser: #a9a79f; --gpu: #6250d6; --was: #c3c2b7; --spare: #e9e8e2; --waiting: #c9c7bf;
  --worse: #d03b3b; --better: #0c7a0c; --budget: #52514e;
  --sans: system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink2: #c3c2b7; --muted: #898781;
  --grid: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10); --wash: rgba(255,255,255,0.04);
  --plugin: #3987e5; --kind: #d95926; --addon: #199e70; --engine: #c98500; --playtester: #d55181;
  --browser: #6e6d68; --gpu: #9085e9; --was: #4a4a46; --spare: #262624; --waiting: #4a4945;
  --worse: #e66767; --better: #0ca30c; --budget: #c3c2b7; color-scheme: dark; } }
:root[data-theme="dark"] {
  --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink2: #c3c2b7; --muted: #898781;
  --grid: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10); --wash: rgba(255,255,255,0.04);
  --plugin: #3987e5; --kind: #d95926; --addon: #199e70; --engine: #c98500; --playtester: #d55181;
  --browser: #6e6d68; --gpu: #9085e9; --was: #4a4a46; --spare: #262624; --waiting: #4a4945;
  --worse: #e66767; --better: #0ca30c; --budget: #c3c2b7; color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink); font: 14px/1.5 var(--sans); }
main { max-width: 1040px; margin: 0 auto; padding-block: 32px 80px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 20px; }
h1 { font-size: 28px; line-height: 1.15; margin: 0; letter-spacing: -0.01em; text-wrap: balance; }
h2 { font-size: 18px; margin: 0; text-wrap: balance; }
h3 { font-size: 15px; margin: 0; }
a { color: inherit; }
code { font: 12px var(--mono); }
.note { color: var(--ink2); margin: 4px 0 12px; max-width: 72ch; }
.quiet { color: var(--muted); }
.top { display: grid; gap: 10px; }
.runs { display: grid; gap: 6px; color: var(--ink2); font-size: 13px; }
.run { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
.run b { color: var(--ink); font-weight: 600; }
.path { font: 12px var(--mono); color: var(--muted); overflow-wrap: anywhere; }
.tag { font-size: 12px; font-weight: 600; padding: 1px 7px; border-radius: 4px; background: var(--wash); box-shadow: inset 0 0 0 1px var(--ring); color: var(--ink2); }
.tag.after { color: var(--ink); }
section { background: var(--surface); border-radius: 10px; box-shadow: 0 0 0 1px var(--ring); padding: 20px 22px; min-width: 0; }
.scene { display: grid; gap: 22px; scroll-margin-top: 16px; }
.sh { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.sh h2 { font-size: 22px; }
.pill { font-size: 12px; font-weight: 600; padding: 2px 9px; border-radius: 999px; white-space: nowrap; box-shadow: inset 0 0 0 1px var(--ring); }
.pill::before { content: ""; display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; }
.pill.none::before { background: var(--better); } .pill.gpu::before { background: var(--gpu); } .pill.cpu::before { background: var(--kind); }
.warn { margin: 0; padding: 8px 12px; border-radius: 6px; background: color-mix(in srgb, var(--worse) 9%, transparent); color: var(--ink); font-size: 13px; }
.warnc { color: var(--worse); font-size: 12px; font-weight: 400; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; color: var(--ink2); margin: 0 0 10px; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
.g-plugin { background: var(--plugin); } .g-kind { background: var(--kind); } .g-addon { background: var(--addon); } .g-engine { background: var(--engine); }
.g-playtester { background: var(--playtester); } .g-browser, .g-page { background: var(--browser); } .g-gpu { background: var(--gpu); }
.was, .sw.wask { background: var(--was); }
.rest, .rest.none, .sw.rest.none { background: var(--spare); } .rest.gpu, .sw.rest.gpu { background: var(--waiting); } .rest.cpu { background: var(--spare); }
.sw.rest { background: var(--waiting); } .legend .sw.rest.none { box-shadow: inset 0 0 0 1px var(--ring); }

/* every scene's frame */
.ovs { display: grid; }
.ov { display: grid; grid-template-columns: minmax(130px, 200px) 1fr; gap: 6px 18px; align-items: center; padding: 12px 0; border-top: 1px solid var(--grid); text-decoration: none; }
.ov:hover .ovn b { text-decoration: underline; }
.ovn { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.ovn b { font-size: 15px; }
.ovb { position: relative; display: grid; gap: 6px; }
.budget { position: absolute; top: -4px; bottom: -4px; width: 1px; background: var(--budget); z-index: 1; }
.fb { display: grid; grid-template-columns: 1fr; gap: 2px 8px; align-items: center; }
.fb.tagged { grid-template-columns: 52px 1fr; }
.fb .tag { grid-row: span 2; align-self: start; font-size: 11px; text-align: center; }
.stack { position: relative; display: flex; gap: 2px; height: 16px; }
.stack .seg { display: block; height: 100%; min-width: 0; }
.stack .seg:first-child { border-radius: 3px 0 0 3px; } .stack .seg:last-child { border-radius: 0 4px 4px 0; }
.fbl { grid-column: -2; font-size: 12px; color: var(--ink2); font-variant-numeric: tabular-nums; }
.fbl b { color: var(--ink); }

/* figures */
.figs { display: flex; flex-wrap: wrap; gap: 12px 36px; }
.fig { display: grid; gap: 1px; }
.fl { font-size: 12px; color: var(--ink2); }
.fv { font-size: 26px; font-weight: 600; line-height: 1.1; }
.fv small { font-size: 14px; font-weight: 500; color: var(--ink2); }
.d { font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.d.worse { color: var(--worse); font-weight: 600; } .d.better { color: var(--better); font-weight: 600; }

/* bar charts */
.part { display: grid; min-width: 0; }
.part > h3 { margin-bottom: 0; }
.bars { display: grid; }
.br, .br > summary { display: grid; grid-template-columns: minmax(140px, 30%) 1fr; gap: 0 14px; align-items: center; }
.br.cmp, .br.cmp > summary { grid-template-columns: minmax(140px, 28%) 1fr 96px; }
details.br { display: block; }
.br > summary { list-style: none; cursor: pointer; border-radius: 6px; }
.br > summary::-webkit-details-marker { display: none; }
.br > summary:hover, details.br[open] > summary { background: var(--wash); }
.br > summary:focus { outline: none; } .br > summary:focus-visible { outline: 2px solid var(--plugin); outline-offset: 1px; }
.bl { min-width: 0; padding: 3px 6px; overflow-wrap: anywhere; }
.bn { font-weight: 500; }
details.br > summary .bl::before { content: "+"; display: inline-block; width: 14px; color: var(--muted); font-weight: 400; }
details.br[open] > summary .bl::before { content: "−"; }
.bs { font-size: 12px; color: var(--muted); }
.bp { position: relative; height: 30px; }
.grid { position: absolute; inset: 0; }
.grid i { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--grid); }
.fill, .was { position: absolute; left: 0; height: 10px; top: 10px; border-radius: 0 4px 4px 0; }
.br.cmp .was { top: 5px; height: 6px; }
.br.cmp .fill { top: 13px; }
.whisk { position: absolute; top: 14px; height: 2px; background: var(--ink2); }
.tip { position: absolute; top: 6px; margin-left: 8px; font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--ink); }
.bc { text-align: right; }
.br.faint { opacity: .55; }
.br.axis .bp { height: 22px; }
.br.axis .bp span { position: absolute; top: 2px; transform: translateX(-50%); font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.br.axis .bp span:first-child { transform: none; }
.unit { font-size: 11px; color: var(--muted); text-align: right; font-weight: 400; }
.fns th:first-child, .fns td:first-child { width: 1%; }
.tail > summary { cursor: pointer; list-style: none; padding: 6px 6px; color: var(--ink2); font-size: 13px; border-radius: 6px; }
.tail > summary::-webkit-details-marker { display: none; }
.tail > summary::before { content: "+"; display: inline-block; width: 14px; color: var(--muted); }
.tail[open] > summary::before { content: "−"; }
.tail > summary:hover { background: var(--wash); }
.tail > summary:focus { outline: none; } .tail > summary:focus-visible { outline: 2px solid var(--plugin); }
.open { padding: 4px 6px 14px 26px; display: grid; gap: 10px; }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: 2px 14px; margin: 0; font-size: 13px; }
.facts dt { color: var(--muted); } .facts dd { margin: 0; color: var(--ink2); }
.fns { border-collapse: collapse; width: 100%; font-size: 12px; }
.fns th { text-align: left; font-weight: 500; color: var(--muted); padding: 3px 8px; border-bottom: 1px solid var(--grid); }
.fns td { padding: 3px 8px; border-bottom: 1px solid var(--grid); vertical-align: top; }
.fns td code { color: var(--ink); }
.fns .at { display: block; color: var(--muted); font: 11px var(--mono); overflow-wrap: anywhere; }
.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }

/* what changed */
.dms { display: grid; }
.dm { display: grid; grid-template-columns: minmax(160px, 32%) 1fr 190px; gap: 0 14px; align-items: center; min-height: 34px; border-top: 1px solid var(--grid); }
.dm.axis { border: 0; min-height: 0; }
.dml { overflow-wrap: anywhere; }
.dml a { font-weight: 600; }
.dmp { position: relative; height: 30px; }
.dm.axis .dmp { height: 22px; }
.dm.axis .dmp span { position: absolute; top: 2px; transform: translateX(-50%); font-size: 11px; color: var(--muted); }
.dm.axis .dmp span:first-child { transform: none; }
.dmline { position: absolute; top: 14px; height: 2px; }
.dmline.worse { background: color-mix(in srgb, var(--worse) 55%, transparent); } .dmline.better { background: color-mix(in srgb, var(--better) 55%, transparent); }
.dot { position: absolute; top: 10px; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; box-shadow: 0 0 0 2px var(--surface); }
.dot.before, .dotk.before { background: var(--muted); }
.dot.worse, .dotk.worse { background: var(--worse); } .dot.better, .dotk.better { background: var(--better); }
.dotk { display: inline-block; width: 9px; height: 9px; border-radius: 50%; }
.dmv { font-size: 13px; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }

/* the line chart */
.lc { display: grid; grid-template-columns: 40px 1fr; gap: 8px; }
.ly { position: relative; height: 200px; }
.ly span { position: absolute; right: 0; transform: translateY(-50%); font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.ly .yu { top: -26px; transform: none; }
.lc { margin-top: 26px; }
.lp { position: relative; height: 200px; }
.lp svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.lp polyline { fill: none; stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.lp .now { stroke: var(--plugin); } .lp .before { stroke: var(--was); }
.lp .gl { stroke: var(--grid); stroke-width: 1; vector-effect: non-scaling-stroke; }
.lp .budget { stroke: var(--budget); stroke-width: 1; vector-effect: non-scaling-stroke; position: static; }
.bud { position: absolute; right: 0; transform: translateY(-120%); font-size: 11px; color: var(--ink2); background: var(--surface); padding: 0 4px; }
.lx { display: flex; justify-content: space-between; margin-left: 48px; font-size: 11px; color: var(--muted); padding-top: 4px; }
.lk { display: inline-block; width: 14px; height: 2px; border-radius: 1px; }
.lk.now { background: var(--plugin); } .lk.before { background: var(--was); }

/* folded parts */
.fold > summary { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; cursor: pointer; list-style: none; padding: 6px 0; border-top: 1px solid var(--grid); }
.fold > summary::-webkit-details-marker { display: none; }
.fold > summary h3::before { content: "+"; display: inline-block; width: 16px; color: var(--muted); font-weight: 400; }
.fold[open] > summary h3::before { content: "−"; }
.fold > summary:focus { outline: none; } .fold > summary:focus-visible { outline: 2px solid var(--plugin); outline-offset: 2px; }
.fold[open] > summary { margin-bottom: 4px; }

/* the slowest frames */
.sf { display: grid; grid-template-columns: 64px 1fr; gap: 2px 14px; align-items: center; padding: 6px 0; }
.sft { font-weight: 600; font-variant-numeric: tabular-nums; }
.sfp { position: relative; height: 16px; }
.sfp .stack { position: absolute; left: 0; top: 2px; height: 12px; }
.sfp .budget { top: -2px; bottom: -2px; }
.sfl { grid-column: 2; display: flex; flex-wrap: wrap; gap: 2px 16px; font-size: 12px; color: var(--ink2); }
.sfl span { display: inline-flex; align-items: center; gap: 6px; }
.sfl b { color: var(--ink); font-variant-numeric: tabular-nums; }
.sf.axis { padding: 0; }
.sf.axis .sfp { height: 22px; }
.sf.axis .sfp span { position: absolute; top: 2px; transform: translateX(-50%); font-size: 11px; color: var(--muted); }
.sf.axis .sfp span:first-child { transform: none; }

/* the list of runs */
.back a { font-size: 13px; color: var(--ink2); }
.pick { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.pick label { font-size: 13px; color: var(--ink2); }
.pick select { font: inherit; padding: 5px 8px; border-radius: 6px; border: 1px solid var(--axis); background: var(--page); color: var(--ink); max-width: 100%; min-width: 0; }
.pick button { font: inherit; font-weight: 600; padding: 6px 16px; border-radius: 6px; border: 0; background: var(--ink); color: var(--surface); cursor: pointer; }
.pick select:focus-visible, .pick button:focus-visible { outline: 2px solid var(--plugin); outline-offset: 2px; }
.lst { display: grid; margin-top: 8px; }
.li { display: grid; gap: 6px; padding: 12px 0; border-top: 1px solid var(--grid); }
.lih { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; }
.cmpl { margin-left: auto; font-size: 13px; }
.lis { display: flex; flex-wrap: wrap; gap: 6px 22px; font-size: 13px; color: var(--ink2); }
.ls { display: inline-flex; align-items: center; gap: 8px; }
.ls b { color: var(--ink); }
@media (max-width: 640px) {
  section { padding: 16px 14px; }
  .ov { grid-template-columns: 1fr; }
  .br, .br > summary, .br.cmp, .br.cmp > summary { grid-template-columns: 1fr; }
  .br .bc { text-align: left; padding: 0 6px 6px; }
  .dm { grid-template-columns: 1fr; padding: 6px 0; }
  .dmv { text-align: left; }
  .open { padding-left: 6px; }
}
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; } }
`

const doc = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<style>${STYLE}</style></head>
<body><main>
${body}
</main></body></html>
`

// One run laid out, or two compared, `a` before and `b` after; `back` the page that lists them.
export function page(a: Run, b?: Run, back?: string): string {
  const now = b ?? a
  return doc(`${now.game} benchmark`, `${back ? `<nav class="back"><a href="${esc(back)}">All benchmarks</a></nav>` : ''}
${header(a, b)}
${overview(a, b)}
${b ? changes(a, b) : ''}
${now.scenes.map(s => scene(s, b ? a.scenes.find(x => x.scene === s.scene) : undefined)).join('\n')}`)
}

// Where the benchmark keeps its runs: `benchmarks/<game>/<when>`, at the repo's root.
export const HOME = path.resolve(import.meta.dirname, '..', 'benchmarks')

// Every run there, and any other folder named, newest first, each by an id the page asks for it by.
export type Listed = { id: string; run: Run }
export function listed(home = HOME, extra: string[] = []): Listed[] {
  const out: Listed[] = []
  const add = (id: string, dir: string) => { try { out.push({ id, run: load(dir) }) } catch { /* a folder with no run in it */ } }
  if (fs.existsSync(home)) {
    for (const game of fs.readdirSync(home, { withFileTypes: true }).filter(d => d.isDirectory())) {
      for (const run of fs.readdirSync(path.join(home, game.name), { withFileTypes: true }).filter(d => d.isDirectory())) add(`${game.name}/${run.name}`, path.join(home, game.name, run.name))
    }
  }
  extra.forEach((dir, i) => add(`given/${i}`, path.resolve(dir)))
  return out.sort((x, y) => (y.run.made?.at ?? '').localeCompare(x.run.made?.at ?? ''))
}

const when = (r: Run) => r.made ? new Date(r.made.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'when not recorded'

// The page listing every run: pick one to look at, or two to compare, and each game's runs with what
// held each scene.
export function index(list: Listed[]): string {
  const games = [...new Set(list.map(l => l.run.game))].sort()
  const option = (l: Listed) => `<option value="${esc(l.id)}">${esc(l.run.game)}, ${esc(when(l.run))}, ${esc(l.run.mode.toLowerCase())}</option>`
  const run = (l: Listed, older?: Listed) => `<div class="li">
      <div class="lih"><a href="view?b=${encodeURIComponent(l.id)}"><b>${esc(when(l.run))}</b></a> <span class="quiet">${esc(l.run.mode)}${l.run.made ? `, core ${esc(l.run.made.core.commit)}${l.run.made.core.dirty ? ' with changes' : ''}` : ''}</span>
        ${older ? `<a class="cmpl" href="view?a=${encodeURIComponent(older.id)}&amp;b=${encodeURIComponent(l.id)}">Compare with the run before</a>` : ''}</div>
      <div class="lis">${l.run.scenes.map(s => { const v = verdict(s); return `<span class="ls"><b>${esc(s.scene)}</b> ${v ? `${v.fps.toFixed(1)} a second <span class="pill ${v.held}">${esc(v.says)}</span>` : '<span class="quiet">not measured</span>'}${s.cpu?.threw.count ? ` <span class="warnc">the page threw ${s.cpu.threw.count} times</span>` : ''}</span>` }).join('')}</div>
    </div>`
  return doc('Benchmarks', `<header class="top"><h1>Benchmarks</h1>
  <p class="note">Every run in <code>benchmarks/</code>, newest first. Pick one to look at, or a before and an after to compare. A run is made with <code>node .claude/skills/benchmarking-a-game/bench.mjs &lt;server&gt; &lt;game&gt;</code> and lands here.</p></header>
  ${list.length ? `<section>
  <form class="pick" action="view" method="get">
    <label for="pick-b">Look at</label><select id="pick-b" name="b">${list.map(option).join('')}</select>
    <label for="pick-a">Compared with</label><select id="pick-a" name="a"><option value="">nothing</option>${list.map(option).join('')}</select>
    <button type="submit">Show</button>
  </form>
  </section>
  ${games.map(g => { const runs = list.filter(l => l.run.game === g); return `<section><h2>${esc(g)}</h2><div class="lst">${runs.map((l, i) => run(l, runs[i + 1])).join('')}</div></section>` }).join('')}`
    : '<section><p>No runs yet. Run the benchmark on a game and its run appears here.</p></section>'}`)
}

// The page's server: `/` the runs, `/view?b=<id>[&a=<id>]` one run, or `a` before and `b` after. The
// folders are read again on every request, so a run made while it serves is there on the next.
export function server(extra: string[] = []) {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const send = (code: number, html: string) => { res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' }); res.end(html) }
    const list = listed(HOME, extra)
    if (url.pathname === '/') return send(200, index(list))
    if (url.pathname === '/view') {
      const find = (id: string | null) => id ? list.find(l => l.id === id) : undefined
      const b = find(url.searchParams.get('b')), a = find(url.searchParams.get('a'))
      if (!b) return send(404, doc('Not found', `<nav class="back"><a href="/">All benchmarks</a></nav><section><p>There is no run <code>${esc(url.searchParams.get('b') ?? '')}</code> in <code>benchmarks/</code>.</p></section>`))
      return send(200, a ? page(a.run, b.run, '/') : page(b.run, undefined, '/'))
    }
    send(404, doc('Not found', '<nav class="back"><a href="/">All benchmarks</a></nav>'))
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const p = args.indexOf('--port')
  let port = p >= 0 ? Number(args.splice(p, 2)[1]) : 5190
  const s = server(args)
  // the next port up when one is taken
  s.on('error', (e: NodeJS.ErrnoException) => { if (e.code === 'EADDRINUSE' && port < 5290) s.listen(++port); else throw e })
  s.on('listening', () => console.log(`benchmarks: http://localhost:${port}/`))
  s.listen(port)
}
