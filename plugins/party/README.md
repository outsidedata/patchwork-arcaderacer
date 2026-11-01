# party

Parties of players across scenes: invite, accept, decline, leave, kick and promote, held in the hub
and mirrored into every scene a member is in, with frames for each other member (name, zone, life
bar, leader, kick and promote buttons) and an invite prompt drawn on ui's panels, and a key a party's
dungeons are instanced by.

## Why use it

Use party for a co-op or MMO-style game where players group up: see your party's health and where
they are, invite someone, hand over the lead, enter a dungeon instance together. The hub decides
every change, so two scenes never disagree about who is in a party, and each seat is sent its own
account and invite only.

## How it works

**Server half (`party.sim.ts`).** `party(post, here)` builds the kinds, handed the game's mail
between truths and the truth's own name, since one plugin never imports another.

- `parties`: one per truth (an `actors` entry of every scene a party is made in, and of the hub). It
  is the door: every party act is sent at it and party mail lands on it. Its prefab holds `hub`,
  `prefix`, `max`, `invite` (hub steps an invite waits), `grain` (the step a member's life fraction
  is rounded to), `rate`, `who`, `page`; it counts its own steps in `n`, and in the hub holds
  `invites`.
- `party`: in the hub, one per party, `{ key, leader, members }`, each member `{ name, zone, life,
  joined }`. `key` is `prefix` and the row's id.
- `partymirror`: in a member's truth, the same three fields as the hub last mailed them.
- `partyseat`: one per account here, `{ account, invite }`, owned by the account's player row, so a
  scene whose `security` lists `partyseat: { account: 'me', invite: 'me' }` sends each seat only its
  own.

The open acts `invite(account)`, `accept()`, `decline()`, `leave()`, `kick(account)` and
`promote(account)` are rate-limited per seat and mailed to the hub as `ask(...)`, which refuses what
it must (inviting yourself, a full party, a non-leader inviting), keeps invites, makes parties,
hands the lead to the earliest joiner when the leader goes, and disbands a party of one. Each truth
mails each member's zone and rounded life when they change. Every change mails `mirror(json)` to each
member's truth.

For rules: `partyOf(w, account)`, `members(w, account)`, `mates(w, account)` (the other members' rows
here) and `instance(w, account)` (a dungeon's instance key: the party's key, or the account alone).

**Browser half (`party.plugin.ts`).** In its `afterTick` it draws on ui's panels: `party.frames` (a
frame per other member by join order, `page.stride` apart: name or leader style, zone, a life `bar`,
and for the leader `kick` and `promote` buttons, plus `leave`) and `party.invite` (the inviter's name
with accept and decline). `plugins.party.invite(account)` sends an invite. A tap on a member's name
hands their account and name to the `whisper` mod. It throws when the scene's security does not keep
`partyseat` to its seat.

## Using it

1. In the game's sim, build the kinds with `party(post, here)`.
2. List `party` before `ui` in `plugins`; add a `parties` row to every scene parties are made in and
   to the hub, its prefab with `hub`, `prefix`, `max`, `invite`, `grain`, `rate: { gap, burst }`,
   `who: { kind, seat, account, name, life, most }` and `page`.
3. List `partyseat: { account: 'me', invite: 'me' }` in the scene's `security`.
4. Give ui's prefab the `party.frames` and `party.invite` panels and the party styles.
5. Name `world.party.mods: { whisper: 'chat' }` to whisper a member from their frame.

## Plugins it works with

- **chat**: its party channel reads `members`; chat's mod `chat.party.ts` is the `whisper` a tap on a
  name opens.
- **ui**: the frames, bars, buttons and prompt are drawn on its panels.
- **player**: a seat's `player` row is usually the `who` that stands for it.
- **scenemanager**: the hub, the truths, and mail between them.

## Keywords

party, group, squad, team up, co-op, MMO, invite, accept, decline, leave party, kick, promote,
leader, party frames, raid frames, health bars, party members, dungeon instance, instancing,
cross-scene, hub, mail between truths, security, private fields, whisper, `invite`, `members`,
`mates`, `instance`, `partyOf`
