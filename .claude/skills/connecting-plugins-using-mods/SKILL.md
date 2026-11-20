---
name: connecting-plugins-using-mods
description: Use in core, or any clone of it, before writing or changing any plugin, and whenever one plugin's things should act on another plugin's things (a car runs over a body, a round hits a limb, a layer is drawn as meshes or as particles, a shot stops at a wall), whenever a plugin must handle a new kind of thing or handle one it has differently (behaviors, `world.<p>.mods.behaviors`, "has no behavior for", "no plugin ... delivers it"), whenever Bill says "like it works in <game>", "this already works", "isn't this just a mod", "it should be behaviors", and before proposing any new code, new act, new field, new `if`, new `switch` or new file to join two plugins. Holds the one model every plugin in core is built on (a host with a table of words, each word's function delivered by the plugin that owns the word, switched on by the scene), the names it goes by, and `check.mjs`, which reads a plugin and says whether it is on the model.
---

# Connecting plugins using mods

Every plugin in core is built on one model. Learn it in the abstract first, then see it in the files.
Claude keeps rebuilding this model from scratch each time, from the named plugins, and gets it wrong.
The model is below. Read it before any file.

## The model: foo eats

**Plugin foo eats.** Foo does not know what food is. Each food names a word by the key its numbers sit
under: `{ apple: {...} }` or `{ soup: {...} }`. Foo keeps a table from word to the function that eats
that word. Foo's own loop is: for each word on a thing, look it up in the table, run that function on
the thing's numbers for that word. That loop is all foo knows.

**Plugin bar owns `apple`.** Bar hands foo the function that eats an apple, in a file `bar.foo.ts`
beside bar, which exports `behaviors()` returning `{ apple: eatApple }`.

**The scene switches it on.** The scene names bar in `world.foo.mods.behaviors: ['bar']`. When the
scene is prepared, foo reads every named plugin's table into its own. When foo meets `{ apple: {...} }`,
it runs `eatApple` on it.

**Soup is a new plugin baz.** A new `baz.foo.ts` returning `{ soup: eatSoup }`, and baz added to the
list. Foo is never edited.

**More than one word per thing.** If foo can eat with its mouth or its ear, those are words in the same
table, delivered the same way: bar's `bar.foo.ts` returns `{ apple: eatApple, mouth: eatWithMouth }`,
and a thing gives every word it wants, `{ apple: {...}, mouth: {...} }`. Foo runs the function for every
word the thing gives. Foo never connects apple to mouth. If they must meet, the `mouth` function is
handed the thing and reads the apple off it. The joining lives in bar's function, never in foo.

**A wrong word throws.** `{ foo: {...} }` where nothing delivers `foo` throws when the scene is prepared,
before the first step, naming the thing, the word, and `world.<p>.mods.behaviors`.

**Why foo exists at all.** Foo owns the part that is the same no matter what is eaten: when to eat,
which things are near enough, how many a frame, holding what it ate, letting go. That is the hard,
shared machinery. A word's function is only the part that differs per thing, and it is small because
foo carries everything round it. Neither works alone, and neither is changed for the other to grow.

**What it is called.** The Strategy pattern keyed by a registry: foo is the context, the table is the
registry, each word's function is a strategy, and a mod is a plugin registering strategies from
outside. The same shape goes by dispatch table, open extension, and inversion of control. Say one of
these names when explaining it; Bill knows them.

## The model in core's words

| In the model | In core |
|---|---|
| foo, the host | plugin `p`, with `world.<p>` |
| the table | `world.<p>.mods.behaviors`, read by `modsOf(world, '<p>', 'behaviors')` and laid over `p`'s own |
| a thing names a word | `{ <word>: <numbers> }` on a row, a layer, a surface's `shape`, a cue |
| bar, the owner of a word | plugin `a` |
| `bar.foo.ts` | `plugins/<a>/<a>.<p>.ts`, or a game's own `games/<game>/plugins/<a>/<a>.<p>.ts` |
| `behaviors()` | `export const behaviors = () => ({ <word>: <function> })` |
| the scene switches it on | `world.<p>.mods: { behaviors: ['<a>', ...] }` |
| a named function, not a table | any other key: `world.<p>.mods: { height: 'terrain3d' }` and `export const height` |
| one plugin takes one | `mod(world, p, key)`: the entry names one plugin |
| one plugin takes many | `modsOf(world, p, key)`: the entry names a list |

Two plugins in core never import each other. The mechanism is the Mods header of
`addons/scenemanager/scenemanager.addon.ts`: `prepare` loads every mod the scene's `world` names before
the first step, and a mod that does not export the key it is named for throws there.

Three more rules of the table:

- **Whoever brings a word brings its function, in the same mod file.** A plugin that hands `p` things of
  a word through one key (`solids`, `surfaces`, `seen`) exports `behaviors()` with that word beside it,
  and the scene names it under both keys.
- **A delivered word overrides.** A behavior a mod delivers takes the place of `p`'s own of that word,
  a built-in included, and a later mod's takes the place of an earlier one's. To change how `p` does its
  job for a word it already has, a scene names a plugin that does it otherwise. `p` is never edited.
- **The word is shared, the function is not.** `box` means one thing to hitscan3d (a line meets it),
  another to walker (a body walks round it), another to cover3d (a bot hides behind it). Each host keeps
  its own table, and shapes3d delivers a `box` to each, in `shapes3d.hitscan3d.ts`, `shapes3d.walker.ts`
  and `shapes3d.cover3d.ts`.

## Four real tables

**lod3d is foo, and it draws nothing.** A layer's own fields place (`on`, `rows`, `cell`, `seed`,
`spacing`, `density`, `size`, ...). Every other field is a word, and its value is that word's numbers.
`"copse": { ..., "mesh": {...} }` is a mesh layer; `"fireflies": { ..., "emitter": {...} }` is an emitter
layer; a layer can give both and be drawn twice over the same instances. instances3d owns `mesh` and
delivers it in `instances3d.lod3d.ts`; particle3d owns `emitter` and delivers it in `particle3d.lod3d.ts`.
Each word's function is a Drawer (`check`, `shells`, `draw`), and `draw` hands back a Drawing
(`arrive`, `leave`, `frame`, `show`, `stale`, `dispose`). That is the whole contract lod3d calls. The
surfaces a layer stands on are the same table: terrain3d delivers `land`, shapes3d delivers `box`,
`cylinder`, `plane`, `hyperplane`, `point`, `line`, `spline`, each a Behavior (`span`, `spot`). Nothing in
lod3d knows a mesh from an emitter or land from a box. demo_lod3d's main scene wires it with one list:
`world.lod3d.mods.behaviors: ["terrain3d", "shapes3d", "instances3d", "particle3d"]`.

