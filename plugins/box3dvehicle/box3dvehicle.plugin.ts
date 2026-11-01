// The browser half of box3dvehicle: every car of the scene drawn from its Vehicle in
// `world.box3dvehicle.vehicles`, the one its row's `vehicle` names and its server half builds the
// bodies and joints from, placed each frame by its rows. It needs
// render3d, and is listed after box3d and before render3d, so a frame draws the rows it was handed.
// The drawing is the look's: it follows the physics' sizes where a player sees them meet the world,
// the wheels, the springs and the body's outline, and dresses the rest.
//
// A car is, from `look` (each part in `look.paint`'s colour of its name):
//   the body     on the chassis row: the body's box in `body`, and on it, where the body has a
//                `cabin`, the cabin's hull in `cabin`; or, with `open`, an open jeep, every panel
//                rounded, built to the body's box round its cabin (a body with no cabin and an `open`
//                look throws on the frame it is drawn, naming the vehicle):
//                  the tub, one wall round the cabin and the back, `wall` thick, from the cowl (the
//                  cabin's front) back along each side, round the rear corners `corner` round and
//                  across the back; its rim rounded, a rib round it `rib.depth` proud and
//                  `rib.height` tall at `rib.at`, and its top dipping `door.drop` into a door each
//                  side from `door.from` to `door.to` along x, easing in and out over `door.ease`;
//                  a rubber floor `floor` thick in `trim`;
//                  the hood from the cowl to the grille, its top falling `hood.drop` toward the nose,
//                  its edges rounded `hood.round`, with a `dome` pressed up `height` in it, `inset`
//                  in from its edges; chrome hinges at the cowl and a rubber latch each side;
//                  a dash across the cowl's back `dash.depth` deep and `height` tall, its gauges
//                  facing the seats and a chrome grab bar before the right seat;
//                  two bucket seats in `seat` at the cabin's back (`seat`: `width` across, `depth`
//                  long, a cushion `base` thick, a back `back` tall leaning `tilt` radians with
//                  bolsters, a headrest `head` tall, 0 for none, every edge rounded `round`, on a
//                  pedestal), and with `bench` a bench across the tub behind them;
//                  with `tunnel` a hump `width` wide and `height` tall down the floor, and on it with
//                  `stick` a gear stick that tall;
//                  a steering wheel `steer` round before the left seat, on a column into the dash:
//                  the column is the body's, and the wheel (its rim, three spokes and hub) is a piece
//                  of its own on the chassis, `box3dvehicle.steer`, whose origin is the hub and whose
//                  frame is the chassis's pitched down the column, so its +x runs down the column
//                  into the dash, +y up the wheel's face and +z to the right; it turns with the
//                  steering (`lock`, below);
//                  a windshield `windshield.height` tall leaning back `lean` radians from the cowl,
//                  its `frame` of `trim` rounded at the corners with `glass` in it, chrome hinges at
//                  its foot, two wipers `wiper` long on it, and with `mirror` a mirror `size` across
//                  out `arm` on a chrome stalk each side;
//                  a roll bar `cage.height` over the cabin's back, tubes `cage.tube` round bent
//                  `bend` round at the corners, with legs back to the tub's rear corners, a bar each
//                  side to the windshield's top and `pad` thick padding along its top;
//                  with `rocker` a rubber rocker panel `height` tall and `depth` proud along each
//                  side, between the fenders where there are fenders.
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
//   grille       a panel `depth` thick in its `paint` across the nose, from the bumper to the hood (in
//                the open car's nose; ahead of the closed car's box), with `slots` rounded slots cut in
//                it `width` across and `height` tall, and the headlights' holes either side, a dark
//                radiator behind them.
//   lights       two round headlights either side of the grille (or of the nose's middle, with none),
//                each a chrome reflector bowl with a bulb in it under a lens `radius` round domed
//                `depth` proud, lit in `light`, in a chrome ring `bezel` thick; and at the back each
//                side a cluster in a housing of `trim`, `bezel` round its lenses, inside the tub's
//                rear corners: a tail light in `tail` `radius` × 2 tall, and under it a reverse light
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
//                the rocker panels, the spare and the lamps' housings and lenses, none of which is
//                then drawn; the wheels, the corners (springs, dampers, upper and lower arms), the
//                exhaust, the dust and the tracks are drawn as without it. Its origin is at `at` in the
//                chassis's frame ([0, 0, 0] when left out), `scale` metres to one of its units (1 when
//                left out), its +x the car's forward, +y up and +z its right, as the chassis's. It is
//                asked of the loader (`plugins.loader`, which the scene lists, or the frame throws
//                naming the vehicle) once, and taken with `model(asset)` the first frame it is ready;
//                until then the car is drawn with no body. Its own nodes place the lamps, by the
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
//                not see-through casts them. Every node named starting `steer` (glTF's `steer` reaches
//                three as `steer`) that is not under another is a steering wheel, which turns with the
//                steering as the drawn one does (`lock`, below), about its own x: a model's steering
//                wheel is its own node, its +x down the column into the dash, +y up its face, +z right.
//   lock         radians the steering wheel turns at full lock, the car row's `steer` at ±1: each frame
//                the drawn wheel, and each of a model's `steer…` nodes, is turned `steer` × `lock` about
//                its column, from the way it was made, so a steer to the left (positive) turns its top
//                to the left; about its own −x, the column toward the driver. With none the wheel does
//                not turn.
//   points       `{ <name>: [x, y, z] | { at: [x, y, z], part?: 'steer', turn?: [x, y, z, w] } }`:
//                named places of the car in the chassis's frame, where a body sits, takes hold or puts
//                its feet. Each is drawn as an empty three.js object of its name: on the chassis, so
//                with the car still it is at the chassis row's place turned by its turn, plus `at`
//                turned by it; or, with `part: 'steer'`, on the steering wheel (the drawn one, or a
//                model's first `steer…` node, once the model has come), set back by the wheel's own
//                place and turn so that with the wheel straight it is at `at`, and turning with the
//                wheel. With `turn`, a quaternion in the chassis's frame, the empty is turned so (with
//                the wheel straight, for one on it): a hand bent onto it takes that turn. A `part`
//                that names nothing the look draws throws naming the point: on the frame the car is
//                made, or, for a model, on the frame it comes and has no `steer…` node.
//   exhaust      a list of tailpipes, each `{ at, dir, pipe, effect, rev?, rpm? }`: a chrome tailpipe
//                `pipe` round ending at `at`, along `dir`, and particle3d's `effect` thrown from it, both
//                in the chassis's frame and turned with it every frame, for as long as the car is drawn;
//                and `rev` beside it while the car's row holds a throttle, stopped the frame it lets go.
//                Each pipe throws its own. Each is the page's own (particle3d's `emit`), left where it is
//                thrown, so a moving car leaves a trail, and stopped with the car. With `rpm`,
//                `[[rpm, rate], …]` in rising rpm, both run at the rate the curve gives for the row's
//                `rpm` each frame (particle3d's `rate`: that many times as many bursts), its points
//                joined by straight lines and held past its ends (`along`); with none, at 1. A scene
//                whose look has an exhaust lists particle3d after this plugin.
//   dust         `{ effect, clear, speed }`: particle3d's `effect` thrown from under each wheel while
//                it is on the ground, its lowest point within `clear` metres of the land's height there,
//                and either going faster than `speed` metres a second across it or its tread sliding
//                over it faster than that, spinning or locked; it is thrown at the ground under the
//                wheel, along the way the tread pushes the ground back (the tread's speed at the ground
//                less the wheel's, which rolling is back from the way it goes) and up by half as much,
//                and stopped the frame either is no longer so. The land is the one a mod hands it,
//                `world.box3dvehicle.mods: { land: '<a>' }` (terrain3d's, `terrain3d.box3dvehicle.ts`):
//                `land(plugins)` is an object whose `height(x, z)` is the ground there, and whose
//                `spray(x, z)`, when it has one, is what the ground there throws instead of `effect`:
//                an effect's name, false for nothing, undefined for `effect`; a wheel that rolls onto
//                ground that throws something else stops its effect and starts that one. `land` is
//                undefined until it has a ground. Until then, or with no mod named, no wheel is on the ground and no
//                dust is thrown. The plugin the mod is is listed before this one, so the land it asks
//                in its `afterTick` is this frame's, and a scene with dust or tracks that lists it
//                after, or does not list it, throws (`ahead`), as does one with dust on any of its
//                vehicles that does not list particle3d.
//   sprays       a list, each `{ effect, clear, speed: [from, to], rpm? }`: particle3d's `effect` thrown
//                from under each wheel beside its dust, from the same point along the same way, while
//                the wheel is within `clear` metres of the land's height there and its tread goes
//                faster than `from` metres a second over it (its speed across the land or its slide,
//                whichever is more, as dust's), until the wheel itself goes `to` metres a second or
//                faster across the land: a spray that only a car pulling away throws. Ground whose
//                `spray` is false throws none of them, and ground that throws some other effect
//                leaves them as they are. With `rpm`, run at the rate its curve gives for the row's
//                `rpm`, as an exhaust's; with none, at 1. The way it is thrown is its effect's: a
//                layer with its own `dir` throws along that. The land and the order are dust's, and
//                a scene with sprays on any of its vehicles that does not list particle3d throws.
//   skid         `{ effect, clear, speed, rate?, force? }`: particle3d's `effect` thrown from under each wheel
//                sliding sideways: while the wheel is within `clear` metres of the land's height there
//                and goes faster than `speed` metres a second along its axle (its velocity across the
//                land on its own z, turned by its rot, laid flat), at the ground under it, along the
//                way it slides and up by a tenth as much, stopped the frame either is no longer so. With
//                `rate`, `[[m/s, rate], …]` in rising speed, run at the rate that curve gives for the
//                sideways speed each frame (`along`), so a harder slide throws more; with none, at 1.
//                With `force`, per m/s, each frame it is thrown with particle3d's `force` that times the
//                sideways speed, every layer's speed multiplied by it, so a harder slide throws harder:
//                at `force` 0.25 a slide of 4 m/s throws as the effect says and one of 12 m/s three
//                times as hard; with none, at 1.
//                It is thrown whatever the ground under the wheel sprays: a tyre slid over asphalt
//                smokes. The land and the order are dust's, and a scene with a skid on any of its
//                vehicles that does not list particle3d throws.
//   tracks       `{ colour, opacity, skid, slide, clear, step, life, max, lift }`: the track each tyre
//                leaves on the land, a ribbon its wheel's width laid `lift` metres over the land's
//                height under each edge, a piece every `step` metres the wheel goes while its lowest
//                point is within `clear` metres of the land, broken where it is not. A piece is
//                `colour` at the opacity the land's `mark(x, z)` gives where it is laid (the land a
//                mod hands, as dust's; `opacity` where it gives none, or has no `mark`), plus `skid`
//                while the tread slides over the ground faster than `slide` metres a second, a skid's
//                rubber or a spun wheel's rut, at most 1; a piece of no opacity is not laid, and
//                breaks the track. Each fades to nothing over `life` seconds from when it was laid,
//                and a wheel keeps its last `max` pieces, laying each new one over its oldest. A track
//                is the page's own, and goes with its car. With no land no tyre is on the ground, and
//                none is laid.
//   the wheels   each on its wheel row: a tyre of its axle's `wheel.radius` and `width`, revolved, its
//                sidewalls bulging and its shoulders rounding into the tread (with `tread`, `blocks`
//                chevron lugs round it `depth` deep, each half turned `angle` radians across it), on a
//                dished steel wheel `look.rim` of the radius with `look.spokes` ribs on its outer face,
//                as many chrome lug nuts round its hub and a chrome cap, so its turning shows.
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
//   solid        with it, each axle is drawn as a solid axle instead of the corners (no coil, damper or
//                arm at any corner, and no upper arm on the body): placed each frame from its two
//                wheel rows by `solidParts` (`box3dvehicle.sim.ts`, which says how every number below
//                is read), so it tilts as one wheel rises and the other falls and steers with them,
//                while the wheels still ride on their own springs. Its parts: a housing `housing`
//                round between the knuckles' pivots `pivot` in from each wheel's middle; the pumpkin, a
//                ball `pumpkin.radius` round at the axle's own `axles[i].pumpkin` along it, with its
//                `pinion` toward the driveshaft and a chrome cover `cover` round the other way; at each
//                wheel a knuckle `knuckle.radius` round and `height` tall, a brake disc `brake.radius`
//                round and `thick` thick `at` in from the wheel's middle with a caliper `caliper`
//                round on its top, all turned with the wheel's steering, inside the wheel's dish; four
//                links `links.radius` round, `lower` and `upper` each side, and the `track` bar, from
//                the chassis to the axle, each with a rod end `end` round on the axle; at each wheel the
//                `shocks`, each a body `radius` round and `body` long hanging from its top on the
//                chassis, a shaft `shaft` round from the axle up to halfway along the body, with `coil` a coil `turns`
//                turns `radius` round in wire `wire` thick between a perch `low` up the shaft and one
//                `high` down the body, never longer than its `free` length (past it, it rides on its
//                lower perch clear of the upper one), and with `reservoir` a can `radius` round and `length` long
//                `gap` beside the body; a bump stop `bump.radius` round each side `across` out, from
//                the `ceiling` down to where the housing's top is at full bump; a limit strap each
//                side, `strap.length` long, `width` wide and `thick` thick, from a tab `drop` under the
//                ceiling to the housing's top, straight once pulled tight and folded back and forth otherwise; on a steered axle a steering arm on each knuckle reaching `steer.arm`, a
//                tie rod `steer.rod` round between them and a steering ram on the housing pushing it;
//                and a driveshaft `shaft.radius` round from the transfer case's output at
//                `axles[i].shaft` to the pinion, a slip yoke `shaft.slip` at its start and a joint
//                `shaft.joint` at the pinion. Coils are in `spring`, the shocks' bodies, shafts,
//                reservoirs, the pumpkin's cover and the joints in `chrome`, the discs in `damper`,
//                the calipers and straps in `hook`, the bump stops in `trim`, and everything else in
//                `arm`. Each part is a mesh of its own on the chassis, named `box3dvehicle.solid.<part>`.
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
// Round parts have `look.segments` sides and arms are `look.arm` thick. A car is drawn once its row
// names its parts and they have come, and goes with its row. When `world.box3dvehicle` changes, as
// the editor does while a value of it is dragged, every car is made again from it.
// Every part is a physical material in its paint, its finish `look.finish`'s for that paint
// (`roughness`, `metalness`, a `clearcoat` and its `clearcoatRoughness` for lacquered paint, a
// `sheen` and its `sheenRoughness` for vinyl, an `opacity` below 1 for glass and lenses, which are
// drawn see-through) and three's own for a paint it leaves out, dressed by render3d, so the sky's
// environment, its wet and its snow reach the car as they reach the ground; `light`, `tail` and
// `amber` glow in their own colour. The parts that never move against the chassis or a wheel are
// merged into one mesh a material, so a car is a few draws however many parts it has; the drawn
// steering wheel, which turns on the chassis, is merged so on its own.
// Every mesh takes shadows, and every one that is not see-through casts them.
// The lamps found by name: each beam's spot light is `box3dvehicle.beam`, the brake light
// `box3dvehicle.brake`, the reverse light `box3dvehicle.reverse`, and the drawn lenses of the tail
// and reverse lights `box3dvehicle.tail` and `box3dvehicle.backup`; a model's group on the chassis
// is `box3dvehicle.model`; the drawn steering wheel is `box3dvehicle.steer`.
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
import type { Effect } from '#plugins/particle3d/particle3d.plugin.ts'
import { along, cabinPoints, corners, cross, design as designOf, pedals, pointOf, solidParts, turn, wheelAt, type Engine, type Fleet, type Lamp, type Lights, type Paint, type Tracks, type Vehicle, type Wheel } from './box3dvehicle.sim.ts'
import type { Quat, Vec3 } from '#plugins/box3d/box3d.sim.ts'

