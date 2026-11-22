// The page's loading cover as the bundle writes it, from a game folder the test writes: a manager
// naming two scenes, the entry one with a loading screen, extending a partial. What the cover draws
// is the entry scene's panel as the child is booted, the manager's world and the partial's under its
// own; what it fetches is every scene's catalogue but what says `preload: false`, every font and
// every wad, each url once.
import { afterAll, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cover, covered } from './loader.cover.ts'

const root = mkdtempSync(join(tmpdir(), 'loader-cover-'))
afterAll(() => rmSync(root, { recursive: true }))

const loading = {
  fill: { color: 1 },
  pictures: [{ picture: 'splash', at: [0, 0], size: [640, 360] }],
  bar: { at: [100, 300], size: [440, 10], edge: 2, frame: { color: 2 }, track: { color: 3 }, fill: { color: 4 } },
  lines: { style: 'tip', at: [320, 340], every: 3, text: ['Hold on.'] },
  fade: 0.5,
}

// A game of two scenes in `name`, its entry `hall`, whose `ui` the manager's world gives.
function game(name: string, hallPanels: Record<string, unknown>) {
  const dir = join(root, name)
  mkdirSync(dir)
  const json = (file: string, v: unknown) => writeFileSync(join(dir, file), JSON.stringify(v))
  json(`${name}.scene.json`, {
    world: { ui: { panels: hallPanels, styles: { tip: { fontFamily: 'Face', fontSize: 20, fill: 5 } } } },
    prefabs: { engine: { dt: 1 / 60 }, scenemanager: { scenes: { hall: { file: 'hall.scene.json', suspend: false }, yard: { file: 'yard.scene.json', suspend: true } }, entry: 'hall', dt: 1 / 60 } },
    actors: [{ is: 'scenemanager' }],
    plugins: ['scenemanager'],
  })
  json('hall.partial.json', { world: { loader: { wads: ['/art.wad'] } }, prefabs: {}, actors: [] })
  json('hall.scene.json', {
    extends: 'hall.partial.json',
    world: {
      loader: {
        wads: ['/art.wad'],
        assets: {
          splash: { type: 'texture', url: '/splash.webp', for: 'ui', preload: true },
          Face: { type: 'font', url: '/face.ttf', preload: false },
          level: { type: 'json', url: '/level.json' },
          kit: { type: 'binary', url: '/kit.glb' },
          later: { type: 'json', url: '/later.json', preload: false },
        },
      },
    },
    prefabs: { engine: { dt: 1 / 60, width: 640, height: 360 } },
    actors: [],
    plugins: ['loader', 'scenemanager', 'ui'],
  })
  json('yard.scene.json', {
    world: { loader: { assets: { level: { type: 'json', url: '/level.json' }, yard: { type: 'model', url: '/yard.glb' } } } },
    prefabs: { engine: { dt: 1 / 60, width: 640, height: 360 } },
    actors: [],
    plugins: ['loader', 'scenemanager'],
  })
  return dir
}

const panel = { anchor: 'center', size: [640, 360], layer: 9, modal: true, loading }

test('the cover draws the entry scene\'s loading panel and fetches every scene\'s files the loader fetches first, each once', async () => {
  expect(await cover(game('shown', { loading: panel }))).toEqual({
    area: { width: 640, height: 360 },
    panel: { anchor: 'center', size: [640, 360] },
    fill: { color: 1 },
    pictures: [{ url: '/splash.webp', at: [0, 0], size: [640, 360] }],
    bar: loading.bar,
    lines: { at: [320, 340], every: 3, text: ['Hold on.'], pictures: [null], style: { fontFamily: 'Face', fontSize: 20, fill: 5 } },
    fonts: [{ family: 'Face', url: '/face.ttf' }],
    urls: ['/art.wad', '/splash.webp', '/face.ttf', '/level.json', '/kit.glb', '/yard.glb'],
  })
})

test('a line that gives a picture hands the cover its url, and a line with none hands it null', async () => {
  const lines = { ...loading.lines, text: [{ text: 'Hold on.', picture: 'splash' }, 'Go.'] }
  const c = await cover(game('lined', { loading: { ...panel, loading: { ...loading, pictures: [], lines } } }))
  expect(c!.lines).toMatchObject({ text: ['Hold on.', 'Go.'], pictures: ['/splash.webp', null] })
})

test('a game whose entry scene shows no loading screen has no cover', async () => {
  const dir = game('plain', { hud: { anchor: 'center', size: [640, 360] } })
  expect(await cover(dir)).toBeUndefined()
  expect(await covered(dir)).toBe('')
})

test('a loading picture that is no preloaded texture for the ui is refused, naming the panel', async () => {
  const dir = game('wrong', { loading: { ...panel, loading: { ...loading, pictures: [{ picture: 'level', at: [0, 0], size: [1, 1] }] } } })
  await expect(cover(dir)).rejects.toThrow('ui panel loading\'s loading picture level is no preloaded texture entry for ui in world.loader.assets')
})

test('a line\'s picture that is no preloaded texture for the ui is refused, naming the panel', async () => {
  const lines = { ...loading.lines, text: [{ text: 'Hold on.', picture: 'level' }] }
  const dir = game('wrongline', { loading: { ...panel, loading: { ...loading, lines } } })
  await expect(cover(dir)).rejects.toThrow('ui panel loading\'s loading lines picture level is no preloaded texture entry for ui in world.loader.assets')
})

test('the cover\'s HTML is one script that parses, its numbers rebased as the site writes paths, and no "<" left in them to end the script', async () => {
  const html = await covered(game('written', { loading: panel }), text => text.replaceAll('"/', '"/site/').replace('Hold on.', '</script>'))
  expect(html.startsWith('<div id="loader-cover"></div>\n<script>\n')).toBe(true)
  const body = html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'))
  expect(body.includes('</script>')).toBe(false)
  expect(() => new Function(body)).not.toThrow()
  expect(body).toContain('"url":"/site/splash.webp"')
  expect(body).toContain('\\u003c/script>')
})