**cutscene is foo, and a cue is the thing.** `{ "do": "open", "who": "gate" }` is played by the step the
game's plugin delivers for `open` in `games/demo_cutscene/plugins/stagehand/stagehand.cutscene.ts`,
named in `world.cutscene.mods.behaviors`. A word nothing delivers is refused when the file is read.

**box3dvehicle is foo, and `hit` is a named function, not a table.** drive's jeep runs over a box3d
ragdoll because `world.box3dvehicle` has `hit: { speed, damage }` and `mods: { bodies: 'hitscan3d',
strike: 'hitscan3d' }`. `hitscan3d.box3dvehicle.ts`'s `bodies` is in turn whatever
`world.hitscan3d.mods.bodies` names, so a car meets whatever bodies a shot meets. A chain of mods, each
link a scene line.

**gpgpu3d is foo, and it has no word of its own.** It holds the things of a scene on the GPU. Who hands
a thing and who owns its word are two lists, `world.gpgpu3d.mods.things` and `behaviors`, and they need
not be the same plugin: walker hands its bodies as `cylinder`, shapes3d's word, and motion3d and
puppet3d hand theirs as `capsule`, anim's, so a new kind of body costs a `things` file and no GLSL. Its
readers are hosts in turn: grass3d takes the things through `pressed` and asks its own `behaviors` how
each word presses grass, which box3dvehicle and walker deliver in `<a>.grass3d.ts` (`using-gpgpu3d`).

