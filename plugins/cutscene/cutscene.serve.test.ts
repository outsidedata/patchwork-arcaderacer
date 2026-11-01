// The dev server's half of the cutscene's panel on a root the test writes in a temp folder: `film`, a
// game of cutscenes. `intro` has a cutscene whose cue file has a check beside it of its name,
// `assets/intro.ts`, and plays a step of the game's own, `roll`, which its plugin `crew` delivers;
// `reel` has a cutscene whose cue file has no check beside it; `still` has a cue file and no cutscene
// row. A cue file saved once it keeps cutscene's check with the steps its scene delivers, and refused
// with why when it does not; the check beside a cue file run on the file posted, and the one that runs
// ended by a check begun after it; and the Vite plugin answering the page's posts.
import { afterAll, expect, test } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { answers, cutsceneServe } from './cutscene.serve.ts'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cutscene-serve-'))
afterAll(() => fs.rmSync(root, { recursive: true }))
const write = (rel: string, data: string) => {
  const full = path.join(root, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, data)
}
// A scene's sim, as every game's: it imports its scene file and exports it, which is how scenemanager's
// `child` reads a scene.
const simOf = (name: string) => `import scene from './${name}.scene.json' with { type: 'json' }\nexport { scene }\nexport const sim = {}\n`
// film's cue file: a shot of the hero, the hero rolling, the game's own step, and a clip of its rig.
const FILM = {
  end: 3, reach: 1, stop: 0.2, head: 1.5, fov: 50, pace: 1, limit: 4,
  cast: { hero: { kind: 'actor', name: 'hero' } },
  cues: [
    { at: 0, do: 'shot', name: 'wide', pos: [0, 4, -6], look: 'hero', over: 0 },
    { at: 0.5, do: 'roll', who: 'hero', speed: 2 },
    { at: 1, do: 'play', who: 'hero', clip: 'wave', holds: false, rate: 1 },
  ] as Record<string, unknown>[],
}
write('games/film/film.scene.json', JSON.stringify({ prefabs: { scenemanager: { scenes: { intro: { file: 'intro.scene.json', suspend: true }, reel: { file: 'reel.scene.json', suspend: true }, still: { file: 'still.scene.json', suspend: true } }, entry: 'intro' } } }))
const world = (script: string) => ({
  loader: { assets: { [script]: { type: 'json', url: `/games/film/assets/${script}.json` }, rig: { type: 'json', url: '/games/film/assets/actor.rig.json' } } },
  cutscene: { script, kinds: ['actor'], settle: 0.5, tremor: [[1, 1], [1, 1], [1, 1]], mods: { behaviors: ['crew'] } },
  shipped: { plugins: ['crew'] },
  audio: { cues: { boom: {} } },
  anim: { kinds: { actor: { rig: 'rig', model: 'actor' } } },
})
const actors = [{ is: 'cutscene' }, { is: 'mark', name: 'pad', at: [1, 2] }, { is: 'actor', name: 'hero' }]
write('games/film/intro.scene.json', JSON.stringify({ world: world('intro'), prefabs: {}, plugins: ['loader', 'shipped', 'cutscene'], actors }, null, 2) + '\n')
write('games/film/reel.scene.json', JSON.stringify({ world: world('reel'), prefabs: {}, plugins: ['loader', 'shipped', 'cutscene'], actors }, null, 2) + '\n')
write('games/film/still.scene.json', JSON.stringify({ world: world('still'), prefabs: {}, plugins: ['loader'], actors: [] }, null, 2) + '\n')
for (const s of ['intro', 'reel', 'still']) write(`games/film/${s}.sim.ts`, simOf(s))
write('games/film/plugins/crew/crew.cutscene.ts', 'export const behaviors = () => ({ roll: { fields: { who: \'who\', speed: \'positive\' }, fire() {} } })\n')
write('games/film/assets/actor.rig.json', JSON.stringify({ clips: { idle: { loop: true }, wave: {} }, roles: {}, table: {} }))
for (const s of ['intro', 'reel', 'still']) write(`games/film/assets/${s}.json`, JSON.stringify(FILM, null, 2) + '\n')
// The intro's check, as a game's is: each shot named `bad` fails at its `at`; one named `slow` takes a
// second and a half first; one named `throws` throws.
write('games/film/assets/intro.ts', `export async function failing(script: { cues: { do: string; name?: string; at: number }[] }) {
  const shots = script.cues.filter(c => c.do === 'shot')
  if (shots.some(c => c.name === 'throws')) throw new Error('throws at 0.00: the shot has no pose')
  if (shots.some(c => c.name === 'slow')) await new Promise(done => setTimeout(done, 1500))
  return shots.filter(c => c.name === 'bad').map(c => ({ shot: c.name, e: c.at, text: \`\${c.name} at \${c.at.toFixed(2)}: the camera stands in the ground\` }))
}
`)

const a = answers(root)
const FILE = path.join(root, 'games/film/assets/intro.json')
const shot = (name: string, at: number) => ({ at, do: 'shot', name, pos: [0, 4, -6], look: 'hero', over: 0 })

