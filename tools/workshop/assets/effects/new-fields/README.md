# new-fields

One effect for each of particle3d's new fields (`plugins/particle3d/README.md`), the field off on the
left and on on the right, everything else the same. Each runs without end in the particle workshop:

```
yarn workshop particles --effects tools/workshop/assets/effects/new-fields/new-fields.json
```

which opens `http://127.0.0.1:5180/particles`. `new-fields.json` lists the six files; the effects named
`<field>-off` and `<field>-on` are the two halves, each carried by a still particle 3 m to one side.
`yarn particle-views tools/workshop/assets/effects/new-fields/new-fields.views.json <out folder>` takes
a picture of each.

| Effect | File | Left (off) | Right (on) |
| --- | --- | --- | --- |
| `tints` | life.json | `tint` to `tint1`: yellow straight to black | five colour stops: white, yellow, orange, red, near black |
| `alphas` | life.json | `a0` to `a1`: each puff pops in | fades in, holds, fades out |
| `grows` | life.json | `grow`: swells evenly | swells, shrinks, holds, swells again |
| `outward` | throwing.json | `speed` from a disc: any way | `outward` from a disc: a clean ring flying apart |
| `inherit` | throwing.json | sparks shed by a thrown ball hang where shed | `inherit` 1: the sparks fly on with the ball |
| `strength-range` | throwing.json | push strength 1: a hollow shell | strength `[0.1, 1]`: a filled ball |
| `direction` | push.json | a fountain | `direction` [3, 0, 0]: bent by a push along x |
| `range` | push.json | a pull reaches every particle | `range` 1.2: only those near the middle |
| `falloff` | push.json | `range` 1.6: everything inside is drawn in, a hard edge | `falloff` 4: drawn in less the farther out |
| `overLife` | push.json | gravity from birth | gravity from halfway through each spark's life |
| `overAge` | push.json | a push that stays on also throws the glows born at 0.6 s | `overAge`: the push ends at 0.2 s, the glows stay |
| `noiseAmplitude` | noise.json | an even lift: a flat top | lift scaled by noise: some lanes rise twice as fast |
| `turbulence` | noise.json | a straight plume | `turbulence`: the plume folds and billows |
| `noiseScroll` | noise.json | turbulence in still noise: fixed tendrils | the noise moving up: the tendrils writhe |
| `wind` | air.json | smoke slowed by still air | the same drag in a `wind`: carried off along x |
| `dragBySpeed` | air.json | plain drag: fast sparks fly far | `dragBySpeed`: the fast stop hard, all end near one radius |
| `shell` | shapes.json | a pull to a point: a ball | `shell` 1.2: a hollow sphere |
| `toAxis` | shapes.json | a pull to a point: a ball | `toAxis`: a vertical line |
| `tube` | shapes.json | `toAxis`: a line | `toAxis` and `shell` 1: a tube (seen from above) |
