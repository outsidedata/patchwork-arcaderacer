---
name: onionskinning-sprite-sheets
description: Use when packing an animation's frames into a sheet, and whenever something drawn from one swims, jitters, slides sideways as it plays, or an overlay (a muzzle flash, a shadow, a shield) sits off the thing it belongs to. Every frame of a clip drawn over every other, so a frame the pack moved shows as a coloured fringe — plus the number that says whether two frames are one drawing, which is what separates the packer's mistake from the animator's intent. Triggers — "the gun swims", "the animation is off", "the flash is in the wrong place", "hella off", a rip cropped tight, a new sheet from a repacker, or before claiming an animation is right.
---

# Onionskinning a sprite sheet

Written after mood's pistol (2026-09-13): three fire frames, and the middle one drawn 8 px to the
right of the two either side of it, every shot, for as long as the game had existed. Nobody could
see it in a screenshot — a still of frame B looks exactly like a still of frame C. It is only
visible when the frames are put on top of each other.

## What the pack cannot know and what you can

A rip crops every sprite to its ink. Two frames of one animation come out of that crop as two
different sizes, and a packer laying each one in a cell has to choose where in the cell to put it.
Bottom-centre is the usual choice and it is wrong for anything that is drawn at a fixed place:
the moment a frame's ink is wider — a muzzle flare, an arm thrown out, a slide pulled back — the
centre moves, and the body of the sprite moves with it.

The information the crop destroyed is not recoverable from the crop. It **is** recoverable from
the pixels: two frames of one drawing overlap almost exactly at the right shift and nowhere else.

**The measure.** For two frames on one canvas, take every whole-pixel shift in a window and score
it by how much of the two inked areas fails to overlap:

    miss(dx, dy) = |A xor shift(B, dx, dy)| / (|A| + |B|)

The best shift is the answer, and the miss there is how much you can trust it:

| miss at the best shift | what the two frames are | what to do |
|---|---|---|
| ≤ 0.15 | one drawing in two crops | the shift is the packer's — take it out |
| 0.2 – 0.6 | two drawings (a pump, a stride, a death) | there is nothing to recover; leave it |
| ≥ 0.6 | unrelated | the frame list is wrong |

That threshold is the whole discipline. It is what lets a tool fix a pistol without flattening a
shotgun's pump, and it needs no per-sheet whitelist to do it.

## What is gated and what is only looked at

- **Drawn at a fixed place on the screen** — a held weapon, a HUD part, a cursor. Two frames that
  are one drawing **must** be on one anchor. Gate this; a pixel of swim is visible at 1:1.
- **Drawn at its own place in the world** — a monster, a pickup, a projectile. It is anchored
  bottom-centre at its position and a walk frame may sway a pixel of its own accord. Draw the
  picture, print the number, gate nothing: you cannot tell a swaying stride from a bad crop at
  ±2 px, and forcing those to zero invents an animation the artist did not draw.

## Pinning an overlay you have no anchor for

A muzzle flash, a glow, a shadow drawn over a body has no shared silhouette to correlate — but a
flash sprite drawn *over the gun* usually carries a few of the gun's own pixels at its base. Score
by identical pixels rather than by overlap:

    carried(dx, dy) = how many opaque pixels of the overlay land on a pixel of the body within a
                      few units of the same colour

A few dozen matching pixels pins it exactly. Then: **the best-carrying frame pins the whole
group, and every other frame that is the same drawing follows it by correlation.** Do not pin each
frame independently — mood's chaingun has two flash frames, one matched on 392 pixels and the
other on 64, and pinning them separately put one flame 38 px below the other.

For a frame that carries nothing (a flame drawn clear of the barrel), fall back to something the
art itself says: its own middle over the topmost inked row of the body — the end of the barrel.

## The picture

One PNG per clip: every frame's silhouette tinted along a hue ramp and **added** over a dark
ground, with the frames in a strip at 1:1 underneath. Agreement comes out white; drift comes out
as a coloured fringe on one side. A stack that is white with thin coloured edges where the slide
moved is a clip on one anchor. Two whole silhouettes in two colours is the pistol bug.

Put them somewhere browsable (`docs/onionskin/<sheet>.<clip>.png`) and look at them. The number
says *whether*; the picture says *what*.

## Make it fast enough to gate

The naive measure is a Python set of coordinate tuples per shift and it costs seconds. Stay in
the C path:

```python
from PIL import Image, ImageChops
pad = window + 1                      # room to roll, so an offset never wraps ink onto itself
am, bm = mask(a), mask(b)             # '1' mode, alpha thresholded
miss = ImageChops.logical_xor(am, ImageChops.offset(bm, dx, dy)).histogram()[255] / (na + nb)
```

8x on mood's sheets — 6.0 s to 0.75 s, which is the difference between a gate that runs on every
`vitest` and one nobody runs. Gate only the sheets whose rule is "must not move"; the rest is for
the eye.

## The check it leaves behind

One row, shelling out to the tool, so the rule lives in one place and not two:

```ts
test('a held frame that is one drawing with its neighbour is on one anchor', () => {
  const r = spawnSync('python3', ['tools/onionskin.py', '--check'], { cwd: root, encoding: 'utf8' })
  expect(r.error ?? r.stderr).toBeFalsy()
  expect((JSON.parse(r.stdout) as { held: string[] }).held).toEqual([])
})
```

## Where a drift comes from, in order of likelihood

| What you see | What it is |
|---|---|
| The body slides side to side as the clip plays | each frame centred in its cell; the widest frame moves the rest |
| The body jumps up or down between frames | the frames were not bottom-aligned on one baseline before packing |
| An overlay is near the right place but offset the same way every frame | the overlay was placed by its cell, not by the body it belongs to |
| Two overlay frames far apart | each pinned on its own weak match instead of following the best one |
| The gate passes and it still looks wrong | the frames are different drawings (miss > 0.15) and the sheet is not the problem — the frame list or the timing is |

## Do not

- Do not "fix" a mob's walk by forcing its frames to zero drift. You will delete the sway.
- Do not hand-tune an offset you can measure. A number in a table that nobody can re-derive is a
  number that goes stale the next time the sheet is cut.
- Do not measure the cell when the view draws the cell somewhere else. If a flash is drawn at a
  per-frame offset, the shift that matters is the one left **after** that offset is applied —
  measure what lands on screen, not what sits in the file.
