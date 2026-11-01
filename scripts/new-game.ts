// Makes a new game: `node --experimental-strip-types scripts/new-game.ts <name>` (`yarn new-game
// <name>`) writes `games/<name>/` under the working directory, `games/` too when there is none: a
// game of one scene, `main` (`play` for a game named `main`, whose manager is `main.scene.json`), 960
// by 540, serving on the port after the highest the games there use, or 9001. It is a folder of its
// own in `games/` holding what the scenemanager's header says a game is (`addons/scenemanager`), a
// game of one scene with one seat that starts at a `start` actor:
//   <game>.scene.json   the manager: its `scenemanager` prefab naming the one scene, which every
//                       connection enters, the port no other game uses, and its `engine`'s step;
//   <game>.sim.ts       its sim, `{ scenemanager }`;
//   <scene>.scene.json  the scene, on render2d with no world of its own, so its points are the
//                       canvas's pixels, its canvas the size asked for, one seat: the scenemanager's
//                       row, the loader's, and slot 0's `start` at the canvas's middle; its
//                       `world.defs` names the definitions;
//   <scene>.sim.ts      its sim, `{ scenemanager, loader, player, start, body }`, and the scene file
//                       exported as `scene`;
//   start.sim.ts        where a seat starts, `{}`: no rule and no drawing;
//   player.sim.ts       the seat's row: `before` spawns a `body` on its slot's start and keeps its id,
//                       and `move` hands the way its keys point to the body;
//   player.client.ts    the arrow keys, a stick sent as `move`;
//   body.sim.ts         a square that runs its definition's `speed` along the way it is sent;
//   body.client.ts      the square drawn, its definition's `size` and `colour`, on render2d's stage;
//   assets/<game>.json  the definitions: the body's `speed`, `size` and `colour`;
//   index.html          the game in one tab, over a loopback; `client.html` one seat over a socket;
//   <game>.server.ts    the game on node behind that socket;
//   <game>.sim.test.ts  the manager booted, its scene loaded, a seat's body spawned on its start and
//                       moved by `move`.
// Every page is the same as every game's but for the files it imports.
//
// `make` writes the files of { name, scene, width, height } through a `Disk` and answers { files,
// port }. It refuses, writing nothing, a name that is no lower-case letter then letters, digits and
// underscores, one of its kinds' (`start`, `player`, `body`), a plugin's or an addon's, a game's that
// is there, a scene named as the game, and a size that is no whole number of pixels from 1 to 8192.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const NAME = /^[a-z][a-z0-9_]*$/
const SCENE = /^[a-z0-9][a-z0-9-]*$/
// The kinds a new game has: a game named as one would write its manager's sim over that kind's rule.
const KINDS = ['start', 'player', 'body']

// What `make` reads and writes with, every path from the root: `list`, every file under a folder, and
// none for a folder that is not there.
export type Disk = {
  list(dir: string): Promise<string[]>
  read(rel: string): Promise<string>
  write(rel: string, data: string): Promise<unknown>
}

// The disk under `root`, skipping `node_modules`, `.git` and `.DS_Store`.
export function disk(root: string): Disk {
  const at = (rel: string) => path.join(root, rel)
  return {
    async list(dir) {
      const out: string[] = []
      const walk = async (p: string) => {
        const entries = await readdir(p, { withFileTypes: true }).catch((e: NodeJS.ErrnoException) => {
          if (p === at(dir) && e.code === 'ENOENT') return []
          throw e
        })
        for (const e of entries) {
          if (e.name === 'node_modules' || e.name === '.git' || e.name === '.DS_Store') continue
          const f = path.join(p, e.name)
          if (e.isDirectory()) await walk(f)
          else out.push(path.relative(root, f).split(path.sep).join('/'))
        }
      }
      await walk(at(dir))
      return out.sort()
    },
    read: rel => readFile(at(rel), 'utf8'),
    async write(rel, data) {
      await mkdir(path.dirname(at(rel)), { recursive: true })
      await writeFile(at(rel), data)
    },
  }
}

