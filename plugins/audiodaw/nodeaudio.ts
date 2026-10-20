// Web Audio on node, for audiodaw's tests: node-web-audio-api's classes put where a page has them,
// before Tone is imported, so Tone renders offline on node as it does in a page.
import * as web from 'node-web-audio-api'

Object.assign(globalThis, {
  window: globalThis,
  self: globalThis,
  // Tone's worklets (PluckSynth's comb filter) ask it of the page; node-web-audio-api runs them.
  isSecureContext: true,
  ...web,
  // Tone.Draw's frames, which a page has and node does not.
  requestAnimationFrame: (f: (t: number) => void) => setTimeout(() => f(performance.now()), 16),
  cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
})
