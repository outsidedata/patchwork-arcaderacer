// The layout viewer's shrink-wrap, off the page's thread: posted { id, bodies, fill, cell, smooth }, answers
// { id, positions, normals, index, grid, ms } (shrinkwrap.mjs).
import { shrinkwrap } from './shrinkwrap.mjs'

self.onmessage = ({ data }) => {
  const made = shrinkwrap(data.bodies, data)
  self.postMessage({ id: data.id, ...made }, [made.positions.buffer, made.normals.buffer, made.index.buffer])
}