// The ports the games there are serve on, read off each manager's `scenemanager` prefab.
async function ports(files: Disk): Promise<number[]> {
  const all = await files.list('games').catch(() => [] as string[])
  const managers = all.filter(f => { const [, g, leaf] = f.split('/'); return leaf === `${g}.scene.json` })
  const out: number[] = []
  for (const m of managers) {
    try {
      const port = JSON.parse(await files.read(m)).prefabs?.scenemanager?.port
      if (typeof port === 'number') out.push(port)
    } catch {
      // A manager that cannot be read serves on no port it knows of.
    }
  }
  return out
}

const page = (title: string, comment: string[], imports: string[], body: string[]) => [
  '<!doctype html>',
  '<html>',
  '  <head>',
  '    <meta charset="utf-8" />',
  `    <title>${title}</title>`,
  '    <style>',
  '      body { margin: 0; background: #0b0b0e; display: grid; place-items: center; height: 100vh }',
  '      canvas { grid-area: 1 / 1 }',
  '    </style>',
  '  </head>',
  '  <body>',
  '    <script type="module">',
  ...comment.map(l => `      // ${l}`),
  ...imports.map(l => `      ${l}`),
  '',
  ...body.map(l => (l ? `      ${l}` : '')),
  '    </script>',
  '  </body>',
  '</html>',
  '',
].join('\n')

const MOUNT = [
  '  for (const surface of [me.plugins.render3d ?? me.plugins.render2d, me.plugins.ui]) {',
  '    if (!surface) continue',
  "    const canvas = document.createElement('canvas')",
  '    canvas.width = scene.prefabs.engine.width',
  '    canvas.height = scene.prefabs.engine.height',
  '    document.body.appendChild(canvas)',
  '    surface.mount(canvas)',
  '  }',
]

