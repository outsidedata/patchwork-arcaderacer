---
name: auditing-a-game
description: Use in core, or any clone of it, to check a game folder, `games/<game>/`, against every rule of the phase skills and the prime directive while it is being written, and to move what breaks a rule into its home. Triggers on "audit the game", "check the game against the rules", "review the game folder", "does this follow the prime directive", "what is in the wrong place", "clean up the game", before a game or a piece of it is called done, and on picking up a game someone else wrote. It covers each check (a number in a rule or a look, a fixed value on a prefab, an actor importing another, logic in a page, a fetch outside the loader, the seat's thing or its own state on a row the `player` row spawns, a page that does not run the scene ahead, a missing press test, `Math.random` in a rule, `Math.sin` or `**` in a rule, state at the top of a plugin, a seat's argument unchecked, a missing test), the command that finds it, the list the audit hands back (file and line, rule broken, home), and migrating every finding with every file and test that uses it.
---

# Auditing a game

An audit reads one game folder, `games/<game>/`, against every rule the phase skills and the prime
directive give, lists what breaks one, and moves each of those into its home. It is run while the
game is being written, not once at the end: after a phase skill's work, before a piece is called
done, and on picking up a game someone else wrote. The rules are theirs: `prime-directive`,
`starting-a-game`, `designing-a-kind`, `designing-a-seat`, `input-and-seats`, `building-a-level`,
`bringing-in-art`, `writing-the-look`, `scene-flow`, `building-the-hud`, `sound`, `tuning-feel`,
`building-a-plugin`, `building-an-extension` and `proving-a-game`, with `going-multiplayer`'s step 7
and press test for what every page that runs a scene ahead draws. This skill adds none. Each check below names the skill
that says it; where a check and its skill differ, the skill is right and this one is fixed.

A game passes its own tests and breaks rules all the same: every finding an audit makes is one the
game's green tests let through. The tests are where a fix is proven, not where a rule is checked.

## When it applies

It applies to everything in a game folder: its scene files, its data files, its rules and looks,
its pages, its own plugins, addons and extensions, and its tests. It does not cover:

- distribution: seats over a socket, `security`, `vision`, `interest` and a bad network are
  `going-multiplayer`, but for the seat's thing and its pages being run ahead, which every game
  has and this audit checks (Seats and prediction); accounts and records kept between runs are `persisting-players`; hosting a
  game and taking core's updates are `publishing-a-game`.
- core's own folders on their own account. The audit asks whether the game's work changed one (The
  folder, below), and a finding whose migration runs into a top-level plugin, addon or the editor
  (Old code a game writes around, below) is built and proven there by `building-a-plugin` or
  `building-an-extension`, as part of the same job. Nothing in `engine/` is edited.
- what the game should do: what a monster does, how a level plays. That is content, and it is the
  person's. Where a thing goes is never asked; what it does is.

## How it is run

From the repo's root, one plain command per Bash call: no `&&`, `;`, pipes, `$(...)` or heredocs.
Files are read with Read. A command that needs logic is a script file run with `node`.

- Quote every glob grep is handed: `--include='*.ts'`. Unquoted, zsh expands it first and stops the
  whole command with `no matches found`, so the grep never runs, and an empty answer reads as a clean
  one. For the same reason a file list the shell expands, `games/<game>/*.client.ts`, is used only
  once `ls` has shown such files, and a folder a game may not have, `games/<game>/plugins`, is
  listed by its own name, never with `*` after it.
- A name with a dot in it is a fixed string, `grep -rnF "scenemanager.scene"`. As a pattern the dot
  matches any character and every `scenemanager/scenemanager.addon.ts` import is a hit.
- Tests do on purpose some things a game's code may not: they stand in for what node lacks
  (`PIXI.Assets.load`, an `AudioContext`, `globalThis.addEventListener`, a canvas), read scene files
  with `node:fs`, and size a stand-in canvas. Where that matters a check says
  `--exclude='*.test.ts'`.
- A grep finds candidates and reading decides. Every hit is read in its file before it is listed or
  passed over, and a check that cannot be grepped (a write to another row through a function it is
  handed) is done by reading.
- A finding that rests on what the code does when it runs, an act that throws on a bad argument, is
  seen before it is listed: a script in the scratch folder that boots the manager as the game's tests
  do, takes a seat with `connection`, sends the message with `seat.take`, steps inside a `try`, and
  prints what happened. It imports every repo file by its absolute path (`#engine/...` does not
  resolve from outside the repo: `ERR_PACKAGE_IMPORT_NOT_DEFINED`), a scene file `with { type: 'json'
  }`, and runs from the repo's root with `node --experimental-strip-types <script>`. It imports the
  game and writes nothing.

First the baseline, before any check:

1. `ls games/<game>`, and `ls` each folder in it by name. Read every scene file, the definitions, and
   every rule, look, plugin and extension once.
2. The names the checks use: the game's kinds, the keys of `sim` in each `<scene>.sim.ts`
   (`grep -n "export const sim" games/<game>/*.sim.ts`); its scenes, the keys of
   `prefabs.scenemanager.scenes` in `<game>.scene.json`; its own plugins, the folders of
   `games/<game>/plugins` and the names in `world.shipped.plugins`; the plugins each scene lists.
3. Every test file in the folder, run one file a call: `yarn vitest run <file>`, and
   `yarn test:view <file>` for a `.view.test.tsx` (`proving-a-game`). Never a directory and never the
   whole suite. A kind an `actors` entry names that its scene's `sim` leaves out, or that has no
   prefab, shows here as `no code for kind <kind>` or `no prefab for <kind>`.
4. `yarn tsc --pretty false > <scratch>/<game>.tsc.txt`, then `grep -n "games/<game>/" <scratch>/<game>.tsc.txt`.
   It checks the whole repo, so another game's error is in it too.
5. `yarn eslint <file>` on each of the game's `*.extension.tsx` and `*.route.ts`.

## What the audit hands back

A list, one entry per finding:

```
games/<game>/<file>:<line>   what is there
  rule:      the rule it breaks, in a few words (the skill that says it)
  home:      where it goes
  with it:   every file that uses it, and every test that reads it or holds its old place
```

After the findings, one line for each check that found nothing, so the reader knows it ran, and one
for each that did not apply (no tilemap, no sound, no extension). The list is handed back only once
every check's Find has run and every hit has been read, the Tests section's included.

Then each entry is moved to its home (Migrating, below). The list is not the end of the audit.

## The checks

Each check says what breaks the rule, how it is found, where it goes, and what proves the move.
Where no proof is named, it is the test beside the file the fix lands in, run, and seen to fail on the
old code first.

### The folder (prime-directive, starting-a-game)

- **A file named for what it does.** Every file is named after a kind, a scene or the game, beside
  `assets/` and the game's own `plugins/<n>/`, `addons/<n>/` and `extensions/<n>/`. The page loads a
  look by its kind's name, `<kind>.client.ts`, so `helpers.ts` or `coins.ts` is never loaded as one.
  Find: `ls games/<game>` against the kinds, the scenes and the game's
  name. Home: code kinds share goes to a plugin of the game's own, `games/<game>/plugins/<name>/`;
  a kind's code to its kind's files.
- **A kind named after a scene.** `<scene>.sim.ts` is the scene's sim and `<kind>.sim.ts` a kind's
  rule, so a kind named as a scene shares one file with it (`scene-flow`). Find, for each scene:
  `grep -n ": Kind" games/<game>/<scene>.sim.ts`. Home: the kind renamed to a name no scene has: its
  rule, look, prefab, definition entry, `actors` entries, its place in every `sim`, every `w.find`,
  `def` key, `wire.send` and test that names it. The scene's sim keeps `sim` and `scene` alone.
- **A kind named after the game, a plugin or an addon.** `<game>.sim.ts` holds `export const sim:
  Sim = { scenemanager }` and nothing else (`starting-a-game`). A file named after a plugin is loaded
  as the look of that plugin's row. Find: `ls plugins addons` against the kinds. The `player` kind is
  the seat's row and its files are meant to be named so; a `<plugin>.client.ts` written to draw that
  plugin's row is too. Any other is renamed, as above.
- **A port another game uses.** No two games share one (`starting-a-game`). Find: `grep -rn
  '"port"' games --include='*.scene.json'`, reading only each manager's `scenemanager` prefab. Home:
  a port no game has.
- **Core's folders changed for this game.** The engine is frozen, and a top-level plugin never gets
  a setting only one game would set (prime-directive). Find: `git status --short engine plugins addons
  editor extensions`, and `git diff --stat <the branch the work began from> -- engine plugins addons
  editor extensions`. An edit to `engine/` goes back out; a plugin's change for one game is that
  game's kind; a change that is general is built and proven in its home by `building-a-plugin`. A
  defect of core met while making the game is fixed there with its test, never worked around in the
  game, the testbed or a way of looking round it.
- **A core file naming this game.** No file, header, test or skill outside `games/` names a game in
  `games/`, as an example, a model or a fixture: core ships none, and cites its own tests
  (prime-directive, Names and tests). Find, from the root: `grep -rnF "games/<game>" engine plugins
  addons editor extensions scripts .claude README.md`, and `grep -rnw "<game>"` over the same
  folders, each hit read: a test that writes a game of the same name on a root of its own is not one,
  and a word that only spells the game's name is not one. Home: the line cites core's own test or a
  scene its test writes; a test that uses the game is written again on a game it writes itself.
