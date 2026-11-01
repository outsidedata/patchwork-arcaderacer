// Time: play, pause, step, step back, restart, and the recording as a timeline in steps to seek
// along: marks on the seat's lane for the steps the seat's messages reached the truth at, and on the
// edits' lane for the steps an edit did, each run of consecutive steps one mark, with the time past
// the recording's end hatched. It fits the recording again whenever its end moves. A seek rebuilds
// the step by replaying from step 0, so scrubbing along the ruler shows the step it is let go at; the
// ruler takes the focus, where ← and → seek a step, and with Shift a tick. Pressing a mark seeks to
// the step under the pointer inside it. However long the recording, a lane draws at most a span per
// two pixels, and a drawing reads only the journal entries added since the last (`read`).
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), each doing what a person does here:
//   game.play, game.step, game.back, game.restart, game.rerun, game.cut
//                the transport and the Game menu, each also a menu item, and all but two a key;
//   game.state   the clock: the step, the recording's end, playing or not and how fast, the step
//                that threw, the marks of each lane (`read`), and whether the page is shown: hidden,
//                the clock plays on at the game's pace, a second's steps at a time, as Chrome fires
//                a hidden tab's timers once a second, and slower once the tab has been hidden five
//                minutes and Chrome fires them once a minute;
//   game.run     steps the game a number of steps, paused, with no clock (`Session.run`): the way a
//                call moves time at once, shown or hidden;
//   game.seek    seeks along the recording, as the ruler does (`Session.seek`);
//   game.speed   the speed it plays at, as the speed menu sets it (`Session.setSpeed`, `SPEEDS`).
import { z } from 'zod'
import type { Entry } from '#addons/recorder/recorder.addon.ts'
import type { Editor } from '#editor/editor.ts'
import type { Mark } from '#editor/ui/timeline.tsx'
import { Timeline } from './timeline.components.tsx'

// The speeds the clock plays at, as the panel's speed offers them and `game.speed` takes them.
export const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4]
type Lane = 'seat' | 'edits'
// What the journal has been read into: each lane's steps and its runs of them, how many entries were
// read and the last one, so the entries after it are all that is read next time.
export type Read = { journal: readonly Entry[]; count: number; last: Entry | undefined; steps: Record<Lane, Set<number>>; marks: Record<Lane, Mark[]> }

// The runs of consecutive steps in `steps`, each a mark from its first step, as long as it runs.
function runs(steps: Set<number>): Mark[] {
  const out: Mark[] = []
  for (const n of [...steps].sort((a, b) => a - b)) extend(out, n)
  return out
}
// Adds step `n`, past every step in `marks`, to the last run or as a run of its own.
function extend(marks: Mark[], n: number) {
  const was = marks[marks.length - 1]
  if (was && n === was.at + (was.length ?? 0) + 1) was.length = (was.length ?? 0) + 1
  else marks.push({ at: n, length: 0 })
}

// The marks of each lane: a run for each stretch of consecutive steps the seat's messages, or an
// edit, reached the truth at. Only the entries added since the last read are read, and a step past
// every step a lane has extends its runs; a step before them (an edit made after seeking back) makes
// that lane's runs again, and a journal that lost entries (a cut, an undone edit) is read again from
// its start.
export function read(cache: { current: Read | undefined }, journal: readonly Entry[]): Record<Lane, Mark[]> {
  let c = cache.current
  const kept = c && c.journal === journal && c.count <= journal.length && (c.count === 0 || journal[c.count - 1] === c.last)
  if (!c || !kept) c = cache.current = { journal, count: 0, last: undefined, steps: { seat: new Set(), edits: new Set() }, marks: { seat: [], edits: [] } }
  if (c.count === journal.length) return c.marks
  const again = new Set<Lane>()
  for (let i = c.count; i < journal.length; i++) {
    const lane: Lane = 'up' in journal[i] ? 'seat' : 'edits'
    const n = journal[i].at, steps = c.steps[lane], marks = c.marks[lane]
    if (steps.has(n)) continue
    const last = marks[marks.length - 1]
    steps.add(n)
    if (!last || n > last.at + (last.length ?? 0)) extend(marks, n)
    else again.add(lane)
  }
  for (const lane of again) c.marks[lane] = runs(c.steps[lane])
  c.count = journal.length
  c.last = journal[journal.length - 1]
  c.marks = { seat: [...c.marks.seat], edits: [...c.marks.edits] }
  return c.marks
}

