// The browser half of box3dvehicle: every car of the scene drawn from its Vehicle in
// `world.box3dvehicle.vehicles`, the one its row's `vehicle` names and its server half builds the
// bodies and joints from, placed each frame by its rows. It needs
// render3d, and is listed after box3d and before render3d, so a frame draws the rows it was handed.
// The drawing is the look's: it follows the physics' sizes where a player sees them meet the world,
// the wheels, the springs and the body's outline, and dresses the rest.
//
// A car is, from `look` (each part in `look.paint`'s colour of its name):
//   the body     on the chassis row: the body's box in `body`, and on it, where the body has a
//                `cabin`, the cabin's hull in `cabin`.
//                An upper arm at each corner from the body's side to the spring's top mount, where
//                the mount is out past the side.
//   fenders      a fender over each axle's wheels in `body`, a band `thickness` thick `gap` over the
//                wheel's top where it rests, from the body's side out to `flare` past the wheel's outer
//                face, its edges rounded `round`: over an axle within `ease` of the nose a flat wing,
//                from the nose back to `gap` behind the wheel, then easing down over `ease` metres to
//                the axle's height; over any other a flare arched round the wheel `gap` clear of it,
//                from the axle's height behind it to the axle's height ahead, the arch a superellipse
//                of power `square` (2 round, squarer above). A wheel pushed in further than `gap` goes
//                up into it.
//   bumpers      a steel bar across the front and the back, `depth` deep and `height` tall at the
//                body's bottom, `overhang` past each side, its edges rounded `round`, in `trim`, with
//                `bolts` chrome bolt heads across each; with `hooks`, a tow hook in `hook` either side
//                of the front one, `hooks` from the middle.
//   grille       a panel `depth` thick in its `paint` across the nose, from the bumper to the body's
//                top, ahead of the body's box, with `slots` rounded slots cut in
//                it `width` across and `height` tall, and the headlights' holes either side, a dark
//                radiator behind them.
//   lights       two round headlights either side of the grille (or of the nose's middle, with none),
//                each a chrome reflector bowl with a bulb in it under a lens `radius` round domed
//                `depth` proud, lit in `light`, in a chrome ring `bezel` thick; and at the back each
//                side a cluster in a housing of `trim`, `bezel` round its lenses, at the body's rear
//                corners: a tail light in `tail` `radius` × 2 tall, and under it a reverse light
//                in `light` `radius` tall; and with `parking`, an amber parking light `radius` round
//                in a housing `depth` deep under each front fender's nose, where it runs flat to the
//                front, glowing `glow`. Each headlight throws a beam, a spot light in `light` of
//                `beam.intensity` candela reaching `distance` metres falling off by `decay`, its cone
//                `angle` radians from its middle soft over its outer `penumbra`, aimed ahead `dip`
//                radians down and `toe` radians out to its own side (none when left out; below 0,
//                in toward the middle). With `beam.at` [x, y, z] in the chassis's frame, the two
//                beams stand there instead, the left at −z and the right at +z, and the lamps are
//                drawn where they were, unlit by them. The tail lights glow `tail.glow` and, with the car braking (`pedals`,
//                `box3dvehicle.sim.ts`), up to `tail.brake` at a full brake, always in `tail`; under the
//                glow the lens itself is `tail.lens` (`tail` when left out), so a dark `lens` with a
//                `glow` of 0 is a lens near black until the brake lights it, as the point light
//                behind the car in `tail` goes to `tail.light.intensity`; the reverse lights glow
//                `reverse.glow` and light theirs, in `light`, `reverse.light.intensity`, while it
//                drives backwards, and are dark otherwise; amber lenses glow `parking.glow`, three's
//                own 1 with no `parking`. With `world.box3dvehicle.lightsOff: true` the car makes no
//                brake light or reverse light, and its lenses glow as above, lighting nothing round
//                them, since every light a scene holds is summed by every lit pixel and a few cars of
//                four lights each slow the whole frame; its headlights' beams are made with it as
//                ever, at no intensity while its row's `lights` is off and at `beam.intensity` while
//                it is on (box3dvehicle's `lights` act, `activateHeadlights`), so switching them never
//                changes how many lights a frame draws and three never builds its lit materials again
//                for it. Without it, every light is made with the car (a model's beams with the model, as
//                it lands) and kept, at no intensity while off, so switching one never changes how
//                many lights a frame draws, and none casts a shadow.
//   spare        the last axle's wheel on the back, `lift` above the body's top, on a bracket.
//   model        `{ asset, at?, scale? }`: the loader catalogue's `model` entry `asset`, drawn on the
//                chassis row in place of the body, its cabin, the fenders, the bumpers, the grille,
//                the spare and the lamps' housings and lenses, none of which is
//                then drawn; the wheels, the corners (springs, dampers, upper and lower arms), the
//                exhaust and the tracks are drawn as without it. Its origin is at `at` in the
//                chassis's frame ([0, 0, 0] when left out), turned `turn` (a quaternion, none when left
//                out), `scale` metres to one of its units (1 when left out), so that once turned its +x
//                is the car's forward, +y up and +z its right, as the chassis's. It is
//                asked of the loader (`plugins.loader`, which the scene lists, or the frame throws
//                naming the vehicle) once, and taken with `model(asset)` the first frame it is ready;
//                until then the car is drawn with no body. With its own `looks` it is a pro-ng glb
//                instead, made by the `models` mod (Models, below). Its own nodes place the lamps, by the
//                start of their names (glTF's `beam.L` reaches three as `beamL`): every node named
//                `beam…` throws a beam of `lights.beam`, a spot light where the node is, aimed along
//                the node's +x (its `dip` is the node's own turn), or, with `beam.at`, the two beams
//                at it as a drawn car's, its `beam…` nodes lighting nothing; and every mesh named, or under a
//                node named, `tail…`, `reverse…` or `amber…` takes the car's tail, reverse or amber
//                lens material, glowing and lit as the drawn lenses are (below), the brake and reverse
//                lights moved to the middle of the tail and the reverse meshes. A look with `model`
//                and no `lights` has no lamps: no beams, and its lamp meshes keep their own
//                materials. Every other material of the model is dressed by render3d, once, and is the
//                loader's, never disposed here; every mesh of it takes shadows, and every one that is
//                not see-through casts them; a pro-ng model's one mesh (Models, below), its see-through
//                calls among its solid ones, casts as the `models` mod made it. Every node named starting `steer` (glTF's `steer` reaches
//                three as `steer`) that is not under another is a steering wheel, which turns with the
//                steering (`lock`, below), about its own x: a model's steering wheel is its own node,
//                its +x down the column into the dash, +y up its face, +z right. A car with no model
//                draws no steering wheel.
//   lock         radians the steering wheel turns at full lock, the car row's `steer` at ±1: each frame
//                each of a model's `steer…` nodes is turned `steer` × `lock` about
//                its column, from the way it was made, so a steer to the left (positive) turns its top
//                to the left; about its own −x, the column toward the driver. With none the wheel does
//                not turn.
//   rig          the name of the kit thing of a pro-ng body model whose skeleton is the car's suspension and steering: its
//                bones are posed every frame by clips of the glb, `<rig> <clip>` (a glb names an animation by its thing
//                and its clip), that the model must have, built to the car's own numbers, each
//                additive on the bind pose, its middle key the pose that adds nothing (the rest), so the clips that
//                move one bone, a solid axle's two wheels, add up. `steer`, when an axle `steered`: 0 full lock to the
//                right, 0.5 straight, 1 full lock to the left. `travel <axle> <left|right>` for every wheel, `axle` its
//                number among the vehicle's `axles` and `left` the car's −z: 0 the spring at full droop (compression
//                0), 0.5 at its `sag`, 1 at full bump (its `travel`), straight between, the wheel's own compression.
//                A model without one of them throws on the frame it comes, naming the vehicle and the clip. The
//                library's pro-ng builds them from the axle numbers (`pro-ng/kit/modern/vehicles/BOX3DVEHICLE.md`).
//   lamps        a pro-ng body model's lamps, which is one mesh with no node a lamp is found by: `{ head?, tail?,
//                reverse?, amber? }`, each a table of the model's lamp material by name to the name of its twin, the
//                same lens lit (`{ "tail": { "v240_lens_red": "v240_lens_red_lit" } }`). Both are in the scene's looks
//                file and in one draw call (the `models` mod's `twin` throws naming them otherwise), and the model
//                has a vertex in each dark material named (or the first frame its model comes throws, naming the
//                vehicle, the group and the material). Each car's vertices in a group's dark material are drawn in
//                its twin while the group is lit, and back in the dark one after: `head` while the headlights are
//                (the row's `lights` under `lightsOff`, always without it), `tail` while the car brakes or the
//                headlights are on, `reverse` while it drives backwards, `amber` while the headlights are on. It
//                lights no light of its own: the beams are `lights.beam.at`'s, the brake and reverse lights `lights`'
//                (they stand at the tail's middle, not at the lenses, which a pro-ng model has no nodes to find).
//   points       `{ <name>: [x, y, z] | { at: [x, y, z], part?: 'steer', turn?: [x, y, z, w] } }`:
//                named places of the car in the chassis's frame, where a body sits, takes hold or puts
//                its feet. Each is drawn as an empty three.js object of its name: on the chassis, so
//                with the car still it is at the chassis row's place turned by its turn, plus `at`
//                turned by it; or, with `part: 'steer'`, on the steering wheel (a model's first
//                `steer…` node, once the model has come), set back by the wheel's own
//                place and turn so that with the wheel straight it is at `at`, and turning with the
//                wheel. With `turn`, a quaternion in the chassis's frame, the empty is turned so (with
//                the wheel straight, for one on it): a hand bent onto it takes that turn. A `part`
//                that names nothing the look draws throws naming the point: on the frame the car is
//                made (a car with no model has no steering wheel), or, for a model, on the frame it
//                comes and has no `steer…` node.
//   exhaust      a list of tailpipes, each `{ at, dir, pipe }`: a chrome tailpipe `pipe` round ending at
//                `at`, along `dir`, both in the chassis's frame. What it blows is particle3d's (Effects,
//                below).
//   tracks      `{ colour, opacity, skid, slide, clear, step, life, max, lift }`: the track each tyre
//                leaves on the land, a ribbon its wheel's width laid `lift` metres over the land's
//                height under each edge, a piece every `step` metres the wheel goes while its lowest
//                point is within `clear` metres of the land, broken where it is not. A piece is
//                `colour` at the opacity the land's `mark(x, z)` gives where it is laid (`opacity`
//                where it gives none, or has no `mark`), plus `skid`
//                while the tread slides over the ground faster than `slide` metres a second, a skid's
//                rubber or a spun wheel's rut, at most 1; a piece of no opacity is not laid, and
//                breaks the track. Each fades to nothing over `life` seconds from when it was laid,
//                and a wheel keeps its last `max` pieces, laying each new one over its oldest. A track
//                is the page's own, and goes with its car. The land is the one a mod hands it,
//                `world.box3dvehicle.mods: { land: '<a>' }` (terrain3d's, `terrain3d.box3dvehicle.ts`):
//                `land(plugins)` is an object whose `height(x, z)` is the ground there, whose
//                `mark(x, z)` is its mark, and whose `drivers(x, z)` are the drivers its ground hands
//                what is on it (Effects, below); undefined until it has a ground. With no land no tyre
//                is on the ground, and none is laid. The plugin the mod is is listed before this one,
//                so the land it asks in its `afterTick` is this frame's, and a scene with tracks that
//                lists it after, or does not list it, throws (`ahead`).
//   the wheels   each on its wheel row: a tyre of its axle's `wheel.radius` and `width`, revolved, its
//                sidewalls bulging and its shoulders rounding into the tread (with `tread`, `blocks`
//                chevron lugs round it `depth` deep, each half turned `angle` radians across it), on a
//                dished steel wheel `look.rim` of the radius with `look.spokes` ribs on its outer face,
//                as many chrome lug nuts round its hub and a chrome cap, so its turning shows. With
//                `look.wheel`, `{ left, right }`, the model of the wheel's side in its place instead,
//                each a model as `model` is (its `at`, `turn` and `scale` in the wheel's frame: +z along
//                the axle toward the car's right, +x forward with the wheel straight and unrolled), one
//                made for each wheel, drawn on its row once it has come, rolling and steering as the row
//                does.
//   the hubs     with `look.hubs`, one `{ left, right }` an axle in `axles`' order: at each wheel's
//                middle the model of its axle's and its side's, in the wheel's frame as a wheel model is,
//                turned as the chassis is and steered about the chassis's up as far as the wheel row is,
//                and never rolled: what of a corner steers and rides with its wheel and does not turn
//                with it (a knuckle, a drum, a fender).
//   corners      `look.corners: false` draws no spring, damper or arm at any corner and no upper arm on
//                the body, for a model that has its own.
//   the corners  between the chassis and each wheel, placed each frame from both rows: a coil spring
//                of `look.coils` turns, `look.coilRadius` round and `look.wire` thick, from the wheel's
//                inner face (level with the wheel's middle, along the chassis's side, so it does not
//                steer with the wheel) up to the spring's mount, stretched to the gap between them, so it
//                squashes as the wheel is pushed in; a damper, a sleeve hanging from the mount as long
//                as the spring at full bump and a rod from the wheel to the mount; and a lower arm from
//                the body's bottom edge to the wheel's inner face, where that is out past the side.
//                With `look.inboard`, the spring and the damper are drawn that many metres in toward
//                the body, out of the tyre: their foot that far in from the wheel's inner face and
//                their top that far in from the mount; the arms run to
//                those two points instead. Only the drawing moves: the spring pushes at its mount
//                (`box3dvehicle.sim.ts`).
//   sound        `{ engine, stems?, ease?, at?, range? }`: the engine heard. `engine` is the loader
//                catalogue's `json` entry of its manifest (`Engine`, `box3dvehicle.sim.ts`), which the
//                library's `sounds/sounds.mjs` writes beside its loops, from a `piston` or `electric`
//                species: its layers, each the engine held at an rpm as the files of its stems (`on`, the
//                exhaust under load; `off`, on the overrun; `intake`; `mech`), and its `mix`. Each file is
//                read beside the manifest through the loader (`beside`) and decoded by the `sound` mod,
//                once a page however many cars share it. `stems` and `ease` lie over the manifest's mix,
//                one stem at a time, so a scene names an engine and gives only what it changes. Each loop
//                plays held going from the car's point `at` in the chassis's frame ([0, 0, 0] when left
//                out), placed every frame, through the `sound` mod, `world.box3dvehicle.mods: { sound:
//                'audio' }` (audio's, `audio.box3dvehicle.ts`), fading out over `range` metres in place of
//                the listener's own. It follows the car row's `rpm`,
//                which its petrol or electric engine writes each step: each stem's loop plays at the row's
//                rpm over its own, so the engine's pitch is the row's, and of the layers that give the
//                stem, the two either side of the rpm are heard, crossfaded by where it stands between them
//                at equal power (cos and sin of a quarter turn across the gap), every other at none. Below
//                the lowest only it is heard, as much quieter as the rpm is below its, none at 0, as a
//                motor standing still is silent; above the highest, only it. Each stem is as loud as
//                `stems.<stem>`, `[shut, full]`, makes the heard throttle: the row's (none below 0, the
//                brake), followed by e of the way every `ease` seconds of the page's clock (at once, left
//                out), so a stab at the throttle swells rather than clicks. A stem with no gain is not
//                played. The loops start once every one has come, and stop with the car; a manifest that
//                names a file not beside it is written to the console once, and its car stays silent. On
//                a page with no Web Audio, as in node, the mod is undefined, and nothing is read. A car
//                with a sound in a scene that lists no loader,
//                or names no `sound` mod, or whose engine writes no `rpm` (direct drive), throws on the
//                frame it is drawn, naming the vehicle.
// Effects. A car throws no effect itself. Its mod for particle3d (`box3dvehicle.particle3d.ts`, named in
// `world.particle3d.mods.sources`) hands particle3d every car's sources each frame (particle3d's header,
// Attachments), and the scene's `world.particle3d.attach` says which effect each throws.
// Models. A model a look names (its body, a wheel, a hub) that names its own `looks` is a pro-ng glb, the loader
// catalogue's `binary` entry `asset`, drawn through `world.box3dvehicle.mods.models` (supershader3d's,
// `supershader3d.box3dvehicle.ts`): its bytes asked of the loader once, unpacked by the mod once, and a mesh built
// of it by the mod for each car and wheel it is drawn on, in the scene's one shader, once the scene's looks file has
// landed; its own looks file, the `json` entry `looks` (preloaded), names the material each of its vertices counts.
// Its meshes are the mod's, dressed already, and their geometry goes with the car. A scene that names no `models`
// throws on the frame such a model is drawn, naming the vehicle, and one that does not list the mod's plugin before
// this one throws then too (`ahead`). Any other model is the loader's `model`, every material of it dressed by
// render3d once, a wheel's or a hub's a copy of it for each wheel.
// Round parts have `look.segments` sides and arms are `look.arm` thick. A car is drawn once its row
// names its parts and they have come, and goes with its row. When `world.box3dvehicle` changes, as
// a dev page's panel does while a value of it is dragged, every car is made again from it.
// Every part is a physical material in its paint, its finish `look.finish`'s for that paint
// (`roughness`, `metalness`, a `clearcoat` and its `clearcoatRoughness` for lacquered paint, a
// `sheen` and its `sheenRoughness` for vinyl, an `opacity` below 1 for glass and lenses, which are
// drawn see-through) and three's own for a paint it leaves out, dressed by render3d, so the sky's
// environment, its wet and its snow reach the car as they reach the ground; `light`, `tail` and
// `amber` glow in their own colour. The parts that never move against the chassis or a wheel are
// merged into one mesh a material, so a car is a few draws however many parts it has; the drawn
// steering wheel, which turns on the chassis, is merged so on its own.
// Every mesh takes shadows, and every one that is not see-through casts them, but the one mesh the `models` mod
// builds of a pro-ng glb, a wheel's, a hub's or a body's, which casts as the mod made it: its see-through calls are
// among its solid ones, and the whole thing would otherwise cast nothing.
// The lamps found by name: each beam's spot light is `box3dvehicle.beam`, the brake light
// `box3dvehicle.brake`, the reverse light `box3dvehicle.reverse`, and the drawn lenses of the tail
// and reverse lights `box3dvehicle.tail` and `box3dvehicle.backup`; a model's group on the chassis
// is `box3dvehicle.model`.
//
// One of these per client: the cars drawn are this scene's. `point(id, name)` is the empty of the look's
// point `name` of the car whose `box3dvehicle` row is `id`, as it is drawn this frame (its world matrix
// this frame's once this plugin's `afterTick` has placed the car); undefined while the car is not
// drawn, for a name its look has not, and, for a point on a model's steering wheel, until the model has
// come. interact asks it through box3dvehicle's mod for it (`box3dvehicle.interact.ts`).
import type { Object3D } from 'three'
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { ahead, mod, provided } from '#addons/scenemanager/scenemanager.addon.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import { cabinPoints, corners, cross, design as designOf, pedals, pointOf, turn, wheelAt, type Centred, type Corner, type Engine, type Fleet, type Lamp, type Lamps, type Lights, type Model, type Paint, type Sided, type Tracks, type Vehicle, type Wheel } from './box3dvehicle.sim.ts'
import type { Quat, Vec3 } from '#plugins/box3d/box3d.sim.ts'

