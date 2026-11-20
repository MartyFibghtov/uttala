function wav(samples: Float32Array, rate: number): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 0x7fff * 0.6), 44 + i * 2);
  }
  return buf;
}

/** Voiced tone: harmonic stack, f0 gliding 110..170 Hz per word, short gap between words. */
export function voicedTone(words: number, perWord = 0.35, rate = 24000): Buffer {
  const total = Math.max(1, words) * perWord;
  const n = Math.floor(total * rate);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const w = Math.floor(t / perWord);
    const local = (t - w * perWord) / perWord;
    const f0 = 110 + 60 * Math.sin(Math.PI * local) + (w % 2) * 20;
    phase += (2 * Math.PI * f0) / rate;
    let v = 0;
    for (let h = 1; h <= 6; h++) v += Math.sin(h * phase) / h;
    const env = local < 0.08 ? local / 0.08 : local > 0.9 ? Math.max(0, (1 - local) / 0.1) : 1;
    out[i] = v * 0.4 * env;
  }
  return wav(out, rate);
}


