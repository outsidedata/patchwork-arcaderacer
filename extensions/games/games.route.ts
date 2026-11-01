// The games extension's backend (`games.extension.tsx`): a new game written by `scripts/new-game.ts`'s
// `make`, whose header lists the files, through the route's files.
//
//   POST make  { name, scene, width, height }: the files written, refused with nothing written as
//              `make` refuses. Answers { files, port }.
import type { Router } from '#editor/server/routes.ts'
import { make } from '#scripts/new-game.ts'

export function games(r: Router) {
  r.post('make', ({ body, files }) => make(body, files))
}
