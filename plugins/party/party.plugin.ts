// The browser half of parties: a frame for each other member of the seat's party, and the prompt for
// an invite waiting for it, drawn in its `afterTick` on ui's panels from the `parties` row, the seat's
// own `partyseat` and the `partymirror` holding its account (`party.sim.ts`). It has no numbers of its
// own: the row carries the prefab's `page`, `{ stride, name, zone, bar, kick, promote, leave, prompt:
// { name, accept, decline } }`, each an `[x, y]` but `stride`, and the panels and styles are ui's
// prefab.
//
// The seat's own account is its `partyseat`'s, the one whose `account` it was sent: the scene's
// `security` lists `partyseat.account` and `partyseat.invite`, so no seat is sent another's. With no
// such listing every seat would be sent every seat's, so it throws.
//
// The panels, each a panel of ui's prefab:
//   party.frames   for each other member, by the order they joined, `page.stride` pixels below the one
//                  before: at `page.name` their name in the style `party.name`, or `party.leader` for
//                  the leader, which a tap on whispers them when the scene names a `whisper` (Whisper,
//                  below); at `page.zone` the truth they are in, in the style `party.zone`; at
//                  `page.bar` their life, a ui `bar` of the style `party.life` filled in its `fill`.
//                  While the seat leads, at `page.kick` and `page.promote` of each frame a button of
//                  the style `party.kick` and `party.promote` (a `button` options object with its
//                  label), sending `kick` and `promote` for that member. At `page.leave`, a button of
//                  the style `party.leave` that sends `leave`.
//   party.invite   while an invite waits: at `page.prompt.name` the inviter's name in the style
//                  `party.prompt`, and at `page.prompt.accept` and `page.prompt.decline` buttons of the
//                  styles `party.accept` and `party.decline` that send `accept` and `decline`.
// A panel the prefab makes `modal` has the input while it shows the prompt, as any ui modal does.
//
// `invite(account)` sends an invite for that account, for another plugin's page half or an actor to
// call when the player picks someone. It does nothing before the first packet holds a `parties` row.
//
// Whisper. A tap on a member's name hands their account and name to the scene's `whisper`, the mod
// `world.party.mods.whisper` names (`addons/scenemanager`'s Mods): `{ whisper: 'chat' }` opens chat's
// whisper channel to them (`plugins/chat/chat.party.ts`). With none named the name is only a name:
// it takes no tap and shows no pointer over it. The mod hands on what its plugin's page half holds,
// so a scene that names one and does not list its plugin throws in the `afterTick` (`provided`).
//
// The order: listed before `ui`, whose `afterTick` draws what this shows in its own; listed after it,
// its afterTick throws.
import type * as PIXI from 'pixi.js'
import type { Plugins } from '#engine/browser.ts'
import { mod, provided } from '#addons/scenemanager/scenemanager.addon.ts'
import type { Party } from './party.sim.ts'

// What the scene's `whisper` is asked with: the page's plugins, and the account and name of the
// member tapped.
export type Whisper = (plugins: Plugins, account: string, name: string) => void

export function party() {
  let send: ((act: string, ...args: string[]) => void) | undefined

  const me = {
    invite(account: string) { send?.('invite', account) },
    afterTick(plugins: Plugins) {
      const order = plugins.wire.scene.plugins ?? []
      if (order.includes('ui') && order.indexOf('ui') < order.indexOf('party')) throw new Error('party is listed after ui')
      provided(plugins.wire.scene, 'party', 'whisper')
      const rows = plugins.wire.rows
      const door = rows.find(r => r.kind === 'parties')
      if (!door) return
      send = (act, ...args) => plugins.wire.send(door.id, act, ...args)
      const ui = plugins.ui
      if (!ui) throw new Error('party draws on ui\'s panels, and the scene lists no ui')
      const listed = (plugins.wire.scene.security as any)?.partyseat
      if (!listed?.account || !listed?.invite) throw new Error('party needs the scene\'s security to list partyseat account and invite, so no seat is sent another\'s')
      const seat = rows.find(r => r.kind === 'partyseat' && 'account' in r.data)
      if (!seat) return
      const page = door.data.page, mine: string = seat.data.account
      const { Container, Text } = ui.PIXI as typeof PIXI
      const at = <T extends PIXI.Container>(c: T, [x, y]: number[], dy = 0) => { c.position.set(x, y + dy); return c }

      const inv = seat.data.invite
      if (inv) {
        at(ui.show('party.invite', 'name', () => new Text({ text: '', style: ui.style('party.prompt') })), page.prompt.name).text = inv.name
        at(ui.show('party.invite', 'accept', () => ui.button(ui.style('party.accept')).on('pointertap', () => send!('accept'))), page.prompt.accept)
        at(ui.show('party.invite', 'decline', () => ui.button(ui.style('party.decline')).on('pointertap', () => send!('decline'))), page.prompt.decline)
      }

      const p: Party | undefined = rows.find(r => r.kind === 'partymirror' && mine in r.data.members)?.data
      if (!p) return
      const leads = p.leader === mine
      at(ui.show('party.frames', 'leave', () => ui.button(ui.style('party.leave')).on('pointertap', () => send!('leave'))), page.leave)
      const others = Object.entries(p.members).filter(([a]) => a !== mine).sort((a, b) => a[1].joined - b[1].joined)
      others.forEach(([account, m], i) => {
        const dy = i * page.stride
        const lead = account === p.leader
        const frame = ui.show('party.frames', `${account}:${lead}`, () => {
          const f = new Container()
          const name = new Text({ text: '', style: ui.style(lead ? 'party.leader' : 'party.name') })
          const whisper = mod<Whisper>(plugins.wire.scene.world!, 'party', 'whisper')
          if (whisper) {
            name.eventMode = 'static'
            name.cursor = 'pointer'
            name.on('pointertap', () => whisper(plugins, account, name.text))
          }
          at(name, page.name)
          const zone = new Text({ text: '', style: ui.style('party.zone') })
          at(zone, page.zone)
          const life = ui.bar(ui.style('party.life'))
          at(life, page.bar)
          f.addChild(name, zone, life)
          return f
        })
        frame.position.set(0, dy)
        const [name, zone, life] = frame.children as [PIXI.Text, PIXI.Text, PIXI.Container & { set(k: number, fill: unknown): void }]
        name.text = m.name
        zone.text = m.zone
        life.set(m.life, ui.style('party.life').fill)
        if (!leads) return
        at(ui.show('party.frames', `kick:${account}`, () => ui.button(ui.style('party.kick')).on('pointertap', () => send!('kick', account))), page.kick, dy)
        at(ui.show('party.frames', `promote:${account}`, () => ui.button(ui.style('party.promote')).on('pointertap', () => send!('promote', account))), page.promote, dy)
      })
    },
  }
  return me
}
