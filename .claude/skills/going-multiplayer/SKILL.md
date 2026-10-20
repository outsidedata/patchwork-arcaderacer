---
name: going-multiplayer
description: Use in core, or any clone of it, when a game is played by more than one person over a network - running `<game>.server.ts` on node and opening `client.html`, the port, raising a scene's `seats` for a second player, what a player who finds the game full gets, sending each seat only what it needs (`interest`, `vision` and its fog of war, a `security` block), what a seat may send and what is dropped, a press against lag, jitter and packet loss, a scene run ahead on the page (`world.predict`, `client.html` wrapping its link in `predict`, every row drawn from the copy on the frame after the key, the server putting a late press back on its step with `addons/rewind`, a jump eased by `halflife`, `snap` and `below`), the press test `<game>.predict.test.ts`, trying a bad network before shipping (the loopback's network shape, the simulator, `?tap=`), chat and parties, and a new way to travel such as WebRTC as a transport addon. Also when someone says multiplayer, online, netcode, server and client, two players, a second seat, play with friends, latency, rubber-banding, "the second tab is blank", or fog of war.
---

# Going multiplayer

A game in core is played by more than one person when its manager runs on node behind a socket and
each person opens `client.html`. Every game `yarn new-game` writes already has both files (the list
is the header of `extensions/games/games.route.ts`), so nothing new carries a packet. The template
still writes `client.html` without `predict` and the seat's square as a `body` row its `player` row
spawns; both are folded before anything else (`starting-a-game`, Fold the body into the player row).
The work is the scene's seats, what each seat is sent, what each seat may send, the seat's own thing
drawn on the frame after its key, and proving the game plays on a bad network. The engine is
frozen: nothing here edits `engine/`. A line that would tell a game to add a guard, keep a layout,
or never hand an addon a copy, so that the wire or a piece does not break, means core is missing a
piece: it is built in its home, with its test, and the line is never
written, here or in a game.

## When it applies

It applies to a game played over a network: running its server, opening its seats, the port, how many
seats a scene takes, what each seat is sent, what a seat may send as it reaches the server, a press
against the network, trying a bad network, chat and parties, and a new transport.

It does not cover:

- making the game and its files in the first place: `starting-a-game`.
- accounts, logging in, and keeping a player's things between visits: `persisting-players`.
- putting the game where players on other machines reach it, and serving its pages: `publishing-a-game`.
- binding keys or a pad, where a seat starts and what it plays there: `input-and-seats`. What the
  `player` row is, the thing the seat plays as, and its press test: `designing-a-seat`.
- a kind's own rules and acts: `designing-a-kind`. A plugin: `building-a-plugin`.

## The wire, as a game meets it

The wire is part of the base, which is finished (prime directive, The wire). Three pieces stand
between the engine and a game, and each does one thing:

- `scenemanager` (`addons/scenemanager/scenemanager.addon.ts`) gives a connection its seat.
  `accept(manager(truth))` is the server's side of every seat, handed to a transport; `link(wire)` is
  the page's side of one; `view` holds one client, for the scene the seat is on. It carries envelopes
  and never says how they travel. Each manager step it sends every connection a `Diff`, the rows
  changed since the newest envelope that page said it got, and the page's `link` rebuilds the whole
  packet before anything hears it. `backlog` on the manager's `scenemanager` prefab is how many
  envelopes back a diff may reach, 32 when it gives none.
- A transport carries whatever its two ends say and knows nothing of scenes or seats: `loopback`
  (`addons/loopback/loopback.addon.ts`), the page and the manager in one process, with a network of
  any shape when it is given one; `socket` (`addons/socket/socket.addon.ts`), a WebSocket between two
  processes.
- A page names its transport in one line, and every line of a page is the same in every game but the
  file names it imports: `index.html` a `loopback`, `client.html` a `dial`, `<game>.server.ts` a
  `serve`.

Nothing else carries a packet. A test or a tool that needs a page and a truth joined takes a
transport, `link(dial(url))` against a `serve` or `link(loopback(accept(row)))`, and never joins them
itself. The last test of `addons/socket/socket.addon.test.ts` fails any file in the repo, a game's
tests included, that opens a WebSocket or imports `ws`, other than the socket addon itself.

## What runs where

- `<game>.server.ts`, on node: boots the manager scene, `load`s every scene its table names (each a
  truth of its own, its loader files read from disk), `serve`s `accept` on the manager's `port`, and
  `run`s the manager, stepping it by its `engine.dt` as often as the real clock owes a step. Each
  manager step steps every scene whose entry says `suspend: false` and every scene a seat is in. It
  prints nothing while it runs.
- `client.html`, in the browser: `dial`s `ws://<the host the page came from>:<port>` and always wraps
  the link in `predict`, `tap(dial(url), wire => predict(link(wire), file, import.meta.url, mount))`,
  calling `page.input()` then `await page.frame(now)` on every `requestAnimationFrame` (prime
  directive, The pages). On a scene that gives `world.predict` the page boots its own copy and runs
  it ahead (step 7, A scene run ahead); on one that gives none, a title or a menu, every envelope goes
  to the view as it came and the page steps nothing. For the scene its seat is on it loads the browser
  half of each plugin the scene lists and each row's `<kind>.client.ts`. `tap` wraps the dial: with
  `?tap=<name>` in the address it records the page, and without it the page is the predicting page,
  untouched. A panel, a readout, a second pane or a network shape on the page is `dev.html`'s, never
  `client.html`'s.