// The files of game `name`, its scene `scene` of `width` by `height`, serving on `port`.
export function gameFiles(name: string, scene: string, width: number, height: number, port: number): Record<string, string> {
  const dt = 1 / 60
  const at = (f: string) => `games/${name}/${f}`
  const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n'
  return {
    [at(`${name}.scene.json`)]: json({
      world: {},
      prefabs: {
        engine: { dt },
        scenemanager: { scenes: { [scene]: { file: `${scene}.scene.json`, suspend: true } }, dt, entry: scene, port },
      },
      actors: [{ is: 'scenemanager' }],
      plugins: ['scenemanager'],
      seats: 1,
    }),
    [at(`${name}.sim.ts`)]: [
      `// The manager. One row, naming ${scene} and that every connection enters it.`,
      "import type { Sim } from '#engine/engine.ts'",
      "import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'",
      '',
      'export const sim: Sim = { scenemanager }',
      '',
    ].join('\n'),
    [at(`${scene}.scene.json`)]: json({
      world: {
        defs: name,
        loader: { assets: { [name]: { type: 'json', url: `/games/${name}/assets/${name}.json`, preload: true } } },
      },
      plugins: ['loader', 'scenemanager', 'player', 'render2d', 'stats'],
      seats: 1,
      prefabs: {
        engine: { dt, width, height },
        scenemanager: { out: {} },
        loader: {},
        player: { seat: 0, body: 0 },
        start: { slot: 0, pos: [0, 0] },
        body: { pos: [0, 0], move: [0, 0] },
      },
      actors: [
        { is: 'scenemanager' },
        { is: 'loader' },
        { is: 'start', slot: 0, pos: [width / 2, height / 2] },
      ],
    }),
    [at(`${scene}.sim.ts`)]: [
      `// The kinds of ${scene} and the ${scene}.scene.json file next to this one. Every number of them that`,
      `// never changes is its definition in \`assets/${name}.json\`, which the scene's \`world.defs\` names.`,
      "// Where each seat's body starts is a `start` actor of the scene file, one per slot.",
      "import type { Scene, Sim } from '#engine/engine.ts'",
      "import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'",
      "import { loader } from '#plugins/loader/loader.sim.ts'",
      "import { player } from './player.sim.ts'",
      "import { start } from './start.sim.ts'",
      "import { body } from './body.sim.ts'",
      `import file from './${scene}.scene.json' with { type: 'json' }`,
      '',
      'export const sim: Sim = { scenemanager, loader, player, start, body }',
      '',
      'export const scene = file as Scene',
      '',
    ].join('\n'),
    [at('start.sim.ts')]: [
      "// Where a seat's body starts: a `start` actor of the scene, one per slot, a row at its `pos` for the",
      "// slot in `slot`, and nothing else. The `player` row puts its seat's body on the start of its slot.",
      '// It has no rule and is not drawn.',
      "import type { Kind } from '#engine/engine.ts'",
      '',
      'export const start: Kind = {}',
      '',
    ].join('\n'),
    [at('player.sim.ts')]: [
      "// The row one seat possesses. `addons/player` spawns it, sends it to that seat alone, and writes the",
      "// slot it gave the connection into `seat`. `before` spawns this seat's `body` on the scene's `start`",
      "// actor for that slot, at its `pos`, and keeps the body's id in `body`. `move`, the way the seat's",
      '// keys point, names the same act on the body, which every seat is sent. The player plugin runs that',
      '// act in the browser too: it accepts a row an act reached through `w.call`.',
      "import type { Kind } from '#engine/engine.ts'",
      '',
      'export const player: Kind = {',
      '  before(me, _dt, w) {',
      '    if (me.data.body) return',
      "    const start = w.find('start', s => s.data.slot === me.data.seat)",
      "    me.data.body = w.spawn('body', { pos: [...start.data.pos] }).id",
      '  },',
      '  acts: {',
      '    move(me, w, seat, x: number, y: number) {',
      '      if (!me.data.body) return',
      "      w.call(w.get(me.data.body), 'move', seat, x, y)",
      '    },',
      '  },',
      '}',
      '',
    ].join('\n'),
    [at('player.client.ts')]: [
      "// One seat's keys: the arrows are a stick, the way they point sent as `move`, y growing down the",
      '// canvas.',
      "import type { Row } from '#engine/engine.ts'",
      "import type { Plugins } from '#engine/browser.ts'",
      "import type { Binds } from '#plugins/player/player.plugin.ts'",
      '',
      'export function setup(_row: Row, plugins: Plugins) {',
      '  plugins.player.bind({',
      "    stick: [{ keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'], send: (x, y) => ['move', x, y] }],",
      '  } satisfies Binds)',
      '}',
      '',
      'export function tick() {}',
      '',
      'export function remove(plugins: Plugins) {',
      '  plugins.player.unbind()',
      '}',
      '',
    ].join('\n'),
    [at('body.sim.ts')]: [
      "// One seat's body: where it stands (`pos`, in the canvas's pixels) and `move`, the way its seat's",
      '// keys point, at most a unit long. Each step it runs `speed` pixels a second along `move`; `speed` is',
      `// its definition in \`assets/${name}.json\`. Every seat is sent every body; the \`player\` row, which`,
      "// only its own seat is sent, holds this row's id. `before` ends this row when no `player` row names",
      "// it, which is what happens when its connection leaves.",
      "import type { Kind } from '#engine/engine.ts'",
      "import { def } from '#plugins/loader/loader.sim.ts'",
      '',
      'export const body: Kind = {',
      '  before(me, _dt, w) {',
      "    if (!w.all('player').some(p => p.data.body === me.id)) w.end(me)",
      '  },',
      '  tick(me, dt, w) {',
      '    const [x, y] = me.data.move',
      '    if (!x && !y) return',
      '    const step = def(w, me.kind).speed * dt',
      '    me.data.pos = [me.data.pos[0] + x * step, me.data.pos[1] + y * step]',
      '  },',
      '  acts: {',
      '    // A way across the canvas, from the page: two numbers, kept to a unit\'s length at most.',
      '    move(me, _w, _seat, x: unknown, y: unknown) {',
      "      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return",
      '      const len = Math.hypot(x, y)',
      '      me.data.move = len > 1 ? [x / len, y / len] : [x, y]',
      '    },',
      '  },',
      '}',
      '',
    ].join('\n'),
    [at('body.client.ts')]: [
      `// One seat's body: a square of its definition's \`size\` and \`colour\` in \`assets/${name}.json\`,`,
      "// centred on the row's `pos`, on render2d's stage in the canvas's pixels.",
      "import type { Row } from '#engine/engine.ts'",
      "import type { Plugins } from '#engine/browser.ts'",
      "import { def } from '#plugins/loader/loader.sim.ts'",
      '',
      'let square: any',
      '',
      'export function setup(row: Row, plugins: Plugins) {',
      '  const { size, colour } = def(plugins.wire, row.kind)',
      '  square = new plugins.render2d.PIXI.Graphics().rect(-size / 2, -size / 2, size, size).fill(colour)',
      '  plugins.render2d.stage.addChild(square)',
      '  tick(row)',
      '}',
      '',
      'export function tick(row: Row) {',
      '  square.position.set(row.data.pos[0], row.data.pos[1])',
      '}',
      '',
      'export function remove(plugins: Plugins) {',
      '  plugins.render2d.stage.removeChild(square)',
      '  square.destroy()',
      '}',
      '',
    ].join('\n'),
    [at(`assets/${name}.json`)]: json({
      body: { speed: 240, size: 32, colour: '#e8c547' },
    }),
    [at('index.html')]: page(name, [
      'One manager truth and the scenes its row names, all in this tab, and one seat on them.',
      'The page holds one client, for the scene the seat is on: `view` makes it when the seat',
      'arrives and closes it when the seat leaves, and `mount` gives each one its canvases: the',
      "game's, and the UI's over it in the same grid cell, for a scene that names each.",
    ], [
      "import { boot } from '#engine/engine.ts'",
      "import { accept, load, manager, link, view } from '#addons/scenemanager/scenemanager.addon.ts'",
      "import { loopback } from '#addons/loopback/loopback.addon.ts'",
      `import { sim } from './${name}.sim.ts'`,
      `import file from './${name}.scene.json'`,
    ], [
      'const dt = file.prefabs.engine.dt',
      'const truth = boot(file, sim)',
      'await load(truth, import.meta.url)',
      'const page = view(link(loopback(accept(manager(truth)))), file, import.meta.url, (me, scene) => {',
      ...MOUNT,
      '})',
      '',
      'let last = performance.now(), owed = 0',
      'const loop = async now => {',
      '  owed += Math.min((now - last) / 1000, 0.25)',
      '  last = now',
      '  page.input()',
      '  while (owed >= dt) { truth.step(dt); owed -= dt }',
      '  await page.frame(owed / dt)',
      '  requestAnimationFrame(loop)',
      '}',
      'requestAnimationFrame(loop)',
    ]),
    [at('client.html')]: page(`${name} client`, [
      `One seat over a socket. The server is \`node --experimental-strip-types games/${name}/${name}.server.ts\`.`,
      'The page holds one client, for the scene the seat is on: `view` makes it when the seat',
      'arrives and closes it when the seat leaves, and `mount` gives each one its canvases: the',
      "game's, and the UI's over it in the same grid cell, for a scene that names each. `tap`",
      "records every frame when the page's address asks for it, `?tap=<name>` (addons/simulator).",
    ], [
      "import { link, view } from '#addons/scenemanager/scenemanager.addon.ts'",
      "import { tap } from '#addons/simulator/simulator.addon.ts'",
      "import { dial } from '#addons/socket/socket.addon.ts'",
      `import file from './${name}.scene.json'`,
    ], [
      'const page = tap(dial(`ws://${location.hostname}:${file.prefabs.scenemanager.port}`), wire => view(link(wire), file, import.meta.url, (me, scene) => {',
      ...MOUNT,
      '}))',
      '',
      'const loop = async () => {',
      '  await page.frame()',
      '  requestAnimationFrame(loop)',
      '}',
      'requestAnimationFrame(loop)',
    ]),
    [at(`${name}.server.ts`)]: [
      `// The manager and ${scene} in one process, behind one socket. Each socket is one connection: one`,
      `// seat in ${scene}, the scene the manager row names as \`entry\`.`,
      "import { boot, type Scene } from '#engine/engine.ts'",
      "import { accept, load, manager, run } from '#addons/scenemanager/scenemanager.addon.ts'",
      "import { serve } from '#addons/socket/socket.addon.ts'",
      `import { sim } from './${name}.sim.ts'`,
      `import file from './${name}.scene.json' with { type: 'json' }`,
      '',
      'const scene = file as Scene',
      'const truth = boot(scene, sim)',
      'await load(truth, import.meta.url)',
      'await serve(manager(truth).data.port, accept(manager(truth)))',
      'run(truth)',
      '',
    ].join('\n'),
    [at(`${name}.sim.test.ts`)]: [
      `// ${name}: the manager booted as its page boots it and ${scene} loaded; a seat joins, its body is`,
      "// spawned on its slot's start, and the body runs its definition's `speed` along the way `move` sends.",
      "import { expect, test } from 'vitest'",
      "import { boot, type Scene } from '#engine/engine.ts'",
      "import { connection, load, manager, type Down } from '#addons/scenemanager/scenemanager.addon.ts'",
      `import { sim } from './${name}.sim.ts'`,
      `import file from './${name}.scene.json' with { type: 'json' }`,
      `import defs from './assets/${name}.json' with { type: 'json' }`,
      '',
      'const DT = file.prefabs.engine.dt',
      '',
      `test('a seat joins ${scene}, its body stands on its start, and move runs it', async () => {`,
      '  const truth = boot(file as Scene, sim)',
      `  const room = (await load(truth, import.meta.url)).get('${scene}')!`,
      '  const heard: Down[] = []',
      '  const seat = connection(manager(truth), d => heard.push(d))',
      '  truth.step(DT)',
      "  const start = room.rows.find(r => r.kind === 'start' && r.data.slot === 0)!",
      "  const body = () => room.rows.find(r => r.kind === 'body')!",
      '  expect(body().data.pos).toEqual(start.data.pos)',
      '',
      '  const last = heard[heard.length - 1]',
      "  const me = last.packet.rows.find(r => r.kind === 'player')!",
      "  seat.take({ scene: last.scene, seat: last.seat, msg: { seq: 1, n: last.packet.n, id: me.id, action: 'move', args: [1, 0] } })",
      '  for (let i = 0; i < 30; i++) truth.step(DT)',
      '  expect(body().data.pos[0]).toBeCloseTo(start.data.pos[0] + defs.body.speed * DT * 30)',
      '  expect(body().data.pos[1]).toBe(start.data.pos[1])',
      '})',
      '',
    ].join('\n'),
  }
}

