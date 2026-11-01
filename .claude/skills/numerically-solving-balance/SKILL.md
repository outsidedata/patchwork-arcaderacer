---
name: numerically-solving-balance
description: Use in core, or any clone of it, when a game has several things that should be different but fair - racers, cars, fighters, classes, weapons, units, characters, builds - and their numbers have to be chosen so each has a clear strength, pays for it with a weakness, and every one is still worth picking. It covers balancing by playing the game's own rules numerically instead of by formula or by hand: a headless round played in a process of its own, an inner solver that finds each build's best clean play (canyonracer's corner solver), knobs read as shares of their ranges under one budget, a locked personality knob per thing, searching for the build nearest the designer's own numbers that hits one target outcome within a margin, the survey pass that finds the target every thing can reach, and the report by segment that shows where each strength pays. Triggers on "balance", "make them fair", "every car usable", "Mario Kart stats", "stat budget", "tradeoffs", "personality", "tier list", "one is too strong", "nobody picks X", "tune the roster", "same lap time", "solve the numbers".
---

# Numerically solving balance

## What is being solved

A roster of things that should feel different and be equally good: eight podracers, a set of
fighters, a class list, a garage of cars. Each has a few knobs (push, top speed, handling, braking;
damage, range, speed, health). The job is to choose every knob of every thing so that:

- each thing has a **clear strength**, a knob near the top of its range that is its personality;
- each pays for it with **weaknesses** elsewhere, so none is best at everything;
- **every thing is usable**: played well, each reaches the same outcome (the same lap time, the same
  win rate, the same time to kill);
- the strengths **show where they should**: the fast one gains on the straights, the nimble one in the
  corners.

Done by hand, this never settles. Change one knob and every matchup shifts. Done by formula ("speed
is worth 1.3 handling"), it is wrong: what a knob is worth depends on the course's shape, on how a
corner meets a jump, on how fast a thing arrives at the next obstacle. Those interactions are the game,
and the only thing that knows them is the game's own rules. So the numbers are found by **playing the
game**, thousands of times, with no screen, and searching.

## The method

Worked through on canyonracer (`games/canyonracer`, its `assets/open/corners.ts` and its journal).
Every piece below is a step a game's balance solver needs.

### 1. One round, played headless, the same every time

Boot the game's real scene under a manager of the solver's own, with only the thing being judged in it
(no rivals, nothing random that isn't seeded), and step the truth until the round ends: a lap, a fight,
a wave. The same inputs must give the same result every run, or no search converges.

Play each round in a node process of its own. The loader keeps each file it read for the life of its
process, and a physics library holds a world per truth until it is collected; a fresh process reads
the data as it now stands and leaks nothing. In canyonracer one 35 second lap plays in 0.4 seconds of
wall time, so a search of hundreds of builds is minutes, not hours. Time one round before planning the
search; never estimate it.

A round returns what happened: its outcome (the lap's time) and, where it failed, where and how (the
crash, its place, its speed), which is what the next step searches on.

### 2. An inner solver: every build at its best clean play

A build is not judged by how a fixed AI happens to drive it. A fast pod driven like a slow one crashes;
a slow one driven like a fast one wastes its strength. So before a build is scored, an inner solver
finds the best play **that build** can make: canyonracer's corner solver plays a lap, and at every
crash lowers the speed allowed through the corner it crashed in, a binary search between a speed that
crashed and one that held, the earliest corner on the lap first, until a whole lap runs clean. Since
slowing always fixes an understeer crash, it always ends.

Whatever the game is, the inner solver is the thing that turns "these numbers" into "these numbers,
played as well as they can be": the corners a racer brakes for, the range a fighter keeps, the moment a
unit retreats. It is solved per build, and kept with the build, since the game's AI plays from it.

Some builds cannot be played clean at all (in canyonracer, low braking and low handling come off one
jump too fast to land, however slow they take the corners before it). Such a build is **infeasible**;
the search skips it and says why. Read a few of those failures yourself: they tell you whether it is the
build that cannot work or the inner solver that is missing a move.

### 3. Knobs as shares of ranges, one budget

Each knob has a range in the roster's data file (canyonracer: `ranges` in
`assets/pod/podracers/podracers.json`). A knob's value is read as its **share** of its range, 0 at the
low end, 1 at the high. Every thing's shares add up to the same **budget** (canyonracer: 2 out of 4
knobs). A strength in one knob is paid for in the others, in units every knob shares.

The ranges are the design: they say what "slow" and "fast" mean in this game. A knob whose range is too
narrow is a weak personality, since its whole range buys little; the survey (step 6) shows it as the
things locked on it reaching only the slow end of the window.

### 4. A locked personality per thing

Each thing names the knob that is its personality (`personality` in the roster file), and that knob
keeps the designer's own value. The search moves only the others, inside the budget. This is what keeps
a personality from being washed out: without it, a search for "equally good" pulls every thing toward
the same middle build.

### 5. Aim at one target outcome, not the best

The search's goal is **not** the fastest build. The fastest build of every thing is the same corner
of the space, and the roster collapses. The goal is: an outcome within a **margin** of one **target**,
the same for every thing, and among the builds that get there, the one **nearest the designer's own
numbers** (the distance between their shares). The target and margin are numbers in the solver's data
file (canyonracer: `target` and `margin` in `assets/open/corners.json`).

Search in order of distance from the designer's numbers, and stop at the first build that hits: with
the free knobs stepped `step` apart and the last knob making up the budget, that is a few dozen builds
for each thing, and things are searched in parallel, one a core.

### 6. The survey: find the target every thing can reach

The target is not guessed. Run the search once with a margin of 0, so no build hits and every thing
plays its whole grid, and have the report print each thing's fastest and slowest outcome. The target
lies in the window every thing can reach: from the slowest of their fastest to the fastest of their
slowest (canyonracer: 49.7 to 55.2 s; the target 52 s, its middle). A thing whose window misses the
others' is a design fact to report, not something to hide by moving the target.

### 7. Report by segment, so the strengths can be seen

An equal total says nothing about personality. Split each round into segments (canyonracer: the
stretches between the gates) and report each thing's time over each against the field's mean. Each thing
should be ahead somewhere and behind somewhere else, and where it is ahead should match its personality:
the top-speed pods gain on the plains, the handling pods through the twisting stretch. A thing ahead
everywhere or behind everywhere is unbalanced however its total reads.

The report is one table: each thing, its personality, every knob (the locked one marked), its shares'
sum (proving the budget), its outcome, and its segments with their difference from the field.

### 8. Keep what was found

Each thing's found build is written into the game's definitions, and its inner solution (canyonracer's
corners) into the data file the game's AI reads. The game then plays exactly what was measured.

## What to watch in the result

- **Twins**: two things locked on the same knob can land on nearly the same build and the same segment
  profile (canyonracer: Slagjaw and Overlord). Their personalities need a second difference, in their
  own numbers or their locked knob.
- **Degenerate play**: a build can hit the target by crawling through one hard segment and flying the
  rest (canyonracer: Longhaul at 8.5 m/s through one jump). It is legal and it is fair, and it may not
  be fun; the segment report is where it shows.
- **Weak personalities**: the things locked on one knob all at the slow end of the survey window means
  that knob's range buys too little.
- **Infeasible regions**: a large share of builds failing points at one place on the course or one move
  the inner solver lacks; read the failures before widening anything.

## Where it goes in a game

By the prime directive: the solver is a script kept in `assets/` beside the data it writes, run by hand
from the repo's root, never read by the game. Every number it uses (ranges, budget, personalities,
target, margin, step, how many at a time) is in a data file, never in the script. Its findings go into
the definitions and the data files the game already reads. It runs the game's real rules through the
real scene, never a copy of them.

It is "done" when every thing hits the target within the margin, every locked knob is its own value,
every budget sums the same, the segments show each thing ahead and behind, and the race has been played
in the game and watched.