- **A header missing, or one that disagrees with its code.** A rule file has a header saying what
  each field means and what the rule does (`designing-a-kind`); a plugin's file has its header first,
  every field of what it reads with its unit, its row's fields, every function, each mod and what it
  does with none, and the order it is listed in (`building-a-plugin`); a look its header saying what
  it draws from what (`bringing-in-art`); an extension its header with its commands (`building-an-extension`).
  A comment naming a kind, a field, a file or a thing the game does not have is wrong and is fixed in
  the same change (prime-directive, When a doc disagrees). Find: read the top of each file beside
  what the file does. The headers `yarn new-game` wrote (`start.sim.ts`, `player.sim.ts`,
  `player.client.ts`, `<scene>.sim.ts`, `<game>.sim.ts`, the pages' comments, and `body.sim.ts` and
  `body.client.ts` until the fold deletes them) describe the scene file as it was written, so each is
  read again against the scene file and the definitions whenever a prefab, an `actors` entry or a
  data file changes; a header that still says the `player` row spawns a body, or that its row is sent
  to its own seat alone, is a finding once the fold is made (`starting-a-game`, Fold the body into
  the player row). The `start.sim.ts` header says a start
  holds its slot and its `pos` "and nothing else"; once a game's starts carry what the thing they
  become starts with (a `look`, a heading, a speed: `starting-a-game`, `input-and-seats`), that
  header is a finding.

### The pages (starting-a-game, scene-flow, building-a-plugin)

- **A rule, number, readout, listener or scene name in a page.** Every page `gameFiles` writes
  (`extensions/games/games.route.ts`), each `games/<game>/*.html` but `dev.html`, and
  `<game>.server.ts` are as `yarn new-game` wrote them, the same in every game but the file names they
  import (`<game>.server.ts` names no scene in its comment once the game has a second, `scene-flow`).
  Find: `ls games/<game>` for the pages it holds, then `grep -nE
  "addEventListener|keydown|entry|seed|\.go\(|textContent|innerHTML|addons/"` over each of them but
  `dev.html`, named one by one, and `games/<game>/<game>.server.ts`; then read each page beside the
  `page(...)` and `MOUNT` lines of `extensions/games/games.route.ts` for `index.html` and
  `<game>.server.ts`, and `client.html` beside the page `starting-a-game` gives whole (The pages),
  which wraps the link in `predict`: `gameFiles` still writes the `client.html` of before `predict`
  while the editor is on hold, so for that page alone the skill's text is the model and the
  template's is a finding. A page the game lacks, or one in an older shape, is a finding too: it is
  written again as `starting-a-game` (The pages) gives it. A `client.html` that holds two panes, a
  network panel, readouts or keys of its own is a testbed in the wrong page. Home: a rule into its
  actor, a number into the scene file, a key into `player.client.ts`, a HUD into a kind's look, a
  trial, a second seat on one screen or a network panel into `dev.html`.
- **A page attaching the game's own addon.** A game's own addon is a home (prime-directive), but
  nothing loads one by its name the way `shipped` loads a game's own plugins (`building-a-plugin`),
  and a page that attaches it is no longer the same in every game. Find: the page reading above, for
  an import from `./addons/`. Home: the loading built in its home first (prime-directive, When
  something is missing), never a line in the page.
- **`dev.html` bleeding out.** Nothing reads what it set or asks whether it runs. Find: `grep -rnE
  "window\.|location\.|globalThis\." games/<game> --include='*.sim.ts' --include='*.client.ts'
  --include='*.plugin.ts'`, and the page reading above for a line copied across. Home: what it found
  goes into its home through the files.
- **A `dev.html` override made after `load`.** `load` boots each truth from the imported scene file,
  so a scene file, prefab or `world` changed after it reaches no truth, and the page draws a number
  the server never steps with (`tuning-feel`). Find: `ls games/<game>`, and where there is a
  `dev.html`, read the order of its overrides against its `load(`. Home: before `load`; a number to
  turn while it plays is a definition, through `jsonAt`.

### Numbers and values (prime-directive, starting-a-game, designing-a-kind, writing-the-look, building-the-hud, bringing-in-art, input-and-seats, scene-flow)