## The order the work is done in

1. **Run the check on the plugin** (below). Its printout is the plugin's whole shape: the keys it
   reads, the contract a word's owner writes, every mod that delivers to it and the words each delivers.
   Read that before any plugin file.
2. **Find the scene where it already works.** Bill usually names it. If not:
   `grep -rln "<plugin>" games/*/*.scene.json`. Read its `world.<p>.mods` for every plugin involved.
3. **Diff that scene against the one being changed** on those keys. The missing lines are the change.
4. **Make only that change, in the scene.** Say it in one line.

New code is on the table only when the diff ends at a word the printout shows no plugin delivers. Then
it is a new `<a>.<p>.ts` exporting `behaviors()` with that word, delivered by the plugin that owns it,
asked of Bill in planning (prime-directive), never an `if` in `p` or in a game's actor.

## The check

```
node .claude/skills/connecting-plugins-using-mods/check.mjs plugins/<p>
node .claude/skills/connecting-plugins-using-mods/check.mjs games/<game>/plugins/<p>
```

Run from the repo root. It reads the plugin's own halves and every `<a>.<p>.ts` that delivers to it,
nothing else, and prints one line each:

- **table**: the `world.<p>.mods` keys the plugin reads, and whether `behaviors` is one. A plugin on the
  model keeps a table of words.
- **contract**: the exported types its tables are keyed to. That type is what a word's owner writes.
- **refusal**: whether it throws, naming the word and `world.<p>.mods.behaviors`, when nothing delivers
  a word.
- **dispatch**: every `switch` and every `=== '<word>'` on a word-like field inside the plugin. Each is a
  word the plugin decides by itself. With a table, those are its built-ins and a delivered word of the
  same name takes their place. Without a table it fails: each belongs in a table a mod can deliver to.
- **coupling**: every plugin it imports for real, not `import type`, other than math and loader. One
  fails: two plugins never import each other.
- **delivered**: every mod file that delivers to it, the keys each exports, and the words each
  `behaviors()` hands back, found by running it.

A plugin with no halves of its own, only `<p>.<host>.ts` files, is one that only delivers; the check lists
what it delivers and passes it. Exit 1 on either failure, 0 otherwise.

Run it:

- before writing or changing any plugin, on that plugin;
- before saying a join does not exist, on the host;
- when a plugin throws "has no behavior for" or "no plugin ... delivers", on that plugin;
- before writing any `behaviors()`, on the host: the printout shows the word is not yet delivered;
- after the change, on the plugin again, and the printout goes in the evidence.

What a good printout looks like, from lod3d:

```
table      reads world.lod3d.mods: hollows, behaviors, surfaces, seen
           keeps a table of words from behaviors
contract   a word's owner writes a Layer or Behavior or Drawer or Use or Live (exported from lod3d)
refusal    throws when nothing delivers a word ("no behavior for")
dispatch   no switch and no === '<word>' on a word-like field
coupling   imports no other plugin for real (type imports, math and loader aside)
delivered  6 mod file(s) deliver to lod3d:
           plugins/instances3d/instances3d.lod3d.ts exports behaviors; behaviors delivers mesh
           plugins/particle3d/particle3d.lod3d.ts exports behaviors; behaviors delivers emitter
           plugins/terrain3d/terrain3d.lod3d.ts exports surfaces, seen, worker, behaviors; behaviors delivers land
lod3d is on the model
```

