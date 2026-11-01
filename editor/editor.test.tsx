// The editor itself, on no game: extensions on and off, bindings found by kind and by pattern, what
// the page reloads for, the placers, tools and commands extensions register, and the pure functions
// that work out the edits and changes a value makes.
import { expect, onTestFinished, test, vi } from 'vitest'
import { answer, editor } from './test/editor.ts'
import { z } from 'zod'
import { BUDGET, changedIssue, changes, gridEdits, listEdits, looseInput, reading, strictFields, worldGridEdits, written, type Editor, type Edits, type Placer, type Plain } from './editor.ts'

const ext = (name: string, add: (ed: Editor) => void) => ({ [`/extensions/${name}/${name}.extension.tsx`]: async () => ({ [name]: add }) })

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('an extension turned off takes everything it added with it', async () => {
  const { ed } = await editor()
  await ed.load(ext('notes', e => {
    e.panel({ id: 'notes', title: 'Notes', component: () => null })
    e.command({ id: 'notes.add', title: 'Add Note', menu: 'Notes', run: () => {} })
    e.field('note', () => null)
    e.bind('imp', { health: 'note' })
    e.inspector({ id: 'notes.section', title: 'Notes', when: () => true, component: () => null })
  }))
  expect(ed.panels.has('notes') && ed.commands.has('notes.add') && ed.fields.has('note')).toBe(true)
  expect(ed.typeOf('imp', ['health'])).toBe('note')
  ed.drop('notes')
  expect([ed.panels.has('notes'), ed.commands.has('notes.add'), ed.fields.has('note'), ed.sections.length]).toEqual([false, false, false, 0])
  expect(ed.typeOf('imp', ['health'])).toBeUndefined()
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('what an extension hands onDrop is called once as it turns off, the last first, and not for another\'s; one that throws is said and the rest are called', async () => {
  const { ed } = await editor()
  const heard: string[] = []
  ed.use('feed', e => {
    const off = e.subscribe(() => heard.push('told'))
    e.onDrop(() => { heard.push('first'); off() })
    e.onDrop(() => { throw new Error('the socket is gone') })
    e.onDrop(() => heard.push('last'))
  })
  ed.use('other', e => e.onDrop(() => heard.push('other')))
  ed.changed('x.feed')
  expect(heard).toEqual(['told'])
  ed.drop('feed')
  // The error said is a change, which the listener hears until the first teardown takes it away.
  const stopped = ['told', 'last', 'told', 'first']
  expect(heard).toEqual(stopped)
  expect(ed.log.filter(l => l.level === 'error').map(l => l.message)).toEqual(['extension feed failed to stop: the socket is gone'])
  ed.changed('x.feed')
  ed.drop('feed')
  expect(heard).toEqual(stopped)
  ed.drop('other')
  expect(heard).toEqual([...stopped, 'other'])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a docked panel\'s drawings are counted; one longer than a frame is said in the console, at most once in ten seconds a panel; perf answers the counts, the costliest panel first, and reset counts again', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  onTestFinished(() => { vi.useRealTimers() })
  vi.setSystemTime(1_000_000)
  const { ed } = await editor()
  ed.perf(true)
  const said = () => ed.log.filter(l => l.message.includes('to draw')).map(l => l.message)
  ed.drawn('inspector', 3)
  ed.drawn('inspector', BUDGET + 24)
  ed.drawn('console', 2)
  expect(said()).toEqual([`the inspector panel took ${BUDGET + 24} ms to draw, over the ${BUDGET} ms of a frame`])
  ed.drawn('inspector', BUDGET + 30)
  expect(said().length).toBe(1)
  vi.setSystemTime(1_010_001)
  ed.drawn('inspector', BUDGET + 5)
  expect(said().length).toBe(2)
  const perf = ed.perf()
  expect(perf.panels).toEqual([
    { panel: 'inspector', draws: 4, ms: 3 + BUDGET + 24 + BUDGET + 30 + BUDGET + 5, most: BUDGET + 30 },
    { panel: 'console', draws: 1, ms: 2, most: 2 },
  ])
  expect(perf.topics.log).toBe(2)
  ed.perf(true)
  expect(ed.perf()).toEqual({ panels: [], topics: {} })
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a file that names no function of its own name, or one that throws, is reported and the rest load', async () => {
  const { ed } = await editor()
  const names = await ed.load({
    ...ext('good', e => e.panel({ id: 'good', title: 'Good', component: () => null })),
    '/extensions/wrong/wrong.extension.tsx': async () => ({ other: () => {} }),
    ...ext('broken', () => { throw new Error('no') }),
  })
  expect(names).toEqual(['good', 'broken'])
  expect(ed.panels.has('good')).toBe(true)
  expect(ed.log.filter(l => l.level === 'error').map(l => l.message)).toEqual([
    'extension /extensions/wrong/wrong.extension.tsx failed to load: /extensions/wrong/wrong.extension.tsx exports no function wrong',
    'extension broken failed to start: no',
  ])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a binding by pattern and by a test of the kind; the last one made wins', async () => {
  const { ed } = await editor()
  ed.bind('ui', { 'styles.*.fill': 'color' })
  ed.bind(kind => kind.endsWith('mp'), { health: 'stars' })
  expect(ed.typeOf('ui', ['styles', 'hud.dead', 'fill'])).toBe('color')
  expect(ed.typeOf('ui', ['styles', 'hud.dead', 'stroke'])).toBeUndefined()
  expect(ed.typeOf('imp', ['health'])).toBe('stars')
  ed.bind('imp', { health: 'integer' })
  expect(ed.typeOf('imp', ['health'])).toBe('integer')
  expect(ed.typeOf(undefined, ['health'])).toBeUndefined()
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a data file\'s fields are bound by its path or a test of it, apart from every kind\'s; an extension turned off takes them', async () => {
  const { ed } = await editor()
  await ed.load(ext('arms', e => {
    e.bindFile('games/war/weapons.json', { '*.tint': 'color' })
    e.bindFile(path => path.endsWith('/effects.json'), { 'effects.*.*.tint': 'color' })
  }))
  expect(ed.typeOf(undefined, ['rifle', 'tint'], 'games/war/weapons.json')).toBe('color')
  expect(ed.typeOf(undefined, ['rifle', 'tint'], 'games/war/other.json')).toBeUndefined()
  expect(ed.typeOf(undefined, ['effects', 'muzzle', '0', 'tint'], 'games/war/effects.json')).toBe('color')
  // A value of a kind is bound by its kind alone, whatever file holds it.
  expect(ed.typeOf('rifle', ['tint'], 'games/war/weapons.json')).toBeUndefined()
  ed.drop('arms')
  expect(ed.typeOf(undefined, ['rifle', 'tint'], 'games/war/weapons.json')).toBeUndefined()
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a route\'s change of code the page fetched reloads the page once it is in the history and the action is done, and again as it is undone and redone; a change of code it never fetched, or that is not code, reloads none', async () => {
  const { ed, reloads, ran } = await editor()
  // A route that writes each file it is handed: code, or a picture's bytes.
  answer('fake', r => r.post('write', async ({ body, files }) => {
    for (const f of (body as { files: string[] }).files) await files.write(f, f.endsWith('.png') ? new Uint8Array([0x89, 0x50, 0x4e, 0x47]) : `// ${f}\n`)
  }))
  const code = ['games/g/a.sim.ts', 'games/g/b.client.ts']
  for (const f of code) ran.add(f)
  const picture = ['games/g/a.png']
  const history: [number, number][] = []
  const reload = ed.files.reload
  ed.files.reload = paths => { history.push([ed.undos.length, ed.redos.length]); reload(paths) }

  await ed.together(async e => {
    await e.route('fake', 'write', { files: code })
    await e.route('fake', 'write', { files: picture })
    await new Promise(r => setTimeout(r, 20))
    // Not yet: the action is not done.
    expect(reloads).toEqual([])
  })
  await vi.waitFor(() => expect(reloads).toEqual([code]))
  // Each reload is of a page of its own, so the undo and the redo are each made on the page the last
  // one left.
  await ed.undo()
  await vi.waitFor(() => expect(reloads).toHaveLength(2))
  await ed.redo()
  await vi.waitFor(() => expect(reloads).toEqual([code, code, code]))
  expect(history).toEqual([[1, 0], [0, 1], [1, 0]])

  await ed.together(e => e.route('fake', 'write', { files: picture }))
  await ed.undo()
  // Code made that no module of the page's had fetched, as a scene's new sim is: it is fetched as it
  // is when first imported.
  await ed.together(e => e.route('fake', 'write', { files: ['games/g/new.sim.ts'] }))
  await ed.undo()
  await new Promise(r => setTimeout(r, 20))
  expect(reloads).toHaveLength(3)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a reload waits for an action begun in the turn it lets go for an answer, as a call already sent is run then', async () => {
  const { ed, reloads } = await editor()
  let finish!: () => void
  const asked = ed.reloadPage(['games/g/a.sim.ts'])
  // Begun before the turn the reload waits: a message the page had already been sent.
  queueMicrotask(() => { void ed.together(() => new Promise<void>(done => { finish = done })) })
  await new Promise(r => setTimeout(r, 20))
  expect(reloads).toEqual([])
  finish()
  await asked
  expect(reloads).toEqual([['games/g/a.sim.ts']])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a reload waits for every action in hand, and the page reloads once however many ask while it waits', async () => {
  const { ed, reloads } = await editor()
  let finish!: () => void
  const action = ed.together(() => new Promise<void>(done => { finish = done }))
  const asked = [ed.reloadPage(['games/g/a.sim.ts']), ed.reloadPage(['games/g/b.sim.ts'])]
  await new Promise(r => setTimeout(r, 20))
  expect(reloads).toEqual([])
  finish()
  await action
  await Promise.all(asked)
  expect(reloads).toEqual([['games/g/a.sim.ts']])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('how a kind moves is the placer made for it last, by name or by a test of the kind, and goes with its extension', async () => {
  const { ed } = await editor()
  const ground: Placer = { at: d => [d.x, 0, d.z], axes: ['x', 'y', 'z'], to: (_d, [x, , z]) => ({ x, z }) }
  const lifted: Placer = { at: d => (Array.isArray(d.pos) ? [...d.pos] : undefined), axes: ['x', 'y', 'z'], to: (d, [x, , z]) => ({ pos: [x, d.pos[1], z] }) }
  ed.use('floor', e => e.place(kind => kind.startsWith('co'), ground))
  expect(ed.placerOf('coin')).toBe(ground)
  expect(ed.placerOf('imp')).toBeUndefined()
  ed.use('air', e => e.place('coin', lifted))
  expect(ed.placerOf('coin')).toBe(lifted)
  expect(ed.placerOf('comet')).toBe(ground)
  ed.drop('air')
  expect(ed.placerOf('coin')).toBe(ground)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a list edited as a whole is written as the list writes it: one taken out, one added at the end, the same in another order each moved whole, and else value by value', () => {
  const [a, b, c] = [{ id: 1, x: 1 }, { x: 2, id: 2 }, { id: 3 }]
  expect(listEdits(['l'], [a, b, c], [a, c])).toEqual([{ at: ['l', 1], value: undefined }])
  expect(listEdits(['l'], [a, b], [a, b, c])).toEqual([{ at: ['l', -1], value: c, insert: true }])
  // moved, each whole, its keys in its own order
  expect(listEdits(['l'], [a, b, c], [b, a, c])).toEqual([{ at: ['l', 0], value: b }, { at: ['l', 1], value: a }])
  expect(listEdits(['l'], [a, b], [a, { ...b, x: 5 }])).toEqual([{ at: ['l', 1, 'x'], value: 5 }])
  expect(listEdits(['l'], [a, b], [a, b])).toEqual([])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('edits are written as one change: a lone value by itself, more, or a key put at its place, together', async () => {
  const calls: unknown[] = []
  const e = { editFile: async (...a: unknown[]) => void calls.push(a), editFiles: async (x: unknown[]) => void calls.push(x.length) } as unknown as Pick<Edits, 'editFile' | 'editFiles'>
  await written(e, [{ file: 'f', at: ['a'], value: 1 }])
  await written(e, [{ file: 'f', at: ['a'], value: 1, index: 0 }])
  await written(e, [{ file: 'f', at: ['a'], value: 1 }, { file: 'f', at: ['b'], value: 2 }])
  await written(e, [])
  expect(calls).toEqual([['f', ['a'], 1, false], 1, 2, 0])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a loose input lists as an object of plain values and is held to the strict fields its value picks, a field it has not got refused naming them', () => {
  const shape = looseInput(v => ('ref' in v ? strictFields('p', 'a ref', { ref: z.string() }, ['ref']) : strictFields('p', 'a thing', { n: z.number().int(), on: z.boolean() })))
  expect(z.toJSONSchema(shape, { io: 'input' })).toMatchObject({ type: 'object', propertyNames: { type: 'string' } })
  expect(shape.safeParse({ n: 2, on: true }).success).toBe(true)
  expect(shape.safeParse({}).success).toBe(true)
  expect(shape.safeParse({ ref: 'x' }).success).toBe(true)
  expect(shape.safeParse({ ref: 1 }).success).toBe(false)
  expect(shape.safeParse({ n: 1.5 }).error!.issues).toMatchObject([{ path: ['n'] }])
  expect(shape.safeParse({ n: 1, sparkle: 1 }).error!.issues.map(i => i.message)).toEqual(['a thing has no sparkle, which p does not read: its fields are n, on'])
  expect(shape.safeParse({ ref: 'x', n: 1 }).error!.issues.map(i => i.message)).toEqual(['a ref has no n, which p does not read: its fields are ref'])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a grid\'s fields are set by their paths, each a field the grid draws and of the shape of the value there, else refused naming the fields', async () => {
  const { ed } = await editor()
  ed.bind('car', { route: 'nav.route' })
  const car = { engine: { speed: 50, on: true }, axles: [{ at: 1.2 }, { at: -1.2 }], paint: '#102030', name: 'van', center: [0, 0.2, 0], route: [[0, 0], [1, 0]], note: null, bodies: {} }
  const set = (values: Record<string, unknown>) => gridEdits(ed, { kind: 'car' }, car, values, 'the car')
  expect(set({ 'engine.speed': 60, 'axles.1.at': -1, paint: '#aabbcc', name: 'bus', center: [0, 0.3, 0], 'engine.on': false })).toEqual([
    { at: ['engine', 'speed'], value: 60 }, { at: ['axles', 1, 'at'], value: -1 }, { at: ['paint'], value: '#aabbcc' },
    { at: ['name'], value: 'bus' }, { at: ['center'], value: [0, 0.3, 0] }, { at: ['engine', 'on'], value: false },
  ])
  // A value bound to a type is one field, the whole of it, of its shape all through; a null is one
  // field of any JSON, as the grid writes it as text; an empty object folds open onto no field.
  expect(set({ route: [[2, 2]] })).toEqual([{ at: ['route'], value: [[2, 2]] }])
  expect(set({ note: { any: 1 } })).toEqual([{ at: ['note'], value: { any: 1 } }])
  const fields = 'engine.speed, engine.on, axles.0.at, axles.1.at, paint, name, center, route, note'
  expect(() => set({ bodies: {} })).toThrow(`the car has no field bodies: its fields are ${fields}`)
  expect(() => set({})).toThrow(`hand a value of the car to set, by its path: its fields are ${fields}`)
  // A plugin's world: each edit of its file, at its place under `world.<kind>`.
  expect(worldGridEdits(ed, 'car', 'games/x/x.scene.json', car, { 'axles.0.at': 2 })).toEqual([{ file: 'games/x/x.scene.json', at: ['world', 'car', 'axles', 0, 'at'], value: 2 }])
  expect(() => worldGridEdits(ed, 'car', 'games/x/x.scene.json', car, { nope: 1 })).toThrow(`world.car has no field nope: its fields are ${fields}`)
  expect(() => set({ 'engine.gear': 1 })).toThrow(`the car has no field engine.gear: its fields are ${fields}`)
  expect(() => set({ 'axles.2.at': 1 })).toThrow(`the car has no field axles.2.at: its fields are ${fields}`)
  expect(() => set({ 'route.0': [1, 1] })).toThrow(`the car has no field route.0: its fields are ${fields}`)
  expect(() => set({ engine: {} })).toThrow('the car has no field engine: its fields under it are engine.speed, engine.on')
  expect(() => set({ 'engine.speed': '60' })).toThrow(/^the car engine\.speed is 50, and "60" is not of its shape: .*expected number/s)
  expect(() => set({ paint: 'red' })).toThrow(/^the car paint is "#102030", and "red" is not of its shape: .*a colour, #rrggbb/s)
  expect(() => set({ center: [0, 1] })).toThrow(/^the car center is \[0,0\.2,0\], and \[0,1\] is not of its shape/)
  expect(() => set({ route: [[1, 'a']] })).toThrow(/^the car route is .*, and .* is not of its shape/)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a truth read as a rule reads it finds its rows and reads its world, and throws at anything that would change it', () => {
  const rows = [{ id: 1, kind: 'sky', data: { t: 3 } }, { id: 2, kind: 'sea', data: {} }]
  const w = reading({ rows, world: { day: 10 } } as never, 'the test panel')
  expect(w.world).toEqual({ day: 10 })
  expect(w.all('sky')).toEqual([rows[0]])
  expect(w.get(2)).toBe(rows[1])
  expect(w.find('sky', r => r.data.t === 3)).toBe(rows[0])
  expect(() => w.get(3)).toThrow('the test panel only reads the rows')
  expect(() => w.spawn('sky', {})).toThrow('the test panel only reads the rows')
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the changes between two values are the values that differ, each at its own path', () => {
  expect(changes({ a: 1, b: [1, 2], c: { d: 1 } }, { a: 1, b: [1, 3], c: { e: 2 } })).toEqual([
    { at: ['b', 1], value: 3 },
    { at: ['c', 'd'], value: undefined, index: 0 },
    { at: ['c', 'e'], value: 2, index: 0 },
  ])
  expect(changes([1, 2], [1, 2, 3])).toEqual([{ at: [], value: [1, 2, 3] }])
  expect(changes({ a: [[1]] }, { a: [[1]] })).toEqual([])
  // A key put in goes where the new value has it; a list of numbers with many changed is one value.
  expect(changes({ id: 1, x: 2 }, { id: 1, name: '', x: 2 })).toEqual([{ at: ['name'], value: '', index: 1 }])
  const cells = Array.from({ length: 100 }, () => 0)
  expect(changes(cells, cells.map((v, i) => (i < 40 ? 7 : v)))).toEqual([{ at: [], value: cells.map((v, i) => (i < 40 ? 7 : v)) }])
  // A list of objects grown or cut is lined up: an item taken out is removed, one put in inserted,
  // one in the place of another compared inside, each at its place as the writes before left it.
  const [a, b, c, d] = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
  expect(changes([a, b, c], [a, c])).toEqual([{ at: [1], value: undefined }])
  expect(changes([a, c], [a, b, c, d])).toEqual([{ at: [1], value: b, insert: true }, { at: [3], value: d, insert: true }])
  expect(changes([a, b, c], [{ id: 9 }, c, d, a])).toEqual([
    { at: [0, 'id'], value: 9 },
    { at: [1], value: undefined },
    { at: [2], value: d, insert: true },
    { at: [3], value: a, insert: true },
  ])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a command whose input lists as no tool, or whose id another extension has, is refused as it is registered, and the one there keeps it', async () => {
  const { ed } = await editor()
  const run = () => {}
  // Its top is no object, so it would void every tool of the list: a union, a nullable, a bare value.
  for (const input of [z.union([z.object({ a: z.string() }), z.object({ b: z.string() })]), z.object({ a: z.string() }).nullable(), z.string()])
    expect(() => ed.command({ id: 'bad.input', title: 'Bad', input, run })).toThrow('command bad.input: its input must be a z.object, which lists as a tool')
  // A transform has no JSON schema at all.
  expect(() => ed.command({ id: 'bad.input', title: 'Bad', input: z.object({ a: z.string() }).transform(o => o.a), run }))
    .toThrow('command bad.input: its input has no JSON schema, so it lists as no tool: Transforms cannot be represented in JSON Schema')
  // A codec is an object once parsed, but a call hands it a string, which is what it lists as.
  const codec = z.codec(z.string(), z.object({ a: z.string() }), { decode: s => JSON.parse(s), encode: o => JSON.stringify(o) })
  expect(() => ed.command({ id: 'bad.input', title: 'Bad', input: codec, run })).toThrow('command bad.input: its input must be a z.object, which lists as a tool')
  expect(ed.commands.has('bad.input')).toBe(false)

  // A game's extension naming a plugin's command is refused as it starts, so closing the game takes
  // nothing of the plugin's; the plugin's own extension registering it again is not.
  await ed.load(ext('plugin', e => {
    e.command({ id: 'shared.go', title: 'Go', run: () => 'plugin' })
    e.tool({ id: 'shared', title: 'Shared' })
  }))
  await ed.load(ext('game', e => e.command({ id: 'shared.go', title: 'Go', run: () => 'game' })))
  expect(ed.log.at(-1)).toMatchObject({ level: 'error', message: 'extension game failed to start: command shared.go is plugin\'s, and game registers it again' })
  await ed.load(ext('other', e => e.tool({ id: 'shared', title: 'Other' })))
  expect(ed.log.at(-1)).toMatchObject({ level: 'error', message: 'extension other failed to start: command tool.shared is plugin\'s, and other registers it again' })
  ed.drop('game')
  ed.drop('other')
  expect(await ed.call('shared.go')).toBe('plugin')
  expect(ed.tools.get('shared')).toMatchObject({ title: 'Shared', owner: 'plugin' })
  ed.use('plugin', e => e.command({ id: 'shared.go', title: 'Go again', run: () => 'again' }))
  expect(await ed.call('shared.go')).toBe('again')
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a tool is a command in the Tools menu with its key; activating it puts the view in it, and it goes with its extension', async () => {
  const { ed } = await editor()
  ed.use('brush', e => e.tool({ id: 'brush', title: 'Brush', key: 'T' }))
  const c = ed.commands.get('tool.brush') as Plain
  expect([c.menu, c.key, c.title]).toEqual(['Tools', 'T', 'Brush'])
  expect(ed.tooling).toBeUndefined()
  await c.run()
  expect(ed.tooling).toBe('brush')
  expect(ed.active?.title).toBe('Brush')
  expect(() => ed.activate('nothing')).toThrow('no tool nothing')
  ed.drop('brush')
  expect([ed.tooling, ed.tools.has('brush'), ed.commands.has('tool.brush')]).toEqual([undefined, false, false])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('leaving a tool hands it hover(undefined) then off, for another tool, for Play and when its extension goes; activating the tool the view is in does nothing', async () => {
  const { ed } = await editor()
  const heard: string[] = []
  const tool = (id: string) => ({ id, title: id, hover: (p: unknown) => heard.push(`${id} hover ${p === undefined ? 'gone' : 'at'}`), off: () => heard.push(`${id} off`) })
  ed.use('a', e => e.tool(tool('a')))
  ed.use('b', e => e.tool(tool('b')))
  ed.activate('a')
  ed.activate('a')
  expect(heard).toEqual([])
  ed.activate('b')
  ed.activate(undefined)
  ed.activate('a')
  ed.drop('a')
  expect(heard).toEqual(['a hover gone', 'a off', 'b hover gone', 'b off', 'a hover gone', 'a off'])
  expect(ed.tooling).toBeUndefined()
  // The view's press is ended before: `ends` runs first.
  heard.length = 0
  const stop = ed.ends(() => heard.push('press ended'))
  ed.activate('b')
  ed.activate(undefined)
  stop()
  expect(heard).toEqual(['press ended', 'b hover gone', 'b off'])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('an object written whole as the values that change is held to its shape only where it changes: a value it had already, or a key, is not the change\'s', () => {
  const shape = z.strictObject({ a: z.number(), b: z.strictObject({ c: z.number(), d: z.number() }), e: z.array(z.number()) })
  const before = { a: 1, b: { c: 'x', d: 2 }, e: [1], stray: true }
  expect(changedIssue(shape, before, { ...before, a: 2 })).toBeUndefined()
  expect(changedIssue(shape, before, { ...before, a: 'two' })).toEqual({ at: 'a', message: 'Invalid input: expected number, received string' })
  expect(changedIssue(shape, before, { ...before, b: { c: 'x', d: 'y' } })).toMatchObject({ at: 'b.d' })
  expect(changedIssue(shape, before, { ...before, e: [1, 'z'] })).toMatchObject({ at: 'e.1' })
  expect(changedIssue(shape, before, { ...before, more: 1 })).toEqual({ at: '', message: 'Unrecognized key: "more"' })
  // With nothing before it, every issue is the change's.
  expect(changedIssue(shape, undefined, { a: 1, b: { c: 1, d: 2 }, e: [], stray: true })).toEqual({ at: '', message: 'Unrecognized key: "stray"' })
})
