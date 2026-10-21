# hitscan3d

Instant shots in 3D: a line through the world answered with the first thing it meets (the ground, a
solid standing on it, or a body and the part of it), with lag compensation that puts every body back
where the shooter's page saw it, and a hurt that calls the body's `hit` act. Also line of sight, and
the one `Struck` shape every kind of harm hands a row.

## Why use it

Use hitscan3d for guns that hit the instant they fire (rifles, pistols, lasers, sniper shots), for
headshots and per-limb damage, for melee traces, for a camera kept out of a hill, and for "can this
enemy see the player". A seat sees other bodies where the last packet put them, some steps behind the
server, so a shot that only checked the present would miss what the player clearly hit; hitscan3d
checks against the bodies as that packet held them.

## How it works

**Server half (`hitscan3d.sim.ts`).** What a line can meet is asked of other plugins through mods,
each named in `world.hitscan3d.mods` and each optional:

- `ground`: `(w, from, dir, far) → { t, normal } | undefined`, the first point of the ground.
- `solids`: `(w, from, dir, far) → { x, z, radius, base, tall? }[]`, upright cylinders (trunks,
  boulders) the line's path crosses.
- `bodies`: `(w) → { id, kind, pos, shapes }[]`, each shape an upright `cylinder` or a `capsule`,
  named by its `part` (`head`, `torso`, `armL`, …).

`shoot(w, from, dir, far, { skip, seen, bodies, grow, hurt })` is the first thing met within `far`:
`{ t, point, normal, what }`, `what` being `ground`, `solid` or `body` (with `id`, `kind`, `part`), or
undefined. `skip` lists ids it passes through (the shooter); `bodies: false` passes through every
body; `grow` widens every shape (a round with a size). With `hurt: { damage, by, … }` (damage a
number, or by part) the body met has its `hit` act called as a rule's, with a `Struck`
`{ ...hurt, damage, part, point, dir, what: 'body' }`.

**Aiming back.** One `hitscan3d` row counts steps in its field `n` and, in its `after`, keeps every
body's feet and shapes for the last `rewind` steps. A page reads `n` off the row in the packet it
draws and sends it with the shot; `shoot`'s `seen` puts each body back where it stood then (clamped to
the oldest kept, or now). This memory is the plugin's own, never sent to a seat, and is handed to a
predicting page and a rewinding server. A body that has ended since is not brought back.

Other calls:

- `strike(w, row, struck)`: hurts a row by calling its `hit` act with a `Struck`.
- `Struck` is what every `hit` act is handed, whoever hurts the row: a shot (`what: 'body'`), a
  round's splash (`'splash'`, from volley3d), a rule's burst (`'blast'`), a car (`'car'`, with its
  `speed`). A `hit` act tells one from another by `what`.
- `hittable(w)`: every body a shot can hit now.
- `sees(w, from, to)`: whether the ground and the solids leave a clear line between two points.

**Browser half (`hitscan3d.plugin.ts`).** `plugins.hitscan3d.seen()` is the `n` of the row in the
packet this page draws from, which the game's player actor sends with each shot.

## Using it

1. List `hitscan3d` in `plugins` and give `world.hitscan3d: { kinds: { <kind>: { off?, tall? } },
   rewind, mods: { ground?, solids?, bodies? } }`: the kinds a shot can hit (a row whose `off` field is
   truthy, a body lying dead, is not hit; a row's `tall` field shortens its cylinders for a crouch),
   and how many steps a shot may be aimed back.
2. Add one `hitscan3d` row to `actors` for aiming back.
3. The seat's act fires with the aim and `plugins.hitscan3d.seen()`; its rule calls `shoot` with
   `{ skip: [me.id], seen, hurt: { damage, by: me.id } }`.
4. Give each hittable kind a `hit` act that reads the `Struck`.

## Plugins it works with

- **terrain3d**: the mod `terrain3d.hitscan3d.ts` is the `ground`.
- **scatter3d**: the mod `scatter3d.hitscan3d.ts` is the `solids` (trunks and boulders).
- **walker**: the mod `walker.hitscan3d.ts` is `bodies` as upright cylinders.
- **ragdoll3d**: the mod `ragdoll3d.hitscan3d.ts` is `bodies` as capsules along the bones.
- **dismember3d**: the mod `dismember3d.hitscan3d.ts` is `bodies` as each joint, so a shot cuts a limb.
- **volley3d**: hitscan3d's mod `hitscan3d.volley3d.ts` (`world.volley3d.mods: { shoot: 'hitscan3d',
  bodies: 'hitscan3d' }`) has launched rounds meet and hurt what a shot meets, in the present.
- **box3dvehicle**: hitscan3d's mod `hitscan3d.box3dvehicle.ts` (`mods: { bodies: 'hitscan3d', strike:
  'hitscan3d' }`) has a car hit and hurt the bodies a shot can hit.
- **chasecamera3d**: its `eye()` is where a shot from the screen's centre starts and points.
- **math**: deterministic maths.

## Keywords

hitscan, raycast, ray cast, shooting, gun, bullet, shot, line trace, lag compensation, rewind,
backward reconciliation, favour the shooter, netcode, hit registration, headshot, hitbox, hit
location, per-limb damage, body parts, damage, hurt, hit act, Struck, splash, blast, car hit, line of
sight, visibility, can see, cover, camera collision, `shoot`, `strike`, `sees`, `hittable`, `seen`,
`world.hitscan3d`