export async function make(body: unknown, files: Disk) {
  const b = body as { name?: unknown; scene?: unknown; width?: unknown; height?: unknown } | null
  const name = b?.name, scene = b?.scene, width = b?.width, height = b?.height
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error(`a game's name is a lower-case letter and then lower-case letters, digits and underscores, and not ${JSON.stringify(name)}`)
  if (typeof scene !== 'string' || !SCENE.test(scene)) throw new Error(`a scene's name is lower-case letters, digits and dashes, and not ${JSON.stringify(scene)}`)
  if (scene === name) throw new Error(`the scene cannot be named ${name}: ${name}.scene.json is the game's manager`)
  for (const [k, v] of [['width', width], ['height', height]] as const)
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 8192) throw new Error(`a game's ${k} is a whole number of pixels from 1 to 8192, and not ${JSON.stringify(v)}`)
  if (KINDS.includes(name)) throw new Error(`a game cannot be named ${name}: ${name}.sim.ts is the rule of its ${name} kind`)
  for (const home of ['plugins', 'addons'])
    if ((await files.list(`${home}/${name}`).catch(() => [] as string[])).length) throw new Error(`a game cannot be named ${name}: ${home}/${name} is ${home === 'plugins' ? 'a plugin' : 'an addon'} of that name`)
  if ((await files.list(`games/${name}`).catch(() => [] as string[])).length) throw new Error(`there is a game ${name} already: games/${name} has files`)
  const taken = await ports(files)
  const port = taken.length ? Math.max(...taken) + 1 : 9001
  const made = gameFiles(name, scene, width as number, height as number, port)
  for (const [p, text] of Object.entries(made)) await files.write(p, text)
  return { files: Object.keys(made), port }
}

export const newGame = (name: string, root: string) =>
  make({ name, scene: name === 'main' ? 'play' : 'main', width: 960, height: 540 }, disk(root))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { files, port } = await newGame(process.argv[2] ?? '', process.cwd())
    console.log(`${files.join('\n')}\nserving on ${port}`)
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
}
