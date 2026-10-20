// Two flat-colour, tileable cartoon maps drawn on canvases, to check that the ground draws a texture as
// given: a cartoon has to stay a cartoon, with hard blob edges, flat fills and no smear.

function tileable(size, base, draw) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  g.fillStyle = base
  g.fillRect(0, 0, size, size)
  // every shape is drawn at the nine offsets of the tile, so it wraps across the edges
  const wrap = (fn) => { for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) { g.save(); g.translate(ox, oy); fn(g); g.restore() } }
  draw(wrap, size)
  return c
}

// a fixed little generator so the toon maps are the same on every load
function rng(seed) {
  let s = seed >>> 0
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
}

export function toonGrass(size = 1024) {
  const r = rng(7)
  return tileable(size, '#62b043', (wrap) => {
    for (const [col, count, rad] of [['#4f9a35', 70, 60], ['#7cc853', 90, 34], ['#3f8429', 160, 10], ['#9adb6a', 120, 7]]) {
      for (let i = 0; i < count; i++) {
        const x = r() * size, y = r() * size, rx = rad * (0.6 + r()), ry = rad * (0.4 + r() * 0.6), a = r() * Math.PI
        wrap(g => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2); g.fill() })
      }
    }
  })
}

export function toonRock(size = 1024) {
  const r = rng(11)
  return tileable(size, '#8d929c', (wrap) => {
    for (const [col, count, rad] of [['#767b86', 40, 110], ['#a4a9b3', 60, 60], ['#5f636c', 90, 26]]) {
      for (let i = 0; i < count; i++) {
        const x = r() * size, y = r() * size, sides = 5 + Math.floor(r() * 3), rr = rad * (0.6 + r() * 0.8), a0 = r() * Math.PI
        const pts = Array.from({ length: sides }, (_, k) => {
          const a = a0 + (k / sides) * Math.PI * 2, d = rr * (0.7 + r() * 0.3)
          return [x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7]
        })
        wrap(g => {
          g.fillStyle = col
          g.strokeStyle = '#4a4d55'
          g.lineWidth = 4
          g.beginPath()
          pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py)))
          g.closePath()
          g.fill()
          g.stroke()
        })
      }
    }
  })
}

// A checkerboard, n × n squares per tile, for seeing exactly how the warp bends the texture.
export function checker(size = 1024, n = 8) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d'), s = size / n
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    g.fillStyle = (i + j) % 2 ? '#111111' : '#eeeeee'
    g.fillRect(i * s, j * s, s, s)
  }
  return c
}

// A flat normal map (straight up) and a mid roughness, for maps that come without either.
export function flat(colour, size = 4) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  g.fillStyle = colour
  g.fillRect(0, 0, size, size)
  return c
}