// What a `land` mod is: the ground dust is thrown from, or undefined until there is one.
type Land = (plugins: Plugins) => {
  height(x: number, z: number): number
  spray?(x: number, z: number): string | false | undefined
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
// One tyre's track: its mesh, the time each piece was laid and its opacity then, the next piece to
// lay over, how many are laid, and the edges of the last place laid at, [x, y, z] left and right, or
// undefined where the track is broken.
type Track = { mesh: any; born: Float32Array; strength: Float32Array; next: number; laid: number; last?: number[][] }
type Drawn = {
  chassis: any; wheels: any[]; corners: { coil: any; sleeve: any; rod: any; arm?: any }[]; owned: { dispose(): void }[]
  // With `look.solid`: each axle's parts, one mesh a part on the chassis, in `solidParts`' order.
  solid: any[][]
  // Each tailpipe's smoke, and its rev while the throttle is held, by the pipe's place in the list.
  smoke: (Effect | undefined)[]; rev: (Effect | undefined)[]; dust: ({ fx: Effect; effect: string } | undefined)[]; tracks: Track[]
  // Each wheel's sprays, by the wheel's corner and the spray's place in the look's list.
  sprays: (Effect | undefined)[][]
  // Each wheel's skid, by the wheel's corner.
  skid: (Effect | undefined)[]
  // The lamps: the tail lenses' and reverse lenses' materials and their two lights, which change, and
  // the amber lenses' material.
  lamps?: { tail: any; backup: any; amber: any; brake?: any; reverse?: any }
  // Each headlight's beam, its spot light; under `lightsOff` at no intensity while the car row's
  // `lights` is off.
  headlights: any[]
  // With `look.model`: the model's group on the chassis, once the loader has it.
  model?: any
  // Each steering wheel, the drawn one or a model's `steer…` nodes, and its turn as it was made.
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

export function box3dvehicle() {
  const cars = new Map<number, Drawn>()
  let design = ''
  // The models asked of the loader, each once; and every material of a model dressed, each once.
  const asked = new Set<string>()
  const dressed = new WeakSet<object>()
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
    const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1)
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
    // A tube `radius` thick through `points`, each corner between them bent round `bend`.
    const bent = (into: any, points: number[][], bend: number, radius: number, paint: keyof Paint) => {
      const P = points.map(p => new THREE.Vector3(p[0], p[1], p[2])), path = new THREE.CurvePath()
      let from = P[0]
      const line = (a: any, b: any) => { if (a.distanceTo(b) > 1e-6) path.add(new THREE.LineCurve3(a, b)) }
      for (let i = 1; i < P.length - 1; i++) {
        const [a, b, c] = [P[i - 1], P[i], P[i + 1]], r = Math.min(bend, a.distanceTo(b) / 2, b.distanceTo(c) / 2)
        const enter = b.clone().add(a.clone().sub(b).setLength(r)), leave = b.clone().add(c.clone().sub(b).setLength(r))
        line(from, enter)
        path.add(new THREE.QuadraticBezierCurve3(enter, b, leave))
        from = leave
      }
      line(from, P[P.length - 1])
      return put(into, new THREE.TubeGeometry(path, P.length * segments, radius, Math.max(8, segments / 2), false), [0, 0, 0], paint)
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
    // A slab drawn in plan (shape x along the car's x, shape y along its z), `depth` up y.
    const plan = (shape: any, depth: number, round: number) => slab(shape, depth, round).rotateX(Math.PI / 2)
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
    const open = drawn ? look.open : undefined, grille = drawn ? look.grille : undefined
    const bumpers = drawn ? look.bumpers : undefined, fenders = drawn ? look.fenders : undefined
    const gT = grille?.depth ?? 0
    // The grille's back face: in the open car's nose, ahead of the closed car's box.
    const gx0 = open ? L / 2 - gT : L / 2, nose = gx0 + gT
    const hoodDrop = open?.hood.drop ?? 0
    const cs = corners(v)
    // The drawn steering wheel, the open car's.
    let wheelPiece: any

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

    if (open) {
      const cabin = v.body.cabin
      if (!cabin) throw new Error(`world.box3dvehicle.vehicles.${name}.look.open is built round body.cabin, and its body has none`)
      const cabFront = cabin.at + cabin.length / 2, cabBack = cabin.at - cabin.length / 2
      const o = open, t = o.wall, floorY = -H / 2 + o.floor, R = Math.max(o.corner, t)
      const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u))
      const topAt = (x: number) => H / 2 - o.door.drop * ease((x - o.door.from) / o.door.ease) * ease((o.door.to - x) / o.door.ease)

      // The tub's wall, one piece round its plan: from the cowl back down the left side, round the
      // rear corners `corner` round, across the back and up the right side, `wall` thick, its top
      // dipping into each door, its rim rounded, a rib `rib.depth` proud round it at `rib.at`.
      {
        const zs = W / 2 - t / 2, Rc = R - t / 2, cx = -L / 2 + R, zc = W / 2 - R, step = 0.015
        const path: { x: number; z: number; nx: number; nz: number }[] = []
        const line = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number) => {
          const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step))
          for (let i = 0; i < n; i++) path.push({ x: ax + ((bx - ax) * i) / n, z: az + ((bz - az) * i) / n, nx, nz })
        }
        const arc = (a0: number, a1: number, cz: number) => {
          const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * Rc) / step))
          for (let i = 0; i < n; i++) { const a = a0 + ((a1 - a0) * i) / n; path.push({ x: cx + Rc * Math.cos(a), z: cz + Rc * Math.sin(a), nx: Math.cos(a), nz: Math.sin(a) }) }
        }
        line(cabFront, -zs, cx, -zs, 0, -1)
        arc(-Math.PI / 2, -Math.PI, -zc)
        line(-L / 2 + t / 2, -zc, -L / 2 + t / 2, zc, -1, 0)
        arc(Math.PI, Math.PI / 2, zc)
        line(cx, zs, cabFront, zs, 0, 1)
        path.push({ x: cabFront, z: zs, nx: 0, nz: 1 })
        const K = 8
        // The section at a point of the path: [out along its normal, y], from the outer foot over the
        // rim to the inner foot.
        const section = (x: number) => {
          const h = topAt(x) - t / 2, rib = o.rib
          const r1 = Math.min(rib.at + rib.height / 2, h - 1e-3), r0 = Math.min(rib.at - rib.height / 2, r1 - 1e-3), span = r1 - r0
          const rows = [[t / 2, -H / 2], [t / 2, r0], [t / 2 + rib.depth, r0 + span * 0.3], [t / 2 + rib.depth, r1 - span * 0.3], [t / 2, r1], [t / 2, h]]
          for (let k = 1; k < K; k++) { const f = (Math.PI * k) / K; rows.push([(t / 2) * Math.cos(f), h + (t / 2) * Math.sin(f)]) }
          rows.push([-t / 2, h], [-t / 2, floorY])
          return rows
        }
        const n = section(0).length, pos: number[] = [], index: number[] = []
        for (const p of path) for (const [off, y] of section(p.x)) pos.push(p.x + p.nx * off, y, p.z + p.nz * off)
        for (let j = 0; j < path.length - 1; j++) {
          for (let k = 0; k < n - 1; k++) {
            const a = j * n + k, b = (j + 1) * n + k
            index.push(a, b, b + 1, a, b + 1, a + 1)
          }
        }
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        g.setIndex(index)
        g.computeVertexNormals()
        put(chassis, g, [0, 0, 0], 'body')
        // Its two front ends, closed flat.
        for (const p of [path[0], path[path.length - 1]]) {
          const rows = section(p.x), contour = rows.map(([off, y]) => new THREE.Vector2(off, y))
          const faces = THREE.ShapeUtils.triangulateShape(contour, [])
          const cap: number[] = []
          for (const f of faces) for (const i of [...f, ...[...f].reverse()]) cap.push(p.x + p.nx * rows[i][0], rows[i][1], p.z + p.nz * rows[i][0])
          const cg = new THREE.BufferGeometry()
          cg.setAttribute('position', new THREE.Float32BufferAttribute(cap, 3))
          cg.computeVertexNormals()
          put(chassis, cg, [0, 0, 0], 'body')
        }
      }
      // The floor inside it, a rubber mat.
      const inLen = cabFront - (-L / 2 + t)
      put(chassis, plan(rect(-inLen / 2, -(W / 2 - t), inLen / 2, W / 2 - t, R - t), o.floor, 0), [(cabFront + -L / 2 + t) / 2, -H / 2 + o.floor / 2, 0], 'trim')

      // The hood ahead of the cowl, its top falling `hood.drop` to the grille, every edge rounded,
      // with a dome pressed up in it.
      const hoodLen = gx0 - cabFront, hood = new THREE.Shape()
      hood.moveTo(cabFront, -H / 2); hood.lineTo(gx0, -H / 2); hood.lineTo(gx0, H / 2 - hoodDrop); hood.lineTo(cabFront, H / 2); hood.closePath()
      put(chassis, side(hood, W, o.hood.round), [0, 0, 0], 'body')
      if (o.hood.dome) {
        const d = o.hood.dome, slope = Math.atan2(hoodDrop, hoodLen)
        const dome = put(chassis, plan(middle(hoodLen - 2 * d.inset, W - 2 * d.inset, d.inset * 0.6), d.height * 2, d.height), [(cabFront + gx0) / 2, H / 2 - hoodDrop / 2, 0], 'body')
        dome.rotation.z = -slope
      }
      // Its hinges at the cowl, and a latch each side, standing on the fender where there is one.
      for (const s of [-1, 1]) {
        tube(chassis, [cabFront + 0.02, H / 2 + 0.004, s * (W / 3) - 0.04], [cabFront + 0.02, H / 2 + 0.004, s * (W / 3) + 0.04], 0.012, 'chrome')
        const latchY = frontTop ? (frontTop.top + H / 2 - hoodDrop) / 2 : H / 2 - hoodDrop - 0.06
        put(chassis, side(rect(-0.018, -0.035, 0.018, 0.035, 0.01), 0.022, 0.006), [gx0 - 0.3, latchY, s * (W / 2 + 0.009)], 'trim')
      }

      // The dash across the cowl's back, in the body's colour, its gauges facing the seats and a grab
      // bar over it before the right seat.
      const dash = o.dash, dashX = cabFront - dash.depth
      put(chassis, front(middle(W - 2 * t, dash.height, 0.02), dash.depth, 0.015), [cabFront - dash.depth / 2, H / 2 - dash.height / 2, 0], 'body')
      const gR = dash.height * 0.28
      for (const [z, r] of [[-W / 4 - gR * 1.15, gR], [-W / 4 + gR * 1.15, gR], [0, gR * 0.6], [gR * 1.4, gR * 0.6]]) {
        const y = H / 2 - dash.height / 2
        put(chassis, disc(r, 0.012), [dashX - 0.004, y, z], 'trim')
        put(chassis, new THREE.TorusGeometry(r, r * 0.12, 6, segments).rotateY(Math.PI / 2), [dashX - 0.01, y, z], 'chrome')
        const needle = box(chassis, [0.003, r * 0.75, r * 0.08], [dashX - 0.012, y + r * 0.3, z + r * 0.1], 'amber')
        needle.rotation.x = -0.6
      }
      put(chassis, new THREE.TorusGeometry(W / 9, arm * 0.45, 8, segments, Math.PI).rotateY(Math.PI / 2), [cabFront - dash.depth / 2, H / 2, W / 4], 'chrome')

      // A bucket seat: a pedestal, a cushion, a back leaning `tilt` with bolsters along its sides, and
      // a headrest `head` tall on two posts; its back's foot `x` and its middle across `z`.
      const s = o.seat, thick = s.base * 0.8, ped = s.base * 0.6, lean = s.back * Math.sin(s.tilt)
      const bucket = (x: number, z: number, width: number, depth: number, back: number, head: number) => {
        put(chassis, plan(middle(depth * 0.6, width * 0.6, 0.02), ped, 0.01), [x + depth / 2, floorY + ped / 2, z], 'trim')
        put(chassis, plan(middle(depth, width, s.round * 1.5), s.base, s.round), [x + depth / 2, floorY + ped + s.base / 2, z], 'seat')
        const g = new THREE.Group()
        g.position.set(x - thick / 2, floorY + ped + s.base * 0.5, z)
        g.rotation.z = s.tilt
        put(g, front(middle(width, back, s.round * 1.5), thick, s.round), [0, back / 2, 0], 'seat')
        for (const k of [-1, 1]) put(g, front(middle(width * 0.16, back * 0.8, s.round), thick * 0.7, s.round * 0.8), [thick * 0.45, back * 0.45, k * (width / 2 - width * 0.08)], 'seat')
        if (head > 0) {
          put(g, front(middle(width * 0.55, head, s.round * 2), thick * 0.85, s.round), [0, back + 0.03 + head / 2, 0], 'seat')
          for (const k of [-1, 1]) tube(g, [0, back - 0.01, k * width * 0.15], [0, back + 0.04, k * width * 0.15], 0.008, 'chrome')
        }
        chassis.add(g)
      }
      const seatX = cabBack + t + thick + lean + 0.3
      for (const k of [-1, 1]) bucket(seatX, k * (W / 4), s.width, s.depth, s.back, s.head)
      if (o.bench) {
        const bx = -L / 2 + t + thick + lean, depth = Math.min(s.depth, cabBack - bx)
        bucket(bx, 0, W - 2 * t - 0.08, depth, s.back * 0.8, 0)
      }

      // The transmission tunnel down the floor's middle, and the gear stick on it.
      if (o.tunnel) {
        const tl = dashX - (cabBack + t)
        put(chassis, plan(middle(tl, o.tunnel.width, o.tunnel.width * 0.4), o.tunnel.height * 2, o.tunnel.height * 0.8), [(dashX + cabBack + t) / 2, floorY, 0], 'trim')
        if (o.stick) {
          const sx = seatX + s.depth + 0.06, sy = floorY + o.tunnel.height
          put(chassis, new THREE.CylinderGeometry(arm * 1.2, arm * 2, 0.04, segments), [sx, sy + 0.02, 0], 'trim')
          tube(chassis, [sx, sy, 0], [sx - 0.06, sy + o.stick, 0], arm * 0.35, 'chrome')
          put(chassis, new THREE.SphereGeometry(arm * 1.3, segments, segments / 2), [sx - 0.06, sy + o.stick, 0], 'trim')
        }
      }

      // The steering wheel before the left seat, on a column down into the dash: a rim `steer` round,
      // three spokes (one down, two 30° above level) and a hub, a piece of its own at the hub, its
      // frame the chassis's pitched down the column, the wheel in its y–z plane; added to the chassis
      // once the body is merged, so it is merged apart and turns.
      const hub = new THREE.Vector3((seatX - 0.3 + s.depth + cabFront) / 2, H / 2 + o.steer / 2, -W / 4)
      const toward = new THREE.Vector3(-Math.cos(0.6), Math.sin(0.6), 0)
      const sw = new THREE.Group()
      sw.name = 'box3dvehicle.steer'
      sw.position.copy(hub)
      sw.quaternion.setFromAxisAngle(Z, -0.6)
      put(sw, new THREE.TorusGeometry(o.steer, arm * 0.6, 8, segments).rotateY(Math.PI / 2), [0, 0, 0], 'trim')
      // Each spoke from the hub to the rim at `a` round the wheel's face from its right (+z) toward its top.
      for (const a of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) {
        const spoke = box(sw, [arm * 0.5, o.steer, arm * 0.9], [0, (Math.sin(a) * o.steer) / 2, (Math.cos(a) * o.steer) / 2], 'trim')
        spoke.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2 - a)
      }
      put(sw, new THREE.CylinderGeometry(o.steer * 0.22, o.steer * 0.22, arm * 1.6, segments).rotateZ(Math.PI / 2), [0, 0, 0], 'chrome')
      wheelPiece = sw
      const reach = Math.max(0.05, (dashX - hub.x) / Math.cos(0.6))
      tube(chassis, hub.clone().addScaledVector(toward, -reach).toArray(), hub.toArray(), arm * 0.7, 'trim')

      // The windshield, leaning back from the cowl: a frame with rounded corners, glass in it, its
      // hinges at the foot, two wipers on it and a mirror out each side.
      const ws = o.windshield, f = ws.frame
      const shield = new THREE.Group()
      shield.position.set(cabFront, H / 2, 0)
      shield.rotation.z = ws.lean
      const frame = rect(-W / 2, 0, W / 2, ws.height, f * 1.5)
      frame.holes.push(rect(-W / 2 + f, f, W / 2 - f, ws.height - f, f * 0.6, new THREE.Path()))
      put(shield, front(frame, f * 0.8, f * 0.25), [0, 0, 0], 'trim')
      put(shield, front(rect(-W / 2 + f * 0.6, f * 0.6, W / 2 - f * 0.6, ws.height - f * 0.6, f * 0.8), 0.008, 0), [0, 0, 0], 'glass')
      for (const k of [-1, 1]) {
        tube(shield, [0, 0, k * (W / 2 - f * 2) - f * 0.8], [0, 0, k * (W / 2 - f * 2) + f * 0.8], f * 0.35, 'chrome')
      }
      for (const z of [-W / 4, W / 8]) {
        const wiper = new THREE.Group()
        wiper.position.set(f * 0.5, f * 1.2, z)
        wiper.rotation.x = 0.35
        box(wiper, [f * 0.25, ws.wiper, f * 0.2], [0, ws.wiper / 2, 0], 'trim')
        box(wiper, [f * 0.15, ws.wiper * 0.9, f * 0.1], [f * 0.2, ws.wiper / 2, 0], 'trim')
        shield.add(wiper)
      }
      if (o.mirror) {
        const { size, arm: reachOut } = o.mirror, my = ws.height * 0.55
        for (const k of [-1, 1]) {
          tube(shield, [0, my, k * (W / 2)], [0, my - 0.02, k * (W / 2 + reachOut)], arm * 0.4, 'chrome')
          put(shield, front(middle(size, size * 0.7, size * 0.2), size * 0.3, size * 0.08), [0, my, k * (W / 2 + reachOut + size / 2)], 'body')
          put(shield, front(middle(size * 0.85, size * 0.55, size * 0.15), 0.004, 0), [-size * 0.15 - 0.002, my, k * (W / 2 + reachOut + size / 2)], 'chrome')
        }
      }
      chassis.add(shield)

      // The roll bar: a hoop bent over the cabin's back on plates on the rim, legs back to the tub's
      // rear corners, a bar each side to the windshield's top, and padding along the hoop's top.
      const { cage } = o, cz = W / 2 - t / 2, top = H / 2 + cage.height, bar = cabBack + cage.tube
      const shieldTop = [cabFront - Math.sin(ws.lean) * ws.height, H / 2 + Math.cos(ws.lean) * ws.height]
      bent(chassis, [[bar, H / 2, -cz], [bar, top, -cz], [bar, top, cz], [bar, H / 2, cz]], cage.bend, cage.tube, 'trim')
      for (const k of [-1, 1]) {
        bent(chassis, [[bar, top - cage.bend, k * cz], [-L / 2 + R, H / 2, k * cz]], 0, cage.tube, 'trim')
        bent(chassis, [[bar, top, k * cz], [(bar + shieldTop[0]) / 2, top + (shieldTop[1] - top) * 0.4, k * cz], [shieldTop[0], shieldTop[1], k * cz]], cage.bend, cage.tube * 0.9, 'trim')
        for (const x of [bar, -L / 2 + R]) put(chassis, new THREE.CylinderGeometry(cage.tube * 1.8, cage.tube * 1.8, 0.01, segments), [x, H / 2 + 0.005, k * cz], 'trim')
      }
      if (cage.pad > 0) put(chassis, new THREE.CylinderGeometry(cage.pad, cage.pad, 2 * cz - 2 * cage.bend - 0.04, segments).rotateX(Math.PI / 2), [bar, top, 0], 'trim')

      // A rocker panel along each side between the fenders, or under the cabin with none.
      if (o.rocker) {
        const order = [...v.axles].sort((a, b) => b.at - a.at), between = fenders && order.length > 1
        const fore = between ? tops.get(order[0].at)!.ends[0] : cabFront, aft = between ? tops.get(order[1].at)!.ends[1] : cabBack
        const len = fore - aft
        if (len > 0) for (const k of [-1, 1]) put(chassis, front(middle(o.rocker.depth, o.rocker.height, o.rocker.depth * 0.4), len, o.rocker.depth * 0.3), [(fore + aft) / 2, -H / 2 + o.rocker.height / 2, k * (W / 2 + o.rocker.depth / 2 - 0.006)], 'trim')
      }
    } else if (drawn) {
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
    const panelBottom = -H / 2 + (bumpers?.height ?? 0), panelTop = H / 2 - hoodDrop, lampY = grille ? (panelBottom + panelTop) / 2 : 0
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
        const edge = W / 2 - (open ? Math.max(open.corner, open.wall) : 0)
        for (const k of [-1, 1]) {
          const tz = k * (edge - r / 2 - bezel)
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
    for (const c of look.solid ? [] : cs) {
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
    const steers: Drawn['steers'] = []
    if (wheelPiece) {
      bake(wheelPiece)
      chassis.add(wheelPiece)
      steers.push({ piece: wheelPiece, rest: wheelPiece.quaternion.clone() })
    }
    // The look's points, each an empty on the chassis or on the drawn wheel; one on a model's wheel
    // waits for the model (`modelled`).
    const points = new Map<string, any>()
    for (const p of Object.keys(look.points ?? {})) {
      const spot = pointOf(v, p)!
      if (spot.part === undefined) points.set(p, hang(THREE, chassis, chassis, p, spot))
      else if (spot.part === 'steer' && wheelPiece) points.set(p, hang(THREE, chassis, wheelPiece, p, spot))
      else if (spot.part !== 'steer' || drawn) throw new Error(`world.box3dvehicle.vehicles.${name}.look.points.${p} rides ${spot.part}, which the look draws nothing of`)
    }
    scene.add(chassis)

    const wheels = cs.map(c => { const g = wheel(c.axle.wheel, c.side); bake(g); scene.add(g); return g })

    // A helix of `coils` turns from y 0 to y 1, to be stretched between the wheel and the mount.
    const helix = new THREE.Curve()
    helix.getPoint = (t: number, into = new THREE.Vector3()) => into.set(coilRadius * Math.cos(t * coils * 2 * Math.PI), t, coilRadius * Math.sin(t * coils * 2 * Math.PI))
    const coil = geo(new THREE.TubeGeometry(helix, coils * segments, wire, Math.max(3, segments / 4), false))
    const stick = (thick: number) => geo(new THREE.BoxGeometry(thick, 1, thick).translate(0, 0.5, 0))
    const drawnCorners = (look.solid ? [] : cs).map(c => {
      const spring = new THREE.Mesh(coil, mat('spring'))
      const sleeve = new THREE.Mesh(geo(new THREE.CylinderGeometry(coilRadius / 2, coilRadius / 2, 1, segments).translate(0, -0.5, 0)), mat('damper'))
      sleeve.scale.y = c.axle.spring.length - c.axle.spring.travel
      const rod = new THREE.Mesh(stick(wire * 2), mat('damper'))
      const inside = Math.abs(c.mount[2]) - inboard - c.axle.wheel.width / 2 <= W / 2
      const lower = inside ? undefined : new THREE.Mesh(stick(arm), mat('arm'))
      for (const m of [spring, sleeve, rod, lower]) if (m) scene.add(m)
      return { coil: spring, sleeve, rod, arm: lower }
    })
    // Each solid axle's parts, made from how they stand at rest: a unit tube, coil or band along y from
    // 0 to 1 to be stretched from `a` to `b` each frame, or a ball.
    const solid = look.solid ? v.axles.map((axle, i) => {
      const [l, r] = cs.filter(c => c.axle === axle)
      return solidParts(v, i, wheelAt(l, axle.spring.sag), wheelAt(r, axle.spring.sag), 0, 0).map(p => {
        let g
        if (p.shape === 'ball') g = new THREE.SphereGeometry(p.r, segments, segments / 2)
        else if (p.shape === 'band') g = new THREE.BoxGeometry(p.r * 2, 1, p.thick!).translate(0, 0.5, 0)
        else if (p.shape === 'coil') {
          const turns = p.turns!, spiral = new THREE.Curve()
          spiral.getPoint = (t: number, into = new THREE.Vector3()) => into.set(p.r * Math.cos(t * turns * 2 * Math.PI), t, p.r * Math.sin(t * turns * 2 * Math.PI))
          g = new THREE.TubeGeometry(spiral, Math.ceil(turns * segments), p.wire!, Math.max(3, segments / 4), false)
        } else g = new THREE.CylinderGeometry(p.r, p.r, 1, segments).translate(0, 0.5, 0)
        const m = new THREE.Mesh(geo(g), mat(p.paint))
        m.name = `box3dvehicle.solid.${p.name}`
        m.castShadow = true
        m.receiveShadow = true
        chassis.add(m)
        return m
      })
    }) : []
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
    return { chassis, wheels, corners: drawnCorners, solid, owned, smoke: [], rev: [], dust: [], sprays: [], skid: [], tracks, lamps, headlights, steers, points }
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
    for (const m of [d.chassis, ...d.wheels, ...d.corners.flatMap(c => [c.coil, c.sleeve, c.rod, c.arm]), ...d.tracks.map(t => t.mesh)]) if (m) scene.remove(m)
    for (const o of d.owned) o.dispose()
    for (const fx of [...d.smoke, ...d.rev, ...d.dust.map(t => t?.fx), ...d.sprays.flat(), ...d.skid]) if (fx) fx.life = fx.age
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

  // The model `scene` put on car `d`'s chassis as `v.look.model` says, its lamps found by name: a
  // spot light on each node named `beam…`, aimed along its +x, and the tail, reverse and amber
  // meshes taking the car's lamp materials, the brake and reverse lights moved to the middle of their
  // lenses. Every other material is dressed by render3d, once, and left the loader's. Its `steer…` nodes
  // are the car's steering wheels, and the look's points on the wheel are hung on the first of them,
  // throwing naming the vehicle `name` when it has none. Hands back the model's group.
  function modelled(render3d: Plugins['render3d'], v: Vehicle, d: Drawn, scene: any, name: string): any {
    const THREE = render3d.THREE as any, m = v.look.model!, l = v.look.lights
    const root = new THREE.Group()
    root.name = 'box3dvehicle.model'
    const [x, y, z] = m.at ?? [0, 0, 0]
    root.position.set(x, y, z)
    root.scale.setScalar(m.scale ?? 1)
    root.add(scene)
    d.chassis.add(root)
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
      } else {
        for (const mt of Array.isArray(o.material) ? o.material : [o.material]) {
          if (dressed.has(mt)) continue
          dressed.add(mt)
          render3d.dress(mt)
        }
      }
      o.castShadow = !(Array.isArray(o.material) ? o.material : [o.material]).some((mt: any) => mt.transparent)
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
      const world = plugins.wire.scene.world
      const fleet: Fleet | undefined = world?.box3dvehicle
      if (!fleet) return
      const now = JSON.stringify(fleet)
      if (now !== design) { for (const id of [...cars.keys()]) drop(scene, id); design = now }
      const rows = new Map<number, Row>(plugins.wire.rows.map(r => [r.id, r]))
      const seen = new Set<number>()
      const dusty = Object.values(fleet.vehicles).some(v => v.look.dust || v.look.sprays?.length || v.look.skid)
      const tracked = Object.values(fleet.vehicles).some(v => v.look.tracks)
      if (dusty || tracked) ahead(plugins.wire.scene, 'box3dvehicle', 'land')
      if (dusty && !plugins.particle3d) throw new Error('world.box3dvehicle has a vehicle whose look has dust, sprays or a skid, and this scene does not list particle3d')
      const ground = dusty || tracked ? mod<Land>(world!, 'box3dvehicle', 'land')?.(plugins) : undefined
      const seconds = performance.now() / 1000
      for (const car of plugins.wire.rows) {
        if (car.kind !== 'box3dvehicle' || car.data.chassis === undefined) continue
        const chassis = rows.get(car.data.chassis), wheels = (car.data.wheels as number[]).map(id => rows.get(id))
        if (!chassis || wheels.some(w => !w)) continue
        seen.add(car.id)
        const v = designOf(world!, car), cs = corners(v), dust = v.look.dust, tracks = v.look.tracks
        if (!cars.has(car.id)) cars.set(car.id, make(plugins.render3d, v, car.data.vehicle, fleet.lightsOff === true))
        const d = cars.get(car.id)!
        if (v.look.model && !d.model) {
          const loader = plugins.loader, { asset } = v.look.model
          if (!loader) throw new Error(`world.box3dvehicle.vehicles.${car.data.vehicle}.look has a model, and this scene does not list loader`)
          if (loader.ready(asset)) d.model = modelled(plugins.render3d, v, d, loader.model(asset).scene, car.data.vehicle)
          else if (!asked.has(asset)) {
            asked.add(asset)
            // The loader writes a failure to the console once itself.
            loader.load(asset).catch(() => {})
          }
        }
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
          // The tread at the ground: the wheel's speed and its spin about its middle, at r below it.
          const [tx, , tz] = cross(wd.spin as Vec3, [0, -r, 0])
          const slide = Math.hypot(vx + tx, vz + tz), speed = Math.hypot(vx, vz)
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
          // What the ground under the wheel throws, and where and along what a wheel's throw leaves: the
          // ground under it, along the way the tread pushes the ground back and up by half as much.
          const sprays = floor === undefined ? undefined : ground!.spray?.(x, z)
          const thrown = () => {
            const back = Math.hypot(tx, tz) > 1e-6 ? [tx, tz] : [-vx, -vz], len = Math.hypot(back[0], back[1]) || 1
            return { at: [x, floor!, z], dir: [back[0] / len, 0.5, back[1] / len] }
          }
          if (dust) {
            const effect = sprays === false ? undefined : sprays ?? dust.effect
            const on = floor !== undefined && effect !== undefined && y - r - floor <= dust.clear && Math.max(speed, slide) > dust.speed
            const was = d.dust[i]
            if (was && (!on || was.effect !== effect)) { was.fx.life = was.fx.age; d.dust[i] = undefined }
            if (on) {
              const { at, dir } = thrown()
              const now = d.dust[i]
              if (now) { now.fx.at = at; now.fx.dir = dir; now.fx.floor = floor } else d.dust[i] = { fx: plugins.particle3d.emit(effect, at, { dir, floor, life: Infinity }), effect }
            }
          }
          ;(v.look.sprays ?? []).forEach((s, k) => {
            const own = (d.sprays[i] ??= [])
            const on = floor !== undefined && sprays !== false && y - r - floor <= s.clear && Math.max(speed, slide) > s.speed[0] && speed < s.speed[1]
            const was = own[k]
            if (was && !on) { was.life = was.age; own[k] = undefined }
            if (!on) return
            const { at, dir } = thrown()
            const fx = (own[k] ??= plugins.particle3d.emit(s.effect, at, { dir, floor, life: Infinity }))
            fx.at = at
            fx.dir = dir
            fx.floor = floor
            fx.rate = s.rpm ? along(s.rpm, car.data.rpm ?? s.rpm[0][0]) : 1
          })
          const skid = v.look.skid
          if (skid) {
            // The wheel's axle across the land (its own z turned by its rot), and its speed along it.
            const [ax, , az] = turn(wd.rot as Quat, [0, 0, 1]), across = Math.hypot(ax, az)
            const sideways = across > 1e-6 ? (vx * ax + vz * az) / across : 0
            const on = floor !== undefined && y - r - floor <= skid.clear && Math.abs(sideways) > skid.speed
            const was = d.skid[i]
            if (was && !on) { was.life = was.age; d.skid[i] = undefined }
            if (on) {
              const s = Math.sign(sideways) / across
              const at = [x, floor!, z], dir = [ax * s, 0.1, az * s]
              const fx = (d.skid[i] ??= plugins.particle3d.emit(skid.effect, at, { dir, floor, life: Infinity }))
              fx.at = at
              fx.dir = dir
              fx.floor = floor
              fx.rate = skid.rate ? along(skid.rate, Math.abs(sideways)) : 1
              fx.force = skid.force !== undefined ? skid.force * Math.abs(sideways) : 1
            }
          }
        })
        // Each solid axle from its two wheels: their middles in the chassis's frame and how far each is
        // steered, its spin axis turned about the chassis's y from the chassis's z.
        if (v.look.solid) {
          const back: Quat = [-rot[0], -rot[1], -rot[2], rot[3]]
          const local = (i: number) => {
            const wd = wheels[i]!.data, p = turn(back, [wd.pos[0] - at[0], wd.pos[1] - at[1], wd.pos[2] - at[2]]), spin = turn(back, turn(wd.rot, [0, 0, 1]))
            return { p, steer: Math.atan2(spin[0], spin[2]) }
          }
          v.axles.forEach((axle, i) => {
            const [l, r] = [cs.findIndex(c => c.axle === axle && c.side < 0), cs.findIndex(c => c.axle === axle && c.side > 0)].map(local)
            solidParts(v, i, l.p, r.p, l.steer, r.steer).forEach((p, k) => {
              const m = d.solid[i][k]
              if (p.shape === 'ball') m.position.fromArray(p.a)
              else span(THREE, m, p.a, p.b)
            })
          })
        }
        const pipes = v.look.exhaust ?? []
        if (pipes.length && !plugins.particle3d) throw new Error(`world.box3dvehicle.vehicles.${car.data.vehicle}.look has an exhaust, and this scene does not list particle3d`)
        pipes.forEach((ex, i) => {
          const particles = plugins.particle3d
          const t = turn(rot, ex.at), exhaust = [at[0] + t[0], at[1] + t[1], at[2] + t[2]], dir = turn(rot, ex.dir)
          d.smoke[i] ??= particles.emit(ex.effect, exhaust, { dir, life: Infinity })
          if (ex.rev && car.data.throttle && !d.rev[i]) d.rev[i] = particles.emit(ex.rev, exhaust, { dir, life: Infinity })
          const rev = d.rev[i]
          if (rev && !car.data.throttle) { rev.life = rev.age; d.rev[i] = undefined }
          const rate = ex.rpm ? along(ex.rpm, car.data.rpm ?? ex.rpm[0][0]) : 1
          for (const fx of [d.smoke[i], d.rev[i]]) if (fx) { fx.at = exhaust; fx.dir = dir; fx.rate = rate }
        })
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
      design = ''
      asked.clear()
      engines.clear()
      read.clear()
    },
    point(id: number, name: string): Object3D | undefined {
      return cars.get(id)?.points.get(name)
    },
  }
}
