// A data file edited in the editor is read by the running game at once. A `json`, `sheet`,
// `palette` or `tilemap` entry, and every file one of them names — a pack of a sheet, a tileset of a
// map — has two copies: the loader's sim half decodes it once per process, for every rule and every
// actor's `def`, and each client's loader decodes its own, which `plugins.loader` hands out. When
// the editor writes such a file this refills both in place from the new text, before the step is
// rebuilt: the process's copy, which every client made from now on decodes its own from too, and the
// copy of the client the game view draws with, whose plugins then build again what they built once
// from the file (the loader's `onWritten`). The view keeps that client and sets its actors up again
// (`Session.authored`). Every rule and actor reading it, everything drawn from it, and every client
// made from now on, reads what the file now says.
//
// A file a route writes that is not text the editor reads (`onBytes`) is taken the same way: one the
// process has read, a `pixels` entry's picture say, is refilled from its new bytes; any other, a
// sheet's page say, is counted as written (`rewritten`), so it is fetched anew wherever it is decoded
// next; and the game view's client redraws every sheet and map that draws from it.
import type { Editor } from '#editor/editor.ts'
import { holds, rewritten, written } from '#plugins/loader/loader.sim.ts'

type Asset = { url: string; type: string }

export function datafiles(ed: Editor) {
  ed.onFile(async (path, text) => {
    const s = ed.session
    if (!s) return
    const url = '/' + path.replace(/^\//, '')
    const named = [...s.files.values()].some(scene => Object.values((scene.world?.loader?.assets ?? {}) as Record<string, Asset>)
      .some(a => a.url === url && ['json', 'sheet', 'palette', 'tilemap'].includes(a.type)))
    if (!named && !holds(url)) return
    written(url, text)
    await s.client?.plugins.loader?.written(url)
  })
  ed.onBytes(async path => {
    const s = ed.session
    if (!s) return
    const url = '/' + path.replace(/^\//, '')
    if (holds(url)) {
      const res = await fetch(encodeURI(url), { cache: 'no-store' })
      if (res.ok) written(url, new Uint8Array(await res.arrayBuffer()))
      else rewritten(url)
    } else rewritten(url)
    await s.client?.plugins.loader?.written(url)
  })
}
