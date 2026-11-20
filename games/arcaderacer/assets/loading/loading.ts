// The loading screen's two pictures, drawn by arcaderacer's bake (`arcaderacer.bake.ts`) with ImageMagick
// from nothing but the Orbitron font of the title (`title/Orbitron-Black.ttf`), and committed with the game:
//   splash.webp  1280 × 720, the canvas's size (the `engine` prefab's): a sky darkening from the horizon up
//                to night, a low sun on the horizon, and a dark road below it ruled in neon to the vanishing
//                point, so the screen reads as a racer's from its first frame
//   logo.webp    1000 × 200, transparent: ARCADE RACER in Orbitron Black, the title's yellow (0xffe100) on a
//                near-black edge, as the HUD's `big` style draws its words
// They are the screen's stand-ins until the game has art of its own for it: the scene's catalogue names
// each as a `texture` `for: "ui"` with `preload`, and the `loading` panel of `world.ui` draws them.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { resolve } from '#scripts/health.ts'

const here = import.meta.dirname
const root = path.join(here, '..', '..', '..', '..')

const WIDTH = 1280
const HEIGHT = 720
const HORIZON = 430
const SKY = ['#0a0f2c', '#7a2a7a']
const SUN = { colour: '#ff9a3c', at: [640, HORIZON - 10], radius: 140 }
const ROAD = '#0b0b16'
const NEON = { colour: '#ff2fa8', width: 3, fan: 320, rows: [442, 458, 482, 516, 566, 636] }
const LOGO = { size: [1000, 200], text: 'ARCADE RACER', points: 88, fill: '#ffe100', edge: '#111111', thick: 12 }

const run = (file: string, args: string[], env: Record<string, string | undefined>) => new Promise<void>((done, fail) =>
  execFile(file, args, { env, maxBuffer: 1 << 26 }, (e, stdout, stderr) => (e ? fail(new Error(`${path.basename(file)} ${args.join(' ')} failed:\n${stdout}${stderr}`)) : done())))

// Both pictures written; their paths handed back.
export async function loading(): Promise<string[]> {
  const { env, magick } = resolve(root, process.env)
  if (!magick) throw new Error('the loading screen is drawn by ImageMagick, and there is no magick (yarn health)')
  fs.mkdirSync(here, { recursive: true })

  const splash = path.join(here, 'splash.webp')
  const [sx, sy] = SUN.at
  const fan: string[] = []
  for (let x = WIDTH / 2 - NEON.fan * 6; x <= WIDTH / 2 + NEON.fan * 6; x += NEON.fan) fan.push('-draw', `line ${WIDTH / 2},${HORIZON} ${x},${HEIGHT}`)
  const rows = NEON.rows.flatMap(y => ['-draw', `line 0,${y} ${WIDTH},${y}`])
  await run(magick, [
    '-size', `${WIDTH}x${HEIGHT}`, `gradient:${SKY[0]}-${SKY[1]}`,
    '-fill', SUN.colour, '-draw', `circle ${sx},${sy} ${sx},${sy - SUN.radius}`,
    '-fill', ROAD, '-draw', `rectangle 0,${HORIZON} ${WIDTH},${HEIGHT}`,
    '-fill', 'none', '-stroke', NEON.colour, '-strokewidth', String(NEON.width), ...fan, ...rows,
    '-quality', '85', splash,
  ], env)

  const logo = path.join(here, 'logo.webp')
  const font = path.join(here, '..', 'title', 'Orbitron-Black.ttf')
  await run(magick, [
    '-size', `${LOGO.size[0]}x${LOGO.size[1]}`, 'xc:none', '-font', font, '-pointsize', String(LOGO.points), '-gravity', 'center',
    '-fill', LOGO.edge, '-stroke', LOGO.edge, '-strokewidth', String(LOGO.thick), '-annotate', '+0+0', LOGO.text,
    '-fill', LOGO.fill, '-stroke', 'none', '-annotate', '+0+0', LOGO.text,
    '-define', 'webp:lossless=true', logo,
  ], env)
  return [splash, logo]
}