What a failing one looks like, from box3dvehicle today: it decides spring part shapes by `p.shape ===
'ball'` with no table, and imports box3d's `b3` for real. Both lines are printed with file and line.

## Writing a new host, or a new word, so it fits the model

A new plugin `p` that does one job over things it does not know:

- `p` keeps a table, `Record<string, Behavior>`, and the type of a Behavior is written in `p`'s header:
  the functions a word's owner must hand over, with their arguments and what they hand back.
- `p` reads the table with `modsOf(world, '<p>', 'behaviors')`, lays each over the last, and throws
  when a thing gives a word nothing delivered: `<p> has no behavior for <thing>, of the word <word>: no
  plugin world.<p>.mods.behaviors names delivers it`.
- `p` has no `if` and no `switch` on what a thing is. Where one is found, it is turned to a word.
- The function `p` runs is handed the thing's numbers for that word and whatever `p` holds that the
  function may need (`{ w }` on the server, `{ plugins }` on the page), never the whole of `p`.
- A built-in word of `p`'s is an entry in its own table, laid under the delivered ones.

A new word for a host that exists:

- It goes in `<a>.<p>.ts` beside the plugin `a` that owns the word, exporting `behaviors()`. If `a` also
  hands `p` the things of that word through another key, both exports sit in the same file.
- The function holds no number of its own. It reads them off the thing's numbers and `p`'s world.
- The scene names `a` under `behaviors`, and under the key the things come through.
- The check prints the new word as delivered.

## What not to do

| Wrong | Why |
|---|---|
| New code in a game's kind to react to another plugin (`if (h.speed) die(...)`) | The kind's act already receives the call through the mod; the plugin behind the act decides what happens. |
| A new `<a>.<p>.ts` before running the check on the host | The one needed is usually there, under the other plugin's folder; the check's `delivered` lines list every one. |
| Reading the kinds and rules first | The join is in the scene's `world.<p>.mods` and the mod files, not in the actors. |
| Explaining the mechanism, then proposing something else | If it works in one scene, the change is the lines that scene has and this one lacks. |
| An `if` or a `switch` in `p` on what a thing is | The plugin that brings the thing delivers `p` a function for its word. |
| Editing `p` to change how it handles a word it already has | A mod delivering that word takes the place of `p`'s own, for the scene that names it. |
| Explaining this to Bill through lod3d, hitscan3d or any named plugin | Explain it as foo eats apple, then point at the files. |
| A wall of text about it | The model is seven short paragraphs above. One of them answers most questions. |

## Example: running over horde's farmers (2026-10-19)

Bill: drive's jeep runs over the pedestrian (a box3d ragdoll); make dismember3d's farmers able to
be run over the same way. "This is something I know works."

What it took: drive's `world.box3dvehicle` has `hit: { speed, damage }` and `mods: { bodies:
'hitscan3d', strike: 'hitscan3d' }`. That mod's `bodies` is whatever `world.hitscan3d.mods.bodies`
names, already `dismember3d` in horde's main scene, and its `strike` calls the farmer's `hit` act,
already dismember3d's. horde's `world.box3dvehicle` lacked the `hit` and the two mods. Three lines.

What Claude did instead: proposed new code in `farmer.sim.ts` to check for a car and call ragdoll3d's
`die`, then a new `dismember3d.box3dvehicle.ts`, while the whole answer was open in front of it.

## Example: lod3d drawing two ways (2026-11-02)

Bill: lod3d should be able to draw a layer as instanced meshes or as particles, and it took rocket
surgery to get there. The model says why it should not have: lod3d is foo, a layer's extra field is the
word, instances3d owns `mesh` and particle3d owns `emitter`, each in its own `<a>.lod3d.ts`, and the
scene lists both under `behaviors`. lod3d draws nothing and knows neither. When this is laid out as foo
eats apple first, the two drawers are two entries in one table, and nothing more.
