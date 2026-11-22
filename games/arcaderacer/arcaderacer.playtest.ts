// The playtester's thinks for arcaderacer, read by the benchmark profilers' `--playtest`
// (`.claude/skills/benchmarking-a-game`): one think for each scene by its name.
//
// title   plays the title through to the car select and stays on it, so the page is measured while the
//         six cars are built and while the line slides. Once the title's intro is done and the match is
//         in the lobby it presses the name (Enter), then the first course word that can be selected
//         (Enter), and on the car select it never presses a car (a pick ends the screen): it moves the
//         selection along the line, one car a `PACE` milliseconds, right to the last car and back to the
//         first, again and again. Every key goes through the page as a key does, to ui3d's own listener
//         (`ui3d.plugin.ts`, `onKey`), since the titlecard's screens are ui3d's presses and a player act
//         reaches none of them.
import type { Think } from '#plugins/playtester/playtester.plugin.ts'

type Page = { client: { plugins: { ui3d: { selected(): string | undefined } } } }

// milliseconds between one key and the next
const PACE = 1500
// the places of the car select's line, `car.0` to `car.<LAST>` (`match`'s `cars` in `arcaderacer.json`)
const LAST = 5

type Phase = 'title' | 'courses' | 'cars'

// A think of the title: its own phase, the moment of its last key and the way it is moving along the line.
function title(): Think {
  let phase: Phase = 'title'
  let at = 0
  let way: 'ArrowRight' | 'ArrowLeft' = 'ArrowRight'
  const press = (key: string) => {
    at = performance.now()
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true }))
  }
  return rows => {
    if (performance.now() - at < PACE) return undefined
    const page = (window as unknown as { __page: Page }).__page
    const picked = page.client.plugins.ui3d.selected()
    const cut = rows.find(r => r.kind === 'cutscene')
    const match = rows.find(r => r.kind === 'match')
    if (!cut?.data.done || match?.data.match !== 'lobby') return undefined
    // a car selected: the car select is up, whatever came before
    if (picked?.startsWith('car.')) phase = 'cars'
    if (phase === 'cars') {
      const place = picked?.startsWith('car.') ? Number(picked.slice(4)) : 0
      if (place >= LAST) way = 'ArrowLeft'
      if (place <= 0) way = 'ArrowRight'
      press(way)
      return undefined
    }
    if (picked?.startsWith('course.')) {
      phase = 'cars'
      press('Enter')
      return undefined
    }
    if (phase === 'title') {
      phase = 'courses'
      press('Enter')
    }
    return undefined
  }
}

export const playtest: Record<string, Think> = { title: title() }
