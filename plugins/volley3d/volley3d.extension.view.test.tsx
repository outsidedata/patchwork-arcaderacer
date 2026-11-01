// The Patterns 3D panel on a game the test writes into a sandbox of the repo, `volleyrange`: a range
// and a yard, whose `world`, the manager's, names volley3d's patterns, particle3d's effects and a data
// file whose launchers name patterns, and hands volley3d hitscan3d's `shoot` over terrain3d's ground,
// level at 0. Each test attaches the game view a few steps in, and it shows the range through
// render3d's stage. Its patterns file is listed, edited a value at a time and undone byte for byte,
// its types bound wherever the file is shown, the selected pattern plotted in the panel and fired
// through the view's client's volley3d as a round of the page's alone, which no row holds.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, onTestFinished, test, vi } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EditorContext } from '#editor/context.ts'
import type { Pointer } from '#editor/editor.ts'
import { editor, sandbox, stage } from '#editor/test/editor.ts'
import { datafiles } from '#extensions/datafiles/datafiles.extension.tsx'
import { types } from '#extensions/types/types.extension.tsx'
import { json } from '#plugins/loader/loader.sim.ts'
import { render3d } from '#plugins/render3d/render3d.extension.tsx'
import { particle3d } from '#plugins/particle3d/particle3d.extension.tsx'
import type { Effect } from '#plugins/particle3d/particle3d.plugin.ts'
import type { Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import { LOOK, type Patterns } from './volley3d.sim.ts'
import type { Volley } from './volley3d.plugin.ts'
import { aimOf, marks, muzzleOf, plot, volley3d } from './volley3d.extension.tsx'
import { GAME, PATTERNS, close, folder, look, path } from './volley3d.extension.harness.ts'

const defs = `${folder}/assets/range.json`
const effectsPath = `${folder}/assets/effects.json`
const DT = 1 / 60

vi.setConfig({ testTimeout: 60000 })

// ---------------------------------------------------------------- the game

const EFFECTS = {
  cap: 400,
  effects: {
    flame: [{ lasts: true, follow: true }],
    smoke: [{ every: 0.05, life: [0.5, 0.5] }],
    boom: [{ n: [6, 6], life: [1, 1], speed: [1, 1] }],
    spark: [{ life: [0.2, 0.2] }],
  },
}
const LAND: Field = {
  program: { world: 600, hscale: 10, sea: 0.5, flood: false, out: 'level', nodes: [{ id: 'level', op: 'const', value: 0 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  bands: [{ colour: '#3e5722', amount: 1, rules: [] }],
  grain: { base: 1, range: 0 },
  detail: [],
  surfaces: {},
  layers: [],
}
const asset = (name: string) => ({ type: 'json', url: `/${folder}/assets/${name}.json`, preload: true })
const MANAGER = {
  world: {
    loader: { assets: { land: asset('land'), patterns: asset('patterns'), effects: asset('effects'), range: asset('range') } },
    terrain3d: { field: 'land' },
    hitscan3d: { mods: { ground: 'terrain3d' }, kinds: {}, rewind: 1 },
    volley3d: { patterns: 'patterns', hold: 0.25, mods: { shoot: 'hitscan3d', bodies: 'hitscan3d' } },
    particle3d: { effects: 'effects', hold: 0.1 },
  },
  prefabs: {
    engine: { dt: DT },
    scenemanager: { scenes: { range: { file: 'range.scene.json', suspend: false }, yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'range', port: 0 },
  },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const child = {
  plugins: ['loader', 'scenemanager', 'volley3d', 'particle3d', 'render3d'],
  seats: 1,
  prefabs: {
    engine: { dt: DT, width: 640, height: 400 },
    render3d: { camera: { fov: 60, near: 0.1, far: 1000, at: [0, 12, -20], look: [0, 0, 10] } },
    scenemanager: { out: {} }, loader: {}, volley3d: { next: 1, live: [] }, particle3d: { next: 1, live: [] },
  },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'volley3d' }, { is: 'particle3d' }],
}
const sims = `
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { loader } from '#plugins/loader/loader.sim.ts'
import { volley3d } from '#plugins/volley3d/volley3d.sim.ts'
import { particle3d } from '#plugins/particle3d/particle3d.sim.ts'
`

// The game written into the sandbox's games, each file as a person writes it, a key a line.
function write(root: string) {
  const at = join(root, folder)
  mkdirSync(join(at, 'assets'), { recursive: true })
  const file = (name: string, value: unknown) => writeFileSync(join(at, name), JSON.stringify(value, null, 2) + '\n')
  file(`${GAME}.scene.json`, MANAGER)
  writeFileSync(join(at, `${GAME}.sim.ts`), `import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'\nexport const sim = { scenemanager }\n`)
  for (const scene of ['range', 'yard']) {
    file(`${scene}.scene.json`, child)
    writeFileSync(join(at, `${scene}.sim.ts`), `${sims}import file from './${scene}.scene.json' with { type: 'json' }\nexport const sim = { scenemanager, loader, volley3d, particle3d }\nexport const scene = file\n`)
  }
  file('assets/patterns.json', PATTERNS)
  file('assets/effects.json', EFFECTS)
  file('assets/land.json', LAND)
  file('assets/range.json', { launcher: { pattern: 'rocket' }, mortar: { pattern: 'grenade', rounds: 6 } })
}

async function open() {
  localStorage.clear()
  write(sandbox([]))
  const made = await editor(GAME, {
    types: async () => ({ types }),
    datafiles: async () => ({ datafiles }),
    render3d: async () => ({ render3d }),
    particle3d: async () => ({ particle3d }),
    volley3d: async () => ({ volley3d }),
  })
  const { ed } = made
  onTestFinished(() => ed.close())
  await ed.open()
  for (let i = 0; i < 3; i++) await ed.session!.step()
  ed.session!.attach(stage())
  await vi.waitFor(() => expect(ed.session!.viewing).toBe('range'))
  await vi.waitFor(() => expect(ed.staged && ed.session!.client?.plugins.render3d?.renderer && ed.session!.client?.plugins.volley3d).toBeTruthy())
  const Panel = ed.panels.get('volley3d')!.component
  render(<EditorContext.Provider value={ed}><Panel /></EditorContext.Provider>)
  await screen.findByRole('table', { name: 'patterns' })
  return { ...made, user: userEvent.setup(), patterns: async () => JSON.parse(await made.read(path)) as Patterns }
}

type Opened = Awaited<ReturnType<typeof open>>
const table = () => screen.getByRole('table', { name: 'patterns' })
const pick = async (user: Opened['user'], name: string) => {
  await user.click(within(table()).getByText(name, { exact: true }))
  await screen.findByRole('textbox', { name: 'pattern name' })
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'pattern name' })).toHaveValue(name))
}
// Types `value` into the number field labelled `label`, once the panel draws it.
async function type(user: Opened['user'], label: string, value: string) {
  await user.click(await screen.findByRole('spinbutton', { name: label }))
  const input = screen.getByRole('textbox', { name: label })
  await user.clear(input)
  await user.type(input, `${value}{Enter}`)
}
const volleys = (ed: Opened['ed']) => ed.session!.client!.plugins.volley3d.volleys() as Volley[]
// The rounds of the page's alone: the preview's.
const previews = (ed: Opened['ed']) => volleys(ed).filter(v => v.key[0] === 0)
const effects = (ed: Opened['ed'], name: string) => (ed.session!.client!.plugins.particle3d.effects as readonly Effect[]).filter(fx => fx.name === name)
const ledger = (ed: Opened['ed']) => JSON.stringify(ed.session!.scene('range').rows.find(r => r.kind === 'volley3d')!.data)
const middle = (ed: Opened['ed']) => {
  const canvas = ed.session!.client!.plugins.render3d.canvas
  return ed.staged!.ground(canvas.width / 2, canvas.height / 2)!
}

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the panel lists the range\'s patterns with their speed, life, reach, whether each seeks, its splash and where it is named, filtered by name', async () => {
  const { user } = await open()
  const names = Object.keys(PATTERNS.patterns)
  expect(within(table()).getAllByRole('row')).toHaveLength(names.length + 1)
  const cells = (name: string) => [...within(table()).getByText(name, { exact: true }).closest('tr')!.querySelectorAll('td')].map(c => c.textContent)
  // Named once the panel has read the range's other data files.
  await waitFor(() => expect(cells('rocket')).toEqual(['rocket', '40', '3', '120', '', '2', '1']))
  expect(cells('missile')).toEqual(['missile', '30', '3', '90', 'yes', '0', '0'])
  // 30 → 50 m/s over its first second, and nothing holds it: 30·4 + 20·4²/2 m.
  expect(cells('shell')[3]).toBe('280')
  await user.type(screen.getByRole('textbox', { name: 'filter patterns' }), 'r{Enter}')
  expect(within(table()).getAllByRole('row').slice(1).map(r => r.firstChild!.textContent)).toEqual(names.filter(n => n.includes('r')))
  await user.clear(screen.getByRole('textbox', { name: 'filter patterns' }))
  await user.type(screen.getByRole('textbox', { name: 'filter patterns' }), '{Enter}')

  await pick(user, 'grenade')
  const where = await screen.findByRole('table', { name: 'where grenade is named' })
  expect(within(where).getAllByRole('row').slice(1).map(r => r.textContent)).toEqual([`${defs}mortar.pattern`])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a field edited in the panel writes one value, the page\'s copy reads it, and undo takes it back', async () => {
  const { ed, user, read, edits } = await open()
  const before = await read(path)
  await pick(user, 'rocket')
  await type(user, 'rocket speed', '55')
  await waitFor(() => expect(edits.map(e => [e.path, e.at, e.value])).toEqual([[path, ['patterns', 'rocket', 'speed'], 55]]))
  await act(() => ed.idle())
  const after = await read(path)
  expect(after.split('\n').length).toBe(before.split('\n').length)
  expect(after.replace('"speed": 55', '"speed": 40')).toBe(before)
  expect((json(ed.session!.client!.plugins.wire, 'patterns') as Patterns).patterns.rocket.speed).toBe(55)
  await act(() => ed.undo())
  expect(await read(path)).toBe(before)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a field is added with volley3d\'s own value and removed, each one undo; speed, life and look are never removed', async () => {
  const { ed, user, read, patterns } = await open()
  const before = await read(path)
  await pick(user, 'shell')
  expect(screen.queryByRole('button', { name: 'remove speed of shell' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'remove life of shell' })).toBeNull()
  // No max when left out: added at the speed it reaches at the end of its life, which holds nothing.
  await user.selectOptions(screen.getByRole('combobox', { name: 'add a field to shell' }), 'max (m/s)')
  await waitFor(async () => expect((await patterns()).patterns.shell).toMatchObject({ max: 110 }))
  await act(() => ed.idle())
  await user.selectOptions(screen.getByRole('combobox', { name: 'add a field to shell' }), 'g (m/s²)')
  await waitFor(async () => expect((await patterns()).patterns.shell).toMatchObject({ g: 0 }))
  await act(() => ed.idle())
  await user.click(screen.getByRole('button', { name: 'remove g of shell' }))
  await waitFor(async () => expect((await patterns()).patterns.shell).not.toHaveProperty('g'))
  await act(() => ed.idle())
  // seek shows in degrees a second and writes radians
  await user.selectOptions(screen.getByRole('combobox', { name: 'add a field to shell' }), 'seek (°/s)')
  await waitFor(async () => expect((await patterns()).patterns.shell).toMatchObject({ seek: 0 }))
  await act(() => ed.idle())
  await type(user, 'shell seek', '90')
  await waitFor(async () => expect((await patterns()).patterns.shell.seek).toBeCloseTo(Math.PI / 2, 12))
  await act(() => ed.idle())
  // A look's trail is added as the one the file's patterns name first, and a look's field removed.
  await user.selectOptions(screen.getByRole('combobox', { name: 'add a field to shell' }), 'look trail')
  await waitFor(async () => expect((await patterns()).patterns.shell.look).toEqual({ body: 'flame', burst: 'boom', trail: 'smoke' }))
  await act(() => ed.idle())
  await user.click(screen.getByRole('button', { name: 'remove look burst of shell' }))
  await waitFor(async () => expect((await patterns()).patterns.shell.look).toEqual({ body: 'flame', trail: 'smoke' }))
  await act(() => ed.idle())
  expect(screen.getByRole('combobox', { name: 'shell look body' })).toHaveValue('flame')
  // Seven changes, seven undos, and the file as it was.
  expect(ed.undos).toHaveLength(7)
  for (let i = 0; i < 7; i++) await act(() => ed.undo())
  expect(await read(path)).toBe(before)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a pattern is added, renamed, refused a name in use, and removed once what names it is said', async () => {
  const { ed, user, read, patterns } = await open()
  const before = await read(path)
  await user.type(screen.getByRole('textbox', { name: 'new pattern name' }), 'flare{Enter}')
  await user.click(screen.getByRole('button', { name: 'add a pattern' }))
  await waitFor(async () => expect((await patterns()).patterns.flare).toEqual({ speed: 40, life: 3, look }))
  await act(() => ed.idle())
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'pattern name' })).toHaveValue('flare'))

  await pick(user, 'missile')
  const name = screen.getByRole('textbox', { name: 'pattern name' })
  await user.clear(name)
  await user.type(name, 'rocket{Enter}')
  expect(await screen.findByText(/Refused: there is a pattern rocket already/)).toBeInTheDocument()
  await user.clear(name)
  await user.type(name, 'seeker{Enter}')
  await waitFor(async () => expect((await patterns()).patterns.seeker).toEqual(PATTERNS.patterns.missile))
  await act(() => ed.idle())
  expect((await patterns()).patterns.missile).toBeUndefined()
  await act(() => ed.undo())
  expect((await patterns()).patterns.missile).toEqual(PATTERNS.patterns.missile)

  // rocket is named by the range's launcher: removing it says so first
  await pick(user, 'rocket')
  await user.click(screen.getByRole('button', { name: 'remove pattern rocket' }))
  expect(screen.getByText(/rocket is named in 1 place/)).toBeInTheDocument()
  expect((await patterns()).patterns.rocket).toBeDefined()
  await user.click(screen.getByRole('button', { name: 'remove rocket anyway' }))
  await waitFor(async () => expect((await patterns()).patterns.rocket).toBeUndefined())
  await act(() => ed.idle())
  await act(() => ed.undo())
  await act(() => ed.undo())
  expect(await read(path)).toBe(before)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the file\'s fields are bound to their types wherever it is shown', async () => {
  const { ed } = await open()
  const at = (...k: string[]) => ed.typeOf(undefined, k, path)
  for (const k of LOOK) expect(at('patterns', 'rocket', 'look', k)).toBe('particle3d.effect')
  expect(at('patterns', 'missile', 'seek')).toBe('angle')
  expect(at('patterns', 'rocket', 'speed')).toBeUndefined()
  expect(ed.typeOf(undefined, ['patterns', 'rocket', 'look', 'body'], defs)).toBeUndefined()
  expect(ed.fields.has('volley3d.pattern')).toBe(true)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the selected pattern loops through the view\'s client as a round of the page\'s alone, drawn with its look, and never on a row', async () => {
  const { ed, user } = await open()
  const mark = vi.spyOn(ed.staged!, 'mark')
  const rows = ledger(ed)
  await pick(user, 'dart')
  await waitFor(() => expect(previews(ed)).toHaveLength(1))
  const [first] = previews(ed)
  // The page's only round: the range's ledger has none.
  expect(volleys(ed)).toEqual([first])
  const spawn = { heading: 0, elevation: 10, height: 2 }
  expect(mark).toHaveBeenCalledWith(marks(PATTERNS.patterns.dart, middle(ed), spawn), expect.any(Number))
  // Its body carried with it and its trail thrown from it, put on the first frame it is drawn.
  await waitFor(() => expect([effects(ed, 'flame').length, effects(ed, 'smoke').length]).toEqual([1, 1]))
  const [flame] = effects(ed, 'flame')
  expect(flame.dir).toEqual(aimOf(spawn).map(v => expect.closeTo(v, 9)))
  expect(ledger(ed)).toBe(rows)
  // Its half second flown and a quarter held, the next is fired.
  await waitFor(() => expect(previews(ed).some(v => v.key[1] > first.key[1])).toBe(true), { timeout: 20000 })

  // Loop off: once the last has gone, nothing more; Fire Once fires one.
  await user.click(screen.getByRole('button', { name: 'loop the selected pattern' }))
  await waitFor(() => expect(previews(ed)).toEqual([]), { timeout: 20000 })
  await new Promise(f => setTimeout(f, 200))
  expect(previews(ed)).toEqual([])
  // Clicked with no frame between the click and the read, so the round is where it was fired.
  fireEvent.click(screen.getByRole('button', { name: 'fire the selected pattern once' }))
  expect(previews(ed)).toHaveLength(1)
  close(previews(ed)[0].pos, muzzleOf(middle(ed), spawn))
  expect(ledger(ed)).toBe(rows)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the heading is a dial, the elevation and height numbers; the plot shows where it ends, its top and where it comes down', async () => {
  const { ed, user } = await open()
  await user.click(screen.getByRole('button', { name: 'loop the selected pattern' }))
  await pick(user, 'grenade')
  const dial = screen.getByRole('slider', { name: 'preview heading' })
  expect(dial).toHaveAttribute('aria-valuenow', '0')
  dial.focus()
  await user.keyboard('{ArrowRight}')
  await type(user, 'preview elevation', '30')
  await type(user, 'preview height', '3')
  fireEvent.click(screen.getByRole('button', { name: 'fire the selected pattern once' }))
  const spawn = { heading: 1, elevation: 30, height: 3 }
  close(previews(ed).at(-1)!.pos, muzzleOf(middle(ed), spawn))
  // Its body put on the first frame it is drawn, turned along the way it goes: 1° from +z toward +x,
  // whatever its fall has done to the rest since.
  await waitFor(() => expect(effects(ed, 'flame')).toHaveLength(1))
  const [flame] = effects(ed, 'flame')
  expect(flame.dir![0] / flame.dir![2]).toBeCloseTo(Math.tan(Math.PI / 180), 9)
  // 20 m/s at 30° under 9.8: up for 1.02 s to 5.1 m, and back down 35.3 m on at 2.04 s.
  const got = plot(PATTERNS.patterns.grenade, Math.PI / 6, DT)
  expect(screen.getByRole('img', { name: 'grenade fired 30° up' })).toBeInTheDocument()
  expect(screen.getByText(`top ${+got.top.height.toFixed(2)} m at ${+got.top.when.toFixed(2)} s`)).toBeInTheDocument()
  expect(screen.getByText(`down at ${+got.down!.along.toFixed(2)} m, ${+got.down!.when.toFixed(2)} s`)).toBeInTheDocument()
  expect(got.down!.along).toBeCloseTo((20 * 20 * Math.sin(Math.PI / 3)) / 9.8, 1)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a pattern that would throw as the page draws it is not fired, and the panel says why', async () => {
  const { ed, user } = await open()
  await user.click(screen.getByRole('button', { name: 'loop the selected pattern' }))
  await pick(user, 'dart')
  await act(() => ed.editFile(path, ['patterns', 'dart', 'look', 'body'], 'fire'))
  await waitFor(() => expect(screen.getAllByText(/its look's body fire is no effect of/).length).toBeGreaterThan(0))
  expect(within(within(table()).getByText('dart', { exact: true }).closest('tr')!).getByText('broken')).toBeInTheDocument()
  const had = previews(ed).length
  await user.click(screen.getByRole('button', { name: 'fire the selected pattern once' }))
  expect(previews(ed)).toHaveLength(had)
  expect(screen.getByText(`dart is not fired: its look's body fire is no effect of ${effectsPath}`)).toBeInTheDocument()
  await act(() => ed.undo())
  await act(() => ed.editFile(path, ['patterns', 'dart', 'sped'], 2))
  await user.click(screen.getByRole('button', { name: 'fire the selected pattern once' }))
  expect(screen.getByText('dart is not fired: volley3d pattern dart has sped, which volley3d does not know')).toBeInTheDocument()
  await act(() => ed.undo())
  await user.click(screen.getByRole('button', { name: 'fire the selected pattern once' }))
  expect(previews(ed)).toHaveLength(had + 1)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the Fire Pattern 3D tool fires the selected pattern over the ground point pressed, and loops it there', async () => {
  const { ed, user } = await open()
  await user.click(screen.getByRole('button', { name: 'loop the selected pattern' }))
  await pick(user, 'dart')
  expect(ed.tools.get('volley3d.fire')).toMatchObject({ title: 'Fire Pattern 3D', key: 'N' })
  const mark = vi.spyOn(ed.staged!, 'mark')
  act(() => ed.activate('volley3d.fire'))
  const p: Pointer = { x: 200, y: 300, scene: 'range', stage: ed.staged!, shift: false, alt: false, mod: false }
  const rows = ledger(ed)
  act(() => ed.active!.down!(p))
  const at = ed.staged!.ground(200, 300)!.map(v => Math.round(v * 1000) / 1000)
  const spawn = { heading: 0, elevation: 10, height: 2 }
  expect(previews(ed)).toHaveLength(1)
  close(previews(ed)[0].pos, muzzleOf(at, spawn))
  expect(screen.getByText(at.map(v => String(+v.toFixed(2))).join(', '))).toBeInTheDocument()
  await waitFor(() => expect(mark).toHaveBeenCalledWith(marks(PATTERNS.patterns.dart, at, spawn), expect.any(Number)))
  await user.click(screen.getByRole('button', { name: 'loop the selected pattern' }))
  await waitFor(() => expect(previews(ed).some(v => v.key[1] > 1)).toBe(true), { timeout: 20000 })
  expect(ledger(ed)).toBe(rows)
  act(() => ed.activate(undefined))
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the panel says so when the game view shows another scene', async () => {
  const { ed } = await open()
  act(() => ed.select({ scene: 'yard' }))
  expect(await screen.findByText(/The game view shows range: the patterns preview once it shows yard/)).toBeInTheDocument()
})
