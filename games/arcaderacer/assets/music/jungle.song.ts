// Writes the courses' songs beside this file, `jungle-<seed>.json`, each an audiodaw project the jungle
// generator of demo_audiodaw (`assets/songs/jungle.ts`, played on its `presets.json`) makes from its
// seed, the same song every time. Each course's file names the one it plays (`music`), and the
// scene's catalogue has an entry of each. The game reads the json and never this. Run from the repo's
// root, again whenever the generator or its presets change:
//   node_modules/.bin/vite-node games/arcaderacer/assets/music/jungle.song.ts
import '#plugins/audiodaw/nodeaudio.ts'
import { readFileSync, writeFileSync } from 'node:fs'
import type { Preset } from '#plugins/audiodaw/audiodaw.sim.ts'
import { jungle } from '#games/demo_audiodaw/assets/songs/jungle.ts'

// The seeds of the courses' songs: forest's, tokyo's and paris's.
const SEEDS = [60896, 31586, 8411]

const presets = JSON.parse(readFileSync(new URL('../../../demo_audiodaw/assets/presets.json', import.meta.url), 'utf8')) as Preset[]
for (const seed of SEEDS) {
  const { plan, project } = jungle(seed, presets)
  writeFileSync(new URL(`./jungle-${seed}.json`, import.meta.url), JSON.stringify(project))
  console.log(`jungle-${seed}: ${plan.key}, ${plan.bpm} bpm, ${plan.sections.map(s => s.kind).join(' ')}`)
}
// Tone's audio context keeps node running once it is made; the files are written, so end.
process.exit(0)
