// The theme's colours read where the page draws them itself rather than through CSS: a mark on the
// stage, a canvas, a picture's pixels. A theme sets them as CSS variables on the page
// (`editor/themes/`), in any CSS colour; one that is not `#rrggbb` is read as the page computes it,
// rgb(r, g, b), or rgba(r, g, b, a) with its alpha, on an element it is set on. A value the page does
// not read as a colour is dropped as it is set, and the element would be computed the colour it
// inherits, the page's text: so that is known where it is set.
//
// The colour variable `name` of the page's theme as 0xrrggbb, or `unset` when the theme does not set
// it, or sets it to what the page does not read as a colour.
export function themed(name: string, unset: number): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const c = v ? rgbaOf(v) : undefined
  return c ? (c[0] << 16) | (c[1] << 8) | c[2] : unset
}

// A CSS colour as the page reads it, [r, g, b, a], each of red, green and blue from 0 to 255 and
// its alpha from 0 to 1: `#rrggbb` as it is written, and any other colour as the page computes it on
// an element it is set on; undefined for what the page does not read as a colour.
export function rgbaOf(css: string): [number, number, number, number] | undefined {
  if (/^#[0-9a-f]{6}$/i.test(css)) {
    const n = parseInt(css.slice(1), 16)
    return [n >> 16, (n >> 8) & 255, n & 255, 1]
  }
  const probe = document.createElement('span')
  probe.style.color = css
  if (!probe.style.color) return undefined
  document.body.appendChild(probe)
  const m = getComputedStyle(probe).color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/)
  probe.remove()
  return m ? [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3]), m[4] === undefined ? 1 : +m[4]] : undefined
}

// That colour as CSS, `#rrggbb`.
export const hexOf = (c: number) => `#${(c >>> 0).toString(16).padStart(6, '0').slice(-6)}`

// Each colour variable as the CSS colour it is under `el`, for a canvas `el` draws on: `#888` when
// none is set there.
export const cssOf = (el: Element) => {
  const css = getComputedStyle(el)
  return (name: string) => css.getPropertyValue(name).trim() || '#888'
}
