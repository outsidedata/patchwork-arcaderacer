# chat

Text chat between players on four channels: zone (everyone in this scene), global (every live copy
of the scenes listed), party (the speaker's party) and whisper (one account). Rate-limited, kept as
short rings of lines on rows, with private channels sent only to their reader, and a chat box drawn
on ui's panels with channel tabs, a log and a text entry.

## Why use it

Use chat for a multiplayer game where players type to each other: an MMO-style chat window, party
chat, whispers, a lobby. It runs on the server so nobody can fake another's line, keeps every line a
seat may not read off that seat's packets, and sends one line per message, never the whole log.

## How it works

**Server half (`chat.sim.ts`).** `chat(post, members)` hands back two kinds, `chat` and `chatbox`.
It takes `post` (mail an act to a row in another truth) and `members` (an account's party) as
parameters, since one plugin never imports another; the game's sim hands both in.

- One `chat` row per truth (an `actors` entry of every scene that talks, and of the hub) holds
  `channels.zone` and `channels.global`, each a ring `{ seq, lines }` of the last `keep` lines. A
  line is `{ from, account, text, n }`. Adding a line adds one key and deletes the one `keep` behind,
  so only that line is sent.
- `party` and `whisper` lines go on a `chatbox` row of the reading account (spawned the first time a
  line reaches it, ended when the account leaves). Its `owner` is the account's player row, so a
  scene whose `security` lists `chatbox: { channels: 'me' }` sends every other seat the chatbox
  without its lines.
- `say(channel, text, to?, toName?)` is `open`. It is dropped unless the channel is in the row's
  `talk`, the text is a non-blank string of at most `length` characters, and the seat is within its
  rate: `burst` lines at once, then one every `rate.gap` steps.
- The speaker is the row of `who.kind` whose `who.seat` field is the sending seat; its `who.account`
  and `who.name` fields name it.
- zone lines go on this truth's chat row; whisper lines are posted to the account and echoed on the
  speaker's chatbox with `to`; party and global lines are posted to the hub's chat row as `relay`,
  which posts `hear` to every party member, or to every live copy of each scene in `scenes`.

**Browser half (`chat.plugin.ts`).** In its `afterTick` it draws on ui's panels: `chat.tabs` (a
button per channel of `talk`), `chat.log` (the last `page.lines` lines of the open channel; a tap on
a line opens a whisper to its speaker) and `chat.entry` (the channel label and ui's text entry; Enter
sends `say`). Its layout numbers are the row's `page: { lines, height, tab, label, entry }` and its
styles are ui's (`chat.tab`, `chat.tab.on`, `chat.<channel>`, `chat.label`, `chat.entry`). With party
or whisper in `talk` and no `security.chatbox.channels`, it throws rather than send every whisper to
every seat. `plugins.chat.whisper(account, name)` opens the whisper channel to someone.

## Using it

1. In the game's sim, make the kinds with `chat(post, members)`, handing it the game's mail between
   truths and party's members.
2. List `chat` before `ui` in `plugins` (after it, its `afterTick` throws), add a `chat` row to
   `actors`, and give its prefab `talk`, `keep`, `length`, `rate: { gap, burst }`, `who: { kind,
   seat, account, name }`, `hub`, `scenes`, `page`, `channels`, `next: {}` and `n: 0`.
3. Give ui's prefab the `chat.tabs`, `chat.log` and `chat.entry` panels and the chat styles.
4. For party or whisper, list `chatbox: { channels: 'me' }` in the scene's `security`.

## Plugins it works with

- **ui**: chat draws its tabs, log and entry on ui's panels with ui's styles, and calls
  `ui.entry(panel, key, { max, style })` for its line of text entry.
- **party**: `members(w, account)` reads the hub's party rows; chat's mod `chat.party.ts`
  (`world.party.mods.whisper: 'chat'`) lets a tap on a name in party's frames open a whisper.
- **player**: a `player` row usually stands for the seat (`who`), keeping the seat number its
  `arrive` act was handed.

## Keywords

chat, text chat, chat box, chat window, messages, say, whisper, private message, DM, party chat,
global chat, zone chat, local chat, channels, tabs, multiplayer, MMO, lobby, rate limit, spam,
flood, security, private fields, hub, mail between scenes, cross-server, `say`, `whisper`,
`chatbox`
