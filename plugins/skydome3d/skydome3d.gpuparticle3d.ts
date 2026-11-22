// skydome3d's mod for gpuparticle3d: the same `light` it hands particle3d (`skydome3d.particle3d.ts`),
// since both draw particles unlit and both take the sky's light the same way. A scene with
// `world.gpuparticle3d.mods.light: 'skydome3d'` draws its GPU particles dimmed as the sky is.
export { light } from './skydome3d.particle3d.ts'
