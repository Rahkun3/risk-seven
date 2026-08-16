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

function normalize(out, peakTarget) {
  let peak = 0.0001;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = (peakTarget || 0.78) / peak;
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * g);
  return out;
}

function addTone(out, sr, start, dur, freq, amp, type) {
  const a0 = Math.floor(start * sr);
  const n = Math.floor(dur * sr);
  const attack = Math.min(Math.floor(sr * 0.006), (n * 0.15) | 0);
  const release = Math.min(Math.floor(sr * 0.04), (n * 0.4) | 0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let env = 1;
    if (i < attack) env = i / attack;
    else if (i > n - release) env = (n - i) / release;
    const ph = 2 * Math.PI * freq * t;
    let s = Math.sin(ph);
    if (type === "square") s = Math.sign(Math.sin(ph)) * 0.7 + Math.sin(ph) * 0.3;
    if (type === "saw") s = (2 * ((freq * t) % 1) - 1) * 0.55 + Math.sin(ph) * 0.2;
    const idx = a0 + i;
    if (idx >= 0 && idx < out.length) out[idx] += s * env * amp;
  }
}

function addHorn(out, sr, start, dur, freq, amp) {
  const a0 = Math.floor(start * sr);
  const n = Math.floor(dur * sr);
  const attack = Math.min(Math.floor(sr * 0.018), (n * 0.2) | 0);
  const release = Math.min(Math.floor(sr * 0.08), (n * 0.35) | 0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let env = 1;
    if (i < attack) env = i / attack;
    else if (i > n - release) env = (n - i) / release;
    const wobble = 1 + 0.012 * Math.sin(2 * Math.PI * 6 * t);
    const f = freq * wobble;
    const ph = 2 * Math.PI * f * t;
    const s =
      Math.sin(ph) * 0.42 +
      Math.sin(2 * ph) * 0.28 +
      Math.sin(3 * ph) * 0.22 +
      Math.sin(4 * ph) * 0.12 +
      Math.sin(5 * ph) * 0.1 +
      Math.sign(Math.sin(ph)) * 0.08;
    const rasp = (Math.random() * 2 - 1) * 0.035 * env;
    const idx = a0 + i;
    if (idx >= 0 && idx < out.length) out[idx] += (s * env + rasp) * amp;
  }
}

function renderBust() {
  const sr = 22050;
  const out = new Float32Array(Math.floor(sr * 0.72));
  addHorn(out, sr, 0.0, 0.24, 233, 0.55);
  addHorn(out, sr, 0.28, 0.38, 175, 0.62);
  return normalize(out, 0.82);
}

function crack(out, sr, start, dur, amp, rnd) {
  const a0 = Math.floor(start * sr);
  const n = Math.floor(dur * sr);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const white = rnd() * 2 - 1;
    prev = prev * 0.25 + white * 0.75;
    const hp = white - prev * 0.55;
    const env = Math.exp(-i / (sr * (dur * 0.35)));
    const idx = a0 + i;
    if (idx >= 0 && idx < out.length) out[idx] += hp * env * amp;
  }
}

function creak(out, sr, start, dur, f0, f1, amp) {
  const a0 = Math.floor(start * sr);
  const n = Math.floor(dur * sr);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const f = f0 + (f1 - f0) * u;
    const env = Math.sin(Math.PI * u) * Math.exp(-u * 1.6);
    const t = i / sr;
    const s = Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2.3 * t);
    const idx = a0 + i;
    if (idx >= 0 && idx < out.length) out[idx] += s * env * amp;
  }
}

function renderFreeze() {
  const sr = 22050;
  const out = new Float32Array(Math.floor(sr * 0.78));
  let s = 0x9e3779b9;
  const rnd = function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const rumble = Math.sin(2 * Math.PI * 58 * t) * Math.exp(-t * 5) * 0.1;
    out[i] += rumble;
  }

  crack(out, sr, 0.0, 0.055, 0.72, rnd);
  creak(out, sr, 0.03, 0.09, 920, 540, 0.16);
  crack(out, sr, 0.08, 0.03, 0.38, rnd);
  crack(out, sr, 0.14, 0.04, 0.48, rnd);
  creak(out, sr, 0.16, 0.11, 780, 320, 0.2);
  crack(out, sr, 0.26, 0.07, 0.82, rnd);
  creak(out, sr, 0.28, 0.14, 640, 210, 0.18);
  crack(out, sr, 0.36, 0.025, 0.32, rnd);
  crack(out, sr, 0.42, 0.05, 0.55, rnd);
  crack(out, sr, 0.5, 0.022, 0.28, rnd);
  crack(out, sr, 0.58, 0.03, 0.22, rnd);
  crack(out, sr, 0.66, 0.018, 0.16, rnd);

  return normalize(out, 0.8);
}