// The most steps one `game.run` takes. The heaviest game here steps in about 4 ms (tieclone; most take
// under 1 ms), so these many, a minute of a game stepping 60 times a second, take at most about 15 s,
// well inside the minute an MCP client waits for a call.
export const RUN = 3600

// The clock as `game.state` answers it.
function state(ed: Editor) {
  const s = ed.need()
  const f = s.rec.failure
  const marks = read({ current: undefined }, s.rec.journal)
  const told = (m: Mark[]) => m.map(({ at, length = 0 }) => ({ from: at, to: at + length }))
  return {
    step: s.n,
    end: s.end,
    playing: s.playing,
    speed: s.speed,
    replaying: s.n < s.end,
    ...(f && { failure: { at: f.at, message: f.message } }),
    marks: { seat: told(marks.seat), edits: told(marks.edits) },
    visible: document.visibilityState === 'visible',
  }
}

export function timeline(ed: Editor) {
  const open = () => !!ed.session
  ed.panel({ id: 'timeline', title: 'Timeline', area: 'bottom', lead: true, component: Timeline })
  ed.command({ id: 'game.play', title: 'Play / Pause', menu: 'Game', key: 'Space', enabled: open, run: () => { const s = ed.session!; if (s.playing) s.pause(); else s.play() } })
  ed.command({ id: 'game.step', title: 'Step', menu: 'Game', key: '.', enabled: open, run: () => ed.session!.step() })
  ed.command({ id: 'game.back', title: 'Step Back', menu: 'Game', key: ',', enabled: () => !!ed.session && ed.session.n > 0, run: () => ed.session!.back() })
  ed.command({ id: 'game.rerun', title: 'Re-run From the Files', menu: 'Game', enabled: open, run: async () => { await ed.session!.rec.rerun(); ed.session!.rebuild() } })
  ed.command({ id: 'game.restart', title: 'Restart', menu: 'Game', key: 'Mod+Shift+R', enabled: open, run: () => ed.session!.restart() })
  ed.command({ id: 'game.cut', title: 'End the Recording Here', menu: 'Game', enabled: () => !!ed.session && ed.session.n < ed.session.end, run: () => ed.endHere() })

  ed.command({
    id: 'game.state',
    title: 'Clock',
    input: z.object({}).describe('The clock of the open game: step, the step it is at; end, where the recording ends; playing and speed; replaying, whether it is before the end; failure, the step that threw and what; marks, the runs of steps the seat\'s messages and the edits reached the truth at; visible, whether the page is shown: in a hidden tab the clock plays on, at the game\'s pace but a second\'s steps at a time, as Chrome fires a hidden tab\'s timers once a second, and slower once the tab has been hidden five minutes and Chrome fires them once a minute (game.run steps at once either way).'),
    run: () => state(ed),
  })
  ed.command({
    id: 'game.run',
    title: 'Run steps',
    input: z.object({
      steps: z.number().int().min(1).max(RUN).describe(`how many steps, at most ${RUN}: a minute of a game stepping 60 times a second, about 15 s in the heaviest game`),
    }).describe('Steps the open game, paused and one step after another, whether the page is shown or not: the way to move time on. Stops at a step that throws. Past the recording\'s end it records; before it, it plays the recording back. Answers the clock, as game.state does.'),
    run: async ({ steps }) => {
      await ed.need().run(steps)
      return state(ed)
    },
  })
  ed.command({
    id: 'game.seek',
    title: 'Seek',
    input: z.object({ step: z.number().int().min(0).describe('a step of the recording, from 0 to its end') }).describe('Rebuilds the step asked for from the recording, paused, as letting go of the timeline\'s ruler there does: back, or forward up to the recording\'s end (game.run steps past it). Answers the clock, as game.state does.'),
    run: async ({ step }) => {
      const s = ed.need()
      if (step > s.end) throw new Error(`the recording ends at step ${s.end}: seek from 0 to ${s.end}, or run steps past it with game.run`)
      await s.seek(step)
      return state(ed)
    },
  })
  ed.command({
    id: 'game.speed',
    title: 'Speed',
    input: z.object({ speed: z.literal(SPEEDS).describe(`how many times its own pace the game plays at: ${SPEEDS.join(', ')}`) }).describe('Sets the speed the open game plays at, as the timeline\'s speed menu does. Answers the clock, as game.state does.'),
    run: ({ speed }) => {
      ed.need().setSpeed(speed)
      return state(ed)
    },
  })
}
