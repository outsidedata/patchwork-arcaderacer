// A seat that plays itself. An actor's setup hands it the player and a think; every frame the
// think reads the rows this seat sees and names a press or nothing, and the press goes through
// the player like a key would. One of these per client, so the think is this scene's.
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'

export type Think = (rows: Row[]) => [action: string, ...args: any[]] | undefined

export function playtester() {
  let player: Record<string, (...args: any[]) => void> | undefined
  let think: Think | undefined
  return {
    play(p: Record<string, (...args: any[]) => void>, t: Think) { player = p; think = t },
    tick(plugins: Plugins) {
      if (!player || !think) return
      const press = think(plugins.wire.rows)
      if (press) player[press[0]](...press.slice(1))
    },
  }
}
