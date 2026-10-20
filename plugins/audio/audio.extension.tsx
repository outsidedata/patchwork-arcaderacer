// audio's extension: the Sound panel, and the types of the sound fields.
//
// The panel (`audio.components.tsx`) works on the sound of the scene selected, else of the one the
// game view shows, else of the first scene with an audio row. It lists every `sound` entry of the
// scene's catalogue with a button that plays it, and `world.audio`'s cue table and loops, each change
// written into the scene file a value at a time as one undo: a cue's sounds, picked from the
// catalogue, its gain, its rate, its range and whether it cuts; a loop's sound, the field or the
// listener it follows or the field that names its sound, its ranges, its fade and its loop region,
// or a named loop's region for each song, added from the catalogue; and `space` and `screen`, the
// numbers render3d's and render2d's listeners fade placed sounds by, whichever the table gives. A
// cue's range stands in for the max of those, `space`'s where both are given, and starts from it.
// A loop is turned to play by another of its three ways as one undo, keeping its sound, its ranges
// and its loop region, or, turned from playing the sound a field names, with the catalogue's first
// sound over [0, 100] at a gain of [0, 1], as a loop added has; a field it is turned to read starts
// empty, reading nothing, and one turned to play the sound a field names fades over 1 s. A change
// the browser half would throw at is refused, said in the panel and the console, and written
// nowhere: a max distance (`space`'s or `screen`'s `max`, a cue's `range`) not above 0 and a `ref` or
// `rolloff` below 0; a loop whose `over` is one value, whose gain is NaN where what it follows
// stands at that value; and a cue taken out that a kind plays, which it throws at the first time
// the kind plays it: one named in a `sounds` table, at any depth, of a kind's entry in the
// definitions (`world.defs`) of a scene whose cue table this is, said with each kind and event. A
// cue is auditioned as an entry of it sounds. Playing goes through the game view's client's audio
// (`audition`), so only while the view shows that scene.
//
// The types, wherever an audio field is shown: a cue's sounds and a loop's sound are sounds of the
// scene's catalogue (`audio.sound`), a definition's, which is no scene's, of the catalogue of the
// scene `focus('loader')` says; a cue's gain is a slider from 0 to 2 (`audio.gain`); the
// model of `space` and of `screen` is one of the panner's distance models (`audio.model`).
import type { Editor } from '#editor/editor.ts'
import { Gain, Model, Sound, SoundName } from './audio.components.tsx'

export function audio(ed: Editor) {
  ed.panel({ id: 'audio', title: 'Sound', area: 'right', component: Sound })
  ed.field('audio.sound', SoundName)
  ed.field('audio.gain', Gain)
  ed.field('audio.model', Model)
  ed.bind('audio', { 'cues.*.sounds.*': 'audio.sound', 'loops.*.sound': 'audio.sound', 'cues.*.gain': 'audio.gain', 'space.model': 'audio.model', 'screen.model': 'audio.model' })
}
