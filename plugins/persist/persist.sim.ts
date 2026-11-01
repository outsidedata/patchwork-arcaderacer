// The rule side of the persist addon (`addons/persist/persist.addon.ts`), which keeps a truth's
// durable records as rows. A truth that keeps records has one `persist` row, an `actors` entry of
// the prefab the manager's scene file gives every child, and its sim names `persist`, this kind,
// which does nothing a step: the row carries the declaration and the requests, and the addon reads
// both.
//
// `claim(w, kind, match)` asks for the records of a `claim` kind whose data holds every field of
// `match` at that value, such as `claim(w, 'character', { account })` for an account's characters.
// It writes the request onto the `persist` row's `claims`, keyed by the kind and the match, so
// asking twice before the first is answered is one request, the way `go` writes a seat's next scene
// onto `out` (`plugins/scenemanager/scenemanager.sim.ts`). After the step, the addon holds the truth until the
// records are rows, then deletes the request; the rows are there from the next step on, and a
// record already a row is not made again. A rule never waits: it finds the rows on a later step,
// `w.all(kind)` filtered by the match, as it would find any row. `claim` throws for a kind the row
// does not load by claim.
import type { Kind, W } from '#engine/engine.ts'
import type { Match } from '#addons/persist/persist.addon.ts'

export const persist: Kind = {}

export function claim(w: W, kind: string, match: Match) {
  const me = w.find('persist')
  if (me.data.kinds[kind]?.load !== 'claim') throw new Error(`persist loads no ${kind} by claim`)
  const fields = Object.keys(match).sort().map(f => [f, match[f]])
  me.data.claims[`${kind} ${JSON.stringify(fields)}`] = { kind, match }
}
