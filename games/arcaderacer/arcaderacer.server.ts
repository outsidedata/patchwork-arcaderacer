// The manager and its scenes in one process, behind one socket. Each socket is one connection: one
// seat, entering the scene the manager row names as `entry`, behind the game's match addon, which
// holds who races.
import { boot, type Scene } from '#engine/engine.ts'
import { load, manager, run } from '#addons/scenemanager/scenemanager.addon.ts'
import { serve } from '#addons/socket/socket.addon.ts'
import { match } from './addons/match/match.addon.ts'
import { sim } from './arcaderacer.sim.ts'
import file from './arcaderacer.scene.json' with { type: 'json' }

const scene = file as Scene
const truth = boot(scene, sim)
await load(truth, import.meta.url)
await serve(manager(truth).data.port, match(manager(truth)))
run(truth)