- `index.html`: the manager and the page in one tab, over a loopback, stepped by the page's clock, with
  no prediction and no lag: a press lands on the next step in the same tab. It is one seat on a truth
  of its own. A second tab of it is a second game, not a second player.
- `dev.html`: the game's own testbed, any readout, any number of seats, any network (`starting-a-game`,
  The testbed).

## The work

1. **Seats.** A scene that lists the `player` plugin takes as many seats as its scene file's `seats`
   says. `addons/player` gives each connection the lowest slot below `seats` that no seat holds,
   spawns its `player` row with that slot in `seat`, and the seat possesses that row. The game
   `yarn new-game` writes has `"seats": 1` and one `start` actor. For two players, the scene file,
   `games/<game>/<scene>.scene.json`, gets `"seats": 2` and a second `start` actor,
   `{ "is": "start", "slot": 1, "pos": [x, y] }`: one `actors` entry per slot, never a list of places
   on `world` (prime directive, question 1). The manager scene's own `seats` stays as it is, and
   nothing reads it: no connection is seated on the manager, and each child's own `seats` is the one
   that counts.

   A connection that finds every slot of the entry scene taken is closed by the socket with code 1013,
   and `dial` calls its `gone`. `client.html` hands `dial` no `gone`, so today that player's page
   draws nothing at all. That is what core does now, not how it must stay. A game that must tell a
   refused player it is full builds that in core: the page `make` writes (`client.html` in
   `extensions/games/games.route.ts`), with every game's `client.html` moved over to it, since every
   line of a page is the same in every game. Never a `gone` listener written into one game's page.

   On a loopback nothing is refused: `loopback` calls `accept` with nothing around it. So a page past
   the seats throws `no seat free: <n> declared` out of `link` in a page that holds the manager, and
   out of a simulation, which therefore runs no more pages than the entry scene has seats. A seat that
   a scene sends with `go` to a full scene stays where it is, and the scene may send it again. A scene
   that does not list `player`, such as a menu, takes a plain seat with no limit, so a game whose
   entry scene is a menu refuses nobody at the door.

   When a connection closes, `addons/player` ends its `player` row and frees its slot. The seat's
   thing goes with it, since the thing is that row (`designing-a-seat`); a row its rules spawned, a
   shot in flight, runs on by its own rule. A page that comes back is a new seat with a higher seat
   number, and it may get the same slot, so a rule about who is who reads the slot off the `player`
   row, never the seat number.

2. **Run the server.** From the repo root:
   `node --experimental-strip-types games/<game>/<game>.server.ts`. It must be the root because on
   node the loader reads a catalogue url such as `/games/<game>/assets/<game>.json` as a path under
   the working directory (`plugins/loader/loader.sim.ts`). Or from the editor, `yarn editor <game>`:
   the Node panel's Run on node starts the same file in a child process from the root, shows what it
   prints and when it exits, and starts it again whenever a file it runs changes. Open a seat opens
   `client.html` in a new tab (`extensions/servers/servers.extension.tsx`; its commands are
   `servers.start`, `servers.seat`, `servers.state` and `servers.stop`). One server per port: a second
   one, started by hand beside the panel's or left over from earlier, dies with `EADDRINUSE`.

   The port is the manager's `scenemanager.port`. `yarn new-game` gives each game the port after the
   highest one the games in `games/` use, or 9001 when there are none, so no two games share a port.
   `serve` listens on every interface of the machine.

3. **Open the seats.** With `yarn editor <game>` running, open
   `http://localhost:5173/games/<game>/client.html` once per player, each in a window of its own.
   Chrome pauses `requestAnimationFrame` in a tab that is not in front, so of two tabs in one window
   only the front one plays, while the server keeps stepping. The editor's server answers only on
   `localhost`, so this puts every player on one machine. Players on other machines are
   `publishing-a-game`'s.

