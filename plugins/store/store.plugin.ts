// The page's table of values the server never reads: a volume, a tint, the keys a player rebound.
// It lives on the link the page mounted, so every scene of the page reads and writes one table, and
// it never crosses the wire. A value is any JSON value, a list or a table as well as a number, and
// starts as the scene's `store` prefab names it; a `set` replaces it, and `get` hands back the value
// itself.
import type { Plugins } from '#engine/browser.ts'
import type { Value } from '#addons/scenemanager/scenemanager.addon.ts'

export function store() {
  let values: Record<string, Value> | undefined

  const table = () => {
    if (!values) throw new Error('store has not ticked yet')
    return values
  }

  return {
    tick(p: Plugins) {
      const link = p.scenemanager?.link
      if (!link) throw new Error('store needs a mounted scenemanager link')
      const into: Record<string, Value> = values = link.store
      const start = p.wire.scene.prefabs.store
      if (!start) throw new Error('scene lists store but has no store prefab')
      for (const key of Object.keys(start)) if (!(key in into)) into[key] = start[key]
    },
    has: (key: string) => key in table(),
    get(key: string): Value {
      const v = table()
      if (!(key in v)) throw new Error(`store has no ${key}`)
      return v[key]
    },
    set(key: string, value: Value) { table()[key] = value },
  }
}
