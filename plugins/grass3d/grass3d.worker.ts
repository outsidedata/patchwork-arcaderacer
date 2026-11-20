// A worker of grass3d's browser half (`grass3d.plugin.ts`, Workers): it holds the land the page last sent
// and fills the blocks the page asks for, with the same arithmetic the page runs, so a block is the same to
// the bit (`grass3d.blocks.ts`, which says what is sent each way).
import { holder, serve, type Answer, type Asked } from './grass3d.blocks.ts'

const send = (globalThis as unknown as { postMessage(message: Answer, transfer: Transferable[]): void }).postMessage.bind(globalThis)
const h = holder()

globalThis.addEventListener('message', (e: Event) => { void serve(h, (e as MessageEvent).data as Asked, send) })
