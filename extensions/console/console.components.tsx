// The components of the console extension (console.extension.tsx).
import { useEffect, useRef } from 'react'
import { useEditor } from '#editor/context.ts'
import { Badge, Button, Empty, PanelBody, Toolbar } from '#editor/ui/layout.tsx'

const time = (at: number) => new Date(at).toLocaleTimeString()

export function Console() {
  const ed = useEditor(['log'])
  const end = useRef<HTMLDivElement>(null)
  const count = ed.log.length
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }) }, [count])
  return (
    <PanelBody
      bar={
        <Toolbar label="console">
          <Badge tone={ed.log.some(l => l.level === 'error') ? 'danger' : undefined}>{ed.log.filter(l => l.level === 'error').length} errors</Badge>
          <span className="ui-spacer" />
          <Button title="clear the console" onClick={() => ed.clearLog()}>Clear</Button>
        </Toolbar>
      }
    >
      {ed.log.length === 0 && <Empty>Nothing yet.</Empty>}
      {ed.log.map((l, i) => (
        <div key={i} className={`console-line ${l.level}`} role={l.level === 'error' ? 'alert' : undefined}>
          <span className="console-time">{time(l.at)}</span>
          {l.stack ? (
            <details>
              <summary>{l.message}</summary>
              {l.stack}
            </details>
          ) : (
            <span>{l.message}</span>
          )}
        </div>
      ))}
      <div ref={end} />
    </PanelBody>
  )
}