// What a `land` mod is: the ground the tracks are laid on and the wheels' effects are thrown at, or
// undefined until there is one: its height, the drivers its ground hands what is on it, and its mark.
export type Land = (plugins: Plugins) => {
  height(x: number, z: number): number
  drivers?(x: number, z: number): Record<string, number> | undefined
  mark?(x: number, z: number): number | undefined
} | undefined
// What a `sound` mod is: how this page decodes a file's bytes, and holds a sound going from `buffer`, at
// its rate and gain, placed `at`, until it is stopped; undefined where the page has no Web Audio.
type Held = { set(rate: number, gain: number): void; put(at: number[]): void; stop(): void }
type Sounding = {
  decode(bytes: ArrayBuffer): Promise<AudioBuffer>
  hold(buffer: AudioBuffer, holding: { rate: number; gain: number; at?: number[]; range?: number }): Held
}
type Hold = (plugins: Plugins) => Sounding | undefined
// What a `models` mod is: how this page reads a pro-ng glb's bytes, once, and builds a mesh of what it read, `own`
// its own looks file; undefined while the scene's shader is not ready.
// `twin(dark, lit)` is the scene's look numbers of two materials of one draw call, a lamp's lens dark and lit; it
// throws, naming them, for one the scene's looks file does not hold or two in different calls.
type Made = { unpack(bytes: Uint8Array): Promise<unknown>; build(unpacked: unknown, own: unknown): any | undefined; twin(dark: string, lit: string): [number, number]; rig(unpacked: unknown, mesh: any): Rig }
// A skinned model's clips, held posed: `pose(name, at)` puts the clip `name` `at` of the way through it (0 its first key, 1
// its last) and throws for one the model has not; `apply()` puts what was posed on the bones.
type Rig = { has(name: string): boolean; pose(name: string, at: number): void; apply(): void }
type Makes = (plugins: Plugins) => Made
// The name a wheel's side goes by in a look's models and a rig's clips: `left` (the car's -z) or `right` of a pair axle's, `centre` of a
// one-wheel axle's.
const sideOf = (c: Corner) => (c.side < 0 ? 'left' : c.side > 0 ? 'right' : 'centre')
// The model of corner `c` in `models`, a look's `wheel` or one axle of its `hubs`: throws, naming the vehicle, when it has none for that side.
function modelOf(models: Sided | Centred, c: Corner, name: string, what: string): Model {
  const m = (models as Partial<Record<string, Model>>)[sideOf(c)]
  if (!m) throw new Error(`world.box3dvehicle.vehicles.${name}.look.${what} gives no ${sideOf(c)} model, and a wheel of ${c.side === 0 ? 'a one-wheel axle' : `its ${sideOf(c)}`} is drawn by it`)
  return m
}
// One tyre's track: its mesh, the time each piece was laid and its opacity then, the next piece to
// lay over, how many are laid, and the edges of the last place laid at, [x, y, z] left and right, or
// undefined where the track is broken.
type Track = { mesh: any; born: Float32Array; strength: Float32Array; next: number; laid: number; last?: number[][] }
type Drawn = {
  chassis: any; wheels: any[]; corners: { coil: any; sleeve: any; rod: any; arm?: any }[]; owned: { dispose(): void }[]
  // With `look.wheel`: whether each wheel's model is on its row yet. With `look.hubs`: each wheel's hub, a
  // group on the scene, and whether its model is in it yet.
  fitted: boolean[]; hubs: any[]; hubbed: boolean[]
  tracks: Track[]
  // The lamps: the tail lenses' and reverse lenses' materials and their two lights, which change, and
  // the amber lenses' material.
  lamps?: { tail: any; backup: any; amber: any; brake?: any; reverse?: any }
  // Each headlight's beam, its spot light; under `lightsOff` at no intensity while the car row's
  // `lights` is off.
  headlights: any[]
  // With `look.model`: the model's group on the chassis, once the loader has it.
  model?: any
  // With `look.lamps`: each lamp material of a pro-ng model, for the vertices of the model's mesh that are drawn in
  // it, its look numbers `ids` as [dark, lit], and whether they are drawn lit now.
  twins?: { group: keyof Lamps; attribute: any; vertices: number[]; ids: [number, number]; lit: boolean }[]
  // With `look.rig`: the model's clips, posed each frame.
  rig?: Rig
  // Each steering wheel, a model's `steer…` nodes, and its turn as it was made.
  steers: { piece: any; rest: any }[]
  // The empty of each of the look's points drawn so far, by name.
  points: Map<string, any>
  // With `look.sound`: each stem's layers, sorted by rpm, and each one's loop held going, once every loop
  // has come; and the throttle heard, as it last stood and when.
  engine?: { stem: string; layers: Layer[]; held: Held[] }[]
  heard?: { throttle: number; at: number }
}
// One layer of one stem: the rpm its loop was made at, and the loop.
type Layer = { rpm: number; buffer: AudioBuffer }
// An engine read: its manifest, and each file it names decoded.
type Heard = { manifest: Engine; buffers: Record<string, AudioBuffer> }

