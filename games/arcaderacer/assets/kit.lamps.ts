// The kit cars' lamp materials, for their car files (`cars/<car>.json`): run from the repo root,
// `node --experimental-strip-types games/arcaderacer/assets/kit.lamps.ts`. For every material of `kit.looks.json`
// whose name says it is a lamp's (lens, lamp, light, tail, brake, indicator, reflector), it prints its name, its
// look and every setting the look reads with its value, so a car file can name the lamps it lights and the
// setting each glows by.
import fs from 'node:fs'
import path from 'node:path'

const here = import.meta.dirname
const looks = JSON.parse(fs.readFileSync(path.join(here, 'kit.looks.json'), 'utf8'))
const LAMP = /lens|lamp|light|tail|brake|indicator|reflector|beam/i
looks.materials.forEach((m: { name: string; look: string }, id: number) => {
  if (!LAMP.test(m.name) && !LAMP.test(m.look)) return
  const settings = (looks.settings.materials[id] as { name: string; value: unknown }[]).map(s => `${s.name}=${JSON.stringify(s.value)}`).join(' ')
  console.log(`${m.name} | ${m.look} | ${settings}`)
})
