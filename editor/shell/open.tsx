// The games there are to open, as the server lists them now, the one this editor is on marked. A
// game older than the scenemanager pattern is listed and cannot be opened.
import { useEffect, useState } from 'react'
import { useEditor } from '../context.ts'
import { Badge, Button, Note } from '../ui/layout.tsx'

export function GameList({ onOpen }: { onOpen(name: string): void }) {
  // A game opening is `busy`.
  const ed = useEditor(['game'])
  const [games, setGames] = useState<{ name: string; opens: boolean }[] | undefined>()
  const [error, setError] = useState<string | undefined>()
  useEffect(() => {
    let on = true
    ed.files.games().then(g => { if (on) setGames(g) }, e => { if (on) setError((e as Error).message) })
    return () => { on = false }
  }, [ed])
  if (error) return <Note>{error}</Note>
  if (!games) return <Note>Listing the games…</Note>
  return (
    <ul className="ui-games" aria-label="games">
      {games.map(g => (
        <li key={g.name}>
          <Button primary={ed.game?.name === g.name} disabled={!g.opens || ed.busy} onClick={() => onOpen(g.name)} title={`open ${g.name}`}>
            {g.name}
          </Button>
          {!g.opens && <Badge tone="dim">not on the scenemanager pattern</Badge>}
        </li>
      ))}
    </ul>
  )
}
