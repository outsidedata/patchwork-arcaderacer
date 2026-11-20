// Writes flame02.json, the sheet of flame02.png: Unity Labs' Flame02 flipbook (CC0,
// https://unity.com/blog/engine-platform/free-vfx-image-sequences-flipbooks), a Houdini fire
// simulation of 64 frames, 16 across and 4 down, each 128 × 256, read left to right and top to
// bottom. Its one clip, `burn`, is every frame in order; each frame's pivot is the middle of its
// bottom edge, the flame's foot.
//
// flame02.png is the download's Flame02_16x4.tga with the alpha of each frame's bottom 12 pixels faded
// to nothing at its bottom edge, so a flame has no hard line at its foot:
//
//   magick Flame02_16x4.tga -channel A -fx "a*min(1,(255-(j%256))/12)" +channel flame02.png
//
//   node tools/workshop/assets/effects/fire/flame02.sheet.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const across = 16, down = 4, w = 128, h = 256
const frames = []
for (let row = 0; row < down; row++)
  for (let col = 0; col < across; col++)
    frames.push({
      filename: `flame02 ${frames.length}`,
      frame: { x: col * w, y: row * h, w, h },
      rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
      pivot: { x: 0.5, y: 0.95 },
      duration: 33,
    })
const sheet = {
  frames,
  meta: { app: 'flame02.sheet.mjs', image: 'flame02.png', size: { w: across * w, h: down * h }, frameTags: [{ name: 'burn', from: 0, to: frames.length - 1 }] },
}
fs.writeFileSync(path.join(here, 'flame02.json'), JSON.stringify(sheet, null, 2) + '\n')
console.log(`wrote flame02.json: ${frames.length} frames`)
