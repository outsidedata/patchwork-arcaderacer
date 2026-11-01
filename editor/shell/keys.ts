// The commands' keys, on the whole page but for two places: a key typed into a field is the
// field's, and a key pressed while the game's stage has the focus is the game's.
import type { Editor, Plain } from '../editor.ts'

// A key as commands name it: `Mod+Shift+Z`, `Space`, `.`.
export function named(e: KeyboardEvent): string {
  const mac = navigator.platform.startsWith('Mac')
  const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key
  return [(mac ? e.metaKey : e.ctrlKey) && 'Mod', e.shiftKey && 'Shift', e.altKey && 'Alt', key].filter(Boolean).join('+')
}

// A key as a menu shows it.
export const keyLabel = (key: string) =>
  key.replace('Mod+', navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl+').replace('Shift+', '⇧').replace('Alt+', '⌥')

// Runs a command as a menu item or a key runs it, as a call does (`Editor.call`): what it throws is
// written to the console, since no caller is there to be handed it, unless the console has it
// already, as it has a write of the editor's that failed (`Editor.said`).
export function press(ed: Editor, c: Plain) {
  ed.call(c.id).catch(e => { if (!ed.said(e)) ed.error(`${c.title}: ${(e as Error).message}`, (e as Error).stack) })
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')

export function listen(ed: Editor) {
  const down = (e: KeyboardEvent) => {
    if (typing(e.target) || (document.activeElement as HTMLElement | null)?.closest('.game-stage')) return
    const key = named(e)
    for (const c of ed.commands.values()) {
      if ('input' in c || c.key?.toUpperCase() !== key.toUpperCase() || (c.enabled && !c.enabled())) continue
      e.preventDefault()
      press(ed, c)
      return
    }
  }
  addEventListener('keydown', down)
  return () => removeEventListener('keydown', down)
}
