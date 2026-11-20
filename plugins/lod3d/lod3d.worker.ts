// A worker of lod3d's browser half (`lod3d.plugin.ts`, Workers): it holds the layers and surfaces the page
// last sent and works the tiles the page asks for, with the same arithmetic the page and the server run
// (`lod3d.tiles.ts`, which says what is sent each way).
import { holder, serve, type Answer, type Asked } from './lod3d.tiles.ts'

const send = (globalThis as unknown as { postMessage(message: Answer): void }).postMessage.bind(globalThis)
const h = holder()

globalThis.addEventListener('message', (e: Event) => serve(h, (e as MessageEvent).data as Asked, send))