function addBell(out, sr, start, freq, amp) {
  const a0 = Math.floor(start * sr);
  const n = out.length - a0;
  if (n <= 0) return;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 4.2) * (t < 0.008 ? t / 0.008 : 1);
    const s =
      Math.sin(2 * Math.PI * freq * t) +
      0.38 * Math.sin(2 * Math.PI * freq * 2.01 * t) * Math.exp(-t * 8) +
      0.14 * Math.sin(2 * Math.PI * freq * 3.02 * t) * Math.exp(-t * 12);
    out[a0 + i] += s * env * amp;
  }
}

function renderChime() {
  const sr = 22050;
  const out = new Float32Array(Math.floor(sr * 0.95));
  addBell(out, sr, 0.0, 784, 0.28);
  addBell(out, sr, 0.09, 988, 0.3);
  addBell(out, sr, 0.18, 1318.5, 0.34);
  addBell(out, sr, 0.18, 1976, 0.1);
  return normalize(out, 0.74);
}

function renderCheer() {
  const sr = 22050;
  const out = new Float32Array(Math.floor(sr * 0.72));
  addBell(out, sr, 0.0, 523.25, 0.18);
  addBell(out, sr, 0.05, 659.25, 0.22);
  addBell(out, sr, 0.1, 783.99, 0.26);
  addBell(out, sr, 0.16, 1046.5, 0.32);
  addBell(out, sr, 0.16, 1568, 0.12);
  addBell(out, sr, 0.28, 1318.5, 0.16);
  return normalize(out, 0.76);
}

function renderSeven() {
  const sr = 22050;
  const out = new Float32Array(Math.floor(sr * 1.35));
  addBell(out, sr, 0.0, 523.25, 0.2);
  addBell(out, sr, 0.07, 659.25, 0.24);
  addBell(out, sr, 0.14, 783.99, 0.28);
  addBell(out, sr, 0.22, 1046.5, 0.34);
  addBell(out, sr, 0.22, 1318.5, 0.16);
  addHorn(out, sr, 0.34, 0.42, 392, 0.28);
  addHorn(out, sr, 0.42, 0.55, 523.25, 0.32);
  addBell(out, sr, 0.48, 1568, 0.22);
  addBell(out, sr, 0.56, 2093, 0.14);
  addBell(out, sr, 0.7, 1046.5, 0.18);
  return normalize(out, 0.8);
}

function renderClick() {
  const sr = 22050;
  const out = new Float32Array(Math.floor(sr * 0.07));
  addTone(out, sr, 0.0, 0.018, 1900, 0.28, "sine");
  addTone(out, sr, 0.0, 0.012, 3200, 0.16, "sine");
  for (let i = 0; i < Math.floor(sr * 0.012); i++) {
    out[i] += (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.003)) * 0.18;
  }
  return normalize(out, 0.7);
}

function renderDing() {
  const sr = 22050;
  const out = new Float32Array(Math.floor(sr * 0.85));
  [0, 0.18, 0.36].forEach((t) => {
    addBell(out, sr, t, 1318.5, 0.34);
    addBell(out, sr, t, 2637, 0.1);
  });
  return normalize(out, 0.76);
}

if (require.main === module) {
  const only = process.argv[2];
  if (only === "bust" || only === "freeze" || only === "yes" || only === "cheer" || only === "triple" || only === "click" || only === "seven") {
    const name = only === "yes" ? "yes.wav" : only + ".wav";
    const fn =
      only === "bust" ? renderBust :
      only === "freeze" ? renderFreeze :
      only === "cheer" ? renderCheer :
      only === "triple" ? renderDing :
      only === "click" ? renderClick :
      only === "seven" ? renderSeven :
      renderChime;
    fs.writeFileSync(path.join(outDir, name), encodeWav(fn(), 22050));
    console.log("wrote assets/" + name);
  } else {
    fs.writeFileSync(path.join(outDir, "bust.wav"), encodeWav(renderBust(), 22050));
    fs.writeFileSync(path.join(outDir, "freeze.wav"), encodeWav(renderFreeze(), 22050));
    fs.writeFileSync(path.join(outDir, "yes.wav"), encodeWav(renderChime(), 22050));
    console.log("wrote assets/bust.wav, assets/freeze.wav, and assets/yes.wav");
  }
}
