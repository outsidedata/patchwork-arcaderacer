---
name: publishing-a-game
description: Use in core, or any clone of it, when a finished game goes to other people or its repo is kept alongside core. That covers publishing, shipping, deploying, hosting, exporting, putting it online, a static host, GitHub Pages or itch.io, `vite build`, sharing it with friends, playing it from another machine or over the LAN, serving `index.html` or `client.html` outside the editor, and running `<game>.server.ts` for others (its port, TLS and `wss://`, what stops it). It also covers taking core's updates (`git fetch upstream`, a merge on a branch, `yarn install`, `yarn tsc`, the tests beside what changed), merge conflicts and a `yarn.lock` conflict, the `upstream` and `origin` remotes, and giving a plugin, an addon, an extension, a script or an edit to a core file back to core as a pull request from a fork.
---

# Publishing a game

A game made in core leaves the editor as the files `yarn new-game` wrote and the ones added since,
in `games/<game>/`, inside a clone of core. This skill is how it gets to other people, how its repo
keeps taking core's updates, and how what was built for it goes back to core. A line that would
tell a game to add a guard, keep a layout, or never hand an addon a copy, so that core does not
break when the game goes out, means core is missing a piece: it is built in its home, with its test,
and the line is never written, here or in a game.

## When it applies

It applies when the game is played by people other than its maker: its pages served to them, its
server run where they reach it. It also covers the repo kept beside core (its remotes, core's updates
merged and proven, conflicts) and anything given back to core.

It does not cover:

- how many seats a scene takes, what each seat is sent, what a seat may send, a press against a bad
  network, and the server's test: `going-multiplayer`.
- making the game and what each of its first files is for: `starting-a-game`.
- which of the game's files are committed, its source and its baked art and never the raw parts the
  bake reads from the library: `committing-a-game`, before every commit of the game.
- a kind's rules: `designing-a-kind`. An editor extension in general: `building-an-extension`.
  Where anything new goes: `prime-directive`.

## What a game is when it leaves the editor

Two ways to play, each a page that is the same in every game but for the file names it imports.
`gameFiles` in `extensions/games/games.route.ts` writes both, and the header of
`addons/scenemanager/scenemanager.addon.ts` says what each does:

- `index.html`: the whole game in one tab over a loopback. The manager, every scene, every rule and
  the drawing run in the player's browser, and no server is involved. It runs nothing ahead and has
  no lag: a press lands on the next step in the same tab. It is one seat on a truth of its own, so a
  second tab is a second game.
- `client.html` with `<game>.server.ts`: the manager runs on node behind a socket, and each
  `client.html` is one seat on it. The page dials
  `ws://${location.hostname}:${file.prefabs.scenemanager.port}`: the host the page was served from,
  on the port in `<game>.scene.json`. It wraps its link in `predict` (the prime directive's The
  pages), `tap(dial(url), wire => predict(link(wire), file, import.meta.url, mount))`, and each frame
  calls `page.input()` and then `await page.frame(now)`. Every scene a seat plays in gives
  `world.predict`, so the page runs it ahead of the server and draws every row from its copy, on the
  frame after the key (`addons/predict/predict.addon.ts`). Without the wrap, or without `world.predict`, every press is
  drawn a round trip after the key. `yarn new-game`'s template still writes `client.html` with
  `view(link(wire), …)` in place of `predict`; the editor that writes it is on hold, so a game's
  `client.html` is put in the shape above, the line the same as every other game's, before it ships.

Neither page is a bundle. Each is an inline module that imports `#engine/…` and `#addons/…`, names
that `package.json`'s `imports` maps to the repo's folders. Of the game's own files, `index.html`
imports `<game>.sim.ts` and `<game>.scene.json`, and `client.html` imports the scene file alone,
without an import attribute. Everything else the game is, the pages reach while they run, by URLs
built at run time.

A browser cannot do this by itself. It cannot resolve `#engine/engine.ts`, run a `.ts` file, or import
a `.json` file without an import attribute. Vite's dev server does all three, and so does the editor's
server, which holds a Vite.

## Which way out

- **Played from your machine** by people on your network: Vite's dev server serves the pages from the
  repo, and node runs the server beside it. That is the next section, and it serves the whole repo to
  that network.
- **Online**: `yarn publish_gh_pages_game <game>`, in Going online below.

## Playing it from your machine