// The layers of the engine `e` that give `stem`, sorted by rpm.
const layersOf = (e: Heard, stem: string): Layer[] =>
  e.manifest.layers.filter(l => l.stems[stem] !== undefined).map(l => ({ rpm: l.rpm, buffer: e.buffers[l.stems[stem]] })).sort((a, b) => a.rpm - b.rpm)

// Each layer's playback rate and gain at `rpm`, `layers` sorted by rpm, `loud` the gain at this throttle.
// A wheel row's tread where it meets the ground, `radius` below its middle: `speed`, m/s the wheel goes
// across the land; `slide`, m/s the tread slides over the ground, its speed and its spin's there summed,
// spinning or locked; `back`, the way across the land the tread pushes the ground, [x, z] of length 1:
// back from the way the wheel goes as it rolls, and from the way it spins on the spot, which is back from
// its way when it goes nowhere.
export function tread(wheel: Record<string, any>, radius: number): { speed: number; slide: number; back: [number, number] } {
  const [vx, , vz] = wheel.vel as Vec3
  const [tx, , tz] = cross(wheel.spin as Vec3, [0, -radius, 0])
  const back = Math.hypot(tx, tz) > 1e-6 ? [tx, tz] : [-vx, -vz], len = Math.hypot(back[0], back[1]) || 1
  return { speed: Math.hypot(vx, vz), slide: Math.hypot(vx + tx, vz + tz), back: [back[0] / len, back[1] / len] }
}

export function mix(layers: { rpm: number }[], rpm: number, loud: number): { rate: number; gain: number }[] {
  const weights = layers.map(() => 0), last = layers.length - 1
  if (rpm <= layers[0].rpm) weights[0] = Math.max(0, rpm) / layers[0].rpm
  else if (rpm >= layers[last].rpm) weights[last] = 1
  else {
    const i = layers.findIndex((_, k) => k < last && rpm < layers[k + 1].rpm), t = (rpm - layers[i].rpm) / (layers[i + 1].rpm - layers[i].rpm)
    weights[i] = Math.cos((t * Math.PI) / 2)
    weights[i + 1] = Math.sin((t * Math.PI) / 2)
  }
  return layers.map((l, k) => ({ rate: Math.max(0, rpm) / l.rpm, gain: weights[k] * loud }))
}

