// The six cars made from the library's pro-ng kit, made by arcaderacer's bake (`arcaderacer.bake.ts`): each a body and
// its wheels, so box3dvehicle draws the body on the chassis and a wheel on each wheel row
// (`world.box3dvehicle.vehicles.<car>.look`). `cars.kit.json` beside this file holds every car's pieces, each a list of
// pro-ng entries:
//   body          the car's kind with Corners and Steering false (no road wheel, no steering wheel), and its
//                 interior/steering placed alone where the car's STEERING_PLACE puts it, as the thing `steer`, so its
//                 bone `steer wheel` is the node box3dvehicle turns as the steering wheel, its +x down the column
//   wheel-<side>  the car's wheels/wheel, Hand -1 on the left and 1 on the right; the countach and the f40, whose
//                 front and rear wheels differ, have wheel-<end>-<side> with End front or rear
// Each piece is written as a pro-ng scene of its own, `<piece>.kit.json`, in the scratch folder, cut in Blender by the
// library's `pro-ng/procedural.py` and packed by its `pro-ng/pack.mjs`, which writes the glb for supershader3d and its
// looks file; both are copied to `<car>/<piece>.kit.glb` and `<car>/<piece>.kit.looks.json` (which box3dvehicle's
// models mod reads the material names from). Then every piece of every car is put in one scene, each `SPACING` metres
// from the last, made only for its looks file: every material any of them draws. That looks file is made
// supershader3d's (`packLooks`) and written as `kit.looks.json`, the `world.supershader3d.looks` of every scene that
// draws a car, with every picture its looks read in `looks/` and their KTX2 stack beside them (`stack`).
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import type { Looks, Tools } from '#scripts/bake.ts'
import { packLooks } from '#scripts/pack-looks.ts'

type Entry = { kind: string; name: string; place?: [number, number]; [key: string]: unknown }
type Car = { body: Entry[]; wheels: Record<string, Entry> }

const here = import.meta.dirname
const root = path.join(here, '..', '..', '..')
const SET = 'kit.set.kit'
const SPACING = 8

const node = (args: string[]) => new Promise<void>((done, fail) =>
  execFile(process.execPath, args, { maxBuffer: 1 << 26 }, (e, stdout, stderr) => (e ? fail(new Error(`${stdout}${stderr}`)) : done())))

export async function kits({ blender, scratch, library, stack }: Tools) {
  const prong = path.join(library, 'pro-ng')
  const cars: Record<string, Car> = JSON.parse(fs.readFileSync(path.join(here, 'cars.kit.json'), 'utf8'))
  // `buildings` written as the scene `<name>.kit.json` in the scratch folder `<key>`, cut and packed there, and the
  // folder handed back
  const cut = async (buildings: Entry[], name: string, key: string) => {
    const out = scratch(key)
    fs.mkdirSync(out, { recursive: true })
    const scene = path.join(out, `${name}.json`)
    fs.writeFileSync(scene, JSON.stringify({ buildings }, null, 1) + '\n')
    await blender(['--factory-startup', '--python-exit-code', '1', '--python', path.join(prong, 'procedural.py'), '--', 'file', scene, out])
    await node([path.join(prong, 'pack.mjs'), path.join(out, `${name}.glb`)])
    return out
  }
  const pieces = (car: Car): [string, Entry[]][] => [['body', car.body], ...Object.entries(car.wheels).map(([p, e]): [string, Entry[]] => [p, [e]])]
  const set: Entry[] = []
  for (const [i, [name, car]] of Object.entries(cars).entries()) {
    const folder = path.join(here, name)
    fs.mkdirSync(folder, { recursive: true })
    for (const [j, [piece, entries]] of pieces(car).entries()) {
      const file = `${piece}.kit`
      const out = await cut(entries, file, `${name}-${file}`)
      for (const suffix of ['.glb', '.looks.json']) {
        fs.copyFileSync(path.join(out, file + suffix), path.join(folder, file + suffix))
        console.log('wrote', path.relative(root, path.join(folder, file + suffix)))
      }
      for (const e of entries) {
        const [x, y] = e.place ?? [0, 0]
        set.push({ ...e, name: `${name} ${piece} ${e.name}`, place: [x + j * SPACING, y + i * SPACING] })
      }
    }
  }
  const out = await cut(set, SET, SET)
  const packed: Looks = packLooks(JSON.parse(fs.readFileSync(path.join(out, `${SET}.looks.json`), 'utf8')))
  const into = path.join(here, 'looks')
  const file = path.join(here, 'kit.looks.json')
  fs.rmSync(into, { recursive: true, force: true })
  if (packed.pictures.length) {
    fs.mkdirSync(into)
    for (const p of packed.pictures) fs.copyFileSync(path.join(out, 'looks', p.file), path.join(into, p.file))
    console.log('wrote', path.relative(root, into), `${packed.pictures.length} pictures`)
  }
  // every picture again as one KTX2 array, `looks/kit.pictures.ktx2`, which supershader3d binds in place of
  // the pictures, and which every catalogue naming the pictures lists as `kit_pictures`; the file as it was
  // when its looks read no picture
  const looks = await stack(packed, into, file)
  fs.writeFileSync(file, JSON.stringify(looks, null, 1) + '\n')
  console.log('wrote', path.relative(root, file))
}
