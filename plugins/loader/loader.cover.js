// The page's loading cover, as it runs in the page: written into the page just inside its <body>, after
// the line that hands it its numbers, `const cover = {...}`, by the bundle (`loader.cover.ts` makes
// both). It is a classic script, so it runs as the first bytes of the page arrive, ahead of every
// module of the game's code. It draws the entry scene's loading screen as `loader.ui.ts` draws it, and
// fetches every file the loader would fetch first, the screen's pictures and fonts ahead of the rest,
// each fetch's promise kept by its url where the loader reads it (`Symbol.for('loader: cover')`,
// `loader.sim.ts`), so nothing is fetched twice. `loader.ui.ts` takes it off the page the frame after
// it has drawn the same screen under it.
/* global cover */
(() => {
  const c = cover
  const held = new Map()
  globalThis[Symbol.for('loader: cover')] = held

  const css = (f, fallback = 0) => {
    const o = typeof f === 'number' ? { color: f } : f ?? { color: fallback }
    const color = o.color ?? fallback, alpha = o.alpha ?? 1
    return `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, ${alpha})`
  }
  const ANCHORS = {
    'top-left': [0, 0], top: [0.5, 0], 'top-right': [1, 0],
    left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5],
    'bottom-left': [0, 1], bottom: [0.5, 1], 'bottom-right': [1, 1],
  }
  // The ui's canvas as the scene will have it: its size in its own pixels, and the CSS pixels each is
  // drawn across, as render2d's `fit` makes them; render3d draws one to one.
  const area = () => {
    const { width: w, height: h, fit } = c.area
    if (fit === 'window') return { width: innerWidth, height: innerHeight, scale: 1 }
    if (fit === 'contain') return { width: w, height: h, scale: Math.min(innerWidth / w, innerHeight / h) }
    if (fit === 'integer') return { width: w, height: h, scale: Math.max(1, Math.floor(Math.min((innerWidth * devicePixelRatio) / w, (innerHeight * devicePixelRatio) / h))) / devicePixelRatio }
    return { width: w, height: h, scale: 1 }
  }

  const root = document.getElementById('loader-cover')
  root.style.cssText = 'position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center'
  const canvas = root.appendChild(document.createElement('div'))
  canvas.style.cssText = 'position: relative; overflow: hidden; flex: none'
  const fill = canvas.appendChild(document.createElement('div'))
  fill.style.cssText = `position: absolute; inset: 0; background: ${css(c.fill, 0)}`
  const box = canvas.appendChild(document.createElement('div'))
  box.style.cssText = 'position: absolute; transform-origin: 0 0'
  const images = c.pictures.map(p => {
    const img = box.appendChild(document.createElement('img'))
    img.style.cssText = `position: absolute; left: ${p.at[0]}px; top: ${p.at[1]}px; width: ${p.size[0]}px; height: ${p.size[1]}px; visibility: hidden`
    return img
  })
  // each line's own picture, at the panel's top left corner at the size it was made, shown while its turn
  // lasts, under the bar and the words
  const lineImages = (c.lines?.pictures ?? []).map(url => {
    if (!url) return null
    const img = box.appendChild(document.createElement('img'))
    img.style.cssText = 'position: absolute; left: 0; top: 0; visibility: hidden'
    return img
  })
  let full
  if (c.bar) {
    const b = c.bar, e = b.edge ?? 0
    const frame = box.appendChild(document.createElement('div'))
    frame.style.cssText = `position: absolute; left: ${b.at[0] - e}px; top: ${b.at[1] - e}px; width: ${b.size[0] + 2 * e}px; height: ${b.size[1] + 2 * e}px; background: ${e ? css(b.frame, 0) : 'transparent'}`
    const track = frame.appendChild(document.createElement('div'))
    track.style.cssText = `position: absolute; left: ${e}px; top: ${e}px; width: ${b.size[0]}px; height: ${b.size[1]}px; background: ${css(b.track, 0)}`
    full = track.appendChild(document.createElement('div'))
    full.style.cssText = `position: absolute; left: 0; top: 0; width: 0; height: ${b.size[1]}px; background: ${css(b.fill, 0)}`
  }
  let line
  if (c.lines) {
    const l = c.lines, s = l.style
    line = box.appendChild(document.createElement('div'))
    line.style.cssText = `position: absolute; left: ${l.at[0]}px; top: ${l.at[1]}px; transform: translate(-50%, -50%); white-space: nowrap`
    line.style.fontFamily = Array.isArray(s.fontFamily) ? s.fontFamily.join(', ') : s.fontFamily ?? 'Arial'
    line.style.fontSize = typeof s.fontSize === 'number' ? `${s.fontSize}px` : s.fontSize ?? '26px'
    line.style.color = css(s.fill, 0)
    if (s.fontWeight) line.style.fontWeight = s.fontWeight
    if (s.fontStyle) line.style.fontStyle = s.fontStyle
    if (s.letterSpacing) line.style.letterSpacing = `${s.letterSpacing}px`
    if (s.dropShadow) {
      const d = s.dropShadow, r = d.distance ?? 5, a = d.angle ?? Math.PI / 6
      line.style.textShadow = `${Math.cos(a) * r}px ${Math.sin(a) * r}px ${d.blur ?? 0}px ${css({ color: d.color ?? 0, alpha: d.alpha ?? 1 })}`
    }
  }

  let done = 0
  // How much of its files the cover has in, 0 to 1: where the ui's bar takes over from (`loader.ui.ts`).
  held.progress = () => (c.urls.length ? done / c.urls.length : 1)
  const began = performance.now()
  const draw = () => {
    if (!root.isConnected) return
    const a = area()
    canvas.style.width = `${a.width}px`
    canvas.style.height = `${a.height}px`
    canvas.style.transform = `scale(${a.scale})`
    const p = c.panel, f = ANCHORS[p.anchor], [w, h] = p.size, [x, y] = p.at ?? [0, 0], k = p.scale ?? 1
    box.style.left = `${f[0] * (a.width - w * k) + x}px`
    box.style.top = `${f[1] * (a.height - h * k) + y}px`
    box.style.width = `${w}px`
    box.style.height = `${h}px`
    box.style.transform = `scale(${k})`
    if (full) full.style.width = `${Math.max(0, Math.min(c.bar.size[0], Math.round(c.bar.size[0] * held.progress())))}px`
    if (line) {
      const now = Math.floor((performance.now() - began) / 1000 / c.lines.every) % c.lines.text.length
      line.textContent = c.lines.text[now]
      lineImages.forEach((img, i) => { if (img) img.style.visibility = i === now && img.src ? 'visible' : 'hidden' })
    }
  }

  // One fetch of `url` once `after` has settled, kept where the loader reads it from this moment on:
  // its bytes, or undefined when it failed.
  const get = (url, after = Promise.resolve()) => {
    if (held.has(url)) return held.get(url)
    const coming = after
      .then(() => fetch(encodeURI(url)))
      .then(res => (res.ok ? res.arrayBuffer() : undefined), () => undefined)
      .finally(() => { done++; draw() })
    held.set(url, coming)
    return coming
  }

  // The screen's pictures and fonts first, each picture shown and each font put in the page as it
  // lands; then every other file, all at once. Every one is held from the start, so a loader that asks
  // for one still waiting waits for this fetch of it.
  let opened
  const open = new Promise(ok => { opened = ok })
  const firsts = [
    ...c.pictures.map((p, i) => get(p.url).then(bytes => {
      if (!bytes) return
      images[i].src = URL.createObjectURL(new Blob([bytes]))
      images[i].style.visibility = 'visible'
    })),
    ...(c.lines?.pictures ?? []).map((url, i) => url && get(url).then(bytes => {
      if (!bytes) return
      lineImages[i].src = URL.createObjectURL(new Blob([bytes]))
      draw()
    })),
    ...c.fonts.map(f => get(f.url).then(bytes => {
      if (!bytes || typeof FontFace === 'undefined') return
      const face = new FontFace(f.family, bytes.slice(0))
      return face.load().then(() => { document.fonts.add(face); draw() }, () => {})
    })),
  ]
  for (const url of c.urls) get(url, open)
  Promise.all(firsts).then(opened)

  draw()
  const turning = setInterval(draw, 250)
  addEventListener('resize', draw)
  // Taken off the page by the ui's loading screen: stop drawing.
  new MutationObserver((_, watch) => {
    if (root.isConnected) return
    clearInterval(turning)
    removeEventListener('resize', draw)
    for (const img of [...images, ...lineImages]) if (img?.src) URL.revokeObjectURL(img.src)
    watch.disconnect()
  }).observe(document.body, { childList: true })
})()
