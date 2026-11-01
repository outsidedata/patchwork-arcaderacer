# math

Deterministic transcendental maths: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `sinh`,
`cosh`, `tanh`, `asinh`, `acosh`, `atanh`, `exp`, `expm1`, `log`, `log1p`, `log2`, `log10`, `pow`,
`cbrt` and `hypot` that hand back the same double for the same arguments on node, in every browser
and in every version of either.

## Why use it

JavaScript leaves those `Math` functions to each engine, and engines differ in the last bit: node 22
against Chrome 157 differed on 2 to 16 in every 100 inputs of each but `hypot`. A page that runs a
scene ahead (`addons/predict`) steps the same rules as the server, so a rule that called `Math.sin`
ends a hair from the server's truth, and the hair grows. Every rule, every plugin's server half and
every mod calls `math` instead, so prediction, rewind and replay land on the same bits as the
server.

## How it works

Each function is written with `+`, `-`, `*`, `/` and `Math.sqrt` alone, which IEEE 754 rounds exactly
and every engine computes to the same bit, and integer work on the two 32-bit halves of a double.
They are fdlibm (Sun, 1993), ported line for line from V8 12.4's `src/base/ieee754.cc`; `hypot` is
V8's own (each argument scaled by the largest, the squares summed with Kahan's compensation, the root
scaled back). Each is within 1 ulp of the true value and takes and hands back what its `Math`
namesake does for NaN, ±0 and ±Infinity.

It has a server half only: no row, no `world.math`, nothing in `plugins`.

Core's three.js is a fork (`outsidedata/three.js`) whose `src/math/DeterministicMath.js` is this file
with its types taken out, its test pinning the same hashes, and every method of three's `src/math`
that turns an angle calls it, so a rule may use three's vectors, quaternions and matrices. A change
here is made there too, and the fork built and pinned again in `package.json`.

## Using it

```ts
import * as math from '#plugins/math/math.sim.ts'

const x = r * math.cos(a), y = r * math.sin(a)
const d = math.hypot(dx, dz)
const k = math.pow(base, n) // never base ** n in a rule
```

What `Math` computes exactly stays on `Math`: `sqrt`, `abs`, `floor`, `ceil`, `round`, `trunc`,
`sign`, `min`, `max`, `fround`, `imul`, `clz32`, `PI`, `E` and the other constants. A look and a
browser half only draw, and may use `Math`.

## Plugins it works with

Every plugin with a server half that does geometry imports it: **anim**, **box3d**, **box3dvehicle**,
**cover3d**, **cutscene**, **dismember3d**, **flight3d**, **grid**, **hitscan3d**, **interact**,
**mapgen**, **ragdoll3d**, **walker**, **terrain3d**, and the rest. The **predict** and **rewind**
addons are why it exists.

## Keywords

deterministic, determinism, cross-platform, bit-exact, floating point, IEEE 754, ulp, fdlibm, V8,
ieee754.cc, sin, cos, tan, atan2, exp, log, pow, hypot, cbrt, trigonometry, lockstep, prediction,
rollback, rewind, replay, desync, netcode, same result on every machine, three.js fork,
DeterministicMath