4. **Decide what each seat is sent.** A seat's packet holds the rows that every piece attached to the
   truth shows that seat, each without the fields a piece hides (`Piece` in `engine/engine.ts`). By
   default each seat is sent every row, the other seats' `player` rows without their `mine` (the
   seat's own is the one that is `mine`, which `possessed(rows)` finds), and never a child
   `scenemanager` row's `out`. Every row a seat is sent is copied to it every step, which is why a
   fixed number never rides on a row (prime directive, question 1). Three pieces send less. Each one
   limits what is sent, never what the rules know, and each is an addon (question 5):

   - Fields, by owner. A top-level `security` block in the scene file names, for each kind, the group
     of each field it lists, and the `player` prefab gets a `masks` list. A listed field of an owned
     row is sent only to seats whose masks share the owner's group (`me/<id>` is a group of one). The
     whole of it is the header of `addons/player/player.addon.ts`. An actor that reads such a field
     tests for it with `in`.
   - Team vision, the fog of war. The scene's `world.vision` (`cell`, `size`, `at`, `slot`, `teams`,
     `sight`, `always`) is read by `addons/vision`. `addons/player` attaches it by itself to a scene
     whose `world` has the block, the first time a seat joins. A row belongs to the team of the slot
     it holds in the field `slot` names, and a kind listed in `sight` sees that many cells. A row with
     no such field belongs to no team and is sent only to a team that sees its cell.

     The seat's thing is its `player` row (`designing-a-seat`), and that row holds its slot in `seat`,
     which `addons/player` writes. So in the block `slot` is `"seat"`, `at` is the field holding the
     thing's place, `"pos"` on the folded new game, and `sight` is `{ "player": <cells> }`. `slot`
     names one field for every kind, so a row the seat's rules spawn that belongs to its team, a shot
     say, is spawned with `seat: me.data.seat` beside its `pos`. A block whose `slot` names a field the
     `player` row does not hold leaves every player row on no team and seeing nothing: a seat is sent
     a player row, its own among them, only where a seer of its team stands, and the new game has no
     other seer, so no page draws any square. Listing `player` in `always`
     instead puts every seat's thing outside the fog.

     The page draws the fog with the `vision` plugin, listed in the scene's `plugins` before
     `render2d`. Its own `layer`, `unexplored` and `explored` sit in the same block. It draws on
     render2d's world, so the scene gives `world.render2d` with `ground`, `up`, `zoom`, `look` and
     `layers`, that layer among them. `place` reads `up`, so it is given even where nothing stands
     above the ground. For the new game, whose things stand in canvas pixels, the block is
     `"ground": [[1, 0], [0, 1]]`, `"up": [0, -1]`, `"zoom": 1` and `"look"` the canvas middle, so a
     world unit is a canvas pixel and the fog's cells sit where the seats' squares stand. The world
     lies under anything put straight on the stage, as the folded `player.client.ts` puts its square. A
     thing the fog should cover is drawn on a layer of the world, at `place(pos)`. From then the player
     row's `pos` and its definition's `speed` and `size` are in the world's units, one a canvas pixel
     under this ground but units all the same: its look draws its size scaled by
     `render2d.ground()`, and the headers that say pixels say units (`writing-the-look`, render2d or
     render3d).

     A rule that must act only on what a team sees asks `sees(w.world, slot, row)`. The editor's
     Vision panel shows, for each slot, which rows are sent and which are not
     (`addons/vision/vision.extension.tsx`).
   - Area of interest. A top-level `interest` block, `{ "radius": r, "always": [kinds], "at": field }`,
     is read by `interest(truth, possessed)` (`addons/interest/interest.addon.ts`). A row with a `pos`
     farther than `radius` from the seat's centre, measured on x and y, is not sent. A row that walks
     out of range is in that seat's next `ended`, and one that walks back in is in its `born`. Without
     `at` the centre is the possessed `player` row itself, which is the seat's thing, so a game whose
     seat plays as its `player` row leaves `at` out; `at` names a field of the player row holding
     another row's id, and a seat's thing is never such a row (`designing-a-seat`). Nothing in core
     attaches it today, so the block alone sends every seat every row.
     `interest` needs the truth and which row each seat possesses, and that lookup is held inside
     `addons/player`, which attaches vision the same way. A game that wants interest therefore builds
     that attach in its home: `addons/player`, beside its `vision` line, from the scene's `interest`
     block, tested in `addons/player/player.addon.test.ts`. Then `index.html`, `<game>.server.ts`,
     the simulator and every test that seats a player all get it, since each one seats through
     `join`. It never goes in `<game>.server.ts`. A page names no scene and holds no rule, and
     `index.html` and a simulation never run that file, so they would still send every row. The same
     change rewrites three docs so they say what the code does:
     - the header of `addons/player/player.addon.ts`, which names only vision among the pieces it
       attaches;
     - the header of `addons/interest/interest.addon.ts`, whose lookup paragraph says the caller
       hands `interest` the lookup. It names `addons/player` as the attacher instead, as
       `addons/vision/vision.addon.ts`'s header does;
     - this skill's lines that say nothing attaches it.

   Under vision and interest, a row with no place (a manager, a loader) and a kind listed in `always`
   go to every seat. A `player` row that is the seat's thing has a place, so it is in the fog and the
   radius as any thing is; the headers of `addons/vision/vision.addon.ts` and
   `addons/interest/interest.addon.ts` that list a player row among the rows with no place were
   written when it had none, and the code tests the field, not the kind. `always` is for what every seat sees wherever it stands, the
   map's pieces: a kind listed there is outside the fog and outside the radius. The `start` rows have
   a `pos`, so a seat far from them is not sent them, which nothing in the new game minds. Under
   interest a seat's centre row is always within its own radius. Under vision a seat is sent its own
   team's rows wherever they stand.

5. **Hold what a seat may send.** A page's message names a row, an act and its args. The engine runs
   it only when the row is the one the seat possesses, its `player` row, or the row's kind lists the
   act in `open`. A well-formed message that names a row not there, an act the kind does not have, or
   an act the seat may not send is refused: it runs nothing and gets no answer, but its number is
   still acked. A message sent on a visit that is over, sent before the page heard its seat had moved,
   is dropped by `connection`. That holds only for a message of the right shape, which step 6 makes
   the wire enforce.

   A kind reached through the `player` row lists no `open`; `w.call` runs its acts without the check,
   because the `player` act that called it already passed one. The other way round, a seat may send
   any act its own `player` row has. So an act on the `player` row that other kinds use to change it,
   `hurt`, `award`, `heal`, is one the seat could send itself: it is a plain function of a game
   plugin that other kinds call, or an act that returns at once when a seat sent it (`seat >= 0`;
   a hook passes `-1`) (`designing-a-seat`, Acts a seat can send). `scenemanager`'s `go` is open, so any
   seat may send itself to any scene the manager's table names, and the args it sends reach the next
   scene's `player` row as `arrive`. A connection behind `accounts` is seated on the entry scene and
   sent its packets from the first step, but what it sends, other than its log-in, is dropped until it
   logs in (`persisting-players`). What a player chose on the page, such as a volume or rebound keys,
   is a key of the store, which the server is never sent.

   Every arg arrives from outside the program, whatever the act's types say. Each act checks each arg:
   its type, that a number is finite, its range. The folded new game's `player.sim.ts` does this in
   its `move` (`starting-a-game`, Fold the body into the player row).

