// Every `.test.tsx`, in jsdom: what jsdom does not have that the pages' code uses, and a clean
// storage after each test.
import { afterEach } from 'vitest'

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

// jsdom lays nothing out, so a size never changes and nothing is ever observed.
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserver as unknown as typeof globalThis.ResizeObserver

// jsdom has no pointer events: a pointer event is a mouse event with a pointer's id and type.
class PointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly pointerType: string
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'mouse'
  }
}
globalThis.PointerEvent ??= PointerEvent as unknown as typeof globalThis.PointerEvent