1. **Prove the game where it stands.** Run `yarn tsc`, which checks every `.ts` and `.tsx` in the
   repo, the game's included (`tsconfig.json`). It does not check a page's inline script, because a
   page is HTML. Run each test file of the game: `yarn vitest run <file>` for a `.test.ts` or
   `.test.tsx`, and `yarn test:view <file>` for a `.view.test.tsx`, which `yarn vitest run` leaves out
   (`vitest.workspace.ts`). That is the `<game>.sim.test.ts` that `yarn new-game` wrote,
   `<game>.server.test.ts` (`going-multiplayer`), `<game>.predict.test.ts`, which presses on pages run
   ahead over the network panel's bad wires and holds the seat's own `player` row to every press by the
   next frame (`designing-a-seat`, The proof), and every test beside what you wrote. Play
   `index.html`, then `client.html` against the server, and see your thing move on the frame after
   the key.

2. **Serve the pages**, from the repo root:

   ```
   yarn vite --host --port <port> --strictPort
   ```

   Vite prints its `Local` and `Network` addresses. The pages are
   `http://<address>:<port>/games/<game>/index.html` and `…/client.html`.
   - With `--host`, Vite serves every file of the repo that its deny list leaves out
     (`server.fs.deny` in `vite.config.ts`: `.env`, `.env.*`, `*.pem`, `*.key`, `**/.git/**`). At the
     network address `package.json` came back 200 and `.git/config` 403. Everyone on that network can
     read the repo, `dev.html` and every test included. Use it on a network whose people may.
   - Run it from the root, because a catalogue url is a path from the folder served.
   - Without `--host`, Vite answers on `localhost` alone and says `Network: use --host to expose`.
   - Vite's default port, 5173, is the editor's. Give Vite a port of its own. `--strictPort` makes it
     stop when that port is taken, so it never moves to another port without a word.
   - `yarn editor <game>` serves both pages too, but its server listens on `localhost` alone
     (`editor/server/server.ts`). At the network address it refused the connection. The editor is the
     maker's tool, never the players' address.

3. **Run the server**, on the same machine, from the repo root:

   ```
   node --experimental-strip-types games/<game>/<game>.server.ts
   ```

   - Run it from the root. On node the loader reads a catalogue url as a path under the working
     directory (`plugins/loader/loader.sim.ts`). Started from another folder, the server stopped
     before it served, printing `loader <name>: loader could not read
     /games/<game>/assets/<game>.json: ENOENT`, and exited with code 1.
   - It listens on `prefabs.scenemanager.port` of `<game>.scene.json` on every interface of the
     machine. That port and Vite's must both be open to the players' machines.
   - On Node 22.22 it printed nothing while it ran. A Node 22 before 22.18 prints an
     `ExperimentalWarning` for type stripping as it starts. A throw prints its stack trace, and the
     process ends (What stops the server, below). Nothing in core starts it again. The editor's Node
     panel (`editor/server/servers.ts`) starts it again only when a file it runs changes.
   - The game `yarn new-game` writes takes one seat. A second player's page draws nothing: the socket
     closes with `1013 Error: no seat free: 1 declared`. Raising `seats` and adding a `start` actor per
     slot is `going-multiplayer`'s step 1.
   - A socket's close frees its seat (`ws.on('close', …)` in `addons/socket/socket.addon.ts`). The
     socket never pings, so a player whose machine vanishes without a close holds the seat until the
     operating system gives up on the connection. `lsof -nP -iTCP:<port>` lists the connections.

4. **Hand out the link.** For one player it is `index.html` at the network address, and that player's
   tab runs the whole game. For players together it is `client.html` at the network address, one
   window each. Chrome pauses `requestAnimationFrame` in a tab that is not in front, so of two tabs in
   one window only the front one plays. The link is never `dev.html`.

## Going online

1. **Put it on GitHub Pages.** From the repo root:

   ```
   yarn publish_gh_pages_game <game>
   ```

   Run it again to publish the game's changes. `--owner <owner>` names the GitHub owner when this
   repo's `origin` is not on GitHub. The game is played at
   `https://<owner>.github.io/patchwork-<game>/`. The steps it takes are the header of
   `scripts/publish_gh_pages_game.ts`.

2. **`client.html`** is not on Pages. Its server runs on node (step 3).

