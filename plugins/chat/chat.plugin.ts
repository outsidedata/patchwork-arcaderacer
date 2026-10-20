// The browser half of chat: channel tabs, the lines of the open channel, and a line of text entry,
// all drawn in its `afterTick` on ui's panels from the `chat` row and the seat's own `chatbox`
// (`chat.sim.ts`). It has no numbers of its own: the row carries the prefab's `page`, `{ lines,
// height, tab, label, entry }`, and the panels and styles are ui's prefab.
//
// The panels, each a panel of ui's prefab:
//   chat.tabs    a button per channel of the row's `talk`, `page.tab` pixels apart across, labelled
//                with the channel's name, in the style `chat.tab`, and the open one in `chat.tab.on`
//                (each a `button` options object without its label); a tap opens that channel.
//   chat.log     the last `page.lines` lines of the open channel, oldest at the top, `page.height`
//                pixels apart, `from: text`, or `→name: text` for a whisper the seat sent, in the
//                style `chat.<channel>`. A tap on a line opens the whisper channel to its speaker, or
//                to whoever a whisper the seat sent went to.
//   chat.entry   at `page.label` the channel a line goes on, `[zone]`, or the name a whisper goes to,
//                in the style `chat.label`; at `page.entry` the text entry, `ui.entry(panel, key,
//                { max, style })` with the row's `length` for `max` and the style `chat.entry`. A line
//                the player sends from it is sent at the chat row as `say` on the open channel, a
//                whisper with the account and name it goes to; a whisper with nobody to go to is not
//                sent.
// The zone and global lines are the chat row's, and the party and whisper lines the seat's own
// chatbox's, which it is sent only when the scene's `security` lists `chatbox.channels` (`chat.sim.ts`):
// with party or whisper in `talk` and no such listing, every seat would be sent every whisper, so it
// throws. The channel open at first is the first of `talk`.
//
// `whisper(account, name)` opens the whisper channel to that account, for another plugin's page half
// to call when the player picks someone: party's frames call it through chat's mod for party,
// `chat.party.ts`, when the scene names it in `world.party.mods.whisper`.
//
// The order: listed before `ui`, whose `afterTick` draws what this shows in its own; listed after it,
// its afterTick throws.
//
// The text entry is the ui plugin's `entry(panel, key, { max, style })`, shown every frame as `show`
// is, handing back a PIXI.Container to place with `take()`, the line the player sent with Enter since
// the last frame, once, or undefined.
import type * as PIXI from 'pixi.js'
import type { Plugins } from '#engine/browser.ts'
import type { Line, Ring } from './chat.sim.ts'

export type Entry = PIXI.Container & { take(): string | undefined }

const PRIVATE = ['party', 'whisper']

export function chat() {
  let tab: string | undefined
  let to: { account: string; name: string } | undefined

  const me = {
    whisper(account: string, name: string) {
      to = { account, name }
      tab = 'whisper'
    },
    afterTick(plugins: Plugins) {
      const order = plugins.wire.scene.plugins ?? []
      if (order.includes('ui') && order.indexOf('ui') < order.indexOf('chat')) throw new Error('chat is listed after ui')
      const row = plugins.wire.rows.find(r => r.kind === 'chat')
      if (!row) return
      const ui = plugins.ui
      if (!ui) throw new Error('chat draws on ui\'s panels, and the scene lists no ui')
      const d = row.data, talk: string[] = d.talk
      if (talk.some(c => PRIVATE.includes(c)) && !(plugins.wire.scene.security as any)?.chatbox?.channels)
        throw new Error('chat talks on party or whisper, and the scene\'s security lists no chatbox channels to keep them to their reader')
      const open: string = tab = tab && talk.includes(tab) ? tab : talk[0]
      const { Text } = ui.PIXI as typeof PIXI

      talk.forEach((c, i) => {
        const on = c === open
        const b = ui.show('chat.tabs', `${c}:${on}`, () => ui.button({ ...ui.style(on ? 'chat.tab.on' : 'chat.tab'), label: c }).on('pointertap', () => { tab = c }))
        b.position.set(i * d.page.tab, 0)
      })

      const box = plugins.wire.rows.find(r => r.kind === 'chatbox' && 'channels' in r.data)
      const ring: Ring | undefined = PRIVATE.includes(open) ? box?.data.channels[open] : d.channels[open]
      const lines = Object.entries(ring?.lines ?? {}).sort((a, b) => +a[0] - +b[0]).slice(-d.page.lines)
      lines.forEach(([seq, line]: [string, Line], i) => {
        const t = ui.show('chat.log', `${open}:${seq}`, () => {
          const t = new Text({ text: line.to ? `→${line.to.name}: ${line.text}` : `${line.from}: ${line.text}`, style: ui.style(`chat.${open}`) })
          t.eventMode = 'static'
          t.cursor = 'pointer'
          return t.on('pointertap', () => { const o = line.to ?? { account: line.account, name: line.from }; me.whisper(o.account, o.name) })
        })
        t.position.set(0, i * d.page.height)
      })

      const label = ui.show('chat.entry', 'label', () => new Text({ text: '', style: ui.style('chat.label') }))
      label.position.set(d.page.label[0], d.page.label[1])
      label.text = open === 'whisper' ? `[${to?.name ?? ''}]` : `[${open}]`
      const entry: Entry = ui.entry('chat.entry', 'line', { max: d.length, style: 'chat.entry' })
      entry.position.set(d.page.entry[0], d.page.entry[1])
      const text = entry.take()
      if (text === undefined) return
      if (open !== 'whisper') plugins.wire.send(row.id, 'say', open, text)
      else if (to) plugins.wire.send(row.id, 'say', 'whisper', text, to.account, to.name)
    },
  }
  return me
}
