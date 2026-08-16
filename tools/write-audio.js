#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "..", "assets");

function encodeWav(samples, sampleRate) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, off);
    off += 2;
  }
  return buf;
}

function midi(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

function renderLoop() {
  const sr = 22050;
  const bpm = 108;
  const beats = 32;
  const beat = 60 / bpm;
  const n = Math.floor(sr * beats * beat);
  const out = new Float32Array(n);

  function add(i, v) {
    if (i >= 0 && i < n) out[i] += v;
  }

  function tone(freq, startBeat, durBeats, amp, kind) {
    const start = Math.floor(startBeat * beat * sr);
    const len = Math.floor(durBeats * beat * sr);
    const attack = Math.min(Math.floor(sr * (kind === "pad" ? 0.28 : kind === "bass" ? 0.02 : 0.012)), (len * 0.2) | 0);
    const release = Math.min(Math.floor(sr * (kind === "pad" ? 0.7 : 0.18)), (len * 0.5) | 0);
    const decay = kind === "lead" ? 2.6 : kind === "bass" ? 0.7 : 0.16;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      let env = 1;
      if (i < attack) env = i / attack;
      else if (i > len - release) env = (len - i) / release;
      env *= Math.exp(-t * decay);
      const ph = 2 * Math.PI * freq * t;
      let s;
      if (kind === "bass") {
        s = Math.sin(ph) * 0.9 + Math.sin(2 * ph) * 0.08;
      } else if (kind === "pad") {
        s = Math.sin(ph) + Math.sin(ph * 1.004) * 0.45 + Math.sin(2 * ph) * 0.12;
        s *= 0.4;
      } else {
        const dec = Math.exp(-t * 3.6);
        s = Math.sin(ph) + Math.sin(2 * ph) * 0.32 * dec + Math.sin(3 * ph) * 0.1 * dec * dec;
        s *= 0.34;
      }
      add(start + i, s * env * amp);
    }
  }

  function kick(startBeat, amp) {
    const start = Math.floor(startBeat * beat * sr);
    const len = Math.floor(sr * 0.14);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const f = 68 * Math.exp(-t * 14);
      add(start + i, Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 12) * amp);
    }
  }

  function hat(startBeat, dur, amp) {
    const start = Math.floor(startBeat * beat * sr);
    const len = Math.floor(sr * dur);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      prev = prev * 0.62 + white * 0.38;
      add(start + i, prev * Math.exp(-i / (sr * 0.024)) * amp);
    }
  }

  const chords = [
    [60, 64, 67, 71],
    [65, 69, 72, 76],
    [67, 71, 74, 79],
    [60, 64, 67, 72],
  ];
  const bass = [36, 41, 43, 36];
  for (let c = 0; c < 4; c++) {
    const start = c * 8;
    tone(midi(bass[c]), start, 3.6, 0.24, "bass");
    tone(midi(bass[c] + 7), start + 4, 1.7, 0.12, "bass");
    tone(midi(bass[c]), start + 6, 1.7, 0.16, "bass");
    chords[c].forEach((m, k) => tone(midi(m), start + 0.04, 7.6, 0.07 - k * 0.008, "pad"));
  }

  const melody = [
    [0, 72, 0.75], [1, 76, 0.75], [2, 79, 1], [3.5, 81, 0.5],
    [4, 79, 1], [5, 76, 1], [6, 72, 1.5],
    [8, 77, 0.75], [9, 81, 0.75], [10, 84, 1.5],
    [12, 81, 1], [13, 79, 1], [14, 77, 1.5],
    [16, 79, 0.75], [17, 83, 0.75], [18, 86, 1], [19.5, 84, 0.5],
    [20, 83, 1], [21, 79, 1], [22, 76, 1.5],
    [24, 72, 0.75], [25, 76, 0.75], [26, 79, 1], [27.5, 84, 0.5],
    [28, 79, 1], [29, 76, 1], [30, 72, 2],
  ];
  melody.forEach((row) => tone(midi(row[1]), row[0], row[2] * 0.9, 0.16, "lead"));

  for (let b = 0; b < beats; b++) {
    if (b % 4 === 0) kick(b, 0.13);
    else if (b % 4 === 2) kick(b, 0.07);
    hat(b + 0.5, 0.08, 0.034);
    if (b % 2 === 1) hat(b, 0.06, 0.02);
  }

  let peak = 0.0001;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = 0.62 / peak;
  const fade = Math.floor(sr * 0.08);
  for (let i = 0; i < n; i++) {
    let s = Math.tanh(out[i] * g);
    if (i < fade) s *= i / fade;
    if (i > n - fade) s *= (n - i) / fade;
    out[i] = s;
  }
  return { samples: out, sampleRate: sr };
}

const music = renderLoop();
fs.writeFileSync(path.join(outDir, "music.wav"), encodeWav(music.samples, music.sampleRate));
console.log("wrote assets/music.wav");
