// The game's input, kept to the game view. The player and ui plugins listen on `window`, so a key
// typed into an inspector field would move the player. `gate` wraps `window.addEventListener` once,
// before any game is opened: a listener added from a file under `plugins/` or `games/` (the stack at
// the moment it is added names the file) is handed a key only while the focus is inside `stage`'s
// element, and a pointer, mouse or wheel event only when it lands there or the pointer is locked to
// it. Every other event, and every listener the editor adds, passes as it always did. A gamepad is
// read, not listened to: `navigator.getGamepads` asked from a file under `plugins/` or `games/`
// hands back no gamepad unless the focus is inside `stage`'s element, as a key is handed; the
// editor's own call hands back every one.
type Listener = EventListenerOrEventListenerObject

const game = /\/(plugins|games)\//
const keys = /^key/
const pointers = /^(pointer|mouse|click|dblclick|contextmenu|wheel)/

export function gate(stage: string) {
  const add = window.addEventListener.bind(window)
  const remove = window.removeEventListener.bind(window)
  // The wrapper each game listener was added as, by type, so removing the listener removes it.
  const wrapped = new WeakMap<Listener, Map<string, EventListener>>()

  const inside = (el: unknown) => el instanceof Element && !!el.closest(stage)
  const lets = (e: Event) =>
    keys.test(e.type) ? inside(document.activeElement)
      : pointers.test(e.type) ? inside(e.target) || inside(document.pointerLockElement)
        : true

  // The file that called the function this is asked from: the first frame is this function, the
  // second that function, the third whoever called it.
  const caller = () => new Error().stack?.split('\n').filter(l => l.includes('/'))[2] ?? ''

  // Where a page has no gamepads, a game's call reads none either, and there is nothing to wrap.
  const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads.bind(navigator) : undefined
  if (pads) navigator.getGamepads = () => (game.test(caller()) && !inside(document.activeElement) ? [] : pads())

  window.addEventListener = ((type: string, fn: Listener | null, options?: boolean | AddEventListenerOptions) => {
    // A null listener is no listener, as it is to the window.
    if (!fn) return
    if (!game.test(caller()) || !(keys.test(type) || pointers.test(type))) return add(type, fn, options)
    let byType = wrapped.get(fn)
    if (!byType) wrapped.set(fn, (byType = new Map()))
    let w = byType.get(type)
    if (!w) {
      w = (e: Event) => {
        if (!lets(e)) return
        if (typeof fn === 'function') fn.call(window, e)
        else fn.handleEvent(e)
      }
      byType.set(type, w)
    }
    add(type, w, options)
  }) as typeof window.addEventListener

  window.removeEventListener = ((type: string, fn: Listener | null, options?: boolean | EventListenerOptions) => {
    if (fn) remove(type, wrapped.get(fn)?.get(type) ?? fn, options)
  }) as typeof window.removeEventListener

  return () => {
    window.addEventListener = add
    window.removeEventListener = remove
    // The wrapper is the navigator's own property, over its prototype's.
    if (pads) delete (navigator as { getGamepads?: unknown }).getGamepads
  }
}
