import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Multilingual phone recogniser (wav2vec2 CTC, q4 weights, ~240 MB) run on the server with onnxruntime-node.
 * Same model and weights the calibration scripts use. The weights come from SOUND_MODEL_DIR (baked into the
 * Docker image by scripts/fetch-model.mjs); without it they are downloaded once into .data/models.
 */
export const PHONE_MODEL = "onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX";

type Loaded = {
  fe: (samples: Float32Array) => Promise<unknown>;
  model: (inputs: unknown) => Promise<{ logits: { dims: number[]; data: ArrayLike<number> } }>;
  tokens: string[];
};

let loading: Promise<Loaded> | null = null;

async function load(): Promise<Loaded> {
  const { AutoFeatureExtractor, AutoModelForCTC, env } = await import("@huggingface/transformers");
  const dir = process.env.SOUND_MODEL_DIR?.trim() || join(process.cwd(), ".data", "models");
  const local = existsSync(join(dir, PHONE_MODEL, "onnx", "model_q4.onnx"));
  let vocab: Record<string, number>;
  if (local) {
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = dir.endsWith("/") ? dir : `${dir}/`;
    vocab = JSON.parse(await readFile(join(dir, PHONE_MODEL, "vocab.json"), "utf8"));
  } else {
    // Development: download once and keep it under .data/models.
    env.allowLocalModels = false;
    env.cacheDir = dir;
    vocab = await (await fetch(`https://huggingface.co/${PHONE_MODEL}/resolve/main/vocab.json`)).json();
  }
  const [fe, model] = await Promise.all([
    AutoFeatureExtractor.from_pretrained(PHONE_MODEL),
    AutoModelForCTC.from_pretrained(PHONE_MODEL, { dtype: "q4" }),
  ]);
  const tokens: string[] = [];
  for (const [k, v] of Object.entries(vocab)) tokens[v] = k;
  return { fe: fe as Loaded["fe"], model: model as unknown as Loaded["model"], tokens };
}

/** Lazy singleton: the first call loads the model, later calls share it. A failed load is retried. */
export function phoneModel(): Promise<Loaded> {
  loading ??= load().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

/** Start loading in the background (called when the server starts). Errors surface on first use. */
export function warmPhoneModel(): void {
  const started = Date.now();
  phoneModel()
    .then(() => console.log(`[sound-model] ready in ${Date.now() - started}ms`))
    .catch((err) => console.error("Sound model failed to load:", err));
}

// Inference is CPU bound and uses every core: run one at a time and keep a short waiting line.
const CONCURRENCY = Math.max(1, Number(process.env.SOUND_MODEL_CONCURRENCY) || 1);
const MAX_WAITING = 12;
let running = 0;
const waiting: (() => void)[] = [];

export class BusyError extends Error {}

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= CONCURRENCY) {
    if (waiting.length >= MAX_WAITING) throw new BusyError("busy");
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else running++;
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

/** Per-frame output scores for 16 kHz mono samples: row-major [frames x vocab]. */
export function runPhoneModel(samples: Float32Array): Promise<{ data: Float32Array; frames: number; vocab: number }> {
  return slot(async () => {
    const { fe, model } = await phoneModel();
    const { logits } = await model(await fe(samples));
    const [, frames, vocab] = logits.dims;
    return { data: Float32Array.from(logits.data), frames, vocab };
  });
}
