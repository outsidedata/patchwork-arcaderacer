// File, Edit, View, Game and whatever menus the extensions' commands name, then Help. Every item
// is a command, shown with its key, run as its key runs it (`press`). Whether an item is enabled is
// its command's to say (`enabled`), from whatever it reads, an extension's own state too, so it is
// asked again each time a menu opens, and while one is open for every change of every topic.
import { Menubar } from 'radix-ui'
import { useEffect, useState } from 'react'
import { useEditor } from '../context.ts'
import type { Plain } from '../editor.ts'
import { keyLabel, press } from './keys.ts'

const FIRST = ['File', 'Edit', 'View', 'Game']
const LAST = ['Help']

export function MenuBar() {
  const ed = useEditor(['extensions', 'theme'])
  const [open, setOpen] = useState('')
  // While a menu is open, every change, an extension's own too, draws it again.
  const [, redraw] = useState(0)
  useEffect(() => {
    if (!open) return
    return ed.subscribe(() => redraw(n => n + 1))
  }, [ed, open])
  const byMenu = new Map<string, (Plain & { owner: string })[]>()
  for (const c of ed.commands.values()) if (!('input' in c) && c.menu) byMenu.set(c.menu, [...(byMenu.get(c.menu) ?? []), c])
  const names = [...FIRST, ...[...byMenu.keys()].filter(m => !FIRST.includes(m) && !LAST.includes(m)).sort(), ...LAST]
  return (
    <Menubar.Root className="ui-menubar" value={open} onValueChange={setOpen}>
      {names.map(name => {
        const items = byMenu.get(name) ?? []
        const panels = name === 'View' ? [...ed.panels.values()] : []
        if (!items.length && !panels.length) return null
        return (
          <Menubar.Menu key={name} value={name}>
            <Menubar.Trigger className="ui-menu-trigger">{name}</Menubar.Trigger>
            <Menubar.Portal>
              <Menubar.Content className="ui-menu" align="start" sideOffset={4}>
                {items.map((c, i) => (
                  <div key={c.id}>
                    {i > 0 && items[i - 1].owner !== c.owner && <Menubar.Separator className="ui-menu-separator" />}
                    <Menubar.Item className="ui-menu-item" disabled={c.enabled ? !c.enabled() : false} onSelect={() => press(ed, c)}>
                      {c.title}
                      {c.key && <span className="ui-menu-key">{keyLabel(c.key)}</span>}
                    </Menubar.Item>
                  </div>
                ))}
                {panels.length > 0 && (
                  <>
                    {items.length > 0 && <Menubar.Separator className="ui-menu-separator" />}
                    {panels.map(p => (
                      <Menubar.Item key={p.id} className="ui-menu-item" onSelect={() => ed.reveal(p.id)}>
                        {p.title}
                      </Menubar.Item>
                    ))}
                    <Menubar.Separator className="ui-menu-separator" />
                    <Menubar.Sub>
                      <Menubar.SubTrigger className="ui-menu-item">Theme</Menubar.SubTrigger>
                      <Menubar.Portal>
                        <Menubar.SubContent className="ui-menu">
                          <Menubar.RadioGroup value={ed.theme} onValueChange={t => ed.setTheme(t)}>
                            {[...ed.themes.keys()].map(t => (
                              <Menubar.RadioItem key={t} value={t} className="ui-menu-item">
                                <span className="ui-menu-check">{ed.theme === t ? '•' : ''}</span>
                                {t}
                              </Menubar.RadioItem>
                            ))}
                          </Menubar.RadioGroup>
                        </Menubar.SubContent>
                      </Menubar.Portal>
                    </Menubar.Sub>
                  </>
                )}
              </Menubar.Content>
            </Menubar.Portal>
          </Menubar.Menu>
        )
      })}
    </Menubar.Root>
  )
}