// Whether two values are the same: the same number (NaN the same as NaN), string, boolean or null, or
// arrays and plain objects of the same, item by item and field by field, a field holding undefined the
// same as one not there. Read every frame against the copy of world.box3dvehicle, so it walks the two
// and makes nothing.
function same(a: unknown, b: unknown): boolean {
  if (a === b || (a !== a && b !== b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const c = b as unknown[]
    if (a.length !== c.length) return false
    for (let i = 0; i < a.length; i++) if (!same(a[i], c[i])) return false
    return true
  }
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>
  for (const k in x) if (!same(x[k], y[k])) return false
  for (const k in y) if (!(k in x) && y[k] !== undefined) return false
  return true
}

export function box3dvehicle() {
  const cars = new Map<number, Drawn>()
  // A copy of world.box3dvehicle as the cars were drawn from it, taken when it changes; a change,
  // made in place or not, drops every car to be made again.
  let design: Fleet | undefined
  // The models asked of the loader, each once; and every material of a model dressed, each once.
  const asked = new Set<string>()
  const dressed = new WeakSet<object>()
  // With the `models` mod: each pro-ng glb as the mod unpacked it, by its catalogue name, undefined while it comes.
  const glbs = new Map<string, unknown>()
  // A hub's steer and the up it turns about, made once with three and reused every frame.
  let steered: any, up: any
  // Each engine asked for, by its manifest's catalogue name, once a page; and each read, once it has come.
  const engines = new Set<string>()
  const read = new Map<string, Heard>()

  // The engine whose manifest is the catalogue's `name` read: the manifest from the loader, each file it
  // names from beside it, decoded by `sounding`, all at once. A manifest the loader cannot read it writes
  // to the console itself; a file that is not beside it is written here, once.
  function listen(loader: Plugins['loader'], sounding: Sounding, name: string) {
    if (engines.has(name)) return
    engines.add(name)
    void (async () => {
      const manifest: Engine | undefined = await loader.load(name).catch(() => undefined)
      if (!manifest) return
      const files = [...new Set(manifest.layers.flatMap(l => Object.values(l.stems)))]
      const decoded = await Promise.all(files.map(async file => {
        const bytes: ArrayBuffer | undefined = await loader.beside(name, file)
        if (!bytes) throw new Error(`box3dvehicle: the engine ${name} names ${file}, which is not beside it`)
        return [file, await sounding.decode(bytes.slice(0))] as const
      }))
      read.set(name, { manifest, buffers: Object.fromEntries(decoded) })
    })().catch(e => console.error(e))
  }

  function make(render3d: Plugins['render3d'], v: Vehicle, name: string, lightsOff: boolean): Drawn {
    const { THREE, scene } = render3d as { THREE: any; scene: any }
    const owned: { dispose(): void }[] = []
    const mats = new Map<string, any>()
    const lit = new Set(['light', 'tail', 'amber'])
    const mat = (name: keyof Paint) => {
      if (!mats.has(name)) {
        const color = v.look.paint[name], f = v.look.finish?.[name]
        const clear = f?.opacity !== undefined && f.opacity < 1 ? { transparent: true, depthWrite: false } : {}
        const m = render3d.dress(new THREE.MeshPhysicalMaterial({ color, ...f, ...clear, ...(lit.has(name) ? { emissive: color } : {}) }))
        owned.push(m)
        mats.set(name, m)
      }
      return mats.get(name)
    }
    const geo = <G extends { dispose(): void }>(g: G) => { owned.push(g); return g }
    const look = v.look, { segments, spokes, rim, coils, coilRadius, wire, arm } = look
    const { length: L, height: H, width: W } = v.body
    const Y = new THREE.Vector3(0, 1, 0)
    const curve = Math.max(4, Math.round(segments / 4))

    // `g` in `paint`, at `at`, put in `into`.
    const put = (into: any, g: any, at: number[], paint: keyof Paint) => {
      const m = new THREE.Mesh(geo(g), mat(paint))
      m.position.set(at[0], at[1], at[2])
      into.add(m)
      return m
    }
    // A box `size` big with its middle at `at`, in `paint`, put in `into`.
    const box = (into: any, size: number[], at: number[], paint: keyof Paint) => put(into, new THREE.BoxGeometry(size[0], size[1], size[2]), at, paint)
    // A round tube `radius` thick from `a` to `b`, put in `into`.
    const tube = (into: any, a: number[], b: number[], radius: number, paint: keyof Paint) => {
      const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      const m = put(into, new THREE.CylinderGeometry(radius, radius, d.length(), segments).translate(0, d.length() / 2, 0), a, paint)
      m.quaternion.setFromUnitVectors(Y, d.normalize())
      return m
    }
    // A rectangle from [x0, y0] to [x1, y1], its corners rounded `r`: a shape, or a hole `into` one.
    const rect = (x0: number, y0: number, x1: number, y1: number, r: number, into: any = new THREE.Shape()) => {
      const q = Math.max(1e-4, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2)), h = Math.PI / 2
      into.moveTo(x0 + q, y0)
      into.lineTo(x1 - q, y0); into.absarc(x1 - q, y0 + q, q, -h, 0, false)
      into.lineTo(x1, y1 - q); into.absarc(x1 - q, y1 - q, q, 0, h, false)
      into.lineTo(x0 + q, y1); into.absarc(x0 + q, y1 - q, q, h, 2 * h, false)
      into.lineTo(x0, y0 + q); into.absarc(x0 + q, y0 + q, q, 2 * h, 3 * h, false)
      return into
    }
    // The same about the origin, `w` by `h`.
    const middle = (w: number, h: number, r: number) => rect(-w / 2, -h / 2, w / 2, h / 2, r)
    // `shape` pushed `depth` through its plane, every edge rounded `round`, its outline and depth
    // where they were drawn: along z, its middle at z 0.
    const slab = (shape: any, depth: number, round: number) => {
      const r = Math.max(0, Math.min(round, depth / 2 - 1e-4))
      return new THREE.ExtrudeGeometry(shape, {
        depth: depth - 2 * r, bevelEnabled: r > 0, bevelThickness: r, bevelSize: r, bevelOffset: -r, bevelSegments: 3, curveSegments: curve,
      }).translate(0, 0, r - depth / 2)
    }
    // A slab drawn in the car's side view (x along, y up), `depth` across z.
    const side = (shape: any, depth: number, round: number) => slab(shape, depth, round)
    // A slab drawn as seen from the front (shape x along the car's z, y up), `depth` along x.
    const front = (shape: any, depth: number, round: number) => slab(shape, depth, round).rotateY(-Math.PI / 2)
    // A rounded box `size` big: a front-view slab, so its rounding runs round every edge.
    const block = (size: number[], round: number) => front(middle(size[2], size[1], round), size[0], round)
    // A disc `radius` round and `depth` thick facing along x.
    const disc = (radius: number, depth: number, sides = segments) => new THREE.CylinderGeometry(radius, radius, depth, sides).rotateZ(Math.PI / 2)
    // Everything plain under `group` merged into one mesh a material, in the group's frame, so a car is
    // a few draws however many parts it has; a named mesh, a lamp the frame changes, is kept apart.
    const bake = (group: any) => {
      group.updateMatrixWorld(true)
      const inverse = group.matrixWorld.clone().invert(), by = new Map<any, any[]>(), parts: any[] = []
      group.traverse((m: any) => { if (m.isMesh && !m.name) parts.push(m) })
      for (const m of parts) {
        const list = by.get(m.material) ?? []
        by.set(m.material, [...list, m])
        m.parent.remove(m)
      }
      for (const [material, meshes] of by) {
        const pieces = meshes.map((m: any) => {
          const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
          g.applyMatrix4(inverse.clone().multiply(m.matrixWorld))
          return g
        })
        const count = pieces.reduce((n: number, g: any) => n + g.attributes.position.array.length, 0)
        const pos = new Float32Array(count), nor = new Float32Array(count)
        let at = 0
        for (const g of pieces) {
          pos.set(g.attributes.position.array, at)
          nor.set(g.attributes.normal.array, at)
          at += g.attributes.position.array.length
          g.dispose()
        }
        const merged = geo(new THREE.BufferGeometry())
        merged.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
        merged.computeBoundingSphere()
        group.add(new THREE.Mesh(merged, material))
      }
      // The groups the parts were placed with, empty now.
      const empty = (o: any): boolean => o.children.every((c: any) => c.isGroup && empty(c))
      for (const o of [...group.children]) if (o.isGroup && empty(o)) group.remove(o)
    }

    // A wheel across z, its outer face on the `side` it is on: a revolved tyre, its sidewalls bulging
    // and its shoulders rounding into the tread, chevron lugs round it, and a dished steel wheel with
    // `spokes` ribs, as many lug nuts round its hub and a cap on it, so its turning shows.
    const wheel = (wh: Wheel, side: number) => {
      const { radius, width: w } = wh, g = new THREE.Group(), tread = look.tread
      const base = tread ? radius - tread.depth : radius, rr = radius * rim, half = w / 2
      const shoulder = Math.min(w * 0.2, (base - rr) * 0.35), bulge = w * 0.05
      const tyre: any[] = []
      const wall = (from: number, to: number, sign: number) => {
        for (let k = 0; k <= 8; k++) {
          const u = from < to ? k / 8 : 1 - k / 8
          tyre.push(new THREE.Vector2(rr + (base - shoulder - rr) * u, sign * (half * 0.9 + half * 0.1 * u + bulge * Math.sin(Math.PI * u))))
        }
      }
      const round = (sign: number, out: boolean) => {
        for (let k = 0; k <= 6; k++) {
          const f = ((out ? k : 6 - k) / 6) * (Math.PI / 2)
          tyre.push(new THREE.Vector2(base - shoulder + shoulder * Math.sin(f), sign * (half - shoulder + shoulder * Math.cos(f))))
        }
      }
      wall(0, 1, -1)
      round(-1, true)
      round(1, false)
      wall(1, 0, 1)
      g.add(new THREE.Mesh(geo(new THREE.LatheGeometry(tyre, segments).rotateX(Math.PI / 2)), mat('tyre')))
      if (tread) {
        const lug = geo(block([tread.depth, (Math.PI * base) / tread.blocks * 0.55, half * 0.8], tread.depth * 0.25))
        for (let k = 0; k < tread.blocks; k++) {
          const a = (2 * Math.PI * k) / tread.blocks
          for (const s of [-1, 1]) {
            const m = new THREE.Mesh(lug, mat('tyre'))
            m.position.set(Math.cos(a) * (base + tread.depth / 2 - tread.depth * 0.1), Math.sin(a) * (base + tread.depth / 2 - tread.depth * 0.1), s * half * 0.45)
            m.rotation.set(s * tread.angle, 0, a, 'ZYX')
            g.add(m)
          }
        }
      }
      // The steel wheel, its outer face toward +z, turned to face `side`.
      const steel = new THREE.Group()
      const profile = [
        [0.001, -0.3], [0.85, -0.3], [0.97, -0.82], [1.06, -0.88], [1.06, -0.78], [1, -0.74],
        [1, 0.74], [1.06, 0.8], [1.06, 0.9], [0.92, 0.88], [0.76, 0.5], [0.42, 0.5], [0.34, 0.66], [0.001, 0.66],
      ].map(([r, z]) => new THREE.Vector2(rr * r, half * z))
      steel.add(new THREE.Mesh(geo(new THREE.LatheGeometry(profile, segments).rotateX(Math.PI / 2)), mat('rim')))
      const rib = geo(block([rr * 0.28, rr * 0.08, half * 0.12], rr * 0.03))
      const nut = geo(new THREE.CylinderGeometry(rr * 0.05, rr * 0.05, half * 0.14, 6).rotateX(Math.PI / 2))
      for (let s = 0; s < spokes; s++) {
        const a = (2 * Math.PI * s) / spokes, b = a + Math.PI / spokes
        const r1 = new THREE.Mesh(rib, mat('rim'))
        r1.position.set(Math.cos(a) * rr * 0.6, Math.sin(a) * rr * 0.6, half * 0.52)
        r1.rotation.z = a
        steel.add(r1)
        const n = new THREE.Mesh(nut, mat('chrome'))
        n.position.set(Math.cos(b) * rr * 0.24, Math.sin(b) * rr * 0.24, half * 0.68)
        steel.add(n)
      }
      const cap = new THREE.Mesh(geo(new THREE.SphereGeometry(rr * 0.15, segments, 8, 0, 2 * Math.PI, 0, Math.PI / 2).rotateX(Math.PI / 2)), mat('chrome'))
      cap.position.z = half * 0.66
      cap.scale.z = 0.6
      steel.add(cap)
      if (side < 0) steel.rotation.y = Math.PI
      g.add(steel)
      return g
    }

    const chassis = new THREE.Group()
    // With a model, it is the body: none of the body's parts below is drawn.
    const drawn = !look.model
    const grille = drawn ? look.grille : undefined
    const bumpers = drawn ? look.bumpers : undefined, fenders = drawn ? look.fenders : undefined
    const gT = grille?.depth ?? 0
    // The grille's back face, the body's box's front; the nose, the grille's front.
    const gx0 = L / 2, nose = gx0 + gT
    const cs = corners(v)
    // The body, fenders, lamps and springs the look draws from numbers are a car's, on a pair of wheels to an axle: a vehicle with a one-wheel axle is
    // drawn by a model.
    if (!look.model && v.axles.some(a => a.one)) throw new Error(`world.box3dvehicle.vehicles.${name}.look gives no model, and it has a one-wheel axle: a vehicle with one is drawn by its model`)

    // Each axle's fender: a band `thickness` thick over its wheel, `gap` over its top where it rests,
    // from the body's side out past the wheel by `flare`. An axle whose wheel is within `ease` of the
    // nose has a flat wing: flat from the nose back to `gap` behind the wheel, then easing down over
    // `ease` to the axle's height. Any other has a flare arched round its wheel, `gap` clear of it, from
    // the axle's height behind to the axle's height ahead, its arch a superellipse of power `square`,
    // 2 round and squarer above. Each fender's top and its ends along x, for what sits on and between them.
    const tops = new Map<number, { top: number; frontFlat: boolean; ends: [number, number] }>()
    if (fenders) {
      const { gap, thickness: th, flare, round, ease, square } = fenders
      for (const axle of v.axles) {
        const c = cs.find(k => k.axle === axle)!, rest = wheelAt(c, axle.spring.sag), r = axle.wheel.radius
        const mid = rest[1] + r + gap + th / 2, low = rest[1], a = r + gap
        const pts: number[][] = []
        const toFront = L / 2 - (axle.at + a) < ease
        let ends: [number, number]
        if (toFront) {
          ends = [axle.at - a - ease, L / 2]
          for (let k = 0; k < 12; k++) { const u = 1 - k / 12; pts.push([axle.at - a - ease * u, low + ((mid - low) * (1 + Math.cos(Math.PI * u))) / 2]) }
          pts.push([axle.at - a, mid], [L / 2, mid])
        } else {
          const reach = mid - low
          ends = [axle.at - reach, axle.at + reach]
          for (let k = 0; k <= 32; k++) {
            const t = Math.PI * (1 - k / 32), cx = Math.cos(t), sy = Math.sin(t)
            pts.push([axle.at + reach * Math.sign(cx) * Math.abs(cx) ** (2 / square), low + reach * Math.abs(sy) ** (2 / square)])
          }
        }
        // The band round that line, `thickness` across it.
        const normal = (i: number) => {
          const p = pts[Math.max(0, i - 1)], q = pts[Math.min(pts.length - 1, i + 1)], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy)
          return [-dy / len, dx / len]
        }
        const shape = new THREE.Shape()
        pts.forEach((p, i) => { const n = normal(i); const x = p[0] + (n[0] * th) / 2, y = p[1] + (n[1] * th) / 2; if (i) shape.lineTo(x, y); else shape.moveTo(x, y) })
        for (let i = pts.length - 1; i >= 0; i--) { const n = normal(i); shape.lineTo(pts[i][0] - (n[0] * th) / 2, pts[i][1] - (n[1] * th) / 2) }
        const inner = W / 2 - th, outer = axle.track / 2 + axle.wheel.width / 2 + flare
        for (const s of [-1, 1]) put(chassis, side(shape, outer - inner, round), [0, 0, (s * (inner + outer)) / 2], 'body')
        tops.set(axle.at, { top: mid + th / 2, frontFlat: toFront, ends })
      }
    }
    const frontTop = fenders && tops.get(Math.max(...v.axles.map(a => a.at)))

    if (drawn) {
      box(chassis, [L, H, W], [0, 0, 0], 'body')
      // The cabin, where it has one: a box whose eight corners are moved onto the cabin's hull, base
      // and roof.
      const cabin = v.body.cabin
      if (cabin) {
        const pts = cabinPoints(v, cabin), cab = new THREE.BoxGeometry(1, 1, 1), p = cab.attributes.position
        for (let i = 0; i < p.count; i++) {
          const ring = p.getY(i) > 0 ? 4 : 0, x = p.getX(i) > 0, z = p.getZ(i) > 0
          const k = ring + (x ? (z ? 0 : 1) : (z ? 3 : 2))
          p.setXYZ(i, pts[3 * k], pts[3 * k + 1], pts[3 * k + 2])
        }
        cab.computeVertexNormals()
        put(chassis, cab, [0, 0, 0], 'cabin')
      }
    }

    // The bumpers: rounded steel bars at the body's foot, bolted on, with tow hooks on the front.
    if (bumpers) {
      const b = bumpers, span = W + 2 * b.overhang, y = -H / 2 + b.height / 2
      for (const end of [-1, 1]) {
        const x = end * (L / 2 + b.depth / 2)
        put(chassis, front(middle(span, b.height, b.round * 2), b.depth, b.round), [x, y, 0], 'trim')
        for (let k = 0; k < b.bolts; k++) {
          const z = -span * 0.42 + (span * 0.84 * k) / Math.max(1, b.bolts - 1)
          put(chassis, disc(b.height * 0.07, 0.012, 6), [end * (L / 2 + b.depth + 0.004), y, z], 'chrome')
        }
      }
      if (b.hooks) for (const k of [-1, 1]) put(chassis, new THREE.TorusGeometry(b.height * 0.28, b.height * 0.08, 8, segments, Math.PI).rotateZ(-Math.PI / 2), [L / 2 + b.depth, y, k * b.hooks], 'hook')
    }

    // The grille: a panel across the nose from the bumper to the hood with `slots` rounded slots cut in
    // it, `width` across and `height` tall, and the headlights' holes either side, a dark radiator
    // behind them.
    const lights = look.lights
    const panelBottom = -H / 2 + (bumpers?.height ?? 0), panelTop = H / 2, lampY = grille ? (panelBottom + panelTop) / 2 : 0
    const lampZ = lights ? (grille?.width ?? 0) / 2 + (lights.radius + lights.bezel) * 1.5 : 0
    if (grille) {
      const g = grille, step = g.width / g.slots, sw = step / 2
      const panel = rect(-W / 2, panelBottom, W / 2, panelTop, 0.04)
      for (let k = 0; k < g.slots; k++) {
        const z = -g.width / 2 + step * (k + 0.5)
        panel.holes.push(rect(z - sw / 2, lampY - g.height / 2, z + sw / 2, lampY + g.height / 2, sw / 2, new THREE.Path()))
      }
      if (lights) for (const k of [-1, 1]) panel.holes.push(new THREE.Path().absarc(k * lampZ, lampY, lights.radius + lights.bezel * 0.5, 0, 2 * Math.PI, true))
      put(chassis, front(panel, gT, Math.min(0.012, gT / 4)), [gx0 + gT / 2, 0, 0], g.paint)
      put(chassis, front(middle(W - 0.08, panelTop - panelBottom - 0.04, 0.02), 0.006, 0), [gx0 + 0.006, (panelBottom + panelTop) / 2, 0], 'trim')
    }

    let lamps: Drawn['lamps']
    const headlights: any[] = []
    if (lights) {
      const l = lights, { radius: r, depth, bezel, beam } = l
      const tail = mat('tail'), backup = render3d.dress(new THREE.MeshPhysicalMaterial({ color: look.paint.light, ...look.finish?.light, transparent: true, depthWrite: false, emissive: look.paint.light, emissiveIntensity: 0 }))
      owned.push(backup)
      tail.emissiveIntensity = l.tail.glow
      if (l.tail.lens !== undefined) tail.color.set(l.tail.lens)
      const amber = mat('amber')
      if (l.parking) amber.emissiveIntensity = l.parking.glow
      // A light at `at` in the chassis's frame, off until its lamp is on; none under `lightsOff`.
      const glow = (name: string, colour: number, lamp: Lamp, at: number[]) => {
        if (lightsOff) return undefined
        const p = new THREE.PointLight(colour, 0, lamp.distance, lamp.decay)
        p.name = name
        p.position.set(at[0], at[1], at[2])
        chassis.add(p)
        return p
      }
      // A model's lamps are its own meshes and nodes, found as it lands (`modelled`); its brake and
      // reverse lights wait at the back of the body's box till then.
      if (!drawn) lamps = { tail, backup, amber, brake: glow('box3dvehicle.brake', look.paint.tail, l.tail.light, [-L / 2, 0, 0]), reverse: glow('box3dvehicle.reverse', look.paint.light, l.reverse.light, [-L / 2, 0, 0]) }
      // Each headlight: a chrome reflector bowl, a bulb in it, a domed lens over it and a chrome ring
      // round it, set in the grille's hole or standing on the nose, and its beam.
      if (drawn) for (const k of [-1, 1]) {
        const z = k * lampZ
        // Drawn from its rim in to its middle, so its faces look out of the bowl, toward the lens.
        const bowl = [1, 0.85, 0.6, 0.3, 0].map(u => new THREE.Vector2(r * Math.sin((u * Math.PI) / 2) + 1e-3, -Math.min(gT || r, r) * (1 - u)))
        put(chassis, new THREE.LatheGeometry(bowl, segments).rotateZ(-Math.PI / 2), [nose, lampY, z], 'chrome')
        put(chassis, new THREE.SphereGeometry(r * 0.25, 12, 8), [nose - Math.min(gT || r, r) * 0.5, lampY, z], 'light')
        const lens = put(chassis, new THREE.SphereGeometry(r, segments, 8, 0, 2 * Math.PI, 0, Math.PI / 2).rotateZ(-Math.PI / 2), [nose, lampY, z], 'light')
        lens.scale.x = depth / r
        put(chassis, new THREE.TorusGeometry(r + bezel / 2, bezel / 2, 8, segments).rotateY(Math.PI / 2), [nose + bezel * 0.2, lampY, z], 'chrome')
        if (!beam.at) headlights.push(beamed(THREE, chassis, look.paint.light, beam, [nose + depth, lampY, z], k))
      }
      if (drawn && beam.at) for (const k of [-1, 1]) headlights.push(beamed(THREE, chassis, look.paint.light, beam, [beam.at[0], beam.at[1], k * beam.at[2]], k))
      // A parking light under each front fender's nose, where it runs flat to the front.
      if (l.parking && frontTop?.frontFlat && fenders) {
        const p = l.parking, axle = v.axles.reduce((a, b) => (b.at > a.at ? b : a)), outer = axle.track / 2 + axle.wheel.width / 2 + fenders.flare
        const pz = (W / 2 + outer) / 2, py = frontTop.top - fenders.thickness - p.radius * 1.4
        for (const k of [-1, 1]) {
          put(chassis, front(middle(p.radius * 3.2, p.radius * 2.6, p.radius * 0.8), p.depth, p.radius * 0.3), [L / 2 - p.depth / 2, py, k * pz], 'trim')
          put(chassis, disc(p.radius, p.depth * 0.6), [L / 2 + p.depth * 0.1, py, k * pz], 'amber')
        }
      }
      // At the back each side a cluster: a housing, the tail lens and the reverse lens under it, and
      // behind the car the brake light at the tail lenses' height and the reverse light at theirs.
      if (drawn) {
        const ty = -H / 2 + (bumpers?.height ?? 0) + 2 * r + 3 * bezel, ry = ty - 1.5 * r - bezel
        for (const k of [-1, 1]) {
          const tz = k * (W / 2 - r / 2 - bezel)
          put(chassis, front(middle(r + 2 * bezel, 3 * r + 3 * bezel, bezel), depth / 2, bezel * 0.4), [-L / 2 - depth / 4, ty - r / 2 - bezel / 2, tz], 'trim')
          put(chassis, front(middle(r, 2 * r, r * 0.25), depth, r * 0.1), [-L / 2 - depth / 2, ty, tz], 'tail').name = 'box3dvehicle.tail'
          const rev = new THREE.Mesh(geo(front(middle(r, r, r * 0.25), depth, r * 0.1)), backup)
          rev.name = 'box3dvehicle.backup'
          rev.position.set(-L / 2 - depth / 2, ry, tz)
          chassis.add(rev)
        }
        lamps = { tail, backup, amber, brake: glow('box3dvehicle.brake', look.paint.tail, l.tail.light, [-L / 2 - depth, ty, 0]), reverse: glow('box3dvehicle.reverse', look.paint.light, l.reverse.light, [-L / 2 - depth, ry, 0]) }
      }
    }
    // The spare on the back, `lift` above the body's top, on a bracket.
    if (look.spare && drawn) {
      const wh = v.axles[v.axles.length - 1].wheel, spare = wheel(wh, 1), gap = (bumpers?.depth ?? 0) / 2, y = H / 2 + look.spare.lift
      spare.rotation.y = -Math.PI / 2
      spare.position.set(-L / 2 - gap - wh.width / 2, y, 0)
      chassis.add(spare)
      put(chassis, front(middle(wh.radius * 0.5, wh.radius * 0.3, 0.02), gap + 0.02, 0.008), [-L / 2 - gap / 2, y, 0], 'trim')
    }
    // Each tailpipe, chrome, dark inside, where the exhaust leaves it.
    for (const ex of look.exhaust ?? []) {
      const d = new THREE.Vector3(...ex.dir).normalize(), tip = new THREE.Vector3(...ex.at)
      tube(chassis, tip.clone().addScaledVector(d, -0.3).toArray(), tip.toArray(), ex.pipe, 'chrome')
      tube(chassis, tip.clone().addScaledVector(d, -0.05).toArray(), tip.clone().addScaledVector(d, 0.002).toArray(), ex.pipe * 0.72, 'trim')
    }

    const inboard = look.inboard ?? 0
    // the corners drawn: none with `corners: false`
    const cornered = look.corners === false ? [] : cs
    for (const c of cornered) {
      const out = Math.abs(c.mount[2]) - inboard - W / 2
      if (out > 0) {
        const upper = new THREE.Mesh(geo(new THREE.BoxGeometry(arm, 1, arm).translate(0, 0.5, 0)), mat('arm'))
        upper.position.set(c.mount[0], c.mount[1], c.side * W / 2)
        upper.quaternion.setFromUnitVectors(Y, new THREE.Vector3(0, 0, c.side))
        upper.scale.y = out
        chassis.add(upper)
      }
    }
    bake(chassis)
    // Each steering wheel, a model's `steer…` nodes, found as the model lands (`modelled`).
    const steers: Drawn['steers'] = []
    // The look's points, each an empty on the chassis; one on a model's steering wheel waits for the model
    // (`modelled`).
    const points = new Map<string, any>()
    for (const p of Object.keys(look.points ?? {})) {
      const spot = pointOf(v, p)!
      if (spot.part === undefined) points.set(p, hang(THREE, chassis, chassis, p, spot))
      else if (spot.part !== 'steer' || drawn) throw new Error(`world.box3dvehicle.vehicles.${name}.look.points.${p} rides ${spot.part}, which the look draws nothing of`)
    }
    scene.add(chassis)

    // each wheel drawn, or with `look.wheel` a group its model is put in once it has come
    const wheels = cs.map(c => {
      const g = look.wheel ? new THREE.Group() : wheel(c.axle.wheel, c.side)
      if (!look.wheel) bake(g)
      scene.add(g)
      return g
    })
    const hubs = look.hubs ? cs.map(() => { const g = new THREE.Group(); scene.add(g); return g }) : []

    // A helix of `coils` turns from y 0 to y 1, to be stretched between the wheel and the mount.
    const helix = new THREE.Curve()
    helix.getPoint = (t: number, into = new THREE.Vector3()) => into.set(coilRadius * Math.cos(t * coils * 2 * Math.PI), t, coilRadius * Math.sin(t * coils * 2 * Math.PI))
    const coil = geo(new THREE.TubeGeometry(helix, coils * segments, wire, Math.max(3, segments / 4), false))
    const stick = (thick: number) => geo(new THREE.BoxGeometry(thick, 1, thick).translate(0, 0.5, 0))
    const drawnCorners = cornered.map(c => {
      const spring = new THREE.Mesh(coil, mat('spring'))
      const sleeve = new THREE.Mesh(geo(new THREE.CylinderGeometry(coilRadius / 2, coilRadius / 2, 1, segments).translate(0, -0.5, 0)), mat('damper'))
      sleeve.scale.y = c.axle.spring.length - c.axle.spring.travel
      const rod = new THREE.Mesh(stick(wire * 2), mat('damper'))
      const inside = Math.abs(c.mount[2]) - inboard - c.axle.wheel.width / 2 <= W / 2
      const lower = inside ? undefined : new THREE.Mesh(stick(arm), mat('arm'))
      for (const m of [spring, sleeve, rod, lower]) if (m) scene.add(m)
      return { coil: spring, sleeve, rod, arm: lower }
    })
    for (const part of [chassis, ...wheels, ...drawnCorners.flatMap(c => [c.coil, c.sleeve, c.rod, c.arm])]) {
      part?.traverse((m: any) => { if (m.isMesh) { m.castShadow = !m.material.transparent; m.receiveShadow = true } })
    }
    // Each tyre's track: `max` pieces, each its own four corners, so a piece fades alone and a break
    // joins nothing. One material for the car's tracks, drawn over the land without hiding it.
    const t = look.tracks
    const ink = t && render3d.dress(new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
    if (ink) owned.push(ink)
    const tracks: Track[] = t ? cs.map(() => {
      const g = geo(new THREE.BufferGeometry())
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(t.max * 12), 3).setUsage(THREE.DynamicDrawUsage))
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(t.max * 16), 4).setUsage(THREE.DynamicDrawUsage))
      const index = new Uint32Array(t.max * 6)
      for (let i = 0; i < t.max; i++) index.set([4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 2, 4 * i + 1, 4 * i + 3], 6 * i)
      g.setIndex(new THREE.BufferAttribute(index, 1))
      g.setDrawRange(0, 0)
      const mesh = new THREE.Mesh(g, ink)
      mesh.name = 'box3dvehicle.track'
      mesh.frustumCulled = false
      mesh.receiveShadow = true
      scene.add(mesh)
      return { mesh, born: new Float32Array(t.max), strength: new Float32Array(t.max), next: 0, laid: 0 }
    }) : []
    return { chassis, wheels, fitted: cs.map(() => false), hubs, hubbed: hubs.map(() => false), corners: drawnCorners, owned, tracks, lamps, headlights, steers, points }
  }

  // Lays the next piece of `tr` from its last edges to `edges`, `strength` opaque, laid at `now`.
  function lay(tr: Track, t: Tracks, edges: number[][], strength: number, now: number) {
    const i = tr.next, p = tr.mesh.geometry.attributes.position, c = tr.mesh.geometry.attributes.color
    const [a, b] = tr.last!, [d, e] = edges
    p.array.set([...a, ...b, ...d, ...e], 12 * i)
    const r = ((t.colour >> 16) & 255) / 255, g = ((t.colour >> 8) & 255) / 255, bl = (t.colour & 255) / 255
    for (let k = 0; k < 4; k++) c.array.set([r, g, bl, strength], 16 * i + 4 * k)
    p.needsUpdate = true
    tr.born[i] = now
    tr.strength[i] = strength
    tr.next = (i + 1) % t.max
    tr.laid = Math.min(tr.laid + 1, t.max)
    tr.mesh.geometry.setDrawRange(0, tr.laid * 6)
  }

  // Every piece of `tr` faded by its age at `now`: its strength times 1 − age / life, none past it.
  function fade(tr: Track, t: Tracks, now: number) {
    const c = tr.mesh.geometry.attributes.color
    for (let i = 0; i < tr.laid; i++) {
      const alpha = tr.strength[i] * Math.max(0, 1 - (now - tr.born[i]) / t.life)
      for (let k = 0; k < 4; k++) c.array[16 * i + 4 * k + 3] = alpha
    }
    c.needsUpdate = true
  }

  function drop(scene: any, id: number) {
    const d = cars.get(id)!
    for (const m of [d.chassis, ...d.wheels, ...d.hubs, ...d.corners.flatMap(c => [c.coil, c.sleeve, c.rod, c.arm]), ...d.tracks.map(t => t.mesh)]) if (m) scene.remove(m)
    for (const o of d.owned) o.dispose()
    for (const s of d.engine ?? []) for (const held of s.held) held.stop()
    cars.delete(id)
  }

  // `obj` from `from` to `to`: at `from`, its y turned onto the way to `to` and stretched to reach it.
  function span(THREE: any, obj: any, from: Vec3, to: Vec3) {
    const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2])
    const len = dir.length()
    obj.position.set(from[0], from[1], from[2])
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.divideScalar(len || 1))
    obj.scale.y = len
  }

  // A headlight's beam of `beam` in `colour` put on `chassis` at `at` in its frame, aimed ahead `beam.dip`
  // radians down and `beam.toe` out to side `k` (−1 the left, at −z; 1 the right).
  function beamed(THREE: any, chassis: any, colour: number, beam: Lights['beam'], at: Vec3, k: number) {
    const spot = new THREE.SpotLight(colour, beam.intensity, beam.distance, beam.angle, beam.penumbra, beam.decay)
    spot.name = 'box3dvehicle.beam'
    const toe = beam.toe ?? 0
    spot.position.set(at[0], at[1], at[2])
    spot.target.position.set(at[0] + Math.cos(beam.dip) * Math.cos(toe), at[1] - Math.sin(beam.dip), at[2] + k * Math.cos(beam.dip) * Math.sin(toe))
    chassis.add(spot, spot.target)
    return spot
  }

  // Car `d`'s headlights on or off as its row's `lights` says, under `lightsOff`: each beam at the
  // look's `beam.intensity` on and at none off, never made or taken away, so the number of lights a
  // frame draws never changes.
  function activateHeadlights(d: Drawn, beam: Lights['beam'], on: boolean) {
    for (const spot of d.headlights) spot.intensity = on ? beam.intensity : 0
  }

  // An empty named `name` hung in `into`, a part of `chassis` as it was made, set back by `into`'s place,
  // turn and scale on the chassis, so that while `into` stands as it was made the empty is at `spot.at`
  // in the chassis's frame, turned `spot.turn` there.
  function hang(THREE: any, chassis: any, into: any, name: string, spot: { at: number[]; turn?: number[] }) {
    chassis.updateMatrixWorld(true)
    const on = chassis.matrixWorld.clone().invert().multiply(into.matrixWorld)
    const want = new THREE.Matrix4().compose(new THREE.Vector3(...spot.at), new THREE.Quaternion(...(spot.turn ?? [0, 0, 0, 1])).normalize(), new THREE.Vector3(1, 1, 1))
    const o = new THREE.Object3D()
    o.name = name
    on.invert().multiply(want).decompose(o.position, o.quaternion, o.scale)
    into.add(o)
    o.updateMatrixWorld(true)
    return o
  }

  // Every material of mesh `o` dressed by render3d, each once.
  function dressOf(render3d: Plugins['render3d'], o: any) {
    for (const mt of Array.isArray(o.material) ? o.material : [o.material]) {
      if (dressed.has(mt)) continue
      dressed.add(mt)
      render3d.dress(mt)
    }
  }

  // `object` in a group of its own, placed as model `m` says: at `at`, turned `turn`, `scale` metres a unit.
  function placed(THREE: any, m: Model, object: any): any {
    const root = new THREE.Group()
    const [x, y, z] = m.at ?? [0, 0, 0]
    root.position.set(x, y, z)
    if (m.turn) root.quaternion.fromArray(m.turn)
    root.scale.setScalar(m.scale ?? 1)
    root.add(object)
    return root
  }

  // Model `m` of the vehicle `name` as this page has it now, or undefined until it has come. One that names its
  // `looks`, a mesh the `models` mod built of the pro-ng glb, for this car alone, its geometry let go with `owned`; else the loader's
  // model, the very scene with `whole` (a body, drawn once) or a copy of it. `dress` says whether its materials are
  // render3d's to dress: the loader's are, the mod's are dressed already.
  function made(plugins: Plugins, m: Model, name: string, owned: { dispose(): void }[], whole: boolean): { object: any; dress: boolean; twin?: Made['twin']; rig?: () => Rig } | undefined {
    const loader = plugins.loader
    if (!loader) throw new Error(`world.box3dvehicle.vehicles.${name}.look has a model, and this scene does not list loader`)
    if (m.looks) {
      const makes = mod<Makes>(plugins.wire.scene.world!, 'box3dvehicle', 'models')
      if (!makes) throw new Error(`world.box3dvehicle.vehicles.${name}.look's model ${m.asset} names its looks, a pro-ng glb, and world.box3dvehicle.mods names no models`)
      ahead(plugins.wire.scene, 'box3dvehicle', 'models')
      const maker = makes(plugins)
      if (!glbs.has(m.asset)) {
        glbs.set(m.asset, undefined)
        // The loader writes a failure to the console once itself.
        loader.load(m.asset).then(async (glb: { bytes: Uint8Array }) => { glbs.set(m.asset, await maker.unpack(glb.bytes)) }).catch(() => {})
      }
      const unpacked = glbs.get(m.asset)
      if (unpacked === undefined) return undefined
      const object = maker.build(unpacked, json(plugins.wire, m.looks))
      if (!object) return undefined
      owned.push({ dispose: () => object.traverse((o: any) => o.geometry?.dispose()) })
      return { object, dress: false, twin: maker.twin, rig: () => maker.rig(unpacked, object) }
    }
    if (!loader.ready(m.asset)) {
      if (!asked.has(m.asset)) {
        asked.add(m.asset)
        loader.load(m.asset).catch(() => {})
      }
      return undefined
    }
    const scene = loader.model(m.asset).scene
    return { object: whole ? scene : scene.clone(true), dress: true }
  }

  // A wheel's or a hub's model made, placed in its group as `m` says, its materials dressed where they are
  // render3d's, every mesh taking shadows. A loader's model casts them from every mesh not see-through; a mesh the
  // `models` mod built (`dress` false) is a whole glb in one mesh, its see-through calls among its solid ones, and
  // casts as the mod made it.
  function fitted(render3d: Plugins['render3d'], m: Model, got: { object: any; dress: boolean }): any {
    got.object.traverse((o: any) => {
      if (!o.isMesh) return
      if (got.dress) {
        dressOf(render3d, o)
        o.castShadow = !(Array.isArray(o.material) ? o.material : [o.material]).some((mt: any) => mt.transparent)
      }
      o.receiveShadow = true
    })
    return placed(render3d.THREE, m, got.object)
  }

  // Every lamp material of `lamps` and the vertices of the pro-ng model `scene` drawn in it, each with the look
  // numbers of its dark and its lit twin. A material the model has no vertex of throws, naming the vehicle.
  function twinsOf(lamps: Lamps, twin: Made['twin'], scene: any, name: string, asset: string): NonNullable<Drawn['twins']> {
    const out: NonNullable<Drawn['twins']> = []
    const found = new Set<string>()
    scene.traverse((o: any) => {
      const attribute = o.geometry?.getAttribute?.('lookId')
      if (!attribute) return
      for (const [group, pairs] of Object.entries(lamps) as [keyof Lamps, Record<string, string>][]) {
        for (const [dark, lit] of Object.entries(pairs)) {
          const ids = twin(dark, lit)
          const vertices: number[] = []
          for (let i = 0; i < attribute.count; i++) if (Math.round(attribute.array[i]) === ids[0]) vertices.push(i)
          if (vertices.length) found.add(`${group}.${dark}`)
          out.push({ group, attribute, vertices, ids, lit: false })
        }
      }
    })
    for (const [group, pairs] of Object.entries(lamps)) for (const dark of Object.keys(pairs)) {
      if (!found.has(`${group}.${dark}`)) throw new Error(`world.box3dvehicle.vehicles.${name}.look.lamps.${group} names the material ${dark}, which its model ${asset} has no vertex of`)
    }
    return out
  }

  // Lamp material `t` drawn lit or dark: each of its vertices' look number the twin's.
  function lampLit(t: NonNullable<Drawn['twins']>[number], on: boolean) {
    if (t.lit === on) return
    t.lit = on
    const id = t.ids[on ? 1 : 0]
    for (const i of t.vertices) t.attribute.array[i] = id
    t.attribute.needsUpdate = true
  }

  // The model `scene` put on car `d`'s chassis as `v.look.model` says, its lamps found by name: a
  // spot light on each node named `beam…`, aimed along its +x, and the tail, reverse and amber
  // meshes taking the car's lamp materials, the brake and reverse lights moved to the middle of their
  // lenses. Every other material is dressed by render3d, once, and left the loader's. Its `steer…` nodes
  // are the car's steering wheels, and the look's points on the wheel are hung on the first of them,
  // throwing naming the vehicle `name` when it has none. Hands back the model's group.
  function modelled(render3d: Plugins['render3d'], v: Vehicle, d: Drawn, scene: any, name: string, dress: boolean, twin?: Made['twin'], rig?: () => Rig): any {
    const THREE = render3d.THREE as any, m = v.look.model!, l = v.look.lights
    const root = placed(THREE, m, scene)
    root.name = 'box3dvehicle.model'
    d.chassis.add(root)
    if (v.look.rig) {
      if (!rig) throw new Error(`world.box3dvehicle.vehicles.${name}.look.rig poses a skeleton, and its model ${m.asset} names no looks: it is not a pro-ng glb`)
      d.rig = rig()
      // the clips the standard names, of the thing `look.rig` names: `steer` when an axle steers, and a `travel <axle>
      // <left|right>` for every wheel
      const clips = [...(v.axles.some(a => a.steered) ? ['steer'] : []), ...v.axles.flatMap((a, k) => (a.one ? ['centre'] : ['left', 'right']).map(side => `travel ${k} ${side}`))]
      for (const c of clips) if (!d.rig.has(`${v.look.rig} ${c}`)) throw new Error(`world.box3dvehicle.vehicles.${name}.look.rig poses the clip ${v.look.rig} ${c}, which its model ${m.asset} has not`)
    }
    if (v.look.lamps) {
      if (!twin) throw new Error(`world.box3dvehicle.vehicles.${name}.look.lamps names lamp materials, and its model ${m.asset} names no looks: it is not a pro-ng glb`)
      d.twins = twinsOf(v.look.lamps, twin, scene, name, m.asset)
    }
    // Whether `o`, or a node above it in the model, is named starting `prefix`.
    const under = (o: any, prefix: string) => { for (let p = o; p && p !== root; p = p.parent) if (p.name.startsWith(prefix)) return true; return false }
    const beams: any[] = [], wheels: any[] = [], lenses: Record<'tail' | 'reverse', any[]> = { tail: [], reverse: [] }
    scene.traverse((o: any) => {
      if (l && o.name.startsWith('beam') && !under(o.parent, 'beam')) beams.push(o)
      if (o.name.startsWith('steer') && !under(o.parent, 'steer')) wheels.push(o)
      if (!o.isMesh) return
      const lamp = l && d.lamps && (['tail', 'reverse', 'amber'] as const).find(p => under(o, p))
      if (lamp) {
        o.material = lamp === 'tail' ? d.lamps!.tail : lamp === 'reverse' ? d.lamps!.backup : d.lamps!.amber
        if (lamp !== 'amber') lenses[lamp].push(o)
      } else if (dress) dressOf(render3d, o)
      // a loader's mesh casts unless it is see-through; a mesh the `models` mod built is a whole glb, its
      // see-through calls among its solid ones, and casts as the mod made it
      if (dress) o.castShadow = !(Array.isArray(o.material) ? o.material : [o.material]).some((mt: any) => mt.transparent)
      o.receiveShadow = true
    })
    const at = l?.beam.at
    if (at) for (const k of [-1, 1]) d.headlights.push(beamed(THREE, d.chassis, v.look.paint.light, l!.beam, [at[0], at[1], k * at[2]], k))
    else for (const node of beams) {
      const { beam } = l!
      const spot = new THREE.SpotLight(v.look.paint.light, beam.intensity, beam.distance, beam.angle, beam.penumbra, beam.decay)
      spot.name = 'box3dvehicle.beam'
      spot.position.set(0, 0, 0)
      spot.target.position.set(1, 0, 0)
      node.add(spot, spot.target)
      d.headlights.push(spot)
    }
    if (d.lamps) {
      d.chassis.updateMatrixWorld(true)
      const inverse = d.chassis.matrixWorld.clone().invert()
      for (const [lamp, light] of [['tail', d.lamps.brake], ['reverse', d.lamps.reverse]] as const) {
        const found = lenses[lamp]
        if (!light || !found.length) continue
        const at = new THREE.Vector3()
        for (const o of found) at.add(new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).applyMatrix4(inverse))
        light.position.copy(at.divideScalar(found.length))
      }
    }
    for (const node of wheels) d.steers.push({ piece: node, rest: node.quaternion.clone() })
    for (const p of Object.keys(v.look.points ?? {})) {
      const spot = pointOf(v, p)!
      if (spot.part !== 'steer') continue
      if (!wheels.length) throw new Error(`world.box3dvehicle.vehicles.${name}.look.points.${p} rides steer, and its model ${m.asset} has no node whose name starts steer`)
      d.points.set(p, hang(THREE, d.chassis, wheels[0], p, spot))
    }
    return root
  }

  return {
    afterTick(plugins: Plugins) {
      const { THREE, scene } = plugins.render3d
      steered ??= new THREE.Quaternion()
      up ??= new THREE.Vector3(0, 1, 0)
      const world = plugins.wire.scene.world
      const fleet: Fleet | undefined = world?.box3dvehicle
      if (!fleet) return
      if (!same(fleet, design)) { for (const id of [...cars.keys()]) drop(scene, id); design = structuredClone(fleet) }
      const rows = new Map<number, Row>(plugins.wire.rows.map(r => [r.id, r]))
      const seen = new Set<number>()
      const tracked = Object.values(fleet.vehicles).some(v => v.look.tracks)
      if (tracked) ahead(plugins.wire.scene, 'box3dvehicle', 'land')
      const ground = tracked ? mod<Land>(world!, 'box3dvehicle', 'land')?.(plugins) : undefined
      const seconds = performance.now() / 1000
      for (const car of plugins.wire.rows) {
        if (car.kind !== 'box3dvehicle' || car.data.chassis === undefined) continue
        const chassis = rows.get(car.data.chassis), wheels = (car.data.wheels as number[]).map(id => rows.get(id))
        if (!chassis || wheels.some(w => !w)) continue
        seen.add(car.id)
        const v = designOf(world!, car), cs = corners(v), tracks = v.look.tracks
        if (!cars.has(car.id)) cars.set(car.id, make(plugins.render3d, v, car.data.vehicle, fleet.lightsOff === true))
        const d = cars.get(car.id)!
        if (v.look.model && !d.model) {
          const got = made(plugins, v.look.model, car.data.vehicle, d.owned, true)
          if (got) d.model = modelled(plugins.render3d, v, d, got.object, car.data.vehicle, got.dress, got.twin, got.rig)
        }
        // each wheel's model and each hub's, of its side and its axle, put in its group once it has come
        const { wheel: wheelModels, hubs: hubModels } = v.look
        if (hubModels && hubModels.length !== v.axles.length) throw new Error(`world.box3dvehicle.vehicles.${car.data.vehicle}.look has ${hubModels.length} hubs, and the vehicle ${v.axles.length} axles`)
        cs.forEach((c, i) => {
          if (wheelModels && !d.fitted[i]) {
            // one model for every wheel, or a list of them, one for each axle of `axles` (a bike's front wheel and its rear differ)
            const m = modelOf(Array.isArray(wheelModels) ? wheelModels[v.axles.indexOf(c.axle)] : wheelModels, c, car.data.vehicle, 'wheel')
            const got = made(plugins, m, car.data.vehicle, d.owned, false)
            if (got) { d.wheels[i].add(fitted(plugins.render3d, m, got)); d.fitted[i] = true }
          }
          if (hubModels && !d.hubbed[i]) {
            const m = modelOf(hubModels[v.axles.indexOf(c.axle)], c, car.data.vehicle, 'hubs')
            const got = made(plugins, m, car.data.vehicle, d.owned, false)
            if (got) { d.hubs[i].add(fitted(plugins.render3d, m, got)); d.hubbed[i] = true }
          }
        })
        const at: Vec3 = chassis.data.pos, rot: Quat = chassis.data.rot
        d.chassis.position.fromArray(at)
        d.chassis.quaternion.fromArray(rot)
        // Each steering wheel turned `steer` × `lock` about its column, its top to the left on a left steer.
        const wheelTurn = -(car.data.steer ?? 0) * (v.look.lock ?? 0)
        for (const s of d.steers) s.piece.quaternion.copy(s.rest).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), wheelTurn))
        if (fleet.lightsOff && v.look.lights) activateHeadlights(d, v.look.lights.beam, car.data.lights === true)
        if (d.lamps) {
          const l = v.look.lights!, { brake, reverse } = pedals(v, car)
          d.lamps.tail.emissiveIntensity = l.tail.glow + (l.tail.brake - l.tail.glow) * brake
          d.lamps.backup.emissiveIntensity = reverse ? l.reverse.glow : 0
          if (d.lamps.brake) d.lamps.brake.intensity = l.tail.light.intensity * brake
          if (d.lamps.reverse) d.lamps.reverse.intensity = reverse ? l.reverse.light.intensity : 0
        }
        if (d.rig) {
          // the steering: the clip `steer` at 0 is full lock to the right, 0.5 straight, 1 full lock to the left; each
          // wheel's `travel <axle> <side>` at 0 is its spring at full droop, 0.5 at `sag`, 1 at full bump (`compression`
          // is metres from full droop, `travel` the most it can be)
          const rig = d.rig, thing = v.look.rig, compression = car.data.compression as number[] | undefined
          if (v.axles.some(a => a.steered)) rig.pose(`${thing} steer`, (Math.max(-1, Math.min(1, car.data.steer ?? 0)) + 1) / 2)
          cs.forEach((c, i) => {
            const { sag, travel } = c.axle.spring, x = Math.max(0, Math.min(travel, compression?.[i] ?? sag))
            rig.pose(`${thing} travel ${v.axles.indexOf(c.axle)} ${sideOf(c)}`, x <= sag ? (0.5 * x) / sag : 0.5 + (0.5 * (x - sag)) / (travel - sag))
          })
          rig.apply()
        }
        if (d.twins) {
          const head = fleet.lightsOff ? car.data.lights === true : true
          const { brake, reverse } = pedals(v, car)
          const lit = { head, tail: head || brake > 0, reverse, amber: head }
          for (const t of d.twins) lampLit(t, lit[t.group])
        }
        const inboard = v.look.inboard ?? 0
        cs.forEach((c, i) => {
          const wd = wheels[i]!.data
          d.wheels[i].position.fromArray(wd.pos)
          d.wheels[i].quaternion.fromArray(wd.rot)
          const place = (local: Vec3): Vec3 => { const t = turn(rot, local); return [at[0] + t[0], at[1] + t[1], at[2] + t[2]] }
          // the spring's top `inboard` in from the mount, and its foot level with the wheel's middle,
          // `inboard` in from the wheel's inner face along the chassis's side: it rises and falls with
          // the wheel and does not steer with it, as a spring on an axle does not
          const mount = place([c.mount[0], c.mount[1], c.mount[2] - c.side * inboard])
          const h = turn(rot, [c.hub[0], c.hub[1], c.hub[2] - c.side * inboard]), hub: Vec3 = [wd.pos[0] + h[0], wd.pos[1] + h[1], wd.pos[2] + h[2]]
          const k = d.corners[i]
          if (k) {
            span(THREE, k.coil, hub, mount)
            span(THREE, k.rod, hub, mount)
            k.sleeve.position.fromArray(mount)
            k.sleeve.quaternion.copy(k.rod.quaternion)
            if (k.arm) span(THREE, k.arm, place([c.mount[0], -v.body.height / 2, (c.side * v.body.width) / 2]), hub)
          }
          const [x, y, z] = wd.pos as Vec3, [vx, , vz] = wd.vel as Vec3, r = c.axle.wheel.radius
          const { slide } = tread(wd, r)
          const floor = ground ? ground.height(x, z) : undefined
          if (tracks) {
            const tr = d.tracks[i]
            const strength = floor === undefined || y - r - floor > tracks.clear ? 0
              : Math.min(1, (ground!.mark?.(x, z) ?? tracks.opacity) + (slide > tracks.slide ? tracks.skid : 0))
            if (strength <= 0) tr.last = undefined
            else {
              // The tyre's two edges, across the way it has gone since the last piece, on the land.
              const from = tr.last && [(tr.last[0][0] + tr.last[1][0]) / 2, (tr.last[0][2] + tr.last[1][2]) / 2]
              const dx = from ? x - from[0] : vx, dz = from ? z - from[1] : vz, len = Math.hypot(dx, dz)
              if (!from || len >= tracks.step) {
                const half = c.axle.wheel.width / 2, ax = len ? (-dz / len) * half : 0, az = len ? (dx / len) * half : half
                const edge = (s: number) => { const ex = x + s * ax, ez = z + s * az; return [ex, ground!.height(ex, ez) + tracks.lift, ez] }
                const edges = [edge(-1), edge(1)]
                if (tr.last) lay(tr, tracks, edges, strength, seconds)
                tr.last = edges
              }
            }
            fade(tr, tracks, seconds)
          }
        })
        // Each hub where its wheel is drawn, turned as the chassis is and steered about its up as far as the
        // wheel row is (its spin axis in the chassis's frame, turned about the chassis's y from the chassis's z)
        if (d.hubs.length) {
          const back: Quat = [-rot[0], -rot[1], -rot[2], rot[3]]
          cs.forEach((_, i) => {
            const spin = turn(back, turn(wheels[i]!.data.rot as Quat, [0, 0, 1]))
            d.hubs[i].position.copy(d.wheels[i].position)
            d.hubs[i].quaternion.fromArray(rot).multiply(steered.setFromAxisAngle(up, Math.atan2(spin[0], spin[2])))
          })
        }
        const sound = v.look.sound
        if (sound) {
          const name = car.data.vehicle, loader = plugins.loader
          if (!loader) throw new Error(`world.box3dvehicle.vehicles.${name}.look has a sound, and this scene does not list loader`)
          const holding = mod<Hold>(world!, 'box3dvehicle', 'sound')
          if (!holding) throw new Error(`world.box3dvehicle.vehicles.${name}.look has a sound, and world.box3dvehicle.mods names no sound`)
          provided(plugins.wire.scene, 'box3dvehicle', 'sound')
          if (typeof car.data.rpm !== 'number') throw new Error(`world.box3dvehicle.vehicles.${name}.look has a sound, and its engine writes no rpm: a petrol or electric engine does`)
          const sounding = holding(plugins)
          const engine = read.get(sound.engine)
          if (sounding && !engine) listen(loader, sounding, sound.engine)
          if (sounding && engine) {
            // The mix: the scene's stems and ease over the manifest's.
            const gains = { ...engine.manifest.mix?.stems, ...sound.stems }, ease = sound.ease ?? engine.manifest.mix?.ease ?? 0
            // The throttle heard: the row's, followed by e of the way every `ease` seconds.
            const want = Math.min(1, Math.max(0, car.data.throttle ?? 0)), was = d.heard
            const heard = !was || ease <= 0 ? want : want + (was.throttle - want) * Math.exp(-(seconds - was.at) / ease)
            d.heard = { throttle: heard, at: seconds }
            const stems = Object.entries(gains).map(([stem, [shut, full]]) => {
              const layers = layersOf(engine, stem)
              return { stem, layers, levels: layers.length ? mix(layers, car.data.rpm, shut + (full - shut) * heard) : [] }
            })
            const t = turn(rot, sound.at ?? [0, 0, 0]), where = [at[0] + t[0], at[1] + t[1], at[2] + t[2]]
            if (d.engine) d.engine.forEach((s, i) => s.held.forEach((held, k) => { held.set(stems[i].levels[k].rate, stems[i].levels[k].gain); held.put(where) }))
            else d.engine = stems.map(s => ({ stem: s.stem, layers: s.layers, held: s.layers.map((l, k) => sounding.hold(l.buffer, { ...s.levels[k], at: where, range: sound.range })) }))
          }
        }
      }
      for (const id of [...cars.keys()]) if (!seen.has(id)) drop(scene, id)
    },
    close(plugins: Plugins) {
      for (const id of [...cars.keys()]) drop(plugins.render3d.scene, id)
      design = undefined
      asked.clear()
      glbs.clear()
      engines.clear()
      read.clear()
    },
    point(id: number, name: string): Object3D | undefined {
      return cars.get(id)?.points.get(name)
    },
  }
}