3. **Run the server online.** It runs from a clone of your repo with `yarn install`, from the root, as
   in Playing it from your machine, on Node 22.6 or later. Online it meets what follows.

   What stops the server. One process holds every seat, so whatever ends it ends the game for every
   player. Each of these was seen to end it with code 1 and close every other player's socket:
   - A throw in any rule or act. `run` in the scenemanager addon steps the manager from a timer with
     no catch, the engine's `as` passes the throw on (`try … finally` in `engine/engine.ts`), and no
     file of core handles an uncaught exception.
   - One malformed message from any client. The JSON text `5` threw `Cannot use 'in' operator to
     search for 'got' in 5` in `accept`'s `take` in the scenemanager addon. The text `not json` threw
     in the socket addon's `JSON.parse`.

   Each is built in its home, with its test (`going-multiplayer`, step 6): a malformed message dropped
   in the socket addon and in `accept`, and a rule's throw caught in the scenemanager addon's own
   loops, per scene around each scene's step in `load` and per connection around each connection's
   work. It is never caught around the whole manager step in `run`, where one scene's throw would skip
   every later scene and every connection's packet, and a throw that came back every step would
   freeze every seat behind one line of log. A scene that threw is half stepped, so it is not stepped
   again and its seats are let go, and every throw is reported, naming the scene. It is never a `try`,
   a `catch` or a `process.on` in one game's `<game>.server.ts`, which names its transport in one
   line, as a page does.

   A page served over `https://` may not dial `ws://`, and `client.html` dials `ws://`. The page
   dials `wss://` only when the server speaks TLS. `serve` in `addons/socket/socket.addon.ts` makes a
   plain `WebSocketServer`. `upgrades`, beside it, lets an HTTPS server someone else holds carry the
   seats. TLS for the server is built in the transport, the socket addon, with its test.

   `client.html` dials the host it was served from, so the server runs on the machine that serves the
   pages. A server elsewhere, or a scheme other than `ws://`, is a change to what every game's page
   dials, made in `gameFiles` and through the scene file, never in one game's `client.html`.

4. **What a player sees when the server refuses a seat or goes away** is built in the page side of an
   addon. `dial` in the socket addon already learns that the server has gone, through its `gone`. A
   word on the page is a readout and `gone` is a listener, and a page holds neither (prime directive,
   Page). The page line at most hands one addon's function to another, as `client.html` already does
   with `tap(dial(…), wire => predict(link(wire), …))`.

## The pages, where shipping meets them

Every line of a page is the same in every game but the file names it imports (prime directive,
Page). Shipping meets that rule here:

- The port is a value of the scene file, `prefabs.scenemanager.port` in `<game>.scene.json`, which
  `client.html` and `<game>.server.ts` both read. It changes there and nowhere else.
- The host is the page's own: `client.html` dials `location.hostname`. A server's address, a `wss://`,
  a build step's path, a readout or a listener is never put into one game's `index.html` or
  `client.html`. Such a page is no longer the same as every game's.
- `predict` around the link is no one game's line: it is the line of every game's `client.html`
  (prime directive, The pages). A scene that is not to run ahead says so by giving no
  `world.predict`, never by a `client.html` without `predict`. `index.html` never takes it, since its
  page and truth share a tab. A cpu driver, a network panel, two panes or a readout of `stats` is
  `dev.html`'s, never `client.html`'s.
- Accounts and records on a page are the same: what `world.accounts` and `world.persist` ask of
  `index.html`, `client.html` and `<game>.server.ts` is one addon call that `gameFiles` writes into
  every game's pages and that does what the scene file asks, every game moved to it in the same change
  (`persisting-players`, step 7). Never `persist`, `sqlite`, `indexeddb`, `local`, `signin`, a `keep`
  or `accounts` written into one game's page.
- `yarn tsc` never sees a page. When core changes what a page calls (`boot`, `load`, `manager`,
  `accept`, `link`, `view`, `predict`, `loopback`, `dial`, `tap`), only playing the page shows it. Its fix is the
  page as `gameFiles` now writes it, with your game's names.

## The testbed never ships

`dev.html`, beside `index.html`, is where the game is played to find something out (prime directive,
Testbed). Vite's dev server serves it like every other file of the folder, so with `--host` anyone on
the network can open it. It still never ships into anything else, and `yarn publish_gh_pages_game` never takes it.
`index.html`, `client.html` and `<game>.server.ts` are written as if it did not exist. No scene file,
rule, actor, plugin, addon, extension or test imports it, reads what it set, or asks whether it is
running. The game plays the same with it deleted. What it found out that the game needs is built in
its home and reaches `index.html` through the files, never as a line copied out of `dev.html`. Before
a game is handed out, nothing of the game but `dev.html` itself names `dev.html`.

## Your repo and core

From `README.md`: a game's repo is a clone of core made with
`git clone --origin upstream https://github.com/outsidedata/patchwork.git <game>`. It has two remotes:

- `upstream` is core. You read from it and never push to it.
- `origin` is your own repo, added when you make it: `git remote add origin <url>`, then
  `git push -u origin master`.

