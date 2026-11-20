// Downloads the phone-recognition model used by the server (src/lib/server/phone-model.ts) into
// <dir>/<model id>/. Run at image build time (see Dockerfile): the image carries the weights, so the
// server never downloads anything at runtime. Usage: node scripts/fetch-model.mjs [dir]  (default .data/models)
// The files are exactly what transformers.js reads for this model: config.json and preprocessor_config.json,
// vocab.json (read by the server) and onnx/model_q4.onnx (dtype "q4").
import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const MODEL = "onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX";
const FILES = ["config.json", "preprocessor_config.json", "vocab.json", "onnx/model_q4.onnx"];
const out = process.argv[2] || ".data/models";

for (const file of FILES) {
  const dest = join(out, MODEL, file);
  const url = `https://huggingface.co/${MODEL}/resolve/main/${file}`;
  const existing = await stat(dest).catch(() => null);
  if (existing && existing.size > 0) {
    console.log(`have ${file}`);
    continue;
  }
  await mkdir(dirname(dest), { recursive: true });
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const expected = Number(res.headers.get("content-length") ?? 0);
      const tmp = `${dest}.part`;
      await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
      const size = (await stat(tmp)).size;
      if (size === 0 || (expected && size !== expected)) throw new Error(`incomplete download (${size} of ${expected} bytes)`);
      await rename(tmp, dest);
      console.log(`fetched ${file} (${(size / 1e6).toFixed(1)} MB)`);
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err;
      await rm(`${dest}.part`, { force: true });
      console.warn(`${file}: attempt ${attempt} failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  if (lastError) {
    console.error(`Could not download ${file}`);
    process.exit(1);
  }
}
