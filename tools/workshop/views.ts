// The views page: the effects file the server was started on (`--effects`, `/api/particles`), played on
// the particle workshop's stage (`stage.ts`) filling the window, with nothing else on the page, for
// pictures of it to be taken and for it to be scored. It runs no clock of its own: `yarn particle-views`
// (`scripts/particle-views.ts`) and `yarn particle-score` (`scripts/particle-score.ts`) open it in a headless
// Chrome and ask it for one thing at a time.
//
// Once the stage is up it sets `window.__views`, `{ shoot, score, picture }`; a page that could not come up
// sets `window.__failed`, why.
//
//   shoot(view)   plays one view (`shoot.ts`, its fields) and leaves it drawn on the canvas, handing back
//                 `{ particles, effects }`, how many particles and effects are in the air in it.
//   score(base, keep)   scores the effect `base` names (`score.ts`'s `scoreEffect`, `base` every view of
//                 it but its moment, its layers and its sky) and hands back what it found, with `report`,
//                 its lines of text. With `keep`, every picture it measured is kept, by name, until the
//                 next score.
//   picture(name) one picture the last score kept, as a PNG data URL.
//
// Every effect, force generator and driver of a file the effects file lists (`files`) is read in with its
// own (`stage.ts`'s `gather`), so a view's `off` and `only` reach those effects too.
import { gather, stage, type Found } from './stage.ts'
import { shooter, type View } from './shoot.ts'
import { report, scoreEffect, type Picture } from './score.ts'
import type { Layer } from '#plugins/particle3d/particle3d.plugin.ts'

async function main() {
  const answer = await fetch('/api/particles')
  const sum = await answer.json()
  if (!answer.ok) throw new Error(sum.error)
  const found: Found = sum.files[0]
  // every effect of the files it lists, laid over its own as particle3d lays them, with their force
  // generators and drivers, which the stage plays them by
  const all: Record<string, Layer[]> = gather(found).whole.effects

  const st = await stage(found, document.querySelector('#view') as HTMLElement)
  const { shoot, look } = shooter(st, found, all)
  let kept = new Map<string, Picture>()
  const score = async (base: Omit<View, 'preroll' | 'off' | 'only' | 'sky'>, keep: boolean) => {
    kept = new Map()
    const scored = await scoreEffect(look, all, base, keep ? { keep: (name, pic) => kept.set(name, pic) } : {})
    return { ...scored, report: report(scored), pictures: [...kept.keys()] }
  }
  const picture = (name: string) => {
    const pic = kept.get(name)
    if (!pic) throw new Error(`the last score kept no picture ${name}`)
    const c = document.createElement('canvas')
    c.width = pic.width
    c.height = pic.height
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pic.data), pic.width, pic.height), 0, 0)
    return c.toDataURL('image/png')
  }
  ;(window as any).__views = { shoot, score, picture }
}

main().catch(e => { (window as any).__failed = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e) })
