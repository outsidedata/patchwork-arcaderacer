import { afterEach, expect, test } from 'vitest'
import { gate } from './gate.ts'

// A listener added from a file under plugins/, as the player plugin adds its own.
const fromPlugin = new Function('on', 'return addEventListener("keydown", on)\n//# sourceURL=http://localhost/plugins/fake/fake.plugin.ts')

let undo = () => {}
afterEach(() => {
  undo()
  document.body.innerHTML = ''
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a game listener hears keys only while the stage has the focus; the editor hears them always', () => {
  undo = gate('.game-stage')
  document.body.innerHTML = '<input id="field"><div class="game-stage" tabindex="0"><canvas></canvas></div>'
  const game: string[] = [], editor: string[] = []
  const on = (e: KeyboardEvent) => game.push(e.key)
  fromPlugin(on)
  addEventListener('keydown', e => editor.push(e.key))

  ;(document.getElementById('field') as HTMLInputElement).focus()
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
  ;(document.querySelector('.game-stage') as HTMLElement).focus()
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }))
  expect(game).toEqual(['b'])
  expect(editor).toEqual(['a', 'b'])

  removeEventListener('keydown', on)
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))
  expect(game).toEqual(['b'])
})

// jsdom has no gamepads; this page has one, on the navigator's prototype, where a browser's
// `getGamepads` is.
// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a game reads the gamepads only while the stage has the focus; the editor reads them always', () => {
  const pad = { connected: true, buttons: [], axes: [] }
  const proto = Object.getPrototypeOf(navigator)
  Object.defineProperty(proto, 'getGamepads', { value: () => [pad], configurable: true, writable: true })
  try {
    undo = gate('.game-stage')
    document.body.innerHTML = '<input id="field"><div class="game-stage" tabindex="0"><canvas></canvas></div>'
    const fromPlugin = new Function('return navigator.getGamepads()\n//# sourceURL=http://localhost/plugins/fake/fake.plugin.ts')
    ;(document.getElementById('field') as HTMLInputElement).focus()
    expect(fromPlugin()).toEqual([])
    expect(navigator.getGamepads()).toEqual([pad])
    ;(document.querySelector('.game-stage') as HTMLElement).focus()
    expect(fromPlugin()).toEqual([pad])
    undo()
    undo = () => {}
    expect(Object.hasOwn(navigator, 'getGamepads')).toBe(false)
    ;(document.getElementById('field') as HTMLInputElement).focus()
    expect(fromPlugin()).toEqual([pad])
  } finally {
    delete proto.getGamepads
  }
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a game listener hears a click only when it lands in the stage', () => {
  undo = gate('.game-stage')
  document.body.innerHTML = '<button>x</button><div class="game-stage"><canvas></canvas></div>'
  const game: string[] = []
  new Function('on', 'addEventListener("click", on)\n//# sourceURL=http://localhost/games/fake/fake.client.ts')(() => game.push('click'))
  document.querySelector('button')!.click()
  document.querySelector('canvas')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  expect(game).toEqual(['click'])
})
