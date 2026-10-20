// The components of the servers extension (servers.extension.tsx).
import { useSyncExternalStore } from 'react'
import { useEditor } from '#editor/context.ts'
import { Badge, Button, Empty, PanelBody, Toolbar } from '#editor/ui/layout.tsx'
import { feedOf, openSeat, serve } from './servers.extension.tsx'

export function Servers() {
  // The feed is drawn by its own store; the editor's part is the game open.
  const ed = useEditor(['game'])
  const game = ed.session?.game.name
  const feed = feedOf(ed)
  useSyncExternalStore(feed.subscribe, () => feed.version)
  if (!game) return <Empty>No game is open.</Empty>
  const mine = feed.running.find(r => r.game === game)
  const fail = (e: unknown) => ed.error((e as Error).message)
  const act = (route: 'start' | 'stop') => () => void serve(ed, route).catch(fail)
  return (
    <PanelBody
      bar={
        <Toolbar label="node">
          {mine ? <Button title="stop the server" onClick={act('stop')}>Stop</Button> : <Button title="run the game on node" primary onClick={act('start')}>Run on node</Button>}
          {mine && <Badge tone="accent">port {mine.port}</Badge>}
          {mine && <Button title="open a seat in a new tab" onClick={() => { try { openSeat(ed) } catch (e) { fail(e) } }}>Open a seat</Button>}
        </Toolbar>
      }
    >
      {feed.lines.filter(l => l.game === game).map((l, i) => <div key={i} className="console-line">{l.line}</div>)}
    </PanelBody>
  )
}
