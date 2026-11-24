import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { voicedTone } from "./mock-server-audio";

export const FAKE_MIC = path.resolve(__dirname, ".tmp/fake-mic.wav");

/** A voiced-tone WAV for Chrome's fake microphone. */
export default async function globalSetup() {
  mkdirSync(path.dirname(FAKE_MIC), { recursive: true });
  writeFileSync(FAKE_MIC, voicedTone(8, 0.4, 48000));
}
