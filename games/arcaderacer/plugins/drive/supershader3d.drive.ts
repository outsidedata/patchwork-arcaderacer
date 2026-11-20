// supershader3d's mod for drive (`addons/scenemanager`'s mods), the page's. A scene with
// `world.drive.mods: { models: 'supershader3d' }` has drive draw a kit car's pieces (`form: 'kit'` in its car file,
// `drive.plugin.ts`), each a pro-ng glb, in the scene's one shader. It is the very `models` supershader3d hands
// box3dvehicle (`supershader3d.box3dvehicle.ts`): `unpack(bytes)` reads a glb, and `build(unpacked, own)` makes
// one mesh of it in supershader3d's calls, `own` the glb's own looks file, or undefined while the scene's looks
// file has not landed. supershader3d is listed before drive, which drive checks with `ahead`.
export { models } from '#plugins/supershader3d/supershader3d.box3dvehicle.ts'
