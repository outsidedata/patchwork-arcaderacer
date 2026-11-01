# persist

The rule side of saving: the `persist` kind whose row declares which kinds a truth keeps as durable
records, and `claim`, which asks for records to be loaded as rows. The persist addon
(`addons/persist/persist.addon.ts`) does the loading and writing.

## Why use it

Use persist when anything must outlive the server: players' characters, inventories, a market's
listings, a city a player built, a saved grid. The engine neither saves nor loads a truth; the
persist addon keeps the rows of a few kinds, the records, in a store beside it (a database file in
node, IndexedDB in a page), and every other row is made again from the scene when the truth boots.
The rules never wait on the store and never see half a record.

## How it works

`persist` is a kind that does nothing a step. Its row carries the declaration and the requests, and
the addon reads both. The prefab (in the manager's scene file, so every child inherits it):

- `kinds`: kind to `{ key, load }`: the field the record is filed under (`uid` for records a game
  shares), and `load: 'boot'` (every record loaded when the truth starts: a market's listings) or
  `load: 'claim'` (loaded when a rule asks: an account's characters).
- `every`: the fewest steps between two writes of one row.
- `claims`: `{}`, where `claim` writes requests.
- `file`: the store's name. `busy`: how long a write in node waits for another's.

`claim(w, kind, match)` asks for the records of a `claim` kind whose data holds every field of
`match`: `claim(w, 'character', { account })`. It writes the request onto the row's `claims`, keyed
by kind and match, so asking twice before the first is answered is one request. After the step the
addon holds the truth until the records are rows, then deletes the request; a rule finds them on a
later step with `w.all(kind)` filtered by the match. A record already a row is not made again.
`claim` throws for a kind the row does not load by claim.

The addon writes a changed row at most once every `every` steps, at once when its data has
`urgent: true` (both sides of a transfer in one step), one last time when it ends, or drops its record
when it ends with `forget: true`. Records name each other by `uid`, never by a row id. A secret never
goes in a row, so never in a record.

## Using it

1. Put a `persist` prefab in the manager's scene file with `kinds`, `every`, `claims: {}`, `file` and
   `busy`, and add a `persist` row to each truth that keeps records; name the `persist` kind in its
   sim.
2. When a seat arrives, `claim(w, 'character', { account })`, and pick the rows up on a later step.
3. Set `urgent: true` on every row a trade touches; set `forget: true` on a row whose record should go
   when you end it.

## Plugins it works with

- **grid**: a grid kept by persist (key `k`) is found whole and not made again.
- **scenemanager**: the manager's prefab is inherited by every child scene, and the addon is attached
  where the truths are.

## Keywords

persistence, save, load, save game, database, records, durable, characters, inventory, accounts,
MMO, IndexedDB, claim, load on demand, boot load, write-behind, urgent, forget, delete
record, uid, `claim`, `persist`
