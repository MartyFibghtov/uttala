// Runs the phone recogniser in a Web Worker so the page stays responsive during inference.
// Plain JavaScript in public/ on purpose: the bundler does not build worker entry points here.
// Spoken to only through loadSoundCheck() in src/lib/sound-check.ts. Keep the version in step with
// @huggingface/transformers in package.json.
import {
  AutoFeatureExtractor,
  AutoModelForCTC,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";

const MODEL = "onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX";
env.allowLocalModels = false;

let loading = null;

function load(onProgress) {
  loading ??= (async () => {
    const files = new Map();
    const progress_callback = (e) => {
      if (e.status !== "progress" || !e.file || !e.total) return;
      files.set(e.file, { loaded: e.loaded ?? 0, total: e.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      onProgress(loaded / Math.max(1, total));
    };
    const [fe, model, vocab] = await Promise.all([
      AutoFeatureExtractor.from_pretrained(MODEL),
      // q4 on WebAssembly: the same weights the calibration ran with, on every browser.
      AutoModelForCTC.from_pretrained(MODEL, { dtype: "q4", device: "wasm", progress_callback }),
      fetch(`https://huggingface.co/${MODEL}/resolve/main/vocab.json`).then((r) => r.json()),
    ]);
    const tokens = [];
    for (const [k, v] of Object.entries(vocab)) tokens[v] = k;
    return { fe, model, tokens };
  })().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

self.onmessage = async (e) => {
  const { id, type } = e.data;
  try {
    if (type === "load") {
      const { tokens } = await load((progress) => self.postMessage({ id, progress }));
      self.postMessage({ id, result: { tokens } });
    } else if (type === "logits") {
      const { fe, model } = await load(() => {});
      const { logits } = await model(await fe(e.data.samples));
      const [, frames, vocab] = logits.dims;
      const data = Float32Array.from(logits.data);
      self.postMessage({ id, result: { data, frames, vocab } }, [data.buffer]);
    }
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
