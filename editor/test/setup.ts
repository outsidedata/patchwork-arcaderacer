// Every React test: jest-dom's matchers, a clean page after each test, and what jsdom does not have
// that the editor's components use.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach } from 'vitest'
import type { Pixels } from '../ui/pixels.ts'
import { decodePng } from '#plugins/loader/loader.sim.ts'

afterEach(() => {
  cleanup()
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
Element.prototype.scrollIntoView ??= function () {}
// Nor does it lay out a range of text, which covers nothing, as an element with no box does: the code
// field (`ui/code.tsx`) measures its text by ranges on each animation frame the page draws.
const none = { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON() { return this } }
Range.prototype.getBoundingClientRect ??= function () { return none as DOMRect }
Range.prototype.getClientRects ??= function () { return Object.assign([], { item: () => null }) as unknown as DOMRectList }

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

// jsdom has no 2D context of its own, and PixiJS asks the 2D context's prototype what it can do
// before it lays text out on a lent one (`test/editor.ts`).
globalThis.CanvasRenderingContext2D ??= class {} as unknown as typeof globalThis.CanvasRenderingContext2D
// A canvas asking for one, PixiJS's as it is imported and a panel's surface, is answered none, as
// jsdom answers it, which they draw nothing on; without jsdom saying each time that it has not got
// one. A stage's canvases are lent a context of their own (`test/editor.ts`).
const jsdomContext = HTMLCanvasElement.prototype.getContext
HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
  return kind === '2d' ? null : (jsdomContext as (...a: unknown[]) => unknown).call(this, kind, ...rest)
} as typeof jsdomContext

// jsdom decodes no image, so an image is decoded at once; one of an object url once its blob's bytes
// are read, as a browser's waits, and refused when they are no picture (below).
const reading = new WeakMap<HTMLImageElement, Promise<boolean>>()
HTMLImageElement.prototype.decode = function (this: HTMLImageElement) {
  const read = reading.get(this)
  if (!read) return Promise.resolve()
  return read.then(ok => {
    if (!ok) throw new DOMException('The source image cannot be decoded.', 'EncodingError')
  })
}

// jsdom has no object urls: a blob is kept under the url it is given, as a browser keeps it, until
// it is let go.
const blobs = new Map<string, Blob>()
let urls = 0
URL.createObjectURL ??= (blob: Blob) => {
  const url = `blob:${location.origin}/${++urls}`
  blobs.set(url, blob)
  return url
}
URL.revokeObjectURL ??= (url: string) => { blobs.delete(url) }

// jsdom decodes no image. An image of a PNG the repo holds is read from disk, as the dev server
// serves it, and knows its size; so does one of a blob of a PNG, once its bytes are read.
const pngs = new Map<string, Pixels>()
const pngAt = (src: string): Pixels | undefined => {
  if (!src) return undefined
  if (src.startsWith('blob:')) return pngs.get(src)
  const at = decodeURIComponent(new URL(src, location.href).pathname)
  if (!/\.png$/i.test(at)) return undefined
  let got = pngs.get(at)
  if (!got) pngs.set(at, (got = decodePng(new Uint8Array(readFileSync(path.join(process.cwd(), at))))))
  return got
}
Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get(this: HTMLImageElement) { return pngAt(this.src)?.width ?? 0 } })
Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get(this: HTMLImageElement) { return pngAt(this.src)?.height ?? 0 } })
// Such an image has loaded the moment it is given its `src`, as PixiJS asks of an image it loads a
// texture from; one whose file is not there is broken, which is complete too. An image of a data
// url, which jsdom cannot decode, fails once it is given it, as PixiJS's test of what formats a page
// decodes asks; so the first texture PixiJS loads does not wait on that test for ever. An image of an
// object url loads once its blob's bytes are read, as a model's own textures do in a browser, when
// they are a picture, as a browser judges one: by its first bytes, whatever its type says (`picture`),
// and an SVG, which is text, by its type, image/svg+xml; with its pixels when it is a PNG, and with
// none otherwise, as jsdom decodes none. Bytes that are no picture, whatever their type, a PNG that
// does not decode, or a blob let go fail. Either way the image is complete once it is told, as a broken one is too. A blob read
// after the image was given another `src` is the old one's, and nothing is told of it.
const settled = new WeakSet<HTMLImageElement>()
Object.defineProperty(HTMLImageElement.prototype, 'complete', {
  configurable: true,
  get(this: HTMLImageElement) {
    if (this.src.startsWith('blob:')) return settled.has(this)
    try {
      return !this.src || !!pngAt(this.src)
    } catch {
      return true
    }
  },
})
const PNG = [0x89, 0x50, 0x4e, 0x47]
const starts = (bytes: Uint8Array, at: number, sig: number[] | string) =>
  [...sig].every((b, i) => bytes[at + i] === (typeof b === 'string' ? b.charCodeAt(0) : b))
// Whether bytes are a picture a page decodes, as a browser judges one, by its first bytes: a PNG, a
// JPEG, a GIF, a WebP, a BMP, an AVIF or HEIF (an ISO box of one of their brands), or an icon or a
// cursor.
const BRANDS = ['avif', 'avis', 'heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']
const picture = (bytes: Uint8Array) =>
  starts(bytes, 0, PNG) || starts(bytes, 0, [0xff, 0xd8, 0xff]) || starts(bytes, 0, 'GIF8') || (starts(bytes, 0, 'RIFF') && starts(bytes, 8, 'WEBP')) ||
  starts(bytes, 0, 'BM') || (starts(bytes, 4, 'ftyp') && BRANDS.some(b => starts(bytes, 8, b))) || starts(bytes, 0, [0, 0, 1, 0]) || starts(bytes, 0, [0, 0, 2, 0])
const imageSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!
Object.defineProperty(HTMLImageElement.prototype, 'src', {
  configurable: true,
  get: imageSrc.get,
  set(this: HTMLImageElement, v: string) {
    imageSrc.set!.call(this, v)
    const url = String(v)
    settled.delete(this)
    reading.delete(this)
    if (url.startsWith('data:')) setTimeout(() => this.dispatchEvent(new Event('error')))
    if (!url.startsWith('blob:')) return
    const blob = blobs.get(url)
    // Told of the image while it is still of this url, and answered to `decode`.
    const told = (ok: boolean) => {
      if (this.src !== url) return false
      settled.add(this)
      this.dispatchEvent(new Event(ok ? 'load' : 'error'))
      return ok
    }
    if (!blob) {
      reading.set(this, new Promise(done => setTimeout(() => done(told(false)))))
      return
    }
    // Read as jsdom's own blob is read.
    reading.set(this, new Promise(done => {
      const reader = new FileReader()
      reader.onload = () => {
        const bytes = new Uint8Array(reader.result as ArrayBuffer)
        // A picture by its bytes, whatever its type says; an SVG, which is text, only by its type.
        let ok = picture(bytes) || blob.type === 'image/svg+xml'
        if (ok && starts(bytes, 0, PNG)) {
          try {
            pngs.set(url, decodePng(bytes))
          } catch {
            ok = false
          }
        }
        done(told(ok))
      }
      reader.onerror = () => done(told(false))
      reader.readAsArrayBuffer(blob)
    }))
  },
})