6. **Make the server drop what it cannot read, before it faces other players.** Today one connection
   can stop the server with one message. Each of these was measured against a served manager:
   - text that is not JSON throws out of the socket addon's `JSON.parse`;
   - the JSON `5` or `null` throws out of the scenemanager's `accept` (`'got' in up`);
   - a `msg` of `null` throws out of the next step (`m.n`);
   - `args: 5` throws out of the step, which spreads them;
   - `action: 'valueOf'` at the seat's own `player` row throws out of the step. The engine finds an
     act by `kind.acts?.[action]`, which finds what every object inherits.

   Each throw leaves a message listener or the step, which stops the process and every seat on it.
   Before a player who is not you dials the server, and before `publishing-a-game` puts it where one
   can, the wire's own pieces drop these. The engine is untouched:
   - the socket addon drops a message its `JSON.parse` cannot read;
   - the scenemanager's `accept` drops an up that is not an object;
   - `connection`'s `take` drops a `msg` unless `seq`, `n` and `id` are numbers, `action` is a
     string and `args` is an array of `Arg`s. Where the named row is there, it also drops a `msg`
     whose `action` the row's kind has only by inheritance: `action in acts` but not
     `Object.hasOwn(acts, action)`. An action the kind does not have at all still goes on, because
     the engine refuses it and acks it.

   Each fix has its test beside it: `addons/socket/socket.addon.test.ts` and
   `addons/scenemanager/scenemanager.addon.test.ts`. Each sends what is listed above, then checks that
   the server steps on and that every other seat is still sent its packets.

   A rule or an act that throws stops the server the same way: `run` steps the manager from a timer
   with no catch, the engine runs its step's listeners one after another (`step` in
   `engine/engine.ts`), and the scenemanager steps every scene in one listener (`load`) and sends each
   connection its packet in a listener of its own (`connection`). The throw is caught where those
   loops are, in the scenemanager addon: per scene, around each scene's step in `load`'s loop, and
   per connection, around each connection's work. Never around the whole manager step in `run`:
   there one scene's throw skips every scene after it and every connection's packet, and a throw that
   comes back every step freezes every seat behind one line of log. A scene that threw is half
   stepped, so it is not stepped again and its seats are let go; every throw is reported, naming the
   scene. Its test, in `addons/scenemanager/scenemanager.addon.test.ts`: a manager of two scenes and
   two seats, one on each, where one scene's rule throws every step, and the seat on the other keeps
   playing and is sent its packets. Persist's failed load, which throws out of every step by design
   (`advance` in `addons/persist/persist.addon.ts`), is the same case and needs nothing more. It is
   never a `try`, a `catch` or a `process.on` in one game's `<game>.server.ts`.

7. **Read a press against the network.** The player plugin (`plugins/player/player.plugin.ts`) sends
   the seat's press up the wire at its `player` row. Every scene a seat plays in gives
   `world.predict`, and `client.html` always wraps its link in `predict` (A scene run ahead, below),
   so on `client.html` what a page draws is:

   - Every row from the page's copy, which took the press on the step it was about to run: the seat's
     own `player` row, and every row the press makes or moves, a shot, a thrown thing, a crate knocked
     over, is on screen the frame after the key, at any lag. Another seat's row runs on in the copy
     from its last press, carried by the copy's rules; when that seat's press reaches the copy late,
     what it moved jumps, and the jump is eased (`addons/predict`, Easing a jump).
   - A sound raised `from` the seat's `player` row rides on that row's `voiced` list, so the jump, the
     shot and the hurt of the seat's own thing are heard on the frame after the key; every other sound
     and effect is raised on a ledger row, whose entries stay longer than a step, so a page that takes
     two packets in one frame still plays or draws it once (`plugins/audio/audio.sim.ts`;
     `input-and-seats`, Presses and ledgers).

   On a scene that gives no `world.predict`, a title or a menu, the page draws the last packet's rows,
   its own press among them, when the packet carrying what the server did with it arrives: the up leg,
   the server's step that takes it, and the down leg. That is a round trip of lag on the seat's own
   thing, so no scene a seat plays in is left so.

   What a bad network does to a press: on a scene run ahead, the page keeps each message and sends it
   again every frame until a packet's ack covers it, and the server takes each once, in the order of
   its number, holding one that came early (`connection` in `addons/scenemanager`), so a lost,
   duplicated or reordered press is taken once and on its step. On a scene that is not run ahead, a
   lost press is never applied, a duplicated one runs twice, and presses reordered across steps are
   applied in the other order. The socket is TCP, so it loses, duplicates and reorders nothing: these
   come only from a network the loopback is told to have, or from a transport that does not keep
   TCP's promises. Jitter bunches the packets, which on a scene run ahead changes nothing drawn: the
   page draws its copy, and a packet is only held against it.

   **A scene run ahead.** A child scene whose `world.predict` is `{ "epsilon": e, "cutoff": c,
   "halflife": h, "snap": s, "below": b }` is run ahead on the page (`addons/predict`) and
   run by `rewind` on the server (`addons/rewind`); `predicts` throws on any other shape, naming it.
   `client.html` wraps its link in `predict(link(wire), file, import.meta.url, mount)`, and its loop
   calls `page.input()` then `await page.frame(now)`. Without both, the scene's block and the page's
   `predict`, nothing is predicted, whatever row the thing is on.

   - The page asks for the whole truth (`want`) once the scene's files are in, and the server sends a
     snapshot with what each row's kind holds beside the rows (`Memory`: box2d's and box3d's whole
     world, by their `hold` and `take`). The page boots its own copy from it and steps it on its own
     clock, a step every `engine.dt`. A press is stamped with the step the copy is about to run,
     answered there, and drawn from the copy on the next frame, at any lag.
   - What the view is handed after each step of the copy: every row the seat may see, as the copy has
     it. It draws between the last two steps it was handed, as `index.html`'s
     view does (`engine/browser.ts`, Drawing between steps).
   - The server owns the clock and never waits for a page. It keeps the truth as it stood before each
     of its last `cutoff` steps. A press stamped for a step it has already run makes it load the save
     from before that step and take the press there, running nothing again: it plays on from there a
     step for each step of its clock, so it stands behind its clock by as many steps as it went back,
     never more than `cutoff`. A press stamped further back than that is answered on the next step.
   - Every message and every seat that comes or goes is written in the scene's journal and sent to
     every page beside its packets. A page puts each into its copy on its step, going back there and
     running every step again within the same frame, so the copy never stands behind. Its own press,
     when the server answered it on another step, it moves there (`move`); it asks for the whole truth
     again only when its copy no longer keeps the step it took it on.
   - When the copy jumps, going back for another seat's late press or loading the server's truth, the
     page compares every row as it drew it at its last drawn step with the copy's row at that same
     step after the jump, and hands the view the copy's rows plus each difference, an offset that
     halves every `halflife` ms, dropped once under `below`, and not eased at all past `snap`
     (`addons/predict`, Easing a jump). A number the jump did not move is drawn exactly where the copy
     has it. Distances are in the rows' units.
   - Each packet is held against the rows the copy had at its step. Within `epsilon` of each number
     is a drift, a number a browser and node rounded differently (a rule computes with `plugins/math`,
     the same bits on both, so `Math.sin` and the rest are not where one comes from: `designing-a-kind`,
     Maths in a rule); past it is a
     correction. A drift is left alone; a correction has the page take the server's truth again. `page.stats` counts both, with
     `checked`, `taken`, `back`, `missed` and `loads`, and keeps the first and the last packet that
     differed (`first`, `differed`) and the last that drifted (`drifted`, with `by`, the most one
     number stood apart): each with its step and every row that differed, the copy's data beside the
     packet's.

