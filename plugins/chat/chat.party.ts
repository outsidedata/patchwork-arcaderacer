// chat's mod for party, given to party by one key of a scene: `world.party.mods.whisper` is 'chat'.
// A tap on a member's name in party's frames hands it the account and name, and it opens chat's
// whisper channel to them on chat's page half, as a tap on a line of chat's log does: the next line
// the player sends from chat's entry goes to them.
import type { Plugins } from '#engine/browser.ts'

export const whisper = (plugins: Plugins, account: string, name: string): void => plugins.chat.whisper(account, name)
