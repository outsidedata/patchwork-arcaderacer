---
name: building-an-extension
description: Use in core, or any clone of it, when adding to the editor, `yarn editor`: a panel, a tool in the game view, a command or an MCP tool, an inspector section, a field type and the component that shows and edits it, a theme, a backend route on the editor's server, or an editor tool for one game's level, kinds or states. Also when deciding where an editor thing goes (`editor/`, the recorder, a plugin's or addon's `<p>.extension.tsx`, a game's own extension, `extensions/<name>/`); when an extension must write a scene or data file, change a running row, or be undone ("make this editable in the editor", "one undo", "the diff is that value"); when building a panel from the design system (`editor/ui/`, themes); and when testing an extension or checking how it looks in Chrome.
---

# Building an extension

The editor is a web app like any other: a React page (`editor/main.tsx`) and a Node server
(`editor/server/server.ts`, started by `yarn editor [game]`). It opens one game of `games/`, plays
it in the page as `index.html` does or on node as `<game>.server.ts` does, stops time, steps forward
and back, shows every row and writes the game's files. Everything it shows is an extension: the game
view, the hierarchy, the inspector, the timeline and the console too. The editor itself holds no
panel. An extension is to the editor what a plugin is to a game, and it is built on the base and
changes none of it: nothing in `engine/` is edited for the editor.

The facts are in the headers of `editor/editor.ts` (what every extension is handed, commands, tools,
the stage, undo), `editor/session.ts` (the open game), `editor/server/server.ts` (the server's API),
`editor/server/changes.ts` (every change to the files and its undo), `editor/server/files.ts` (how
one JSON value is written), `editor/mcp.ts` (commands as MCP tools) and `editor/test/editor.ts` (the
test helpers), and in the extensions in `extensions/*/`.

## When it applies

It applies to anything the editor shows or does. It does not cover:

- what the game itself shows the player, a HUD, a menu, a controls screen: that is the game's `ui`
  plugin, which has nothing to do with the editor's design system. That is `building-the-hud`.
- a rule, a look or a system the game runs: `designing-a-kind`, or `building-a-plugin` for a plugin
  or an addon. When a plugin is built there, the extension that presents or edits what it owns is
  built here, beside it.
- the game's own tests, which boot its manager and drive seats: `proving-a-game`.

An extension extends the editor and nothing else. Nothing a game runs imports `editor/`,
`extensions/`, an extension, a components file, a route or a test's harness, so a game runs the
same with the editor and without it. `editor/boundary.test.ts` guards it.

## Where it goes

Ask in this order. The first yes is the home.

1. Is it how the editor runs at all: its page, its server, the shell (menus, docking, commands, and
   the MCP endpoint every command is served on), files and undo, selection, the design system,
   loading extensions? → `editor/`. `editor/` names no game, kind, plugin or field: it finds games,
   scenes, kinds, plugins and extensions by the names their files already have.
2. Is it time: holding a game's truths under the editor's clock, recording what reaches them,
   rebuilding a step by booting again and replaying? → the `recorder` addon
   (`addons/recorder/recorder.addon.ts`). Time goes back by replay, never by a snapshot the engine
   would have to hand out.
3. Does it present or edit what a plugin owns: its prefab, its data files, what it draws? → the
   extension that plugin ships, `plugins/<p>/<p>.extension.tsx`. What an addon owns → its
   `addons/<a>/<a>.extension.tsx`. In core: `plugins/vision/vision.extension.tsx` types the fields
   of `world.vision`; `plugins/render2d/render2d.extension.tsx` is the stage the game view draws on
   and how a row under render2d is moved; `plugins/volley3d/volley3d.extension.tsx` is a panel on
   volley3d's patterns file.
4. Is it one game's: how its kinds' fields are shown, a tool for its level or its states? →
   `games/<game>/<game>.extension.tsx` or `<kind>.extension.tsx`, the extension beside one of its
   own plugins, `games/<game>/plugins/<p>/<p>.extension.tsx`, or
   `games/<game>/extensions/<name>/<name>.extension.tsx` for a tool that uses several of them. A
   game's own extension may name that game's kinds. An extension for what a game's own addon owns
   goes in `games/<game>/extensions/<a>/<a>.extension.tsx`, or in `<game>.extension.tsx`: one put
   beside the addon, `games/<game>/addons/<a>/<a>.extension.tsx`, is never loaded, since the server
   does not list a game's `addons/` (`extensionsOf` in `editor/server/listing.ts`) and the page does
   not reload for one (`GAME_LISTED` in `editor/editor.ts`).
5. None of those, and about rows, kinds, seats, steps or files in general? → an extension of the
   editor's own, `extensions/<name>/`, as `extensions/inspector/`, `extensions/hierarchy/`,
   `extensions/actors/`, `extensions/kinds/` and `extensions/timeline/` are. One of these names no
   game, kind, plugin or field.

There is no other home for a thing of the editor's.

The editor finds extensions by the names their files already have, as the engine finds actors: the
server lists `extensions/*/*.extension.tsx`, `plugins/*/*.extension.tsx`,
`addons/*/*.extension.tsx`, and in the open game's folder `*.extension.tsx`,
`extensions/*/*.extension.tsx` and `plugins/*/*.extension.tsx`, read off the disk each time it is
asked (`editor/server/listing.ts`). There is no registry to add to and no glob: a file made a moment
ago is found, and the open page reloads for it (`held` in `editor/editor.ts`). The page also reloads
for an edit of any module it has imported, and it imports every plugin's and addon's extension as it
loads, including those that are off, so editing one reloads the page whether or not the open game names
the plugin. An edit of a `.route.ts` reloads no page: the page never imports it, and the server takes
it in anew for the next request. Which are on:

- the editor's own, always;
- a plugin's or an addon's, while a scene file of the open game names its folder: in its `plugins`,
  as a key of its `world`, or as a top-level block. One that exports `always` as true is on for
  every game and none (`addons/simulator/simulator.extension.tsx`). An edit that names the plugin
  more, or one less, turns its extension on or off;
- a game's own, while that game is open, turned on after the plugins' and addons', so what it binds
  wins.

## The files

- `<name>.extension.tsx` exports a function named `<name>`, called once with the `Editor` when the
  extension turns on. A file whose function has another name is said in the console ("exports no
  function") and stays off. Its header says what it adds, its panel, and its commands listed as
  `extensions/actors/actors.extension.tsx` lists them, "Its commands, for an LLM calling them".
- `<name>.components.tsx` beside it holds its React components and exports nothing else. It imports
  the functions it calls from its extension file (`extensions/actors/actors.components.tsx` imports
  `placeable` from `actors.extension.tsx`).
- `<name>.route.ts` beside it, only when it needs the machine: the disk, a process, a converter. It
  exports a function named `<name>` that is handed a `Router` and adds `r.get(route, f)` and
  `r.post(route, f)`; the server serves them at `/api/x/<name>/<route>` (`editor/server/routes.ts`)
  and loads them through Vite, so an edit is used by the next request. A route is found by its file
  name across `extensions/`, `plugins/`, `addons/` and `games/`, and two files of one name are
  refused.
- Its tests beside it, named after the file each tests (How it is proven, below).

What the function adds goes when it turns off: `ed.panel`, `ed.command`, `ed.tool`, `ed.field`,
`ed.bind`, `ed.bindFile`, `ed.inspector` (a section of the inspector), `ed.place` and `ed.placeBy`
(how a row is dragged), `ed.stage` (a renderer's surface), `ed.addTheme`, `ed.onFile` and `ed.onBytes`
(a file written). What it opens itself that outlives a call, a listener of the editor's or the
recorder's, a feed of the server's, a timer, a mark on the stage, it hands `ed.onDrop`, which closes
it then. Its own state lives inside the function, as the actors extension's `studio` does, and is
told as the topic `x.<name>` (`ed.changed('x.<name>')`), which its components read.

## Reaching the game

Extensions run in the editor's page and reach the game's truths, client and plugins directly.

- The open game is `ed.session` (`editor/session.ts`): `scenes()`, `scene(name)`, `row(scene, id)`,
  `path(scene)` (a scene's file), `actor(scene, id)` (the `actors` entry a row was made from, its
  file and where in it), `files` (every scene file the game booted from, as objects), and `rec`, the
  recorder. `ed.need()` is the session, and refuses with none open.
- The editor finds what a command is handed, and refuses naming the choices, with `ed.sceneOf` (the
  scenes, or those with rows of a kind), `ed.worldOf` (the scenes whose `world` has the key) and
  `ed.dataFile` (the game's data files). `ed.rowOf` refuses a row the scene has not got without
  naming its rows. `ed.prefabFile` and `ed.worldFile` refuse nothing: each answers the scene's own
  file when it gives the prefab or the key, else the manager's. A panel on the rows of one kind works
  on the scene `ed.focus(kind)` names. A file's text is `ed.text(path)`, and in a
  component `useText(path)` (`editor/context.ts`).
- The client the game view draws with is `ed.session.client`, while the view draws. Only a preview,
  or a readout of what a client holds in the browser, needs it: that command awaits
  `Session.clientOn(scene)` or `Session.mounted()` first. Everything else works from the files and
  the rows, whatever the view shows and whether it draws at all.
- A plugin's pure functions are imported (`json` and `def` of `plugins/loader/loader.sim.ts`); what
  its browser half holds is read off the client's `plugins.<p>`. An extension may import another
  extension's helpers, as `plugins/volley2d/volley2d.extension.tsx` imports the loader extension's.
- A component calls `useEditor(topics)` and names every topic it reads, through every function it
  calls (`game` for the session's rows and edits, `selection`, `texts`, `extensions`, `tools`,
  `history`, `x.<name>`). A topic left out stops the component showing what changed.

## Changing a running truth

An extension changes a running truth only through the recorder, so every step the editor shows can
be rebuilt. The edits are on the `Edits` it is handed (`editor/editor.ts`):

- `editRow(scene, id, path, value)`, `spawn(scene, kind, data)`, `end(scene, id)`: journaled by the
  recorder at the step the game is at, kept by every rebuild after, one undo each;
- `endHere()`: the recording ends at this step;
- a drag shown live and not yet kept: `Session.preview(scene, id, path, value)` for a row,
  `Session.previewWorld(scene, path, value)` for a scene's `world`, the edit written when the drag is
  let go;
- time: `Session.step`, `run`, `seek`, `back`, `restart`, `play`, `pause`.

It never writes `row.data` itself, steps a truth itself or keeps a copy of one: a rebuild boots from
the files and replays the journal, and nothing outside it survives.

## Changing a file

An extension changes a file only through the editor's files. The page sends each change to the
server (`editor/files.ts`). The server finds each JSON value with jsonc-parser, the library VS Code
edits settings.json with, and writes that value by itself as the file around it writes JSON (`edit`
in `editor/server/files.ts`), so only that value's bytes change. A value written on one line is
replaced on one line. A value laid over lines is laid out again by the editor's own `pretty`, which
writes a list of numbers or strings on one line and a list of objects over lines. The change log
keeps each change's bytes before and after; undo puts the bytes back where the file still holds what
the change wrote, and else takes the values back one by one (`editor/server/changes.ts`). The record
is kept in `node_modules/.cache/editor/changes/`, so a change made before the server restarted is
still taken back, for the last 2000 changes (`KEPT`). A JSON value is taken back even where the
file changed since, value by value. A whole file a change wrote, by a route's `write`, a text op or a
bytes op, is taken back only while it still holds what the change left: changed since, by hand or by
another change, its undo is refused, naming the file.
After a write the game is rebuilt from the files, and a panel reading them is drawn again.

- `editFile(file, at, value, insert?)`: one value set, removed with `undefined`, or inserted into
  a list at `at`'s last index, `-1` for its end.
- `editFiles([{ file, at, value }, ...])`: many values, one change, the game rebuilt once.
- `saveFile(file, whole)`: a whole JSON value a tool edited a copy of, written as the values that
  differ (`changes` in `editor/editor.ts`); a list of numbers or strings as long as before is
  written item by item there. For a list a panel edits as a whole, `listEdits`; for the fields a
  PropertyGrid draws, `gridEdits` and `worldGridEdits`; `written(e, edits)` writes any of them as one
  change.
- A vector, two to four numbers, is one field to the editor: the PropertyGrid draws it as one
  `VecField` and `gridEdits` sets it whole, the inspector writes it whole, and a placer writes `pos`
  whole (`placeActor`, `moveActor` in `extensions/actors/actors.extension.tsx`). Written whole over a
  vector the file lays one number a line, as the scene files `yarn new-game` writes do, it lands on one
  line: four lines become one. Keeping such a file's layout is a change to `edit` in
  `editor/server/files.ts`, the editor's home, made once for every extension, never written around
  in one extension.
- An `actors` entry's field: `inspected` and `editEntry` of `extensions/inspector/inspector.extension.tsx`
  write the field into the entry, or the whole field over its prefab's where the entry does not set
  it yet.
- What no JSON value says, code or a picture's bytes or a kind made across several files:
  `Edits.route(owner, route, body)`. The route runs inside the change, every file it writes
  through the `RouteFiles` it is handed is part of it, and one undo takes it all back; a route that
  throws part-way leaves nothing written. A route never works out its own undo. A route asked with
  `routeOf` runs outside any change and no undo takes it back: for reading, and for what is no edit
  of the open game, as the games extension making a new game is. A change that writes code the page
  has imported, a sim a kind is added to say, reloads the page once it is in the history, and again
  as it is undone; the session, the step and the history are put back.

The editor adds nothing of its own to a scene or data file. A viewer's preferences stay in the
browser: `localStorage`, as the volley3d extension keeps its pattern and loop; a panel's state across
a reload, `sessionStorage`, as the code extension keeps its open files. An extension never writes
with `PUT /api/files` or `ed.files.write`, which are outside any change, and never fetches by hand:
`routeOf`, `Edits.route`, `posted` and `fetched` (`editor/editor.ts`).

## One action, one undo

One action is one undo however many edits it makes.

- A panel's button or field runs the action in `ed.together(e => fn(ed, e, ...))` and writes through
  the `e` it is handed. What it throws goes to the console: `.catch(e => ed.error(e.message, e.stack))`.
- An asked command's `run(args, e)` is already inside `together`: it writes through `e`. A write
  through `ed.editFile` there is an undo of its own.
- `ed.editFile` alone is one undo, as the inspector's grids write one field.
- A field hands `onChange(value, done)`: `done` false while a drag or a keystroke goes on, which is
  shown with a preview; true when it is let go, which is written.
- `ed.idle()` is done once no action is in hand.
- The history is the tab's: a change made in one tab is undone in that tab, not in another opened
  on the same game.

## A type and the component that edits it

A type an extension defines, with the component that shows and edits it, is used wherever a value
of that type appears, in any panel. `ed.field('<owner>.<type>', Component)` registers it; the
component takes `FieldProps` (`value`, `onChange(value, done)`, `at`, `owner`, `label`) and is built
from the design system's fields. A binding says which values are of it: `ed.bind(kind, { 'path.*':
type })` for a kind's rows, prefab, `actors` entries and definition, and `ed.bindFile(path or test,
{ ... })` for a data file, or a scene file's `world.*`. The PropertyGrid draws each value by its
type, or by its shape where none is bound (`editor/ui/grid.tsx`). The editor's own types are `color`,
`angle`, `integer` and `bearing` (`extensions/types/types.extension.tsx`); a plugin's are named
after it, as `plugins/vision/vision.extension.tsx` binds `vision.opacity` to `world.vision.explored`
of every scene file.

## The design system

The editor is a web app, so it has a design system like any other web app: React components in
`editor/ui/`, and themes that are CSS. Every extension, the editor's own and the ones a game ships
alike, builds its panels from those components. No extension makes its own button, field or list,
and none writes CSS.

- `editor/ui/layout.tsx`: `PanelBody` (a toolbar over a body that scrolls), `Toolbar`, `Button`,
  `Section`, `LabelledRow`, `Row`, `Note`, `Empty`, `Badge`, `Strip`, `Split`, `Meter`.
- `editor/ui/fields.tsx`: `NumberField`, `TextField`, `Check`, `ColorField`, `VecField`, `Select`,
  `JsonField`, `Slider`, `AngleDial`, `RampField`.
- `editor/ui/grid.tsx` (`PropertyGrid`, `Field`), `editor/ui/list.tsx` (`NodeList`),
  `editor/ui/tree.tsx` (`Tree`), `editor/ui/table.tsx` (`Table`), `editor/ui/chart.tsx` (`Chart`),
  `editor/ui/code.tsx` (`CodeField`), `editor/ui/sheet.tsx` (`Surface`, `FrameImage`, `PixelImage`),
  `editor/ui/swatch.tsx` (`Swatch`), `editor/ui/steps.tsx` (`StepGrid`), `editor/ui/timeline.tsx`
  (`Timeline`).
- What a component draws pictures from: `useImages` (`editor/ui/images.ts`), `usePixels` and
  `raster` (`editor/ui/pixels.ts`), and `onion` (`editor/ui/onion.ts`).
- Its class names, `ui-mono`, `ui-spacer`, `ui-note`, `ui-key`, are in `editor/ui/ui.css`. A colour
  a canvas or a mark draws in is read from the theme with `themed` or `cssOf`
  (`editor/ui/theme.ts`), never written in the code.
- A theme sets the design system's CSS variables under `[data-theme='<name>']` and nothing else:
  the editor's are `editor/themes/dark.css` and `editor/themes/light.css`, and an extension ships
  one with `ed.addTheme(name, href)`.

A field names itself with its `label` and a `Button` with its `title`, its `aria-label`, which is
what Testing Library finds them by.

## Commands, and the MCP endpoint

Commands are what a person runs from a menu or a key and what an LLM calls. Every command is a tool
of the MCP server the editor's server serves at `/api/mcp` (`editor/mcp.ts`, `editor/server/mcp.ts`;
`.mcp.json` names `localhost:5173`), named by its id with each `.` a `_`. A plain command
(`{ id, title, menu?, key?, run(), enabled? }`) takes nothing. An asked command
(`{ id, title, input, run(args, e) }`) takes the arguments its zod `input` parses, has no menu and no
key, and is run in `together` with the edits `e`. So that an LLM can do whatever a person does, a
command is written as the header of `editor/editor.ts` says:

- A panel's button, a tool's pointer and the command that do one thing call one function, in the
  extension's file, and none keeps a copy of its own.
- Its `input` is a `z.object` at the top, with a union or a nullable inside a field and never a
  `.transform`. `ed.command` refuses one that is not, by throwing as the extension turns on; in the
  page that is a console line, "extension failed to start", and whatever the function would have
  added after that command is missing.
- `.describe(...)` on the input is the tool's description, and every field is described. A tool's
  entry is at most 1.2 KB, since the whole list is read into the LLM's context. The header of
  `editor/mcp.ts` sets both rules and names a test that holds them, `mcp.test.tsx`, which does not
  exist: no test holds them, so check the entry yourself. `tools(window.editor)` of `editor/mcp.ts`,
  imported in the page, answers each entry as an LLM reads it.
- It takes world points, never canvas pixels: a tool turns its pointer into world points
  (`Stage.ground`, `Stage.pick`) and calls the same function with them.
- It works from the files and the rows, as above. A value it answers read from a file goes through
  `outlined`; a row it is handed is `ROW`; a change the file would not take throws a `Refusal` before
  anything is written; a refusal names the choices there are.
- A long piece of work lets the page go between slices with `turn()`, never a timer.
- An id is one extension's; two that would be one tool name are refused.

What it answers becomes the call's content: nothing is `done`, a `Blob` is an image, anything else
its JSON.

## The work, in order

1. Find the home (Where it goes). A thing for a plugin goes in that plugin's folder; a thing for one
   game, in that game's.
2. Write the function, `<name>.extension.tsx`, with its header, and every action it does as one
   function taking the `Editor`, the `Edits` and world values, as `placeActor(ed, e, scene, kind,
   point)` in `extensions/actors/actors.extension.tsx` is, never a body inside a click handler.
3. Register the panel, the tool and the commands, each calling that function; the panel in
   `<name>.components.tsx`, built from `editor/ui/`.
4. Write every change through `Edits`: a running row through the recorder, a file a value at a time.
5. Bind any type it defines.
6. Write its test beside it and run it, `yarn vitest run <file>`; then `yarn tsc` and `yarn lint`.
7. Open it in the editor and look at it in Chrome.

## What goes wrong

- A panel for a plugin built in `extensions/`, or in the editor. The plugin ships it,
  `plugins/<p>/<p>.extension.tsx`, and it is on only while a scene names the plugin.
- A whole object written where a field of it changed, or a whole file where a value changed: every
  value in it is written again, and the diff is all of them. Write the value that changed at its own
  path, or hand `saveFile` the whole thing and let it write the values that differ. A vector is the
  one value the editor's own tools write whole (Changing a file).
- `row.data` changed by hand, or a value kept between steps in the extension: lost at the next
  rebuild. `editRow`, `spawn` and `end` are journaled; `preview` is for the frame a drag shows.
- An asked command writing through `ed.editFile` rather than the `e` it is handed: two writes, two
  undos.
- The button and the command each doing the work their own way. One function, called by both.
- A component that reads the rows but subscribes to nothing, or to the wrong topic: it shows the
  first frame and never another.
- A route used for an edit through `routeOf`: written outside any change, so no undo. An edit is
  `Edits.route`.
- An extension that throws as it turns on is a line in the console, not an error a caller sees. A
  test checks `ed.log` has no error line.
- A number of the game's written into the extension. A game's numbers are in its scene file and data
  files; an extension shows and edits them. The extension's own choices, a snap or a step, are its
  own, as `SNAPS` in `extensions/actors/actors.extension.tsx`.
- A game run in an iframe, a worker or behind a port to show it in a panel. It runs in the page, as
  `index.html` runs it (the session's `attach`, which the game extension's Game panel calls), or on
  node, as `<game>.server.ts` runs it (`extensions/servers/`).

## How it is proven

An extension's test boots a scene it writes under the recorder, drives it the way the extension
does, and reads what changed off the rows and the files. It sits beside the file it tests and is
named after it: `<name>.extension.test.tsx`, run in jsdom with Testing Library; logic with no page
in a `.test.ts`
(`plugins/loader/loader.extension.test.ts`); a route's own test `<name>.route.test.ts`
(`extensions/games/games.route.test.ts`).

The helpers are `editor/test/editor.ts`:

- `memoryFiles()` is the editor's server as a test has it: every change made by the server's own
  change log, over the files held in memory, or on a sandbox's disk while the test runs in one, so
  the test reads the bytes the server would write and the repo is never written. It hands back
  `files` (the page's), `read(path)` (a file as the server now holds it), `edits` (every JSON value a
  change sent: `path`, `at`, `value`, `insert`), `reloads` and `opened`. `game(name)` is a game read
  as the page reads it, from the sandbox while there is one.
- `editor(game, loaders)` is `memoryFiles()` and an editor on it, with the extensions named turned on
  as the editor's own are: always, and before the game opens. That is right for an extension of
  `extensions/<name>/`. A plugin's or an addon's extension is turned on by the editor after the
  editor's own, and a game's own after those, once the game opens; a test turns a game's own on that
  way by handing it to the `Editor` as the game's: `new Editor(mem.files, await game('<game>'),
  { '/games/<game>/<game>.extension.tsx': async () => ({ <game> }) })`, then `await ed.open()`. A
  plugin's or an addon's goes in the fourth argument, keyed by its url,
  `/plugins/<p>/<p>.extension.tsx`, and turns on as the open game names the plugin.
- `sandbox([...games])`: a repo of the test's own whose `games/` is its own, and whose copy of each
  game named is a folder of its own holding a link to each of that game's files. The test writes its
  scene there, a manager and the scenes it names, as a person writes them, and takes away the link of
  any file it writes over first: a write through a link writes the repo's file. A test outside
  `games/` writes a game of its own into `sandbox([])`
  (`write` in `plugins/volley3d/volley3d.extension.view.test.tsx`), since core ships no game. A
  game's own extension's test sits in that game's folder and boots a scene it writes from that
  game's kinds, in `sandbox(['<game>'])`: its scene's sim imports `./<kind>.sim.ts` as the game's own
  sims do, through the links.
- `onTestFinished(() => ed.close())` closes the game when the test ends, passed or failed.
- `noClock()` stops the editor's clock, so nothing steps but what the test asks for. `answer(name,
  register)` answers a route as the server would. `stage()` is an element for the session's
  `attach`.

The test, then:

1. `await ed.open()` boots the scene it wrote under the recorder.
2. Drives it as the extension does: `await act(() => ed.call('<command>', args))` for a command; for
   a panel, `ed.panels.get(id)!.component` rendered inside `EditorContext.Provider` and driven with
   Testing Library by its fields' labels and its buttons' titles, then `await act(() => ed.idle())`.
3. Reads the file: `edits` holds the one value sent, and `read(path)` differs from the bytes before
   in that value alone, line by line. Reads the rows: `ed.session!.scene(name).rows`, and a step
   (`ed.session!.step()`) shows the game booted from what the file now says.
4. `await act(() => ed.undo())`, and `read(path)` is the bytes before, exactly.
5. `ed.undos` holds one change per action, and `ed.log` no error line.

A test that attaches the game view (`session.attach`, directly or through the Game panel), so the
game's client is made and draws in jsdom, goes in `<name>.extension.view.test.tsx` beside the
`.test.tsx`, run with `yarn test:view <file>`; what the two share goes in
`<name>.extension.harness.ts` (`plugins/volley3d/volley3d.extension.harness.ts`). Run only the test
files beside what changed, never the whole suite.

How it looks is checked in Chrome, with `.claude/skills/good-webviews/`:

- `yarn editor <game>` in the background, with `PORT=<n>` before it when another editor holds 5173.
  It prints the editor's url. It has no HMR: an edit of an extension's files, or a new extension
  file, reloads the open page; a route's edit is taken by the next request; and the server starts
  again on its own when its own code changes. It is never restarted by hand for an extension.
- `node --experimental-websocket .claude/skills/good-webviews/webview.mjs shot <png> <url> 8000`,
  and Read the picture. Set `WEBVIEW_TAB` to a name of your own. The helper keys its tab by the
  session's id; it was seen that agents of one session landed in one tab, and another agent's page
  replaced the editor in it between two calls.
- `eval` drives the page through `window.editor`: `window.editor.reveal('<panel id>')` shows a
  panel, `window.editor.call('<command>', args)` runs a command. `eval` does not wait for a promise:
  read what it did with a second `eval`, or off the file on the disk.
- A change made this way writes the real file through the real server, and undo through
  `window.editor.call('edit.undo')` puts it back; both read off the disk. Then `close` the tab and
  stop the editor.

## Questions never asked

- Should the editor get a panel for this plugin? No: the plugin ships it, `<p>.extension.tsx`.
- Should the editor run the game in an iframe, a worker or behind a port? No: in the page, as
  `index.html` does, or on node, as `<game>.server.ts` does.
- Does the engine need to hand out its state so the editor can go back? No: the recorder replays.
- Can this extension write the file itself, or change a row directly, just this once? No: a file
  through the editor's files, a value at a time; a running truth through the recorder.
- Can this panel have its own button or a little CSS? No: the design system's components, and a
  theme's variables.
- Should the editor keep this preference in the scene file? No: in the browser.
- The editor lacks something this extension needs: work around it in the extension? No: build it
  in its home, `editor/` or the recorder, general and tested, then use it.
- Do you want the full version? Always.

Ask the person making the game what its tools should do for its level and its kinds. That is
content, and it is theirs.