8. **Try a bad network before shipping.** The press test (How it is proven) is the proof that the
   seat's own thing answers its key on every network. Beyond it, the game is played on bad networks on
   node, with no time passing (`addons/simulator/simulator.addon.ts`):

   - `simulate(run)` boots the manager scene `run.file` with `run.sim`, loading its scenes from
     `run.base`. It steps the server with the loop every server runs, on a clock of its own, and opens
     each page of `run.pages` as `view(link(loopback(accept(manager), time, net)))`, or, with
     `predict: true` on the page, as `predict(...)` on the same link, as `client.html` makes it: a page
     standing for a player is `predict: true`. Each page has its own `up` and `down` legs, display and
     presses, and every frame, step, packet and message is written down as a record. A leg is the
     loopback's `Leg`: `delay`, `jitter`, `tail`, `loss`, `reorder`, `dup` and `burst`, every roll from
     one `seed`, so a run is the same bytes every time. `histogram`, `packets`, `standoff` and
     `summary` read facts off the records for a test to state: how many steps the packet a page drew
     moved each frame, how many envelopes each frame took, and how the camera kept to the page's own
     row. `watch.own` is a list of fields walked from the seat's `player` row, each naming the id of
     the next row (`frameOf` in the simulator); the empty list, `own: []`, is the `player` row itself,
     which is the seat's thing (`?own=` in a `tap` address). Its pages load in node with no canvas, and
     no `mount` is needed.
   - From the command line:
     `node --experimental-strip-types addons/simulator/simulator.addon.ts run <config.json> [out.jsonl]`.
     A config is a run as JSON, with `game`, the path of the manager scene file from the root, in
     place of `file`, `sim` and `base`. It prints the summary.
   - In the editor, the simulator's Runs panel plays a config and keeps it as a recording (`sim.run`,
     `sim.read`, `sim.runs`).
   - In a real browser, `client.html?tap=<name>` records every frame through the editor's server into
     `addons/simulator/runs/<name>.jsonl`, a folder the first recording makes. `timing(records)` gives
     a simulation a recording's own timing, and `real(run)` plays pages over the real socket on real
     clocks.

   A simulation boots the manager and loads its scenes itself. It never runs `<game>.server.ts`, so
   anything only that file did is missing from a simulation.

## Chat and parties

`plugins/chat` and `plugins/party` are players talking and playing together. The game's sim builds
each server half, `chat(post, members)` and `party(post, here)`, and hands in
`post(w, to, kind, act, ...args)`: mail to the first row of `kind` in the truth `to` names. Each also
needs an account for each seat, which its `who` names, and accounts are `persisting-players`'.

Core ships no `post`. Mail between truths holds more than one truth, so it is an addon,
`addons/<name>/<name>.addon.ts`, that names no game and no kind:
- `post` is handed `w`, the truth the mail is sent from. Core already finds a truth's own state from
  `w` by its `w.world`, as `addons/vision`'s `sees` does.
- The mail arrives from a seat that possesses no row (`open()` with no row, in `engine/engine.ts`). So
  every act it carries is one a kind lists in `open`, which is why chat's `relay` and `hear`, and
  party's `ask`, `invited`, `uninvited` and `mirror`, are open.
