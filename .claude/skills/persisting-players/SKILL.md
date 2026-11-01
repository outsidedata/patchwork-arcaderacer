---
name: persisting-players
description: Use in core, or any clone of it, when a game needs to know who a player is or keep something for them between visits. That covers accounts, register, log in, passwords, a token that logs a reloaded page back in, a login screen, logged out elsewhere, saving progress, a character's level, inventory or score kept per account and copied onto the seat's `player` row while it plays, records that survive a server restart, and the database behind them (sqlite on node, IndexedDB in a tab). It covers the `accounts` addon (`accounts`, `signin`, `login`, `register`, `relogin`, `who`, `local`, its refusals), the `persist` addon and kind (`persist`, `claim`, `flush`, `sqlite`, `indexeddb`, `urgent`, `forget`), `world.accounts` and `world.persist`, and the one addon call `gameFiles` writes into every game's pages to take them. It also says why the store and `plugins/local` keep nothing. Also use it when a count resets after a restart, a record never loads, or a login screen throws "this link was not made on a signin wire".
---

# Persisting players

Who a player is and what is kept for them are two truths outside the rows, so each is an addon
(prime directive, question 5: connections, files). `accounts` (`addons/accounts/accounts.addon.ts`)
settles who a connection is at the connection, before anything it sends reaches a truth. `persist`
(`addons/persist/persist.addon.ts`) keeps the rows of a few kinds, the records, in a store beside a
truth: it loads them into the truth as rows and writes them back as they change. Its rule side is the
`persist` kind and `claim` (`plugins/persist/persist.sim.ts`). The engine saves and loads nothing, and
nothing here edits `engine/`. Each addon takes its truth, runs where that truth is, knows no game and
no kind, and imports from `engine/` and other addons, never from `games/`.

Several pieces this work needs are not in core yet: they are listed in the work below, each with its
home and its test. Building them there is part of the job (prime directive, When something is
missing), and so is migrating code that breaks the directive where the job meets it (When old code
disagrees): every file that uses it and every test. A line that would tell a game to add a guard,
keep a layout, or never hand an addon a copy, so that core does not break, means core is missing a
piece: that piece is built in core, and the line is never written, in this skill or in a game.

## When it applies

It applies to logging a player in, keeping an account's things from one visit to the next and across
a restart of the server, the login screen, and the lines of the server file and the pages that take
them. It does not cover:

- running the server for other people, seats, what each seat is sent (a `security` block, vision),
  what a seat may send: `going-multiplayer`.
- putting the game where players on other machines reach it, and serving `wss://` so a secret does
  not cross the network as it was typed: `publishing-a-game`.
- the files a new game starts with: `starting-a-game`. Moving seats between scenes, `go` and
  `arrive`: `scene-flow`. A record kind's own rules beyond being kept: `designing-a-kind`. Keys a
  player rebinds: `input-and-seats`. A panel and its words: `building-the-hud`.

Two things keep nothing for a player:

- The store (question 2). A key of the store is a value only the page uses: a volume, a theme,
  rebound keys. The server never reads it, writes it or is sent it. It lives on the page's link
  (`link.store`, `plugins/store/store.plugin.ts`) for as long as the page is open: every scene of the
  page reads one table, and a reload starts it again from the scene's starting values (`world.store`,
  once the store's read of a `store` prefab is moved there, `building-the-hud` step 9). Anything a rule
  reads, and anything kept for an account, is never a key of the store.
- `plugins/local` is the page's actors with no row. It keeps nothing.

## Who a player is

`accounts(accept(row), store, rules)` wraps the scenemanager's `accept` and hands back one of the
same shape for `serve`. Each connection is handed to the wrapped `accept` at once, so it is seated on
the entry scene and sent its packets from the first step, logged in or not: the entry scene draws the
login screen. The addon answers every ask to log in itself and passes none on. Every other up of a
connection that is not logged in is dropped, with no answer and no throw.