Everything you change is a commit in your repo and is pushed to `origin`: the game, a new plugin, an
edit to one of core's own files. Core's `.gitignore` names `node_modules`, `dist`, `.DS_Store`,
`addons/simulator/runs`, `tools/dvr/out` and `__pycache__`, and not `games/`, so in a clone `games/<game>/` is
committed like any other folder. Core's own checkout keeps `games/` out with a line in its
`.git/info/exclude`, which no clone copies. Core ships no games: `git ls-files games` in core lists
nothing. Of `games/<game>/`, only its source and its baked art are committed, never the raw parts
its bake reads from the library: `committing-a-game`.

## Taking core's updates

1. `git fetch upstream` downloads core's new commits and changes none of your files.
2. `git switch -c update-core` makes a branch to merge on, so `master` is untouched until the merge
   is proven.
3. `git merge upstream/master` joins core's changes into yours.
4. Prove it:
   - `yarn install`, since core may have changed `package.json`.
   - `yarn tsc`. It names every call in a `.ts` file that no longer matches what core changed.
   - The tests beside what core changed. `git diff --name-only master update-core` lists every file
     the merge changed. Run the test beside each one with `yarn vitest run <file>`, or
     `yarn test:view <file>` for a `.view.test.tsx`, then each test file of the game the same way.
   - The pages. If `git diff master update-core -- extensions/games/games.route.ts
     addons/scenemanager/scenemanager.addon.ts` shows the pages changed, write every page `gameFiles`
     now writes into the game again in the shape it now writes, with the game's names: each of them,
     a page core added included, not only the ones the game had, `client.html` keeping `predict`
     around its link while the template does not write it (The pages, where shipping meets them).
     `dev.html` is `index.html` with changes and follows it.
   - Play: `index.html`, and `client.html` against the server.
5. `git switch master`, `git merge update-core`, `git push origin master`.

Git merges line by line, file by file. A file only you have is never touched. A file only core
changed takes core's version. A file both changed in different places keeps both changes. The merge
stops when both changed the same lines, when one side deleted a file the other changed, or when both
created a file at the same path. It names the file and marks both versions inside it. You write what
the lines should be and commit, or `git merge --abort` puts everything back as it was before step 3.
When `yarn.lock` is in conflict, `git checkout --theirs yarn.lock` takes core's, and `yarn install`
writes it again with both sides' dependencies. Conflicts come from core's files you edited. A general
edit given back to core stops being yours to merge.

A merge with no conflict can still break the game. Core renames a function your plugin calls, and the
lines never touched. Step 4 finds it.

## Giving back

What was built in a top-level home for a game, and is worth having in core, goes to core as a pull
request from a fork of core on GitHub. Once it is merged, the next update brings it back as core's.
Your `origin` is not a fork of core, so the pull request goes from a fork made for it.

What each is before it goes, by the prime directive:

- A plugin, `plugins/<name>/`. Its code names no game and no game kind. Every fixed number it reads is
  `world.<name>`. A plugin it is built on is handed to it, and another plugin's knowledge reaches it
  through a mod, `plugins/<a>/<a>.<p>.ts`. Its editor panel, when it has one, is
  `plugins/<name>/<name>.extension.tsx`. A game's own plugin in `games/<game>/plugins/<name>/` may name
  that game's kinds and reads its numbers off their definitions. It goes to core only once it names no
  game, as a top-level plugin.
- An addon, `addons/<name>/`. It knows no game and no kind, runs where its truth is, and imports from
  `engine/` and other addons, never from `games/`. Its editor panel, when it has one, is
  `addons/<name>/<name>.extension.tsx`.
- An extension of the editor's own, `extensions/<name>/`: `<name>.extension.tsx`, its components in
  `<name>.components.tsx`, and `<name>.route.ts` when it needs the machine. It names no game, kind,
  plugin or field, and builds its panels from `editor/ui/`.
- A script, `scripts/<name>.ts`, with its script in `package.json` and its test, `scripts/<name>.test.ts`,
  on a root of its own, as `scripts/new-game.ts` and `scripts/new-game.test.ts` are.
- An edit to a core file. It goes with every file that uses what it changed and every test of them
  (prime directive, When old code disagrees), and with the header of the file when what the header
  says has changed (When a doc disagrees). `git diff upstream/master master -- <file>` shows how your
  file differs from core's. Only the general edit goes. Anything in a core file that names your game
  was in the wrong home and is moved to the game first.
- The engine is never a pull request. A feature that could not work outside it is an issue on core's
  GitHub repo, with the attempt and the one general fact the engine would hand out (prime directive,
  The engine is frozen).