test('a cue file saved: held to the scene\'s steps, its names and its rigs, written in JSON\'s layout, nothing written when it is as it is', async () => {
  const was = fs.readFileSync(FILE, 'utf8')
  const next = structuredClone(FILM)
  next.cues[0] = { ...next.cues[0], fov: 40 }
  expect(await a.answer('save', 'film', 'intro', next)).toEqual({ status: 200, body: { written: ['games/film/assets/intro.json'] } })
  expect(fs.readFileSync(FILE, 'utf8')).toBe(JSON.stringify(next, null, 2) + '\n')
  expect(await a.answer('save', 'film', 'intro', next)).toEqual({ status: 200, body: { written: [] } })
  const refused = async (change: (f: typeof FILM) => void) => {
    const f = structuredClone(next)
    change(f)
    const r = await a.answer('save', 'film', 'intro', f)
    expect(r.status).toBe(400)
    return (r.body as { error: string }).error
  }
  // The game's own step is checked as the scene delivers it, through its plugin's mod.
  expect(await refused(f => { f.cues[1].who = 'nobody' })).toBe('intro: cue 1 (roll at 0.5): who "nobody" is not a cast member: hero')
  expect(await refused(f => { f.cues[1].speed = 0 })).toBe('intro: cue 1 (roll at 0.5): speed 0 is not a number above 0')
  expect(await refused(f => { f.cues[0].look = 'tower' })).toBe('no cast member or mark is named tower: the cast is hero, and the marks are pad')
  expect(await refused(f => { f.cues[2].clip = 'dance' })).toBe('dance is not a clip of hero\'s rig: its clips are idle, wave')
  expect(await refused(f => { (f as Record<string, unknown>).go = 'nowhere' })).toBe('go nowhere is no scene of the game: its scenes are intro, reel, still')
  expect(await a.answer('save', 'film', 'intro', { cues: 'none' })).toEqual({ status: 400, body: { error: 'a cue file is { end, cast, cues, ... }' } })
  expect(await a.answer('save', 'film', 'still', next)).toEqual({ status: 400, body: { error: 'still has no cutscene row' } })
  expect(await a.answer('save', 'film', 'attic', next)).toEqual({ status: 404, body: { error: 'the manager names no scene attic: its scenes are intro, reel, still' } })
  expect(await a.answer('save', 'nope', 'intro', next)).toEqual({ status: 404, body: { error: 'no game nope' } })
  expect(await a.answer('save', '../film', 'intro', next)).toEqual({ status: 404, body: { error: 'a game and a scene are words' } })
  expect(fs.readFileSync(FILE, 'utf8')).toBe(JSON.stringify(next, null, 2) + '\n')
  fs.writeFileSync(FILE, was)
}, 20000)

test('a cue file\'s own check run on the file posted: its failing frames; none with no check beside it; a check that throws, and one begun again, refused', async () => {
  const bad = { ...FILM, cues: [...FILM.cues, shot('bad', 1.25)] }
  expect(await a.answer('check', 'film', 'intro', bad)).toEqual({ status: 200, body: { failed: [{ shot: 'bad', e: 1.25, text: 'bad at 1.25: the camera stands in the ground' }] } })
  expect(await a.answer('check', 'film', 'intro', FILM)).toEqual({ status: 200, body: { failed: [] } })
  expect(await a.answer('check', 'film', 'reel', FILM)).toEqual({ status: 404, body: { error: 'games/film/assets/reel.json has no check beside it, games/film/assets/reel.ts' } })
  expect(await a.answer('check', 'film', 'intro', { ...FILM, cues: [...FILM.cues, shot('throws', 1)] })).toEqual({ status: 409, body: { error: 'throws at 0.00: the shot has no pose' } })
  // A check begun while one runs ends the one that runs.
  const first = a.answer('check', 'film', 'intro', { ...FILM, cues: [...FILM.cues, shot('slow', 1)] })
  await new Promise(done => setTimeout(done, 300))
  const second = a.answer('check', 'film', 'intro', bad)
  expect(await first).toEqual({ status: 409, body: { error: 'another check of this cue file began' } })
  expect(((await second).body as { failed: unknown[] }).failed).toHaveLength(1)
}, 20000)

test('the Vite plugin answers the page\'s posts to /@cutscene/, and lets every other request by', async () => {
  let use: ((req: any, res: any, next: () => void) => Promise<void>) | undefined
  const plugin = cutsceneServe() as { configureServer(s: unknown): void }
  plugin.configureServer({ config: { root }, httpServer: null, middlewares: { use: (f: typeof use) => { use = f } } })
  const ask = async (url: string, method: string, body: unknown) => {
    const req = Object.assign(Readable.from([JSON.stringify(body)]), { url, method })
    const res = { statusCode: 0, headers: {} as Record<string, string>, text: '', setHeader(k: string, v: string) { this.headers[k] = v }, end(t: string) { this.text = t } }
    let passed = false
    await use!(req, res, () => { passed = true })
    return { passed, status: res.statusCode, type: res.headers['content-type'], body: res.text && JSON.parse(res.text) }
  }
  const bad = { ...FILM, cues: [...FILM.cues, shot('bad', 2)] }
  expect(await ask('/@cutscene/check?game=film&scene=intro', 'POST', bad)).toEqual({ passed: false, status: 200, type: 'application/json', body: { failed: [{ shot: 'bad', e: 2, text: 'bad at 2.00: the camera stands in the ground' }] } })
  expect(await ask('/@cutscene/save?game=film&scene=intro', 'POST', FILM)).toEqual({ passed: false, status: 200, type: 'application/json', body: { written: [] } })
  expect((await ask('/@cutscene/save?game=film&scene=intro', 'GET', FILM)).passed).toBe(true)
  expect((await ask('/games/film/dev.html', 'POST', FILM)).passed).toBe(true)
}, 20000)