- A `{ account }` address reaches the truth that account is in, which needs the accounts the
  connections carry.
- It is attached where `index.html`, `<game>.server.ts` and `simulate` all get it: each of them calls
  `load`, which boots every truth. Never a line in `<game>.server.ts`, and never a stand-in written
  inside a game.
- Its test, beside it, writes a manager of two scenes, as the socket's does, and mails from one to the
  other.

Each draws on `ui`'s panels, is listed before `ui` in the scene's `plugins`, and throws when it is
listed after it or the scene lists no `ui`. Chat throws when its row's `talk` holds `party` or
`whisper` and the scene's `security` block lists no `chatbox` `channels` (`chatbox: { channels: 'me' }`),
since every seat would otherwise be sent every whisper. Party always throws unless `security` lists
`partyseat` `account` and `invite` (`partyseat: { account: 'me', invite: 'me' }`). Drawing their
frames is `building-the-hud`'s. Their headers (`chat.sim.ts`, `chat.plugin.ts`, `party.sim.ts`,
`party.plugin.ts`) hold the rest.

## A new way to travel

WebRTC, or any other way to travel, is a new transport addon of the same shape as the loopback and the
socket, `addons/<name>/<name>.addon.ts`. It knows nothing of scenes, seats, games or kinds, and imports
from `engine/` and other addons, never from `games/`. Its server side is handed an `Accept<U, D>` and
its page side is a `Wire<U, D>`, both typed in `addons/loopback/loopback.addon.ts`, and `link` and
`accept` take it as they take the socket's. A game moves to it by changing the one transport line of
`client.html` and of `<game>.server.ts`. Its signalling, the offers and answers exchanged before a peer
connection opens, crosses the socket addon's `dial` and `serve` or `upgrades`, because no other file
may open a WebSocket. Node 22 has no `RTCPeerConnection`, and `ws` is the only network library in
`package.json`. So the server side of a WebRTC transport on node needs a new dependency, added to
`package.json` with the addon.

A channel that drops or reorders is already handled by the scenemanager's diffs. The page's `link`
drops an envelope whose base never arrived, and a second copy of one, and the server diffs each later
envelope against the newest one the page said it got. A predicting page sends a lost press again
until an ack covers it, as in step 7. What
it hands `accept` arrives from outside the program, so it drops what it cannot read, as step 6 has the
socket do. The
addon's test sits beside it, `addons/<name>/<name>.addon.test.ts`, on a manager scene it writes itself,
as the socket's does. It checks that each page that connects gets a seat and loses it on close, that a
page finding no seat free is refused, that a press sent across a scene move is dropped, and that a page
is told once that its server has gone.

## What goes wrong

- The second player's page is blank. The scene still says `"seats": 1`, so the socket refused that
  connection with 1013, and `client.html` gives `dial` no `gone` to say so. Raise `seats` and add a
  `start` per slot. Telling a refused player is built in core's page template (step 1).
- A simulation given more pages than the entry scene has seats throws `no seat free`: the loopback
  refuses nobody.
- `world.vision` added to the new game, and no seat sees even its own square: the block's `slot`
  names a field the `player` row does not hold; it holds its slot in `seat` (step 4).
- The fog drawn off the squares: `world.render2d`'s world is not the canvas's pixels, or the things it
  should cover are drawn straight on the stage (step 4).
- The key moves the seat's thing a round trip late in `client.html`, and on a LAN too: the scene
  gives no `world.predict`, or `client.html` does not wrap the link in `predict`, so the page draws
  the packets. Every scene a seat plays in gives the block, and the page wraps (step 7).
- The seat's own jump or shot heard late: the sound was raised with only `at`, or `from` another
  row, so it went on the ledger and comes with the packets. It is raised `from` the seat's `player`
  row (step 7).
- A seat's HUD or camera shows another seat's thing: it found its row with
  `rows.find(r => r.kind === 'player')`, whichever came first. It is `possessed(rows)`.
- A rule-only act on the `player` row, `award` say, that a seat sends itself (step 5).
- One connection stops the server with one bad message, or one rule's throw stops it for every seat
  (step 6).
- A rule's throw caught around the whole manager step in `run`: one scene's throw skips every later
  scene and every connection's packet. It is caught per scene and per connection in the
  scenemanager's own loops (step 6).
- Two tabs in one window, and one of them frozen: Chrome paused the tab that is not in front. Use two
  windows.
- Two players tried as two tabs of `index.html`: that is two games. Use `client.html` against the
  server.
- The server dies with `EADDRINUSE`: one is already on that port, the Node panel's or a leftover one.
  Stop one of them.
- The server run from inside the game's folder cannot read its files. Run it from the root.
- A level won or stuck on the server stays won or stuck for every seat that enters it after, until
  the server is started again: `load` boots each scene once for the life of the process, and a
  `suspend: true` scene keeps its rows when the last seat leaves. A game that can be won or stuck
  needs a way back of its own, a restart act or an `enter` act that starts the level over
  (`scene-flow`, steps 4 and 6); which one is the person's to say, and they are told that without one
  the level stays as it was left.
- An `interest` block written into the scene, and every seat is still sent every row: nothing attaches
  it (step 4).
- A line added to `<game>.server.ts` or `client.html` to attach a piece, filter rows or show a readout,
  or a network panel, two panes or a key table written into `client.html`. A page mounts things and
  nothing else, and `index.html` and the simulator never run that line; a testbed of seats and
  networks is `dev.html`.
