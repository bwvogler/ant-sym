// The builder's sounds (PRD §71, ja-kjj8.5): each tool's own, made in the browser with WebAudio (no files, no dependency),
// and its name spoken with speechSynthesis where the device has a voice (Hiniker et al. 2015: pre-readers follow audio).
// Nothing plays before the player's first touch (the context is made in a gesture's handler) or while sound is off.

import type { TrayTool } from "./build.ts";

export type Cue = TrayTool | "undo" | "on" | "off";

const SOUND_KEY = "jevants.sound";

/** Whether sound is on (per browser; on unless turned off). */
export function soundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // no storage: it stays as it is for this page
  }
}

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const A =
    typeof window === "undefined"
      ? undefined
      : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!A) return null;
  try {
    ctx = new A();
  } catch {
    return null;
  }
  return ctx;
}

/** A tone gliding from f0 to f1 Hz over `dur` s. */
function tone(a: AudioContext, f0: number, f1: number, dur: number, type: OscillatorType, gain = 0.15, at = 0): void {
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Filtered noise for `dur` s: low for soil, high for rain. */
function noise(a: AudioContext, dur: number, freq: number, type: BiquadFilterType, gain = 0.25, at = 0): void {
  const t = a.currentTime + at;
  const n = Math.ceil(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

/** Play a cue. Call it from a touch or click handler (the first one makes the audio context). */
export function play(cue: Cue): void {
  if (!soundOn()) return;
  const a = audio();
  if (!a) return;
  if (a.state === "suspended") void a.resume();
  switch (cue) {
    case "move":
      tone(a, 500, 700, 0.08, "sine", 0.08);
      break;
    case "dig":
      noise(a, 0.18, 600, "lowpass", 0.35);
      break;
    case "dirt":
      noise(a, 0.22, 300, "lowpass", 0.4);
      tone(a, 120, 60, 0.15, "sine", 0.2);
      break;
    case "rock":
      tone(a, 180, 90, 0.12, "triangle", 0.25);
      break;
    case "sugar":
      tone(a, 1200, 1600, 0.12, "sine", 0.15);
      tone(a, 1800, 2200, 0.1, "sine", 0.1, 0.08);
      break;
    case "crumb":
      tone(a, 700, 900, 0.1, "sine", 0.15);
      break;
    case "crayon":
      tone(a, 900, 1300, 0.15, "square", 0.04);
      break;
    case "rain":
      noise(a, 0.5, 4000, "highpass", 0.15);
      break;
    case "undo":
      tone(a, 900, 300, 0.2, "sine", 0.12);
      break;
    case "on":
      tone(a, 400, 800, 0.15, "sine", 0.12);
      tone(a, 600, 1200, 0.15, "sine", 0.1, 0.1);
      break;
    case "off":
      tone(a, 800, 400, 0.2, "sine", 0.12);
      break;
  }
}

/** Say a tool's name, where the device has a voice. */
export function say(text: string): void {
  if (!soundOn()) return;
  try {
    const s = window.speechSynthesis;
    if (!s) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1.1;
    s.speak(u);
  } catch {
    // no voice: the picture and its sound still say it
  }
}