The page asks through its link: `login(link, name, secret)`, `register(link, name, secret)`, and
`relogin(link)` with the token of an earlier login. Each returns `{ account }` or `{ why, wait? }`,
one at a time. `why` is `wrong` (no account has that name and secret, one answer for both), `taken`,
`name` or `secret` (register, against the rules), `token` (unknown or expired; the page forgets it),
`slow` (too many asks; `wait` is the milliseconds until one more), `busy`, `signed` (logged in
already), `down` (the store failed), `elsewhere`, or `closed` (the page's link closed while it asked).
A login screen has words for each. `who(link)` is the account uid the page is logged in as, or
undefined.

`elsewhere` comes unasked, with `ask: 0`, when the account logs in on another connection: this
connection is logged out and its seat let go, and nothing more is sent on its link, so the page goes
on drawing the last frame of whatever scene it was on. Every scene the seat can be on therefore lists
one piece that notices `who(link)` turn undefined, says the account was logged in elsewhere, and
offers to log in again; logged in again, the connection is seated on the entry scene anew. The piece
lives in the browser and names no game, so it is a plugin's browser half (question 4), its words on
`world.<plugin>`. It asks `relogin` or `login` when the player says so, never by itself: two tabs of
one browser hold one kept token, and each asking as soon as it is let go would log the other out in
turn, for ever.

A name is folded (NFKC, lower case) before anything reads it. The secret is hashed with scrypt under
a salt of the account's own and let go: it is in no row, record, log or error. A token logs in once
and is replaced; the store keeps only its SHA-256. The store's records of the addon are `account` and
`session`, kinds no game names.

The rules never change while the game runs and no row is made from them, so they are fixed data of
the scene: `world.accounts` in the manager scene file (question 1), never a prefab. `name`
`{ min, max, pattern }`, `secret` `{ min, max }`, `scrypt` `{ N, r, p, keylen, salt }`, `token`
`{ bytes, ttl }`, `limit` `{ connection, name, window }`. `accounts` checks them when it is called and
throws on one that is wrong. A child's `world` is the manager's with its own keys over it, key by key
(`child` in `addons/scenemanager/scenemanager.addon.ts`), so a login screen reads the same rules off
`plugins.wire.scene.world.accounts` and can tell a player a name is too short before it asks. The
accounts addon's header and its error for missing rules still name a manager prefab, and its test
puts the rules in `prefabs`: they move to `world.accounts` with the work that meets them.

The page's side. `signin(wire, keep?)` wraps the page's wire before `link` is handed it: it takes the
answers off the wire and puts a door on the link, which `login`, `register`, `relogin` and `who` use.
`who` on a link made without `signin` throws `this link was not made on a signin wire`. `keep` is
where the token lives between loads of the page, `{ get(), set(token | null) }`; without one a reload
asks for the secret again. Core ships no `keep` over the browser's storage: it is built in the
accounts addon's page side, beside `signin`, tested in `addons/accounts/accounts.addon.test.ts`. It
is handed a name read off the scene file, as `indexeddb` is handed the persist `file`: every game
`yarn dev` serves is on one origin, `localhost:5173`, so a key of one name would be every game's
token. A page given a `keep` goes with the logged-out-elsewhere plugin (above), or whatever piece
lets the seat go cleanly, in every scene its seat can reach, and one is never added without the
other: with a kept token a second tab of the same browser logs the account in again, the first is
told `elsewhere`, and a scene with nothing to notice it freezes on its last frame.

`local(accept)` is `index.html`'s: one tab holding the page and every truth, no password and no store.
Every connection is logged in at once as `LOCAL`, the string `'local'`, and every ask is answered with
it. Records filed under it are in IndexedDB, which belongs to the page's origin, so every tab of the
game on that origin shares them.

### What a truth knows of the account

Today, nothing from the server. `account(seat)` and the `logged` callback of `accounts` and `local`
hand the account to whoever made the `accept`, and nothing in core reads them: the scenemanager never
tells a truth which account a seat is, though the accounts header says the manager reads it from
either. An account a page sends in an act is the page's word. Any logged-in player who learns another
account's uid sends it as their own and takes that account's records, and on a server any seat can
send `'local'`. Checking the word's shape in the game changes nothing about whose word it is; it is a
workaround in the game, which the directive rules out.

So the account is handed to the seat on the server, built in its home. It is handed down with the
seat: carried in what an `accept` is called with, beside `send`, filled in by `accounts` as the
connection logs in and by `local` at once, and passed down by each to the `accept` it wraps, so every
wrapper between the transport and the scenemanager hands it on. It is never found by object identity
with `account(seat)`, a `WeakMap` keyed by the seat object (`told` in
`addons/accounts/accounts.addon.ts`), which every wrapper that makes a seat of its own loses. The
scenemanager's `connection` hands it on to the seat it makes on each scene, so that the rules of
every scene the seat enters read its account, written by the server and by no act a page can send:
on the seat's `player` row where the scene lists `player`. It is tested in
`addons/accounts/accounts.addon.test.ts` and `addons/scenemanager/scenemanager.addon.test.ts`, a
wrapper between the two among the cases, and the accounts header's line about the manager is made
true in the same change.

Rules then read the account the server handed the seat; the login screen's act carries none, and
neither does `arrive`. In the change that builds the hand-off, every game in `games/` whose login act
or `arrive` takes an account from its args moves to the server's account: the act and `arrive` carry
no account, and their headers and tests follow. A change to the scene files alone leaves the hole
open, since `go` is open and `arrive` writes what its args say.

A record's fields that only its owner may see are listed in the scene's `security` block under `me`,
the record owned by the account's `player` row (`addons/player/player.addon.ts`); the `player` prefab
then carries `masks: []`. A claimed record is spawned outside every hook, so the player addon gives
it no owner of this boot: it arrives with the `owner` it was written with, or none, and the rule that
claimed it writes its owner. What an `owner` from another boot does today, and where that is
handled, is under What is kept.

## What is kept

The manager scene file declares it, and every child inherits it. What never changes is
`world.persist` (question 1):

- `kinds`: kind name to `{ key, load }`. `key` is the field of the row's data the record is filed
  under, `uid` for every record a game has. `load` is `boot`, every record of the kind loaded when the
  addon is attached (a market's listings in the scene that holds the market), or `claim`, records
  loaded when a rule asks (an account's things).
- `every`: the fewest steps between two writes of one row.
- `file`: the store's name, a database file on node and an IndexedDB database in a tab. Name it after
  the game: two games on one origin with one name share one database.
- `busy`: the milliseconds a write on node waits for another thread's.

The `persist` prefab holds only what changes, `{ "claims": {} }`, the table `claim` writes requests
into. Today the addon reads `kinds` and `every` off the `persist` row (`declared` in
`addons/persist/persist.addon.ts`), `claim` reads `kinds` off it (`plugins/persist/persist.sim.ts`),
and the header puts `file` and `busy` in the prefab. So the job that uses persist moves them to
`world.persist` first, in one change: the addon, `claim`, their headers and tests
(`addons/persist/persist.addon.test.ts`, `plugins/persist/persist.sim.test.ts`) and every game that
uses them. A child that loads a kind differently gives a `world.persist` of its own, whole, since a
child's `world` replaces the manager's key by key.

A scene that keeps records has one `persist` row, the actors entry `{ "is": "persist" }`, and its
sim imports the kind from `#plugins/persist/persist.sim.ts` and names it in `sim`. No file of the
game named `persist.sim.ts` hands it out: a file in a game folder named after a plugin is that
plugin row's (prime directive, Names and tests), and a game writes `<kind>.sim.ts` only for a kind
its `sim` names that is not a plugin's (the header of `addons/scenemanager/scenemanager.addon.ts`). A game that has
such a re-export holds old code, moved with the work that meets it. `persist` is not in the scene's
`plugins`: it has no browser half, and its row is sent to no seat. A declared kind the sim has no
code for is not that scene's to keep, so one declaration serves every child.

Today every scene with a `persist` row needs a prefab for every declared kind, its own or not:
`declared` in `addons/persist/persist.addon.ts` throws on a declared kind with no prefab before it
leaves out the kinds the scene's sim has no code for. Putting every record kind's prefab in the
manager scene file so it does not throw is a layout written to keep core from breaking, which is
core missing a piece: the job that uses persist builds `declared` so a scene asks a prefab only of the
kinds it keeps, while a declared kind that no scene of the manager makes is still refused as a
misspelling, with its test in `addons/persist/persist.addon.test.ts`. A record kind's prefab then
goes where any prefab goes (`designing-a-kind`).

A record is the row's whole `data` as JSON, filed under its kind and the value of its key. Records name
each other, and an account, by uid, never by a row id or a name: a row id is one truth's for one boot.
Whatever row id the row held is in the record all the same, its `owner` among them, naming a row of
a boot that is gone. Today the player addon reads that `owner` as a row of this boot (`hide` in
`addons/player/player.addon.ts`): one naming a row with no `masks` throws as the packet is made, and
one naming another seat's `player` row sends that seat the owner's fields. That is core missing a
piece, never a race for the rule that owns the row to win before a packet is made: the player addon
handles an `owner` a record brought from another boot, built there with its test in
`addons/player/player.addon.test.ts` when a job meets it. The rule that claimed the record then owns
it as it owns any row.

A rule never waits. `claim(w, kind, match)` writes a request onto the `persist` row. After that step
the addon holds the truth, its `advance` saying no, until the records are rows, and they are rows
from the next step on, found by `w.all(kind)` filtered by the match. A record already a live row of
the truth is not made again. So a rule claims on one step, keeps that it asked in a field of its row
(anything remembered between steps is a field), and reads on a later step; no row then means the
account has no record, and the rule spawns it. `claim` throws for a kind the scene does not load by
claim. At boot, a record of a `boot` kind is written over the scene's own actors entry of the same
key.

Writes go out after every step:

- a row that changed since it was last written, at most once per `every` steps; a row this truth
  spawned, in the step it was spawned, and one it loaded, not until it changes and then at once,
  whatever `every` says;
- a row whose data has `urgent: true` that step, whatever `every` says, the flag deleted. A rule sets
  it on every row a transfer touches, in the step it makes the transfer;
- a row that ended, written a last time, or its record dropped when its data has `forget: true`;
- every changed row when a seat has closed since the last step.

One step's writes are one batch, one transaction: a process killed while it writes leaves all of
that step's records or none. `persist(truth, store)` hands back `loaded()` and `flush()`, which writes
everything `every` held back and rejects when the store took not all. A load the store fails throws
out of the next step. The rows a record kind holds for an account end when the account leaves: the
kind's `before` ends its row once no `player` row holds its account, and the addon writes it a last
time.

A record row is storage and nothing else. What the seat controls, the character, the car, the hero,
is its `player` row (`designing-a-seat`), and the character's level, gold, inventory and place are
fields of that row while it plays. So the `player` row's `before` claims the account's record, on a
later step copies the record's fields onto itself, and from then plays on its own fields; each field
it keeps that changes is written back onto the record through an act of the record's kind that lists
no `open`, `w.call(record, 'keep', -1, ...)`, so persist writes the record as it changes. The record
row draws nothing, binds nothing and is read by no look: the HUD, the look and every rule that reads
the character read the `player` row.

There are two stores, five calls each (`load`, `save`, `drop`, `batch`, `close`): `sqlite(file, busy)`
on node, over `node:sqlite`, and `indexeddb(name)` in a tab. One store serves the accounts addon and
every truth of the process.

## The work, in order

1. **The manager scene**, `games/<game>/<game>.scene.json`: `world.accounts`, `world.persist`, the
   `persist` prefab `{ "claims": {} }`, and the login scene added to `scenemanager.scenes` and named
   as `entry`. A record kind's prefab goes where any prefab goes, once `declared` asks it only of the
   scenes that keep that kind. Where the addons still read these off prefabs, or `declared` still asks
   every scene for every kind's prefab, they are migrated first, as above.

2. **The account handed to the seat on the server**, in the accounts and scenemanager addons, as
   above, tested there, before any rule reads an account.

3. **The persist addon attached in one call.** Today `persist(truth, store)` takes one truth and
   throws unless it has exactly one `persist` row, so every page would carry a loop over the scenes,
   a rule in a page. The addon is handed the manager's row and the store and attaches itself to every
   scene with a `persist` row. Its node side, where `sqlite` runs, writes every held write and closes
   the store when the process is stopped (SIGINT, SIGTERM) before it goes. Its page side writes every held write when the tab is
   hidden (`visibilitychange`) or let go (`pagehide`). All of it is tested in
   `addons/persist/persist.addon.test.ts`, the stop as its kill test is, in a child process.

4. **The login screen**, a game's own actor on the entry scene (question 3): the scene's
   `<login>.scene.json` and `<login>.sim.ts` (scene and sim, as every child has), the kind's
   `login.sim.ts` and `login.client.ts`, its words and places in its definition in
   `assets/<game>.json`, drawn on a `ui` panel the scene's `world.ui` names.
   - `login.sim.ts` sends the seat on once the truth knows its account, with
     `w.call(w.find('scenemanager'), 'go', seat, def(w, me.kind).next)`. The next scene's name is the
     definition's, never a string in code.
   - `login.client.ts` asks `relogin` once while its link says it is not logged in; with no token, or
     one refused, it shows the form, and the words of each refusal. A row actor's module is kept by
     the page and handed to the row of the same id when the seat comes back, so `setup` starts its
     state over.
   - The form takes a typed name and secret and calls `register` or `login`. It is built on the ui
     plugin's text entry, `ui.entry(panel, key, { max, style })`, shown every frame as `show` is, whose
     `take()` hands back the line sent with Enter since the last frame, once, or undefined: the shape
     `plugins/chat/chat.plugin.ts` already calls, which `plugins/ui/ui.plugin.ts` does not have. It is
     built there, with a way to draw a secret masked, tested in `plugins/ui/ui.plugin.test.ts`.

5. **Logged out elsewhere**: the plugin every scene lists, as above, with its test beside it.

6. **The scene that keeps records.** Its scene file gets `{ "is": "persist" }`, and the `player`
   prefab gets the field that says it has asked and every field of the record it plays with (a
   level, gold, an inventory), at the values a new account starts with. Its sim names `persist` and
   each record kind, whose rule is `<kind>.sim.ts`. The `player` row's `before` claims the account's
   records; on a later step it copies the fields of the one it finds onto itself, or spawns the record
   from its own fields when there is none, and owns it. From then the `player` row plays on its own
   fields, and writes each change of a kept field back onto the record through the record kind's
   act, which lists no `open` (What is kept). A seat that sends that act at the record is refused, and
   it is no act of the `player` row, so a seat cannot send it there either. The scene's `security`
   block lists every field only the owner may see, on the record and on the `player` row alike.

7. **The pages take them in one call, the same in every game.** Every line of a page is the same in
   every game but the file names it imports (prime directive, Page), so what `world.accounts` and
   `world.persist` ask of `<game>.server.ts`, `index.html` and `client.html` is one addon call that
   `gameFiles` in `scripts/new-game.ts` writes into every game's pages. Handed the scene
   file, it does what those two blocks ask and nothing when a scene asks neither: it opens the store
   (`sqlite` on `world.persist`'s `file` and `busy` on node, `indexeddb` on its `file` in a tab),
   attaches the persist addon's one call on the manager, and wraps the seat's way in: `accounts` with
   the rules of `world.accounts` on the server, `local` in `index.html`, and `signin` with the
   accounts addon's `keep`, named off the scene file, on the pages that dial, between the dial and the
   `link` that `client.html` hands `predict` (the prime directive's The pages), so the page still runs
   its scenes ahead. Its home is an addon
   (question 5). It is built with its test, `gameFiles` writes it, its test
   (`scripts/new-game.test.ts`) makes each page's views as the page's lines make them, and
   every game in `games/` is moved to the pages `gameFiles` then writes, in the same change
   (`starting-a-game`, The pages). The server file holds no listener of its own: stopping is the
   persist addon's. Never a line of `persist`, `sqlite`, `indexeddb`, `local`, `signin`, a `keep` or
   `accounts` written into one game's pages.

8. **The recorder and the simulator sign their seat in.** A scene's replay test plays the game under
   the recorder (`addons/recorder/recorder.addon.ts`), whose view holds the link the recorder builds
   by hand, and whose truths each get `link(loopback(accept(manager(t))))`: no `signin`, no `local`,
   no store, so a login actor's `who` throws `this link was not made on a signin wire`. The recorder's
   link gets the door, its truths are
   logged in as `index.html`'s are, and it attaches persist itself on a store held in memory, built in
   the persist addon beside `sqlite` and `indexeddb` with its test; since time goes back by booting
   again and replaying, a rebuilt step must load the records that step loaded, not what the live run
   wrote since. The recorder has no test of its own, so the change writes
   `addons/recorder/recorder.addon.test.ts` beside it. The simulator's pages are `view(link(wire))`
   over a wire of its own that records every down as an envelope (`simulate` in
   `addons/simulator/simulator.addon.ts`): the door must reach the link the view is handed, an answer
   of the accounts addon is not counted as an envelope, and `simulate` attaches persist itself on a
   store held in memory, as the recorder does, so a run of a game that keeps records needs nothing of
   the test's own. Tested in `addons/simulator/simulator.addon.test.ts`. Never a guard in the login
   actor for a link without a door, and never a store a test hands the simulator.

9. **The database file.** On node `file` is a path under the working directory, which is the clone's
   root, since the loader reads every catalogue url under it too (`fetched` in
   `plugins/loader/loader.sim.ts`). So `"file": "<game>.db"` lands at the root, with `<game>.db-wal`
   and `<game>.db-shm` beside it. They hold every player's account and records, and the root
   `.gitignore`, which names none of them, gets all three in the same change.

## What goes wrong

- The count starts over after a restart: the server file never attached `persist`, the scene has no
  `persist` row, or the kind is not in `world.persist.kinds`.
- The count starts over on every visit within one run: the rule read in the step it claimed. Claim,
  mark the row, read on a later step.
- An account taken from an act's argument, checked for its shape or not. It is the page's word.
- A record keyed by a row id or an account's name. Key it by uid.
- The character kept as a second live row, the record row, that the seat steers through its `player`
  row, or whose level and gold the HUD reads. It is drawn from the server's packets, a round trip
  after the key. The record is storage: the `player` row copies its fields onto itself, plays on
  them, and writes them back (What is kept).
- A `player` row act that writes the record, `save` or `keep`, which a seat may send at its own row
  with any values. The write-back is an act of the record's kind, called by the `player` row's rule.
- A record's `owner`, or any row id it holds, read as if it named a row of this boot. A rule races
  the packet to write `owner` over, or a skill says the stale one crashes: the player addon handles
  it, built there (What is kept).
- A scene with a `persist` row that throws `persist declares <kind>, which has no prefab`, and every
  record kind's prefab moved into the manager scene file to stop it: `declared` is built to ask a
  prefab only of the kinds a scene keeps (What is kept).
- A game file `persist.sim.ts` re-exporting the persist kind. The scene's sim imports it from
  `#plugins/persist/persist.sim.ts`.
- A `keep` given to a page whose scenes do not all list the logged-out-elsewhere plugin, or that
  plugin added with no `keep`: the two go together.
- The hand-off built and a game's login act or `arrive` still taking an account from its args, or
  only its scene files changed: the act and `arrive` carry no account, in the same change.
- `world.persist`'s or `world.accounts`' numbers put in a prefab: fixed data is never a prefab
  (question 1), whether or not a row made from it is sent. Or `claims` put on `world`: it changes, and
  what changes on the server is on a row.
- Progress, a score or anything a rule reads kept in the store. The store is the page's, gone on a
  reload, and never sent.
- A secret put on a row, a record or a log. The addon reads it off the ask and lets it go; nothing
  else touches it.
- A signal listener, a flush or a loop over the scenes written into `<game>.server.ts` or
  `index.html`. A page mounts things; stopping and attaching are the persist addon's.
- `persist`, `sqlite`, `indexeddb`, `local`, `signin`, a `keep` or `accounts` written into one game's
  `index.html`, `client.html` or `<game>.server.ts`. It is the one addon call `gameFiles` writes into
  every game's pages (step 7).
- The database file and its `-wal` and `-shm` committed with the game.
- A login screen that throws `this link was not made on a signin wire`: the page's link was made
  without `signin`, or it is the recorder's or the simulator's before step 8.
- A test that hands the simulator a store, or attaches persist around it: `simulate` attaches persist
  itself (step 8).
- A page that freezes on the last frame of its scene: its account logged in elsewhere, and nothing on
  that scene noticed.
- A page that asks `relogin` by itself after `elsewhere`, and two tabs log each other out in turn.
- A second account refused at the scene that keeps records: its `seats` is 1. Raise it and add a
  `start` per slot (`going-multiplayer`).
- A test reading the store in the same turn as the step that wrote: writes go out after the step.

## How it is proven

- Each piece built in an addon or a plugin is tested beside it, on a scene the test writes: the
  account handed to the seat (`addons/accounts/accounts.addon.test.ts`,
  `addons/scenemanager/scenemanager.addon.test.ts`), checking that the rules of every scene a seat
  enters read the server's account for it, through a wrapper between `accounts` and the scenemanager
  too, and that no act a page sends changes it; the browser `keep` and its name
  (`addons/accounts/accounts.addon.test.ts`); persist on the manager, its stop, its page flush, its
  store held in memory and `declared` asking a prefab only of the kinds a scene keeps
  (`addons/persist/persist.addon.test.ts`); an `owner` from another boot
  (`addons/player/player.addon.test.ts`); the text entry (`plugins/ui/ui.plugin.test.ts`); the one
  call the pages make, through the pages `gameFiles` writes (`scripts/new-game.test.ts`);
  the recorder and the simulator signing in and attaching persist themselves
  (`addons/recorder/recorder.addon.test.ts`, `addons/simulator/simulator.addon.test.ts`). The tests
  already beside the addons run with every change to them: `addons/accounts/accounts.addon.test.ts`,
  `addons/persist/persist.addon.test.ts`, `plugins/persist/persist.sim.test.ts`.
- `games/<game>/<game>.sim.test.ts` boots the manager as the server file does, `load`s it with
  `import.meta.url`, and attaches persist over `sqlite` in a temp file (`mkdtempSync`). After each
  step it awaits a turn of node's loop (`setImmediate`) so a load lands. It checks that a seat logged
  in moves from the entry scene to the next; that the seat's `player` row holds the record's fields on
  the step after the claim landed; that a visit counts on the `player` row, reaches the record that
  step, is on disk after it (read on a second `sqlite` connection to the file, as another process
  would), and counts again on the next visit; that a seat sending the record's write-back act, at the
  record or at its own `player` row, changes nothing; that `flush`, `close` and a second boot on the same file count on; and that a seat is sent
  another account's record without the fields `security` lists under `me`.
- `games/<game>/<game>.server.test.ts` runs the server file as a person does, a child process
  (`spawn(process.execPath, ['--experimental-strip-types', <server file>])`), twice, with SIGTERM
  between and exit code 0 checked. Its working directory is a temp folder holding a symlink `games`
  to the clone's `games/`, so the loader reads the game's files and the database lands in the temp
  folder. It waits for the server by dialing until an envelope arrives. A page is
  `link(signin(dial(url), keep))`; it registers or relogins and reads its own record off its packets.
  It checks that a reloaded page logs back in with its token and counts on; that a page not logged in
  stays on the entry scene whatever it sends; that a page logged in as one account, sending another
  account's uid in any act, still counts on its own; and that the count goes on after the restart
  while a second account starts at one. It opens no socket but through `dial`: the last test of
  `addons/socket/socket.addon.test.ts` fails any file that does.
- `games/<game>/login.client.test.ts` runs the actor as a page does, `view` on a link in node, which
  is a `.test.ts`: the ui plugin shows things and draws nothing there, and the player plugin needs
  a global `addEventListener` and `removeEventListener` that do nothing, as
  `plugins/store/store.plugin.test.ts` gives it. Over `local` the seat is sent on at once and counted.
  Over `accounts` with a kept token it logs in with it and is sent on; with none it stays on the entry
  scene showing its form.
- Run each with `yarn vitest run <file>`.
- Played: `index.html` at `http://localhost:5173/games/<game>/index.html` with `yarn dev`
  running shows the count up by one on each reload, kept in IndexedDB. `client.html` against the
  server: register, reload and be logged back in, restart the server and see the count go on, and
  log the account in from a second window to see the first told it was logged in elsewhere.