- A test or a tool that opens a WebSocket of its own fails the socket addon's guard. Use
  `link(dial(url))`.
- An act that trusts its args. Every arg came off the network (step 5).
- Two pages dialled at the same moment take their slots in either order. A test that needs a given page
  on slot 0 dials the second page once the first is seated.
- A test that waits on the socket with `vi.waitFor` around `truth.step`. It retries every 50 ms for one
  second, about 20 steps, fewer than a walk across the screen takes. Step in a loop of the test's own,
  with a short wait between steps, until the condition holds.
- A fixed number put on a row is copied to every seat every step. It belongs on `world`, in the
  definition, or in a data file.

## How it is proven

- `games/<game>/<game>.server.test.ts`, beside the server file, boots the manager as that file does
  (`boot`, then `load` with `import.meta.url`) and calls `serve(0, accept(manager(truth)))` on a free
  port. It dials pages as `client.html` does, `link(dial(url))` with `url` the
  `ws://localhost:<port>` that `serve` handed back, one after another. It steps the truth by hand between short waits rather than calling `run`, so every step is
  the test's own. It reads what each page was sent off the envelopes that page hears, and what the
  truth holds off the scene's rows (`scene(manager(truth), '<scene>')`). It checks:
  - each page is sent every seat's `player` row, its own the only one that is `mine`, and none of a
    field the scene's `security` block keeps from it;
  - one page past the last seat is refused, and its `gone` is called;
  - a seat that closes leaves its slot and its rows;
  - for each piece the scene uses, a seat is sent its own rows; a row moved out of reach is in that
    page's `ended`, then absent while the truth still holds it, and in its `born` when it comes back.