Its tests boot scenes they write themselves, or a game they write on a root of their own, as
`scripts/new-game.test.ts` does. A test outside `games/` never uses a game in `games/`, because core
has none.

The steps:

1. Fork core once: `gh repo fork outsidedata/patchwork --clone=false`. Then
   `git remote add fork <the fork's url>`.
2. `git fetch upstream`, then `git switch -c give-<name> upstream/master`. The branch holds core and
   nothing of yours. Your game is not in its tree, because core does not track `games/`.
3. `git checkout master -- <path>` for each folder and file that goes: the plugin, addon, extension
   or script with its tests, each mod of it in another plugin's folder, and each core file it changed.
   Where a core file of yours holds more than the general edit, edit it here to that edit alone.
   Commit it.
4. Prove it: `yarn install`, `yarn tsc`, and each of its tests with `yarn vitest run <file>`, or
   `yarn test:view <file>` for a `.view.test.tsx`, and the tests beside each core file it changed. No
   game is in the tree here, so a test that leaned on one fails here, as it would in any clone of core.
5. `git push fork give-<name>`, then
   `gh pr create --repo outsidedata/patchwork --base master --head <you>:give-<name>`.
6. `git switch master`. Once it is merged, take core's updates. Where review changed a file the pull
   request created, the merge stops on it as a file both created. Where review changed a core file the
   pull request edited, it stops as a file both changed on the same lines. Either way core's version
   is the one to keep.

## What goes wrong

- A static host fed the repo, or `vite build`'s `dist/`: the page is blank. `python3 -m http.server`
  over the repo failed on `Failed to resolve module specifier '#engine/engine.ts'`. A built page asked
  for `assets/<scene>.sim.ts` and got a 404. The game goes online with `yarn publish_gh_pages_game`.
- Vite started without `--host`: players on other machines get no answer.
- Vite's dev server handed to the internet: it serves the whole repo.
- The players sent the editor's address: it answers on `localhost` alone.
- The server started from the game's folder, or from anywhere but the root: it exits on its first
  catalogue file.
- The server gone for everyone: one rule threw, or one client sent a malformed message. Each is
  built in its home (Going online, step 3), never caught in `<game>.server.ts`.
- The second player's page is blank: the scene still says `"seats": 1` (`going-multiplayer`).
- A seat held by a player who is gone: their machine vanished without closing the socket, and the
  socket never pings.
- `client.html` served from one machine and the server run on another: the page dials the machine it
  came from.
- `client.html` served over `https://`: the browser refuses its `ws://`.
- Every press drawn a round trip after the key on `client.html`: the page hands the link to `view`
  rather than `predict`, as the template writes it, or the scene gives no `world.predict`.
- `predict` left out of one game's `client.html` as a choice for that game. The page is the same in
  every game; a scene that does not run ahead gives no `world.predict`.
- A server address, a port, `wss://`, a readout or a listener put into one game's page: the page is no
  longer the same as every game's, and the next update's page will not have it. The same for a line
  of `persist`, `local`, `signin` or `accounts`: it is the one call `gameFiles` writes.
- A link to `dev.html` handed out, or a line of it copied into `index.html`.
- `yarn tsc` passes after an update, and a page breaks: pages are not typechecked. Play them.
- A `yarn.lock` conflict written by hand: take core's and run `yarn install`.
- A pull request whose tests import a game: core has none, and the tests fail there.

## How it is proven

- Before it goes out: `yarn tsc`, and each test file of the game with `yarn vitest run <file>`, or
  `yarn test:view <file>` for a `.view.test.tsx`. That includes `games/<game>/<game>.sim.test.ts` and
  `games/<game>/<game>.server.test.ts`, which boots the manager as the server does behind
  `serve(0, …)` and dials seats with `link(dial(url))`, as `going-multiplayer` describes, and
  `games/<game>/<game>.predict.test.ts` (`designing-a-seat`, The proof). It also includes each test
  beside what changed.
- From your machine: played at the network address, not `localhost`. That means `index.html`, then
  the server running and `client.html` in two windows or on two machines, each player's thing moving
  on the frame after their key and each seeing the other move.
- On GitHub Pages: the game played at `https://<owner>.github.io/patchwork-<game>/`.
- What stops the server: the socket addon's and the scenemanager addon's tests send a malformed
  message, and run a manager of two scenes and two seats where one scene throws every step; the
  server still steps for the seat on the other scene and sends it its packets.
- After an update: step 4 of Taking core's updates, the pages played.
- Anything given back: `yarn tsc` and its tests on the `give-<name>` branch, where no game is in the
  tree.