- **A number in a rule, a look or a game's plugin.** No number is written in code. Find: `grep -nE
  "[^A-Za-z_.0-9][0-9]" games/<game>/*.sim.ts games/<game>/*.client.ts`, the same over the game's own
  plugin files, and `grep -rnE "0x[0-9a-fA-F]+|#[0-9a-fA-F]{3,8}\b" games/<game> --include='*.ts'
  --exclude='*.test.ts'`. Arithmetic on the definition's numbers is no number of its own (`size / 2`,
  `writing-the-look`), nor is a `0` as a first index or an empty count, a `-1` that marks nothing, or a
  `±1` that is a direction or one cell. Every other is a knob: a width a line is drawn at, a gap, a
  count of rotations or frames a table already holds, an offset a move may try, a colour, a speed, the
  angle a ring or an arc starts at (`-Math.PI / 2` is a starting angle, not a direction), the order of
  a line's fields and the gaps between them, spaces in a string included (`designing-a-kind`,
  `building-the-hud`), where a picture or a text stands on its point, its anchor
  (`bringing-in-art`: where the picture stands on `pos` is a number of the definition, never of the
  actor), and an x worked out from a panel's width to centre a thing in it, `box.width / 2`, which is
  a place inside the panel and so the definition's, x as well as y (`building-the-hud`). Home: what changes while the game runs, the kind's prefab; what never changes, the kind's
  definition in `assets/<game>.json`; a place or size inside a HUD panel, the definition of the kind
  whose look draws it, and the panel's place in `world.ui` (`building-the-hud`); the scene's own few numbers, its `world`; a plugin's,
  `world.<plugin>`; a count a table holds, read off the table. Proven by the test reading the number
  off the definition, never typing it again.
- **A word a look shows, written in its code.** Every word a screen or the HUD shows, a title, a
  button's label, the words of a line, is on the definition of the kind whose look draws it, and a
  line of several fields is written there whole, each field named in braces where the look fills it
  in (`input-and-seats`, `building-the-hud`, `scene-flow`). Find: `grep -nE "\b(text|label) *[:=]"
  games/<game>/*.client.ts`, the same over the game's own `*.plugin.ts`, each hit read for a string
  written in the code. Home: the kind's definition, read with `def(plugins.wire, row.kind)`. Proven by
  the look's test reading the word off the panel by its key against the definition.
- **A fixed value on a row.** A row is sent to every seat every step, so a prefab holds what changes
  and nothing else. Find: read each `prefabs.<kind>`, and list what writes each field: the rules,
  `grep -nE "\.[A-Za-z_]+ *(=[^=>]|\+\+|--|\+=|-=)" games/<game>/*.sim.ts`, following aliases such as
  `const d = me.data`; the game's own plugins, read the same way; the top-level plugins the scene
  lists, which write their own fields on the rows of the kinds they act on, each in its header (box2d's
  and box3d's `pos`, `rot`, `vel` and `spin`; walker's `pos`, `yaw`, `vel` and `grounded`;
  box3dvehicle's `compression`, `load`, `grounded`, `rpm` and `torque`: the table in `tuning-feel`);
  and the player addon, which writes the `player` row's `seat`. A field none of them writes never
  changes: it goes to the definition, and a thing whose fixed numbers differ from another's is
  another kind (`designing-a-kind`). Two are a row's though they may never change: the `pos` of a
  thing that stands somewhere, which the editor's placer moves (`designing-a-kind`), and what a
  `start` entry hands the thing it becomes, its `pos` and whatever it starts with (`starting-a-game`,
  `input-and-seats`).
- **A changing field missing from its prefab.** A prefab holds every field that changes, at its
  starting value (`designing-a-kind`). Find: the list of writes above against each prefab. Home: the
  prefab, at its starting value. A field written and read by nothing is asked of the person: whether
  the thing should remember it is content.
- **Where a seat starts, on `world` or in a definition.** It is a `start` actor per slot, `{ "is":
  "start", "slot": n, "pos": [...] }`, which the seat's `player` row finds in `before` with
  `w.find('start', s => s.data.slot === me.data.seat)` (`input-and-seats`). Find: `grep -rnE
  "\"(pads|spawns|starts)\"" games/<game> --include='*.json'`; each scene's starts counted against its
  `seats`, one per slot and never a second for a slot that has one, since `w.find` takes the first
  (`building-a-level`); `grep -n "w.find('start'" games/<game>/player.sim.ts`. A seat that stands
  nowhere, a quiz's or a hand of cards', has no `start`, and a `start`, a `pos`, a `placed` or their
  checks kept for it are a finding: they go, and `player.sim.ts` and `player.client.ts` stay as the
  thing the seat plays and its keys (`input-and-seats`, Where a seat starts).
- **A value only the page uses, on a row or sent.** A volume, a mute, a brightness, rebound keys, a
  best score the page keeps: keys of the store (`building-the-hud`, `input-and-seats`). Find: read
  prefabs and acts for such a field. And every key read has a starting value, or `get` throws `store
  has no <key>`: `grep -rnoE "store\.(get|set|has)\('[A-Za-z0-9_.]+'" games/<game> --include='*.ts'`,
  with every key `world.audio.volume` and `world.synthaudio.volume` name, against the store's starting
  values (Old code a game writes around, below). The other way round is a finding too: a row's value
  copied into the store to cross a move, a score a game-over screen shows, since the store holds only
  what the page alone keeps (`scene-flow`, What crosses a move). Find: each `store.set(` from the same
  grep, read for a value taken off a row.
- **A volume moved by a step of 0.1.** It writes values such as 0.30000000000000004 into the store; a
  screen counts whole steps of its definition's `steps` and divides (`building-the-hud`). Find: read
  every `store.set(` of a number.

### Old code a game writes around (prime-directive, writing-the-look, building-the-hud, input-and-seats)

A plugin with no row, or one only its browser half reads, has no prefab, and fixed data is never put
in `prefabs` (prime-directive). Three plugins of core read their fixed numbers off a prefab, so a
scene that uses them gives one. Each is a break, migrated in one change, every file that uses it
and every test (prime-directive, When old code disagrees), built through `building-a-plugin`: the
first two by the job that uses the plugin, before anything else, and the third by the job it is in
the way of. Each phase skill lists once every file its move touches; the audit points there.

- **render3d's and environment3d's numbers on `prefabs.render3d` and `prefabs.environment3d`.**
  Their home is `world.render3d` and `world.environment3d`, and the job that uses either moves them
  there first (`writing-the-look`, Where the look's numbers go, which lists every file the move
  touches), so a game that lists render3d or environment3d always meets it. Find: `grep -nE
  "\"(render3d|environment3d)\"" games/<game>/*.scene.json`, read for which block each is in. A camera
  written under `world.render3d` with the move not made is read by nothing and the scene draws
  nothing; it is never moved back into the prefab.
- **The store's starting values on `prefabs.store`.** Their home is `world.store`, and the job that
  uses the store moves them there first (`building-the-hud`, step 9, which lists every file the move
  touches), so a game that lists `store` always meets it. Find: `grep -n '"store"'
  games/<game>/*.scene.json`, read for the prefab.
- **The stick's deadzone on the `player` prefab.** `bind` and `control` both read
  `world.player.deadzone` (`deadzone()` in `plugins/player/player.plugin.ts`), and a table that
  holds a side of a stick throws `the player table holds a side of a stick, and the scene gives no
  world.player.deadzone` without it; a `deadzone` left on the `player` prefab is read by nothing and
  rides every `player` row to every seat. Find: `grep -rn '"deadzone"' games/<game>`, read for the
  `player` prefab. It moves to `world.player.deadzone`, in the manager's `world` when every child
  plays by it, and leaves the prefab.

### Rules (designing-a-kind, starting-a-game, scene-flow)

- **`Math.random` in a rule.** No replay gets it back and no page agrees with it. Find: `grep -rn
  "Math.random" games/<game> --exclude='*.test.ts'`. Home: `w.die()`, or `seeded` from
  `engine/engine.ts` over a hash of the row's id and a step count the row keeps. Proven by a test that
  seeks under the recorder (Tests, Replay) and a check against `seeded(world.seed)`.
- **A rule computing with what engines differ on.** `Math.sin`, `cos`, `tan`, `asin`, `acos`, `atan`,
  `atan2`, the hyperbolics, `exp`, `expm1`, the logs, `pow`, `**`, `cbrt` and `hypot` differ between
  node and a browser in the last bit, so a page that runs the scene ahead ends a hair from the server;
  so does anything a rule takes from three outside three's `src/math` (a curve, the scene graph).
  Find: `yarn vitest run games/games.test.ts -t "no game's rule computes"`, which names every rule,
  game plugin's server half and truth-side mod that breaks it. Home: `plugins/math`, `math.sin(a)` for
  `Math.sin(a)`, `math.pow(a, b)` for `a ** b`, and three's vectors, quaternions and matrices for the
  rest (`designing-a-kind`, Maths in a rule).
- **The die rolled in a scene with no seed.** It throws `scene has no seed` the step it first rolls.
  Find: `grep -rnF ".die()" games/<game> --include='*.ts' --exclude='*.test.ts'`, the game's own
  plugins included, then `grep -n '"seed"' games/<game>/*.scene.json` for each scene whose rules roll.
  A plugin rolls too: a skydome3d weather that thunders rolls the die, so its scene has a seed
  (`writing-the-look`). Home: `world.seed` in that scene, or in the manager's `world` for every scene.
  A generated level's seed is never `world.seed`: it is a `seed` key of its recipe (`building-a-level`).
- **Memory between steps off the row.** A browser that arrives later is sent rows and nothing else.
  Find: `grep -nE "^(let|var) |^const [A-Za-z_]+ *= *(new |\[|\{)"` over the rule files and the game's
  plugin files; `grep -rnE "w\.world(\.[A-Za-z0-9_]+)+ *(=[^=]|\+=|-=|\+\+)" games/<game>`. Home: a
  field of the row, its starting value in the prefab.
- **An actor importing another.** Kinds share code through a plugin of the game's own. Find: `grep
  -nE "from '\./[a-z0-9-]+\.(sim|client)\.ts'" games/<game>/*.ts`. A hit in a `<scene>.sim.ts`,
  `<game>.server.ts` or a test is right, and so is a look importing its own kind's rule; one in a
  `<kind>.sim.ts` or `<kind>.client.ts` of another kind breaks it. Home: the shared code to
  `games/<game>/plugins/<name>/<name>.sim.ts`, imported by both.
- **An actor building what a plugin builds.** An actor uses plugins and never builds what a plugin
  builds (prime-directive): frames of a sheet drawn by hand where sprite2d or sprite3d draws them, a
  model posed by hand where anim does, an effect where particle2d or particle3d does
  (`bringing-in-art`, `writing-the-look`). Find: read each look and rule against the plugins core has.
  Home: the plugin's table on `world`, and the look goes.
- **A rule writing another kind's row.** The field then has rules in two files. It calls that kind's
  act (`designing-a-kind`), and a function of a
  plugin writes only the row it was handed, a ledger's row excepted (`building-a-plugin`). Find:
  `grep -nE "w\.(find|get|all)\("` over the rules and the game's plugins, then read each: a write to
  the row found, or the row's array handed to a function that writes into it. The second is found
  only by reading. Home: an act on that kind, called with `w.call`, writing its own field.
- **An array or object of a row written in place.** A rule writes such a field whole, `me.data.pos =
  [x, y]`, and spawns with copies (`designing-a-kind`); a plugin writes new arrays, never element by
  element (`building-a-plugin`). Find: `grep -nE "\.(push|pop|shift|unshift|splice|sort|reverse|fill)\(|\]
  *(=[^=]|\+=|-=|\+\+|--)"` over the rules and plugins, keeping the hits on a row's field or on an array
  a row handed in (a destructuring, a type, or an array the function just made is not one); and each
  `w.spawn(` read for data that is another row's array or an entry of
  `w.world.scenemanager.actors`. Home: the field written whole from a new array; a plugin function that
  hands back the new array for the act to write.
- **A definition read by another kind's name.** An actor reads what never changes off its kind's
  definition (prime-directive, Actor), and a game's own plugin reads every number off the definition
  of the kind whose row it was handed, so code two kinds share, a test of touching, is that plugin's
  (`designing-a-kind`). Find: `grep -rnE "def\((w|plugins\.wire), *('|[A-Za-z_]+\.kind)" games/<game>
  --exclude='*.test.ts'`, each hit read: `def(w, me.kind)` in a rule and `def(plugins.wire, row.kind)`
  in a look are the row's own; a kind's name in quotes, or the `.kind` of any other row, is another
  kind's. Home: a function of a game's own plugin, handed the other row and reading that row's
  definition, `games/<game>/plugins/<name>/<name>.sim.ts`; or, for a big table both kinds read, a data
  file of its own in `assets/`, catalogued, named by a field of each definition and read with
  `json(w, name)`.
- **A spawned kind missing from a scene's `sim`.** An `actors` entry of such a kind throws at boot,
  but a spawned row throws a TypeError at its first step, which no test sees until something spawns it
  (`designing-a-kind`). Find: `grep -rnoE "w\.spawn\('[a-z0-9]+'" games/<game> --include='*.ts'`, each
  kind against the `sim` of every scene its spawner runs in, and its prefab there.
- **A seat's argument unchecked, or a throw on one.** An act's arguments from a seat, straight or
  passed on through `w.call`, come from outside the program; the act checks them and does nothing
  with a bad one (`designing-a-kind`, `input-and-seats`). A throw there leaves the step, and on node a
  throw inside `run`'s timer ends the server (`starting-a-game`). The acts: every act a kind lists in
  `open`, every `player` act that takes arguments, and `arrive`. `arrive` can be forged: the seat may
  send it at its own `player` row, and `go` is open with any args, so it takes its args only while the
  fields they fill are unset and checks each one's type and range, a score up to the most the game can
  give; a value carried as args can still be forged up to that bound, so one that must not be forged
  at all never rides as args and is a record the server keeps per account (`scene-flow`). Find:
  `grep -nE "open:|throw |arrive" games/<game>/*.sim.ts`, then read every act's arguments. Home: the
  same act, returning on a bad argument. Proven by the kind's test
  sending each bad argument with `seat.take` and stepping, and `arrive` sent twice: the step runs and
  nothing changes.
- **An act in `open` that only rules or the `player` row reach.** `open` is for an act any seat may
  send at a row it does not own; a kind reached only through rules or through the `player` row lists
  no `open` (`designing-a-kind`, `input-and-seats`). Find: the `open:` hits above, each read for who
  sends it. Home: the `open` entry goes.
- **A seat's thing, or its own state, on a row the `player` row spawns.** The `player` row is the
  thing the seat plays as, and everything the seat owns, its place, health, ammo, lives, score,
  laps, is a field of it (prime-directive, Row or local; `designing-a-seat`; `designing-a-kind`,
  step 2). Find: `grep -n "w.spawn(" games/<game>/player.sim.ts`,
  each hit read: a row spawned once, in `before` or an `arrive`, whose id the `player` row keeps in a
  field (`body`, `car`, `hero`, `tally`, `hud`) is one, and so is a kind whose rule ends its row when
  no `player` row names it, `grep -rnE "w\.all\('player'\)\.some" games/<game> --include='*.sim.ts'`;
  a shot, a ball or a footprint the seat's thing makes and lets go of is not. Then each prefab of a
  kind keyed by slot or by a player's id, read for a field that is one seat's own. Home: the fields
  onto the `player` prefab, the rule's hooks and acts into `player.sim.ts`, its look into
  `player.client.ts` drawn for every row, its definition into the `player` entry, its entry in a
  plugin's kind table under `player`, and the spawned kind's files, prefab, `sim` entry and
  definition deleted (`starting-a-game`, Fold the body into the player row, is the shape for any
  game). A field only its own seat may read is listed in the scene's `security` block,
  `{ "player": { "<field>": "me" } }`, with `masks: []` on the `player` prefab. A value no seat owns,
  a team's total or the coins left, stays a kind of its own. Proven by the kind's tests read off the
  `player` row and by `<game>.predict.test.ts` (Seats and prediction).
- **`w.find` or `w.get` where the row may be gone.** Both throw. A row that may have ended is asked
  with `w.all`. Find: the `w.(find|get|all)` list above, read for kept ids.
- **A rule that reads another row's move in `tick`.** It reads it a step late whenever that row
  stands later; it reads it in `after` (`designing-a-kind`). Find: read each rule that tests one row
  against another.
- **An event raised as a field set for one step.** A page reads only the last packet a frame takes;
  an event is raised on a ledger (`designing-a-kind`, `sound`). Find: read for a field a rule sets and
  clears the next step that a look reacts to.

### Looks (designing-a-kind, writing-the-look, bringing-in-art, building-the-hud)

- **A look's variable set where it is declared, or a plugin asked in `setup`.** The page imports a
  look once per row, so a top-level variable is set in `setup`. On the first packet `setup` runs before
  any plugin ticks: `ui.show` (which never works in `setup`), `store.get`, render3d's camera,
  render2d's `place`, `project`, `camera`, `ground` and `depth`, and a game's own plugin are asked in
  `tick`; render3d's `scene`, `THREE` and `dress`, and `render2d.layer(name)`, are there from the start
  (`writing-the-look`, `building-the-hud`, `building-a-level`, `building-a-plugin`). Find: `grep -nE
  "^(let|var) [A-Za-z_]+[^:]*=" games/<game>/*.client.ts`; `grep -n -A 15 "export function setup"
  games/<game>/*.client.ts`, read.
- **`remove` that does not take off and dispose what `setup` made, or that destroys the loader's.**
  `remove` takes off and disposes what `setup` made, and never a texture, a sheet or a model, which are
  the loader's (`writing-the-look`, `bringing-in-art`). Find: each look's `remove`, read against its
  `setup`.
- **THREE or PIXI imported as a value.** THREE is `plugins.render3d.THREE` and PIXI
  `plugins.render2d.PIXI` or `plugins.ui.PIXI` (`writing-the-look`). Find: `grep -nE "^import [^t].*from
  '(three|pixi\.js)'" games/<game>/*.client.ts`, read for an import that is not `import type`.
- **A look copied from another.** Two looks that would be one code under two definitions, a title
  card and a game-over card, are one shared look, written once in the browser half of a plugin of the
  game's own and loaded by `shipped`, and those kinds have no `<kind>.client.ts` (`designing-a-kind`,
  Shared code and systems; `building-the-hud`; `scene-flow`). Find: `ls games/<game>` for the looks,
  then a script in the scratch folder, run with `node`, that reads every `*.client.ts` of the folder
  and prints, for each pair, the share of the shorter file's trimmed, non-blank lines the other holds
  too; the pairs are read side by side from the highest share down. Home: the plugin's browser half,
  drawing every row of those kinds from `plugins.wire.rows`, each with its own kind's definition; the
  copied looks go.
- **The HUD built once and torn down.** A panel takes only what `ui.show` hands out, every frame.
  Find: `grep -nE "panel\([^)]*\)\.addChild" games/<game>/*.client.ts`. Home: `ui.show` in `tick`.
- **The thing to focus first shown after the others.** The focus goes to the first interactive thing
  a modal showed (`building-the-hud`). Find: read each screen's look for the order it shows things.
- **A pause key that is not a keyboard `back`.** On a screen the game puts up the UI takes every key
  but `world.ui.keys.back`, and no gamepad key reaches the game while a modal has the input, so the key
  bound to the act that clears the screen is a keyboard key named in `back`; a pad leaves by the
  screen's button, under `control` (`building-the-hud`). Find: the key `player.client.ts` binds to that
  act, against `grep -n '"back"' games/<game>/*.scene.json`. A screen the game must stop for is shown
  because a row says so, never a panel with a `key`.
- **A menu panel with a `key` and no `modal`.** Its key never closes it, nor does `back`
  (`building-the-hud`). Find: each scene's `world.ui.panels`, read.
- **A modal with keys missing.** A scene with a modal names all six of `world.ui.keys`, `up`, `down`,
  `left`, `right`, `press` and `back`, or a key pressed while it is up throws (`building-the-hud`).
  Find: each scene's `world.ui` (its own or the manager's), read.
- **A plugin's drawing and a look both drawing one kind.** Find: the kinds `world.sprite2d.kinds`,
  `world.sprite3d.kinds`, `world.anim.kinds` and `world.solids.kinds` name, against the look files in
  `ls games/<game>`. Home: the plugin's; the look goes.
- **A size in pixels under a `world.render2d`.** Under every `world.render2d`, an identity ground
  and one given only for its layers included, a definition's sizes are in the world's units, drawn
  scaled by `render2d.ground()`, a header says units, and the look's test proves the scaling on a
  scene file of its own whose ground is not identity (`writing-the-look`). Find: `grep -n
  '"render2d"' games/<game>/*.scene.json`, then each look and header of a scene that gives it, read
  for a size drawn unscaled or the word pixels; each such look's test, read for its ground.
- **A 3D material not dressed, or a shadow half set up.** Every material goes through
  `render3d.dress`; a shadow takes render3d's `shadows`, a light that casts, and `castShadow` and
  `receiveShadow` on each mesh (`writing-the-look`). Find: `grep -nE "new [A-Za-z.]*Material\(|castShadow|receiveShadow"
  games/<game>/*.client.ts`, read.
- **A page-only look setting applied by an actor.** A brightness a 3D look honours is a change to the
  plugin that owns the exposure, and a 2D one to the renderer, which names the store key in its own
  table; `light2d.ambient` is not a brightness, and an actor writing `renderer.toneMappingExposure` is
  written over (`writing-the-look`). Find: `grep -nE "toneMappingExposure|ambient\(" games/<game>/*.client.ts`,
  read. Home: the plugin, in its home (`building-a-plugin`).

### The scene's look (writing-the-look)

- **A plugin listed where nothing says so.** Most plugins listed out of order throw, and the tests
  show it; some do not. Before render3d: skydome3d, terrain3d, ocean3d, scatter3d, environment3d,
  solids, flight3d and box3dvehicle. Before render2d: sprite2d, tilemap, vision and volley2d. Listed
  after, each draws a frame behind and nothing says so. Find: read each scene's `plugins`. The rest of
  the order is under The order of things, below.
- **The camera's `far` short of the sky.** skydome3d's dome is clipped where its depth along the
  view passes `far`, so `far` is past `look.radius`. Find: render3d's `camera.far`, in
  `world.render3d` once the move above is made, against `world.skydome3d.look.radius`, read.
- **scatter3d with no `land` mod.** It draws nothing until one hands it a ground. Find: `grep -n
  '"scatter3d"' games/<game>/*.scene.json`, read for `world.scatter3d.mods.land`.
- **environment3d's floor as the ground under a sky or a shadow.** It is not dressed and takes no
  shadow, so it stays dry in the rain and nothing casts on it. Home: terrain3d, or a change to
  environment3d in its home. Find: a scene listing environment3d with a `floor` beside skydome3d or a
  casting `sun.shadow`, read.

### The order of things (writing-the-look, building-the-hud, sound, input-and-seats, building-a-plugin)

- **`store` after `player` under `control`, or after `synthaudio`.** Under `control` the player
  plugin throws `store is listed after player` (`plugins/player/player.plugin.ts`, `input-and-seats`);
  after `synthaudio`, `store.get` throws only where a page has an AudioContext, so a node test never
  sees it (`sound`).
- **A plugin that shows on the ui listed on the wrong side of it.** One that shows in its
  `afterTick` is listed before `ui` (chat, party and cutscene throw otherwise); one that shows in its
  `tick` after it; `local`, whose actors tick in its own `tick`, after `ui`; and `shipped` stands
  where the game's own plugin it loads would (`building-the-hud`).
- **A mod's provider listed after the plugin that asks it `ahead`.** It throws (`writing-the-look`,
  `building-a-plugin`).
- **The audio ledger's entry behind what raises a sound.** `{ "is": "audio" }` stands in `actors`
  ahead of every actor that raises a sound in its own `before`, and ahead of the cutscene row (`sound`).
  Find: each scene's `actors`, read.

### Files (bringing-in-art, building-a-level, sound)

- **A fetch, a decoder or a path in code.** Every file is a catalogue entry, `world.loader.assets`,
  reached through the loader. Find: `grep -rnE "fetch\(|Assets\.load|TextureLoader|GLTFLoader|new
  Audio\(|AudioContext|XMLHttpRequest|readFile|/games/|\.(png|glb|tmj|tsj|wav|mp3|ogg)'" games/<game>
  --include='*.ts' --exclude='*.test.ts'`. Home: an entry of the catalogue, its name read off a
  definition, a plugin's table or the row; a type the loader lacks is added to the loader
  (`bringing-in-art`).
- **An entry's name written in code.** Find: `grep -rnE "loader\.(get|load|on|model|ready)\('|sound\(w,
  *'" games/<game> --exclude='*.test.ts'`. Home: the definition (`image`, `sounds`).
- **An entry that cannot load.** Find, in each scene file's catalogue: a `url` with no leading `/`,
  `grep -nE "\"url\": *\"[^/]" games/<game>/*.scene.json` (a node test that reads the file passes, and
  the page stays blank or the art goes missing); a `.gltf` where the loader takes only a `.glb`; a
  `for` other than `"ui"`, or `"for": "ui"` in a scene that lists no `ui`; `space`, `wrap` or
  `anisotropy` on anything but a `texture` render3d decodes; a `sound` entry in a scene that lists no
  `audio` (`sound`); a HUD icon never preloaded, loaded or awaited. Each fails.
- **`nearest` on a `texture`.** The entry loads and the picture is filtered smooth, since the loader
  does not read it there. Find: `grep -n "nearest" games/<game>/*.scene.json`, read for the type. Home:
  a `sheet` with `nearest`.
- **The HUD drawing the game's entry.** An image the HUD shows is an entry with `"for": "ui"`, and a
  file both draw is two entries (`bringing-in-art`, `building-the-hud`). Find: each `ui.show` that draws
  `loader.get(...)`, its entry read.
- **A child scene's catalogue dropping the manager's.** A child that gives `world.loader` has only
  its own entries. Find: the scene files' `world.loader` blocks, read.
- **A sprite sized before its texture lands.** `setSize` then scales the empty texture's one pixel.
  Find: `grep -rn "setSize" games/<game> --include='*.ts' --exclude='*.test.ts'`. Home: `width` and
  `height`, which hold when the texture arrives.
- **A row saying whether a file has landed.** A fetch takes a different time on every machine; the
  page asks the loader (`bringing-in-art`). Find: read the prefabs for such a field.

### Levels (building-a-level)

- **The map on a row.** The tilemap row holds `edits` and nothing else, never the map or its file's
  name. Find: `prefabs.tilemap` in each scene file, read.
- **A row made from the map.** A Tiled object makes no row; starts, enemies and pickups are `actors`
  entries, in the scene file or its `<level>.actors.json`. Find: `grep -nE "objects\(" games/<game>/*.sim.ts`,
  read for a `w.spawn` from what it hands back.
- **A level made while the game runs.** A generated level is two files the game's level tool writes
  before the game boots. Find: `grep -rn "mapgen" games/<game> --include='*.sim.ts' --include='*.client.ts'
  --include='*.plugin.ts'`.
- **A 3D actor left at y = 0 under the land.** Place writes y = 0; only solids and walker stand a row
  on the land themselves. Find: the `actors` entries of a scene with terrain3d, their `pos[1]` read
  against the land. Home: the land's height written into `pos[1]` of its entry.
- Proven by the scene's test, `<scene>.sim.test.ts`: every start stands clear of the walls for the
  thing the seat plays, its `player` row, and every cell that thing can stand in is reachable from
  every start.

### Sound (sound)

- **A sound played by a look.** Every sound a rule causes goes on audio's ledger; a look neither
  fetches nor decodes one, nor plays a cue when a field changes. Find: `grep -rnE "new Audio\(|AudioContext|decodeAudioData|audio\.|synthaudio\."
  games/<game> --include='*.client.ts'`, read. A note a player plays on their own instrument, a
  `synthaudio` attack from a key, is the page's and sends nothing. Home: `sound(w, cue, at, from)` in
  the rule that made the change, the cue on the kind's definition under `sounds`.
- **The cue table on the ledger.** `prefabs.audio` holds `step`, `next` and `live`; the table is
  `world.audio`; a scene that raises sounds has one `{ "is": "audio" }`. Find: the scene files' `audio`
  blocks, read.
- **A cue a definition names that `world.audio.cues` lacks.** The server raises it without a word,
  and the page throws `audio has no cue <name>` on the frame its entry arrives; a node test without an
  AudioContext never sees it. Find: every `sounds` table in the definitions against `world.audio.cues`.
- **A placed sound with no listener's numbers.** Under render3d a placed sound needs
  `world.audio.space`, under render2d with a `world.render2d` it needs `world.audio.screen`, or audio
  throws. Find: each `sound(` with an `at` or a `from`, against its scene's renderer and `world.audio`.

### Seats and input (input-and-seats)

- **A listener of the game's own.** The player plugin listens; `player.client.ts` hands it one table
  in `setup` and calls `unbind` in `remove`. Find: `grep -rn "addEventListener" games/<game>
  --exclude='*.test.ts'`.
- **An action bound before its act exists.** The engine refuses every press of an act the `player`
  kind does not have, and the key does nothing with nothing said. Find: every act `player.client.ts`
  sends against the acts of `player.sim.ts`.
- **The slot passed as a seat.** `go` and every act take the truth's seat number, never
  `me.data.seat`. Find: `grep -rnE "'go'|scenemanager\.go\(" games/<game> --exclude='*.test.ts'`, each
  read for the seat it passes; a hook passes one its row kept from an act (Scenes, below).
- **`control` set up wrongly.** Actions and the deadzone on the `player` prefab, `store` listed after
  `player`, the controls screen built in `player.client.ts` or as a plugin, or its places in its code.
  Find: `grep -n "control(" games/<game>/player.client.ts`, then read each scene's `plugins` and
  `world.player`.
- **A child giving `world.player` that drops the manager's.** A child's own `player` key replaces
  all of it, `actions`, `deadzone` and `repeat` together. Find: `grep -n '"player"'
  games/<game>/*.scene.json`, read for `world` blocks.

### Seats and prediction (designing-a-seat, going-multiplayer, input-and-seats, sound)

Every seat is sent every `player` row; the seat's own carries `mine`, and `possessed(rows)` finds
it. The thing a seat controls, and all of its own state, are fields of its `player` row. On
`client.html` the page draws every row from the copy that runs ahead (`addons/predict`), on the frame
after the key. A game can break this and still pass every test that reads the server's rows, so each
check here is run on every game whose seat controls anything.

- **The thing the seat plays as on a row the `player` row spawns.** Find: `grep -n "w.spawn("
  games/<game>/player.sim.ts`, each hit read for a row spawned once and kept by id; `grep -nF
  "w.call(w.get(me.data." games/<game>/player.sim.ts`, an act forwarded to such a row; and the
  generated `body.sim.ts`, `ls games/<game>`. Home: the `player` row, the whole of it moved as
  Rules has it (A seat's thing, or its own state, on a row the `player` row spawns).
- **The seat's own row found as the first `player` row.** `rows.find(r => r.kind === 'player')` is
  whichever seat's row came first. Find: `grep -rnF "kind === 'player'" games/<game> --include='*.ts'
  --include='*.html'`, each hit read: in a look, a page, a browser plugin, a playtester's think or a
  test, one that means the seat's own row is a finding; a rule or a filter over every seat's row, a
  touch asking whether a row is a seat's thing, is not. Home: `possessed(rows)`, imported from
  `#plugins/player/player.plugin.ts` on a page, a look or a browser plugin and from
  `#addons/player/player.addon.ts` in a rule, a test or a node script.
- **Keys bound, or the camera moved, for every seat's row; or the thing drawn only for `mine`.**
  `player.client.ts` is set up once for every `player` row the page is sent. It draws the thing for
  every row, and binds keys, moves the camera and starts a playtester only for the row that is
  `mine` (`designing-a-seat`, The look). Find: `grep -nE "\.(bind|control)\(|camera|playtester"
  games/<game>/player.client.ts` and `grep -n "mine" games/<game>/player.client.ts`, then its `setup`,
  `tick` and `remove` read: each bind, camera move and playtester behind the row being `mine`, the
  drawing before any return on it, `unbind` only for the row that bound. Every other look that binds:
  `grep -rnE "player\.(bind|control)\(" games/<game> --include='*.client.ts'`, read the same way.
- **An act on the `player` row that only rules should call.** A seat may send any act its own
  `player` row has, so `hurt`, `award`, `heal`, `gain` or `power` there is one it sends itself
  (`designing-a-seat`, Acts a seat can send). Find: `grep -n -A 60 "acts:" games/<game>/player.sim.ts`,
  every act listed; each against what `player.client.ts`, the HUD's buttons and the pages send
  (`grep -rnE "'[a-zA-Z]+'" games/<game>/player.client.ts`, read); and `grep -rnE "w\.call\("
  games/<game> --include='*.ts' --exclude='*.test.ts'`, each call read for one made on a `player`
  row. An act other kinds call that does not return at once for `seat >= 0` is a finding. Home: the
  act refusing a seat, `if (seat >= 0) return`, called by rules with `-1`, or the effect a plain
  function of a game plugin, handed the row. Proven by the kind's test sending that act from the
  seat's own connection with `seat.take`: the step runs and the row is as it was.
- **A scene a seat plays in with no `world.predict`.** Without it the page draws the packets, its own
  thing a round trip late. Find: `grep -n '"predict"' games/<game>/*.scene.json`, against each scene
  whose `plugins` list `player`, read; the manager's `world` gives it to every child. A block of
  another shape than `{ epsilon, cutoff, halflife, snap, below }` throws as the scene loads.
  Home: the block in that scene's `world`, or the manager's (`starting-a-game`, Fold the body into
  the player row, step 1).
- **`client.html` that does not wrap `predict`.** Find: `grep -nF "predict(" games/<game>/client.html`;
  nothing is a finding. Then the page read whole against `starting-a-game` (The pages): `tap(dial(url),
  wire => predict(link(wire), file, import.meta.url, mount))`, `page.input()` then `await
  page.frame(now)`, and nothing else; `index.html` read against the same section, `view` over a
  `loopback`, input, steps, `page.frame(owed / dt)`, and no `predict`. Home: the page written again
  as that section gives it, its extra lines into `dev.html`.
- **No press test.** Find: `ls games/<game>` for `<game>.predict.test.ts`; then the file read for
  pages made by `predict(link(loopback(accept(manager(truth)), time, net)), ...)` on a server stepped
  by `run`, a clean wire and bad ones, a press every frame at `possessed(...)`'s id, the row drawn,
  `possessed(page.client.plugins.wire.rows)`, checked on every frame against the presses sent by the
  frame before and by that frame, and `stats.corrections` 0 (`going-multiplayer`, How it is proven).
  A test of the server's rows alone, or a simulation of `view` pages, is not one. Home: the test,
  beside the manager, run with `yarn vitest run games/<game>/<game>.predict.test.ts`.
- **The seat's own sounds raised on the ledger.** A sound the seat's thing makes, its jump, shot or
  hurt, raised `from` its `player` row rides that row's `voiced` list and is heard on the frame after
  the key; one raised with only `at`, or `from` another row, goes on the ledger and is heard a round
  trip late on its own page (`plugins/audio/audio.sim.ts`, `sound`). Find: `grep -rnE "sound\(w|'play'"
  games/<game> --include='*.ts' --exclude='*.test.ts'`, each hit in `player.sim.ts`, or in a rule
  acting on a seat's thing (a hit on it, a pickup by it), read for its `from`. Home: `from` the
  `player` row's id, `sound(w, cue, undefined, me.id)`.
- **A `player` row a rule ends or spawns.** The player addon spawns one for each seat and ends it when
  the seat leaves; a respawn resets the same row's fields, so the seat keeps its row id and its page
  keeps predicting it (`designing-a-seat`). Find: `grep -rnE "w\.end\(|spawn\('player'"
  games/<game> --include='*.sim.ts'`, each read for a `player` row. Home: the fields reset from its
  start in the row's own rule.
- **A seat's private field hidden by moving it off its row.** Find: the `security` block of each
  scene, `grep -n '"security"' games/<game>/*.scene.json`, against the kinds the `player` row spawns
  (above). Home: the field on the `player` row, listed `{ "player": { "<field>": "me" } }`, with
  `masks: []` on the `player` prefab.
- **A test of a scene that runs ahead numbering a visit's messages with a gap.** The scene takes a
  seat's messages in order from 1, and one numbered past a gap waits for ever, so the test reads a
  row that never changes. Find: `grep -nE "seq:" games/<game>/*.test.ts`, read for each visit's
  numbers. Home: `++seq` from 1 per visit, as the client numbers them.

### Scenes (scene-flow)

- **What every scene reads copied into each.** `world.defs`, `world.loader`, and any `world.<plugin>`
  every scene uses go into the manager's `world` once, where every child inherits them. Find: the
  scene files' `world` blocks, read side by side (`grep -nE "\"(defs|loader)\": *[\"{]"
  games/<game>/*.scene.json` starts it; the loader's prefab hits too). Home: `<game>.scene.json`'s
  `world`. With it: every test and extension that reads a scene file's own `world` rather than the
  scene's merged `world` (a session's `scene(name).world`), and any test holding that each scene's
  file gives them.
- **A scene written by hand missing a piece.** It lists `scenemanager` in its `plugins`, has a
  `"scenemanager": { "out": {} }` prefab and an `actors` entry for it, a `loader` prefab and entry, and
  an `engine` prefab with `dt`, `width` and `height`; its sim names every kind it makes rows of and
  exports the scene file as `scene`. Find: each scene file and sim, read.
- **A scene name in code.** Find: the `'go'` list above and `grep -rnE "go\('[a-z]" games/<game>
  --exclude='*.test.ts'`. Home: a field of the scene's own `world` for a name that differs from scene
  to scene; a field of a kind's definition for a name every scene would give alike. An exit's
  `actors` entry holds only which exit it is, a key, and the level's `world` maps each key to the
  scene it leads to; a destination is never on an `actors` entry, where the row carries it to every
  seat every step.
- **A field naming a scene, bound to nothing.** The game's own extension, `games/<game>/<game>.extension.tsx`
  exporting `<game>`, binds each to the scenemanager's type: a definition's field with
  `ed.bind('<kind>', { <field>: 'scenemanager.scene' })`, a `world` field of the scene files with
  `ed.bindFile(path => path.endsWith('.scene.json'), { 'world.<field>': 'scenemanager.scene' })`, or
  `'world.<field>.*'` for a map of exits. Find: each scene's name grepped in `games/<game>/assets` and
  the scene files (past the manager's `scenes` and `entry`), then `grep -rnF "scenemanager.scene"
  games/<game>`. The first game that names a scene in `world` extends `namingsOf` in
  `plugins/scenemanager/scenemanager.extension.tsx` to walk each scene file's `world`, with its test
  beside it. Proven by `<game>.extension.test.tsx` (`ed.typeOf`, and `removeScene` refused).
- **A hook calling `go` with a seat nobody stored.** A hook has no seat. `player.client.ts`'s `setup`,
  for the row that is `mine`, calls an act of the `player` row that writes the seat it is handed, on
  every arrival; `arrive` writes it only when the `go` carried args. Find: each hook that calls `go`,
  read for where its seat came from.
- **A level whose `player` waits for `arrive`, entered with no args.** The row never stands: every
  `go` into that level carries args, a title's button included. Find: each `go` into such a level,
  read.
- **Args sent to a scene that lists no `player`.** They are dropped. Find: each `go` with args,
  against the next scene's `plugins`.
- **A menu, a results screen or a game-over screen that lists `player`.** It seats by slot, so a
  screen whose slots are all taken holds a later seat back; it runs the level's `player` rule and binds
  the level's keys; and listed so its seat takes `go`'s args as `arrive`, it gets round the piece
  core lacks as a store copy does (`scene-flow`, step 4). Find: each scene with no `start`, read for
  `player` in its `plugins`; a game whose seat stands nowhere has no `start` in any scene, so each
  such scene is read for whether it is a screen or where the seat plays. Home: the screen lists no
  `player`; what the seat carried reaches its `enter` act, built in `connection` in
  `addons/scenemanager/scenemanager.addon.ts` with its test first (What crosses a move).
- **A level that can be won or stuck with no way back, or one that starts itself over unasked.** On
  the server every later seat finds it as it was left, a race already won joining a race that is
  over; and which way back it has is the person's (`scene-flow`, step 6). Find: each scene's rules
  read for a win or a dead end, and its table entry for an `enter` act. Home: a restart act or an
  `enter` act, the one the person chose when asked.
- **A scene with kinds of its own handing out another's sim.** Find: `grep -n "export { sim }"
  games/<game>/*.sim.ts`, each read against its scene's kinds.
- **A cutscene's cast without a `go` act.** Every kind `world.cutscene.kinds` names has a `go` act, or
  the call at the cutscene's end throws. Find: `world.cutscene.kinds`, each kind's acts read.
- **What assumed one scene.** The generated `<game>.sim.test.ts` goes from the entry first; the scene's
  name comes out of the comments of `<game>.sim.ts` and `<game>.server.ts`, and `<scene>.sim.ts` names
  the manager's `world.defs`. Find: read them against `entry`.

### The HUD's plugins (building-the-hud)

- **Chat on a page before `ui.entry` exists.** chat's text entry is `ui.entry`, which the ui plugin
  does not have, so a chat box on a real page throws. Find: `grep -n '"chat"' games/<game>/*.scene.json`.
  Home: `entry` built in `plugins/ui/ui.plugin.ts` first, tested there.
- **A frame-rate readout outside `dev.html`.** `stats` is a readout of `dev.html`'s own, listed in its
  copy of the scene in memory. Find: `grep -rn "stats" games/<game> --include='*.json' --include='*.ts'`,
  read.

### Feel (tuning-feel)

- **The three step rates apart.** The manager's `prefabs.engine.dt`, its `prefabs.scenemanager.dt` and
  each child's `prefabs.engine.dt` are one number. Find: `grep -n '"dt"' games/<game>/*.scene.json`.
- **A velocity stepped with Euler, or a top speed typed beside the law's numbers.** The law is solved
  over `dt`; a top speed beside `accel` and `friction` is a second number for one fact. Find: `grep -nE
  "\+= .*\* *dt" games/<game>/*.sim.ts`, read for a velocity; the definitions read.
- **A definition kept from an earlier read.** A number kept in a module variable is never the one
  the editor or `dev.html` changed. Find: `grep -nE "^(const|let) .*def\(" games/<game>/*.ts`. An arrow
  that calls `def` each time it is called is not one.

### The game's own plugins and addons (building-a-plugin, prime-directive)

- **Numbers of its own, or fixed data in its prefab.** Its one entry in `world` is `world.<p>.mods`; it
  reads every number off the definition of the kind whose row it was handed. When its server half
  has changing state that is no kind's row, it has a row, and that row's prefab holds its changing
  fields and nothing else. Find: `grep -nF '"<p>"' games/<game>/*.scene.json` for each of its plugins,
  read for a `world.<p>` key other than `mods` and for a fixed field in `prefabs.<p>`; a kind's field
  of the same name is not one. And `grep -rnE "def\((w|plugins\.wire), '" games/<game>/plugins`, read
  for a definition of a kind other than the one whose row it was handed. A plugin handed no row has no
  definition to read: the numbers of a thing no plugin of core draws, a road or a track no ground
  plugin draws, are the definition of a kind with one `actors` entry, whose look draws it and whose
  row the plugin is handed (`building-a-plugin`, `building-a-level`).
- **Listed in `plugins`.** The client looks for it in the top-level folder. It is `shipped` in
  `plugins` and its name in `world.shipped.plugins`, and every name there has a `<n>.plugin.ts`. Find:
  the scenes' `plugins` and `world.shipped.plugins` against `ls games/<game>/plugins`, then `ls` of
  each plugin's folder.
- **A browser half `shipped` never loads, or one a look or a rule imports.** Every
  `games/<game>/plugins/<n>/<n>.plugin.ts` is named in some scene's `world.shipped.plugins`, with
  `shipped` in that scene's `plugins`: `shipped` calls its exported function once per client, and
  nothing else may (`building-a-plugin`). A look or a rule never imports a `.plugin.ts` for what it
  makes; a look reaches it as `plugins.<n>`. A look shared by several kinds is that plugin drawing
  every row of those kinds, which then have no `<kind>.client.ts` (`designing-a-kind`, Shared code and
  systems). Find: each `<n>.plugin.ts` that `ls` of the plugin folders shows, against every scene's
  `world.shipped.plugins` and `plugins`; and `grep -nE "^import [^t].*plugin\.ts'"
  games/<game>/*.client.ts games/<game>/*.sim.ts`, each hit read. An `import type` is not a hit; a
  look importing a pure function that holds nothing of a top-level plugin's, as a plugin imports
  player's `keyOf`, passes; a rule importing any `.plugin.ts` does not, nor does a look importing the
  function a plugin is made by, or anything that draws or holds. Home: the browser half listed through
  `shipped`, drawing the rows from `plugins.wire.rows` with a map from row id to drawing inside its
  exported function (on the UI, `ui.show` keyed by the row's id, two rows never sharing a key), and
  the looks that imported it go.
- **A mod on a plugin with no browser half.** In a scene that lists `shipped`, a game's own plugin
  with a server half alone can neither take nor give a mod: listed, it breaks `shipped`; unlisted, its
  mods are looked for in the top-level `plugins/`. Home: `plugins/shipped` builds passing over such a
  plugin, never the game. Find: each plugin folder's files, for `<a>.<p>.ts` with no `<p>.plugin.ts`.
- **A mod in the wrong place.** Beside `a` when `a` is the game's plugin, beside `p` when only `p` is.
  Find: `ls` of each plugin's folder, for files `<a>.<p>.ts`.
- **Browser state at the top of the file, or kept past `close`.** It goes inside the exported
  function, and everything the browser half makes is let go in `close`. Find: the top-of-file grep
  above over the game's `*.plugin.ts`, and each `close` read against what the function makes.
- **Another plugin imported, its table read, or found by a field.** A plugin it is built on is handed
  to it, `plugins.<a>`, never imported; a pure function of another's is imported (`def`, `json`,
  `keyOf`); what another knows comes through a mod; never `world.<a>`, a field naming a plugin, or
  `plugins[name]` (`building-a-plugin`, `writing-the-look`). Find: `grep -rnE
  "from '#plugins/|world\.[a-z0-9]+|plugins\[|(ground|land|sky|sound): *'[a-z0-9]+'" games/<game>/plugins`,
  read for names not its own.
- **A function a rule calls that writes another kind's row.** It is reached through `w.call`, a
  ledger's row excepted (Rules, above).

### The game's own extensions (building-an-extension, building-a-level)

- **Where it is and what it exports.** One beside a game's addon is never loaded. The file exports
  a function of its own name; its `.components.tsx` exports components and nothing else. Find: `ls`
  the game's folder, its `extensions` and its `plugins` folders by name, for `*.extension.tsx`;
  `grep -n "^export"` on each file found.
- **A level tool that re-builds Place and Arrange.** Actors are placed, dragged and deleted with the
  editor's own Actors panel, which every game has; a game's own level tool is for what is that game's
  alone, running its generator with its recipe and seed, or showing its own things its own way
  (`building-a-level`). Find: each extension's commands and pointer, read for placing, moving or
  taking out `actors` entries. Home: the Actors panel; a start that draws nothing is made pickable in
  `extensions/actors/`, with its test.
- **A write, a fetch or a control of its own.** A file is changed only through the editor's files, a
  value at a time, and a truth only through the recorder; no `PUT /api/files`, `ed.files.write` or
  fetch by hand; panels are built from `editor/ui/`. Find: `grep -rnE "fetch\(|files\.write|api/files|<button|<input|<select|style=\{"
  games/<game> --include='*.tsx' --include='*.route.ts'`.
- **An edit outside its change.** An asked command writes through the `e` it is handed, never
  `ed.editFile`; an edit through a route is `Edits.route`, never `routeOf`; a panel's action runs in
  `ed.together` (`building-an-extension`). Find: `grep -rnE "ed\.editFile|routeOf|together"
  games/<game> --include='*.tsx'`, read.
- **The button, the tool and the command doing one thing their own ways.** They call one function in
  the extension's file, taking the `Editor`, the `Edits` and world points, never canvas pixels. Find:
  read each `ed.command`, `ed.tool` and panel action.
- **What outlives a call not handed to `ed.onDrop`.** A listener, a feed, a timer, a mark on the stage.
  Find: read the extension's function.
- **A colour in code.** A canvas or a mark reads the theme with `themed` or `cssOf` of
  `editor/ui/theme.ts`. Find: `grep -rnE "#[0-9a-fA-F]{3,8}\b|getComputedStyle" games/<game>
  --include='*.tsx'`. A function that does what `cssOf` does is the same finding. Home: an import of
  `cssOf` or `themed`.
- **A game's number written into the extension.** A game's numbers are in its scene and data files;
  the extension's own choices, a snap or a step, are its own. Find: read its numbers.
- **A command an LLM cannot read.** Its `input` is a `z.object` at the top, described, every field
  described, no `.transform`, its tool entry at most 1.2 KB; its header lists its commands. Find: read
  each `ed.command`; `tools(window.editor)` of `editor/mcp.ts`, in the page, answers each entry as an
  LLM reads it.
- **A component that subscribes to the wrong topics.** It names every topic it reads in `useEditor`,
  or shows the first frame and never another. Find: each component's `useEditor(` against what it reads.
- **A route whose name another route has.** Routes are found by file name across `extensions/`,
  `plugins/`, `addons/` and `games/`, and a second of one name throws. Find: `ls` the game's folders
  for `*.route.ts`, each name grepped for in the others.
- **The game importing it.** Find: `grep -rlE "#editor|extension|\.route" games/<game>
  --include='*.sim.ts' --include='*.client.ts' --include='*.plugin.ts' --include='*.html'
  --include='*.server.ts'`.
- `yarn eslint` covers `*.extension.tsx` and `*.route.ts` and not a game's `.components.tsx`
  (`eslint.config.js`), so the components are read for the same things by eye.

### Tests (proving-a-game, and each skill's Proof)

- **A file with no test beside it.** Every kind with a rule has `<kind>.sim.test.ts`; every look
  that draws, `<kind>.client.test.ts`; the seat's keys, `player.client.test.ts`; the manager,
  `<game>.sim.test.ts`; a scene with a level or with look plugins, `<scene>.sim.test.ts`
  (`building-a-level`, `writing-the-look`); each file of a game's own plugin its test, booting the
  game's manager with the game's folder as base (`new URL('../../', import.meta.url).href`); each mod
  `<a>.<p>.test.ts`; each extension `<name>.extension.test.tsx`, with `<name>.extension.view.test.tsx`
  when it attaches the game view; each route `<name>.route.test.ts`; and `<game>.server.ts`,
  `<game>.server.test.ts` with its `simulate` test, once any scene's `seats` is above 1, since a scene
  of more than one seat is played over a socket (`going-multiplayer`, `input-and-seats`). A kind with
  no rule (`start`) has no rule to test; a screen kind with no rule, a title card a shared look draws,
  is proven by that look's page test and by its `<kind>.sim.test.ts` refusing a message a seat sends
  at its row (`designing-a-kind`); and the game, `<game>.predict.test.ts`, the press test, once a seat
  controls anything (Seats and prediction). Find: `ls` the game's folder and each folder in it,
  pairing each file with its test, and `grep -n '"seats"' games/<game>/*.scene.json`. A new game
  that was never folded shows `body.sim.ts` and `body.client.ts` on its first audit: the finding is
  the body itself, which the fold takes into `player` (`starting-a-game`), not a test missing beside
  it.
- **A look's test that checks the wrong thing.** A look's test checks what the look built from the
  row and the definition: one drawing per row on its layer, standing on the row's `pos`, of the
  definition's size and colour, gone when the row ends. Whether it looks right is seen in Chrome,
  never asserted in node (`proving-a-game`, `writing-the-look`). Find: each `<kind>.client.test.ts`,
  read for those checks, and for an assertion of how the drawing looks in their place: a pixel, a
  picture, a text's measured size.
- **A test beside no file of its name.** A test sits beside the file it tests and is named after it.
  Find: each `*.test.ts` whose stem names no file beside it. A test of a top-level plugin on the game's
  content is the game's (`proving-a-game`), and is the test of the scene or kind it proves: the scene's
  look plugins and level in `<scene>.sim.test.ts` (`writing-the-look`, `building-a-level`), a kind a
  plugin draws or sounds in that kind's test (`bringing-in-art`, `sound`), a menu's button moving the
  seat in the menu kind's `<kind>.client.test.ts` (`scene-flow`). Home: merged into that test.
- **A value of the scene file typed in a test.** Every value a test checks against is read off the
  scene file and the definitions: a number, a count (`toHaveLength(5)` for five starts the scene
  places), a label, a key list, a slot list, the seats in a refusal (`no seat free: 2 declared`), a
  scene's name. An input that works only because of the scene's layout or a definition, a cell beside
  a start, a wall's row, a spot clear of every tree, an offset inside a reach, a list of moves that
  wins, is derived from them too, so it still works when they change; one typed and then guarded by an
  assertion that it still holds is a finding (`proving-a-game`, `building-a-level`). Find: `grep -nE
  "\.to[A-Za-z]+\([^)]*[0-9]" games/<game>/*.test.ts`, for digits inside a matcher; `grep -nE
  "[^A-Za-z_.0-9][0-9]{2,}" games/<game>/*.test.ts`, for numbers anywhere; then every matcher read
  against the scene file and the definitions for a label or a key list written again. A loop's bound,
  a count of steps the test chose, an input of its own that no layout or definition decides, a `0`
  that means none, a stand-in canvas's size and a port of the test's own are its own, and so is the
  literal path a look's test checks the url asked for against (`bringing-in-art`: checked against the
  entry's own url, it passes with the slash missing). On a continuous track, a way typed as an axis
  into the wall, or a distance as the crow flies, is a finding: into the wall is the road's outward
  normal at the point, and distance is measured along the road (`proving-a-game`).
- **A scene file restated, or a file opened by a typed path.** A test proves what a scene file does
  and never copies what it says into an assertion, a prefab's fields or a `plugins` list; a file it
  reads beyond the scene file and the definitions it imports is reached through its catalogue entry,
  `prepared(room.world, <name>)` (`proving-a-game`). Find: `grep -nE "plugins\)|prefabs\."
  games/<game>/*.test.ts` and `grep -nE "readFileSync|/games/|assets/" games/<game>/*.test.ts`, each
  hit read: an `import` of the scene file or the definitions, and the literal path above, are not
  one. Home: the assertion of what the value does; the file through its entry.
- **A page test that presses or clicks and pins no step.** A test that presses a key the player
  plugin handles, or clicks a mouse button a table binds or a UI button whose tap calls
  `plugins.player.<act>()`, pins the step the press lands on (`input-and-seats`, `proving-a-game`).
  Find: `grep -lE "keyCode|pointertap" games/<game>/*.test.ts`, each file read for rows read within a
  range of steps.
- **A HUD test that does the ui's arithmetic.** A panel's place is `ui.panel(name).position`, read
  off the page, never worked out again from `world.ui`'s anchor, `at` and the canvas's size
  (`building-the-hud`). Find: `grep -nE "anchor|\.at\b|width *[-/]" games/<game>/*.client.test.ts`,
  read.
- **A scene changed in memory by a test.** A test never changes a scene's values in memory, the scene
  object a `<scene>.sim.ts` exports, the page's `plugins.wire.scene`, a manager file's `entry` or a
  child's `plugins`: that is `dev.html`'s (`proving-a-game`). Find: `grep -nE
  "\.(entry|plugins|port|world|prefabs|actors)!?[.A-Za-z!]* *= " games/<game>/*.test.ts`, read; the
  `!` takes in a write past a non-null assertion, `scene.world!.player = `. Home: the test boots the
  files as they are, or a scene file of its own written into a temporary folder for a value it must
  try; a scene a person plays is played by the simulator's page `think` or a `playtest` seat.
- **A `player` row spawned or ended by a test.** Another seat's row comes from a second `connection`
  on a scene of `seats: 2` (`proving-a-game`). Find: `grep -nE "spawn\('player'|\.end\("
  games/<game>/*.test.ts`, read.
- **A test faking what a plugin should do.** It drives the plugin; stand-ins are for what node lacks
  (prime-directive, When something is missing). Find: read each test for a plugin's work done by hand.
  A game's own plugin of pure questions is tested through the rule that asks them, on the booted
  game, never on a `W` the test builds (`building-a-plugin`):
  `grep -rnE "as (unknown as )?W\b|: W = " games/<game> --include='*.test.ts'`, read.
- **A page joined to a truth by hand.** Find: `grep -nE "\bview\(|link\(" games/<game>/*.test.ts`,
  each page on `link(loopback(accept(...)))`, a dial, or the recorder's link, often made a line above.
- **A view test in a `.test.tsx`.** Find: `grep -rln "attach(" games/<game> --include='*.test.tsx'`,
  each a `.view.test.tsx`.
- **`playtester` in a scene a person plays, or handed without asking.** That `index.html` then plays
  itself. Its homes are a scene of its own that lists it, or `dev.html`'s copy in memory; a test has a
  scene a person plays play itself with the simulator's page `think` or a `playtest` seat. An actor
  hands the think only `if (plugins.playtester)`, since `<kind>.client.ts` is one file for every
  scene. Find: `grep -rn "playtester" games/<game>`, read.
- **A HUD test that cannot tell the two entries apart.** Its stand-in for `PIXI.Assets.load` hands
  back a new texture on every call (`building-the-hud`).
- **A simulator run with no `watch`, or a simulation standing in for the press test.** A run with no
  `watch` records no rows. A page standing for a player is `predict: true`, and `watch.own` names the
  seat's `player` row itself with `[]`, never a field it holds the id of the thing in. What a key
  puts on screen is proven by `<game>.predict.test.ts` and nothing else; a simulation of `view`
  pages states a round trip of lag on the seat's own thing as if it were the game's
  (`going-multiplayer`, `tuning-feel`, `proving-a-game`). Find: `grep -rn "simulate(" games/<game>`,
  read for `predict`, `watch` and what it asserts of the seat's own row.
- **Replay.** A game proves it replays, in the scene's `<scene>.sim.test.ts`: a real page,
  `view(rec.link, …)`, played by presses or a bot under `recorder(file, sim, here)`, never messages
  handed to `rec.link.send` by the test; `await rec.step()` after each frame with the child's rows
  kept, then `rec.seek(k)` holding them again; it checks `rec.failure` undefined and `rec.skipped`
  empty after every step and every seek, and reads the child again after each, since every seek boots
  a new truth (`proving-a-game`). A scene of N seats replays with N pages, each on a recorder seat
  of its own; the recorder holds one, so its seats are built in `addons/recorder/` first, with
  `addons/recorder/recorder.addon.test.ts`, and a `player` row a recorder edit spawned is never taken
  for a seat. Find: `grep -rln "recorder(" games/<game> --include='*.test.ts'`, read for those
  checks and for the scene's `seats`, and `grep -rnF ".link.send(" games/<game>`.
- **An extension's test missing its checks.** It reads `edits` for the one value sent, the file's
  bytes differing in that value alone, undo putting the bytes back exactly, `ed.undos` one change per
  action, and `ed.log` with no error line (`building-an-extension`). Find: each `.extension.test.tsx`,
  read.

## Migrating

Code that breaks the directive is never copied as a pattern, and when it is in the way, migrating it
is part of the job: every file that uses it and every test (prime-directive, When old code
disagrees). So each entry of the list is moved, in the same piece of work:

1. Find every user: the name, the field or the key grepped across the whole game folder, its scene
   files, data files, rules, looks, plugins, extensions and tests. An extension or a test that reads
   the old place is a user. A migration in a top-level plugin reaches every game that uses it.
2. Move it to its home, and change every user. A rename goes first, since later entries name the new
   files.
3. Change the tests that held the old place, and write the test the rule asks for where none holds
   it. Each new check is seen to fail on the old code before it is trusted.
4. Run the test files beside every file touched, one a call, `yarn vitest run <file>`; `yarn tsc`,
   read for the game; `yarn eslint` on each extension or route touched.
5. Play it where what is drawn or how it plays changed: `yarn editor <game>`, `index.html`, and
   `client.html` against `node --experimental-strip-types games/<game>/<game>.server.ts`, the seat's
   thing moving on the frame after its key.

A finding whose home is missing in core is built there first, general, set from the scene file and
tested (`building-a-plugin`, `building-an-extension`), never worked around in the game and never left
as a note. Nothing in `engine/` is edited. Where a fix would change what the game does, a field
nobody reads, a screen it could lose, the person is asked what it should do.

## What goes wrong

- A grep that never ran: an unquoted `--include=*.ts`, a file list that matched nothing, or a
  `games/<game>/plugins/*` in a game with no `plugins` folder stops the command in zsh, and the empty
  answer is taken for a clean game.
- A dotted name grepped as a pattern, which matches every import of the scenemanager.
- Tests counted as the game: their stand-ins for what node lacks, their `node:fs`, a stand-in canvas's
  size.
- What the skills allow listed as broken: `player.sim.ts` and `player.client.ts`; a seat's own score,
  health, ammo or lives as fields of its `player` row; a shot or a ball the `player` row spawns and
  lets go of; a `<scene>.sim.ts`,
  `<game>.server.ts` or test importing kinds, or a look importing its own kind's rule; an `import
  type` from a `.plugin.ts`; arithmetic on the definition's numbers; a static thing's `pos` and what
  a start hands on; a look test's literal path for the url asked for; an extension's own snap or step.
- What the skills forbid passed over as allowed: a starting angle taken for a direction, a gap of
  spaces in a string taken for no number, a test's input that works only because of the layout taken
  for the test's own, a car, a gun or a hero on a row the `player` row spawns taken for a kind of its
  own because the generated `body` is one, a round trip of lag on the seat's own thing taken for a
  fact of the network.
- A field taken for fixed because no rule of the game writes it, when a plugin the scene lists does.
- A write to another row taken as clean because no grep shows it: a rule handing that row's array to
  a plugin's function, which writes into it. Every `w.find`, `w.get` and `w.all` is read through to
  what it is handed on to.
- A number judged from the grep's line without opening the file.
- The line fixed and its users left: a key moved up into the manager while an extension still reads
  the scene file's own `world`; a test still holding the old shape.
- An entry with no home, or a home that is a new setting on a top-level plugin for one game, or old
  code written back into: a camera put back into `prefabs.render3d` instead of the move.
- A rule of the audit's own. A check is one a phase skill or the directive makes.
- A green suite taken for a clean game. Every finding here passed the game's tests.
- The work reported before every Find has run, the Tests section's left for later: its findings, a
  value typed in a test, a scene changed in memory, a replay never proven, are the ones a green
  suite hides.

## How it is proven

The audit: the baseline run and its results written down; every check's command run, the Tests
section's included, with a real answer and not a stopped glob, before the work is reported; every
hit read. The migration: the test files beside every file it
touched, run one a call and passing, each new check seen to fail on the old code; `yarn tsc` with no
error in the game; `yarn eslint` on each extension or route touched; and the game played where what
it draws or how it plays changed. Then the audit is run again over the folder, and the list is empty.
