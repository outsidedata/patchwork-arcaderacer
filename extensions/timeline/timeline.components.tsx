// The components of the timeline extension (timeline.extension.tsx).
import { useState } from 'react'
import { useEditor } from '#editor/context.ts'
import { press } from '#editor/shell/keys.ts'
import { Select } from '#editor/ui/fields.tsx'
import { Badge, Button, Empty, PanelBody, Toolbar } from '#editor/ui/layout.tsx'
import { Timeline as Lanes } from '#editor/ui/timeline.tsx'
import { read, SPEEDS, type Read } from './timeline.extension.tsx'

export function Timeline() {
  const ed = useEditor(['game'])
  const s = ed.session
  const [scrub, setScrub] = useState<number | undefined>(undefined)
  // The journal as last read, kept by the panel, not drawn from.
  const [cache] = useState<{ current: Read | undefined }>(() => ({ current: undefined }))
  if (!s) return <Empty>No game is open.</Empty>
  // A transport button runs its command as its menu item and its key do.
  const run = (id: string) => () => {
    const c = ed.commands.get(id)
    if (c && !('input' in c)) press(ed, c)
  }
  const at = scrub ?? s.n
  const f = s.rec.failure
  const marks = read(cache, s.rec.journal)
  const seek = (t: number, done: boolean) => {
    const k = Math.min(Math.max(0, t), s.end)
    if (!done) return setScrub(k)
    void s.seek(k).then(() => setScrub(undefined))
  }
  return (
    <PanelBody
      bar={
        <Toolbar label="transport">
          <Button title="restart" onClick={run('game.restart')}>⏮</Button>
          <Button title="step back" onClick={run('game.back')} disabled={s.n === 0}>◀︎</Button>
          <Button title={s.playing ? 'pause' : 'play'} pressed={s.playing} onClick={run('game.play')}>{s.playing ? '⏸' : '▶︎'}</Button>
          <Button title="step" onClick={run('game.step')}>▶︎|</Button>
          <Select label="speed" value={s.speed} options={SPEEDS.map(v => ({ value: v, label: `${v}×` }))} onChange={v => s.setSpeed(v)} />
          <span className="ui-spacer" />
          {s.n < s.end && <Badge tone="accent">replaying the recording</Badge>}
          {f && <Badge tone="danger">step {f.at} threw</Badge>}
          <Badge>step {at} / {s.end}</Badge>
        </Toolbar>
      }
    >
      <Lanes
        label="recording"
        lanes={[{ id: 'seat', label: 'seat', marks: marks.seat }, { id: 'edits', label: 'edits', marks: marks.edits }]}
        head={at}
        span={Math.max(s.end, 1)}
        grain={1}
        fit={s.end}
        end={s.end}
        onSeek={seek}
      />
    </PanelBody>
  )
}
