// The editor's page: the menubar, the dock of panels, and the status bar. It turns on the editor's
// own commands (`shell/commands.ts`), handing them its dialogs, and the keys.
import { Dialog } from 'radix-ui'
import { useEffect, useState } from 'react'
import { EditorContext, useEditor } from './context.ts'
import type { Editor } from './editor.ts'
import { Dock } from './shell/dock.tsx'
import { shell, type ShellDialog } from './shell/commands.ts'
import { keyLabel, listen } from './shell/keys.ts'
import { MenuBar } from './shell/menubar.tsx'
import { GameList } from './shell/open.tsx'

function StatusBar() {
  const ed = useEditor(['game', 'log'])
  const s = ed.session
  const last = ed.log[ed.log.length - 1]
  return (
    <footer className="editor-status" aria-label="status">
      <span>{s ? s.game.name : ed.game ? `${ed.game.name}, not open` : 'no game open: File › Open Game…'}</span>
      {s && <span aria-label="current step">step {s.n} / {s.end}</span>}
      {s && <span>{s.playing ? 'playing' : 'paused'}</span>}
      <span className="ui-spacer" />
      {last && <span className={last.level === 'error' ? 'console-line error' : undefined}>{last.message}</span>}
    </footer>
  )
}

function Shell() {
  // The keys dialog lists the commands with a key.
  const ed = useEditor(['extensions'])
  // A page with no game shows the games to open.
  const [dialog, setDialog] = useState<ShellDialog | undefined>(ed.game ? undefined : 'open')

  useEffect(() => {
    ed.use('shell', e => shell(e, setDialog))
    const stop = listen(ed)
    return () => {
      stop()
      ed.drop('shell')
    }
  }, [ed])

  const open = async (name: string) => {
    setDialog(undefined)
    try {
      await ed.openGame(name)
    } catch (e) {
      ed.error((e as Error).message, (e as Error).stack)
    }
  }

  return (
    <div className="editor">
      <MenuBar />
      <Dock />
      <StatusBar />
      <Dialog.Root open={dialog !== undefined} onOpenChange={o => { if (!o) setDialog(undefined) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="ui-overlay" />
          <Dialog.Content className="ui-dialog" aria-describedby={undefined}>
            {dialog === 'open' && (
              <>
                <Dialog.Title className="ui-dialog-title">Open Game</Dialog.Title>
                <GameList onOpen={open} />
              </>
            )}
            {dialog === 'keys' && (
              <>
                <Dialog.Title className="ui-dialog-title">Keyboard Shortcuts</Dialog.Title>
                <div className="ui-grid">
                  {[...ed.commands.values()].filter(c => c.key).map(c => (
                    <div key={c.id} className="ui-grid-row">
                      <span>{c.title}</span>
                      <span className="ui-menu-key">{keyLabel(c.key!)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

export function App({ editor }: { editor: Editor }) {
  return (
    <EditorContext.Provider value={editor}>
      <Shell />
    </EditorContext.Provider>
  )
}
