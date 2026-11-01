import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { index, listed, load, page, server, verdict, type Cpu, type Gpu, type Owner, type Ticks } from './benchmarkPage.ts'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'benchmarkPage-')) })
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const made = { at: '2026-10-28T12:00:00.000Z', core: { commit: 'abc1234', branch: 'dev', dirty: false }, games: { commit: 'def5678', branch: 'dev', dirty: true }, machine: 'Apple M1' }
const owner = (group: string, name: string, side: string, ms: number): Owner => ({ who: `${group} ${name} ${side}`, group, name, side, ms, via: group === 'plugin' ? { three: ms / 2 } : {}, functions: [{ name: `${name}Fn  plugins/${name}/${name}.plugin.ts:10`, ms }] })

// A run of one scene, `main`, its CPU's work `work` ms a frame, render3d's page half `draw` ms of it and
// the person kind's look `look` over 40 rows, the page `fps` frames a second, and the ground's material
// saving `ground` ms taken away.
function run(name: string, { work, draw, look, fps, ground }: { work: number; draw: number; look: number; fps: number; ground: number }) {
  const out = path.join(dir, name)
  fs.mkdirSync(out)
  const cpu: Cpu = {
    ...made, tool: 'cpu', settings: { seconds: 10 }, game: 'demo_x', scene: 'main', drawn: 'drawn at pixel ratio 1, 1280x720', others: [], threw: { count: 0 },
    frames: 600, seconds: 10, rate: fps, work, times: Array.from({ length: 600 }, (_, i) => work + (i % 7) / 10),
    systems: [{ name: 'page render3d.afterTick', ms: draw, share: 60 }, { name: 'look person.tick', ms: look, share: 10, rows: 40 }],
    slow: [{ frame: work * 2, top: [{ name: 'page render3d.afterTick', ms: draw }] }],
    owners: { busy: work, idle: 0, list: [owner('plugin', 'render3d', 'page', draw), owner('kind', 'person', 'look', look), owner('kind', 'person', 'rules', 0.2), owner('engine', 'engine', 'rules', work - draw - look - 0.2)] },
  }
  const gpu: Gpu = {
    ...made, tool: 'gpu', settings: { each: 3, runs: 1 }, game: 'demo_x', scene: 'main', drawn: '', others: [],
    drawing: { triangles: 120000, calls: 80 }, meshes: { 'MeshStandardMaterial {terrain3d} (ground)': 4 },
    asIs: { ms: 1000 / fps, fps, runs: [{ ms: 1000 / fps }] },
    taken: [{ label: 'material MeshStandardMaterial {terrain3d} (ground)', kind: 'material', fps: 1000 / (1000 / fps - ground), ms: 1000 / fps - ground, saved: ground, least: ground, most: ground, meshes: 4, threw: 0 }],
  }
  const ticks: Ticks = {
    ...made, tool: 'ticks', settings: { seconds: 30 }, game: 'demo_x', scene: 'main', rows: 50, steps: 1800, seconds: 30, wall: 0.5,
    step: { mean: 0.25, p95: 0.4, most: 1 }, systems: [{ name: 'person.tick', ms: 0.2, share: 80 }],
    owners: { busy: 0.25, list: [owner('kind', 'person', 'rules', 0.2)] },
  }
  fs.writeFileSync(path.join(out, 'main.cpu.json'), JSON.stringify(cpu))
  fs.writeFileSync(path.join(out, 'main.gpu.json'), JSON.stringify(gpu))
  fs.writeFileSync(path.join(out, 'main.ticks.json'), JSON.stringify(ticks))
  fs.writeFileSync(path.join(out, 'run.json'), JSON.stringify({ ...made, tool: 'bench', settings: { deep: false, playtest: true }, game: 'demo_x', scenes: [{ scene: 'main' }] }))
  return out
}

describe('benchmarkPage', () => {
  it('says what holds a frame: the GPU when the CPU works little of it, the CPU when it works most of it', () => {
    const gpuHeld = load(run('a', { work: 4, draw: 2, look: 1, fps: 30, ground: 12 }))
    const cpuHeld = load(run('b', { work: 30, draw: 20, look: 5, fps: 30, ground: 1 }))
    expect(verdict(gpuHeld.scenes[0])!.held).toBe('gpu')
    expect(verdict(cpuHeld.scenes[0])!.held).toBe('cpu')
  })

  it('lays out a run: every owner with its sides and a kind its cost a row, and the GPU savings', () => {
    const html = page(load(run('a', { work: 4, draw: 2, look: 1, fps: 30, ground: 12 })))
    expect(html).toContain('played by its playtester')
    expect(html).toContain('render3d')
    expect(html).toContain('look 1.00 ms · rules 0.20 ms')
    expect(html).toContain('40.0 rows drawn, its look 0.025 ms a row')
    expect(html).toContain('in three 1.00 ms')
    expect(html).toContain('terrain3d</span> <span class="bs">ground, MeshStandardMaterial, 4 meshes')
    expect(html).toContain('120,000 triangles in 80 draw calls')
    expect(html).not.toContain('title=')
  })

  it('lists every run in a folder of games, newest first, and links each to the one before it', () => {
    const home = path.join(dir, 'home')
    fs.mkdirSync(path.join(home, 'demo_x'), { recursive: true })
    fs.renameSync(run('a', { work: 4, draw: 2, look: 1, fps: 30, ground: 12 }), path.join(home, 'demo_x', 'old'))
    const newer = run('b', { work: 6, draw: 4, look: 1, fps: 20, ground: 25 })
    const at = path.join(newer, 'run.json')
    fs.writeFileSync(at, JSON.stringify({ ...JSON.parse(fs.readFileSync(at, 'utf8')), at: '2026-10-29T12:00:00.000Z' }))
    fs.renameSync(newer, path.join(home, 'demo_x', 'new'))
    const list = listed(home)
    expect(list.map(l => l.id)).toEqual(['demo_x/new', 'demo_x/old'])
    expect(index(list)).toContain('view?a=demo_x%2Fold&amp;b=demo_x%2Fnew')
  })

  it('serves the runs and any one of them', async () => {
    run('a', { work: 4, draw: 2, look: 1, fps: 30, ground: 12 })
    const s = server([path.join(dir, 'a')])
    await new Promise<void>(r => s.listen(0, r))
    const port = (s.address() as { port: number }).port
    const home = await (await fetch(`http://localhost:${port}/`)).text()
    const one = await (await fetch(`http://localhost:${port}/view?b=given%2F0`)).text()
    const none = await fetch(`http://localhost:${port}/view?b=nope`)
    s.close()
    expect(home).toContain('view?b=given%2F0')
    expect(one).toContain('Who eats the CPU')
    expect(none.status).toBe(404)
  })

  it('compares two runs from their files: what grew past noise is a change, what moved inside it is not', () => {
    const before = load(run('a', { work: 4, draw: 2, look: 1, fps: 30, ground: 12 }))
    const after = load(run('b', { work: 6.01, draw: 4, look: 1.01, fps: 20, ground: 25 }))
    const html = page(before, after)
    const changed = html.slice(html.indexOf('What changed'), html.indexOf('id="scene-main"'))
    expect(changed).toContain('render3d on the CPU')
    expect(changed).toContain('+2.00 ms')
    expect(changed).toContain('terrain3d on the GPU')
    expect(changed).toContain('the frame as it is')
    expect(changed).not.toContain('person on the CPU')
  })
})