- Run with `yarn vitest run games/<game>/<game>.server.test.ts`.
- The press test, `games/<game>/<game>.predict.test.ts`: what proves the seat's own thing is
  predicted (`designing-a-seat`, The proof). This is the one list of it; `input-and-seats`,
  `tuning-feel`, `proving-a-game` and `auditing-a-game` point here. Every game whose seat controls
  anything has it. A test that never checks what a key moves on screen passes on a page that draws a
  press late. The test:
  - boots the game's manager, `load`s it, and steps it with `run(truth, time)` on a clock the test
    moves, as node's timers fall due, `performance.now` spied to that clock;
  - opens a predicting page per seat of the scene, up to two,
    `predict(link(loopback(accept(manager(truth)), time, net)), file, here, mount)`, as `client.html`
    makes them, each on a `Net` of its own;
  - frames every page at 60 a second, `page.input()` then `await page.frame(now)`, with the seat's
    press sent before the frame at the seat's own row, `possessed(wire.rows)`, once that row stands
    and `page.stats.predicting` is true; a second seat presses too, so the copy goes back for its
    presses while the first is measured;
  - runs once for each wire: none, a home connection's, and the bad ones (`bad wifi`, `mobile`,
    `awful`), each way.

  For the pressing page, every fact is required:
  1. On every frame, the seat's own `player` row the page draws, `possessed(page.client.plugins.wire.rows)`,
     has taken every press sent up to the frame before, and none sent after the frame: a press is on
     screen by the frame after the key, on every wire.
  2. The thing moves: what the press drives (its place, its yaw) changes from frame to frame while
     the presses say it should.
  3. `page.stats.corrections` is 0: the copy never differed from the server past `epsilon`.

  Each press differs from the one before, so a row drawn late shows: an act that adds up, a turn
  of the mouse, is counted (the row drawn equals the start plus every press sent by the frame before,
  and at most the start plus every press sent by this frame); an act that sets a field, the way the
  keys point, sends a value no press of the last few hundred frames sent, so the field drawn is the
  value of this frame's press or the last frame's and never an older one. The test sends the act at
  the row as a key would (`wire.send(me.id, act, ...args)`), since what it measures is the page, not
  the binding; `player.client.test.ts` proves the keys (`input-and-seats`). On the folded new game
  (`starting-a-game`, Fold the body into the player row), whose `move` sets the way its square
  runs:

  ```ts
  // <game> run ahead: the game's server on a clock the test moves, and a predicting page
  // (`addons/predict`) for each seat of <scene> on loopbacks, framing at 60 a second. The seat's square
  // is its `player` row, which its page draws from its copy, so a way its keys send is drawn no later
  // than the frame after the one it was sent on, over a clean wire, a home one and the bad ones.
  import { afterAll, beforeAll, expect, test, vi } from 'vitest'
  import { boot, seeded, type Scene } from '#engine/engine.ts'
  import type { Client } from '#engine/browser.ts'
  import { accept, link, load, manager, run } from '#addons/scenemanager/scenemanager.addon.ts'
  import { loopback, type Net, type Time } from '#addons/loopback/loopback.addon.ts'
  import { predict } from '#addons/predict/predict.addon.ts'
  import { possessed } from '#addons/player/player.addon.ts'
  import { sim } from './<game>.sim.ts'
  import file from './<game>.scene.json' with { type: 'json' }
  import room from './<scene>.scene.json' with { type: 'json' }

  beforeAll(() => {
    vi.stubGlobal('addEventListener', () => {})
    vi.stubGlobal('removeEventListener', () => {})
  })
  afterAll(() => vi.restoreAllMocks())

  const here = new URL('./', import.meta.url).href
  const { width, height } = room.prefabs.engine
  // The canvas a page would give its client.
  const mount = (me: Client) => { if (me.plugins.render2d) me.plugins.render2d.canvas = { style: {}, width, height, addEventListener() {}, removeEventListener() {}, remove() {} } }

  // A clock the test moves, as node's `setTimeout` falls due.
  function clock() {
    let now = 0
    let queue: { at: number; i: number; f: () => void }[] = []
    let i = 0
    const time: Time = { now: () => now, after: (ms, f) => { queue.push({ at: now + Math.max(1, ms), i: i++, f }) } }
    const to = (t: number) => {
      for (;;) {
        const due = queue.filter(q => q.at <= t).sort((a, b) => a.at - b.at || a.i - b.i)[0]
        if (!due) break
        queue = queue.filter(q => q !== due)
        now = due.at
        due.f()
      }
      now = t
    }
    return { time, to, get now() { return now } }
  }

  // The wires each way: none, a home connection's, and bad ones, which lose, bunch, reorder and
  // send twice.
  const wires = {
    clean: { delay: 0, jitter: 0 },
    home: { delay: 30, jitter: 10 },
    'bad wifi': { delay: 40, jitter: 40, tail: true, loss: 0.01, burst: 0.2 },
    mobile: { delay: 90, jitter: 80, tail: true, loss: 0.03, burst: 0.3, reorder: 0.02 },
    awful: { delay: 150, jitter: 150, tail: true, loss: 0.08, burst: 0.4, reorder: 0.05, dup: 0.02 },
  }

  // The k-th way sent: along x, under a unit long, and none the same as the 96 before it, so a way
  // drawn late is never this frame's or the last frame's.
  const way = (k: number) => [((k % 97) + 1) / 100, 0]

  test.each(Object.entries(wires))('a seat\'s way over %s is drawn by the frame after it was sent', async (_name, leg) => {
    const truth = boot(structuredClone(file) as Scene, sim)
    await load(truth, here)
    const c = clock()
    vi.spyOn(performance, 'now').mockImplementation(() => c.now)
    const stop = run(truth, c.time)
    const open = (net: Net) => predict(link(loopback(accept(manager(truth)), c.time, net)), file as Scene, here, mount)
    const pages = Array.from({ length: Math.min(2, room.seats) }, (_, i) => open({ up: leg, down: leg, seed: i + 1 }))
    const die = seeded(5)
    // The way drawn before the first press, the way each frame sent, and the way and place drawn after.
    let still: number[] | undefined
    const sent: number[][] = [], drawn: number[][] = [], at: number[][] = []
    for (let f = 0; f < 60 * 6; f++) {
      c.to(c.now + 1000 / 60)
      for (const [i, p] of pages.entries()) {
        const wire = p.client?.plugins.wire
        const me = possessed(wire?.rows ?? [])
        const pressing = i === 0 && !!wire && !!me?.data.placed && p.stats.predicting && f >= 60 * 2
        if (pressing) {
          still ??= me!.data.move
          sent.push(way(sent.length))
          wire!.send(me!.id, 'move', ...sent.at(-1)!)
        }
        if (i > 0 && wire && me?.data.placed && p.stats.predicting && die() < 0.1) wire.send(me.id, 'move', die() * 2 - 1, die() * 2 - 1)
        p.input()
        await p.frame(c.now)
        if (!pressing) continue
        const row = possessed(p.client!.plugins.wire.rows)!
        drawn.push(row.data.move)
        at.push(row.data.pos)
      }
    }
    expect(pages[0].stats.corrections).toBe(0)
    expect(sent.length).toBeGreaterThan(200)
    // Each frame's drawn way is the one sent on that frame or the one before: every press up to the
    // frame before has been taken.
    for (const [k, move] of drawn.entries()) expect([sent[k], k > 0 ? sent[k - 1] : still], `frame ${k}`).toContainEqual(move)
    // And the square it draws runs: its place changes from frame to frame.
    expect(at.slice(1).filter((p, k) => p[0] !== at[k][0]).length).toBeGreaterThan(sent.length * 0.9)
    for (const p of pages) p.close()
    stop.stop()
  }, 600_000)
  ```

  The act, its args and the field it sets are the game's; the wires, the frames and the presses are
  the test's own. A game whose look draws on render3d gives `render3d.canvas` in `mount`, and one
  whose look decodes art in node stands in for `PIXI.Assets.load` (`proving-a-game`, A page in a
  test). Run it with `yarn vitest run games/<game>/<game>.predict.test.ts`, then play the page:
  `client.html` in Chrome against `<game>.server.ts`, a key pressed, the thing moving on the next
  frame.
- Step 6's fixes are proven in the addons' own tests: the server sent each bad message keeps
  stepping and keeps serving its other seats, and a manager with one scene that throws every step
  keeps the seat on its other scene playing.
- When a change touches the wire or a piece, run the guards beside it. For the wire:
  `addons/socket/socket.addon.test.ts`, `addons/scenemanager/scenemanager.addon.test.ts` and
  `plugins/scenemanager/scenemanager.plugin.test.ts`. For what is sent:
  `addons/player/player.addon.test.ts`, `addons/interest/interest.addon.test.ts`,
  `addons/vision/vision.addon.test.ts` and `plugins/vision/vision.plugin.test.ts`. For a press:
  `plugins/player/player.plugin.test.ts`. For the network: `addons/loopback/loopback.addon.test.ts`
  and `addons/simulator/simulator.addon.test.ts`.
- Played: the server running and `client.html` in two windows, each player's thing moving on the frame
  after its key and each seeing the other move. For vision, the Vision panel. For a real session, a
  `?tap=` recording read in the Runs panel.
