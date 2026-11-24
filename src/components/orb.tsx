"use client";

import { Check, Ear, Loader, Pause, Sparkles, Volume2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export type OrbPalette = "gold" | "ember" | "orchid" | "sky" | "moss";
export type OrbVariant = "eleven-tuned" | "eleven-ui" | "eleven-convai" | "eleven-vivid";
export type AgentState = "talking" | "listening" | "thinking" | "idle";

export interface OrbVariantInfo {
  id: OrbVariant;
  index: string;
  shortLabel: string;
  title: string;
  tagline: string;
  shaderNote: string;
  smallCircleNote: string;
}

export const ORB_VARIANTS: readonly OrbVariantInfo[] = [
  {
    id: "eleven-tuned",
    index: "01",
    shortLabel: "Liquid Wave",
    title: "ElevenLabs Liquid Wave",
    tagline: "Soft 3D liquid sphere with an undulating wave pocket and state-reactive flow.",
    shaderNote: "[Light -> Deep] color ramp + crisp 0.012 sharpRing wave ridge & center cushion",
    smallCircleNote: "Zero radial pinwheel pinch; responsive wave speed across Talking / Listening / Thinking",
  },
  {
    id: "eleven-ui",
    index: "02",
    shortLabel: "UI + Bezel",
    title: "ElevenLabs UI + Recessed Bezel",
    tagline: "elevenlabs/ui orb.tsx look framed inside its recessed circular bezel.",
    shaderNote: "Silky 0.12 oval gradient blend, soft 0.62 edges & dark-mode velvet rim inversion",
    smallCircleNote: "Recessed glass bezel frames small circles cleanly on both dark and light stages",
  },
  {
    id: "eleven-convai",
    index: "03",
    shortLabel: "Deep Flow",
    title: "ElevenLabs Deep Ribbon Flow",
    tagline: "Richer internal Perlin swirl with a gentle volume scale pulse on speech.",
    shaderNote: "Higher Perlin angular swirl (uFlowMax = 0.42) & richer lobe contrast (0.20)",
    smallCircleNote: "Subtle syllable scale pulse (1.0 -> 1.045x) without any vertical bobbing",
  },
  {
    id: "eleven-vivid",
    index: "04",
    shortLabel: "Soft Cloud",
    title: "ElevenLabs Soft Silk Cloud",
    tagline: "Extra-soft wave pocket feathering and fluid inner cloud motion.",
    shaderNote: "Feathered wave pocket (0.032) + wide Perlin swirl & smooth cloud overlaps",
    smallCircleNote: "Ultra-smooth organic liquid motion tuned for small inline indicators",
  },
] as const;

const PALETTE_COLORS: Record<OrbPalette, readonly [string, string]> = {
  gold: ["#F9E8C8", "#B8823B"],
  orchid: ["#EAD8FF", "#7B52AB"],
  sky: ["#D2E8FF", "#4B83C8"],
  ember: ["#FBD8C8", "#C46042"],
  moss: ["#D2F2E2", "#478E6E"],
};

const PALETTE_SEED: Record<OrbPalette, number> = {
  gold: 1007,
  orchid: 2017,
  sky: 3023,
  ember: 4049,
  moss: 5059,
};

function hexToLinearRgb(hex: string): [number, number, number] {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)];
}

function splitmix32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

// --- Shared Interactive Store (hydrates safely after mount) -----------------

const VARIANT_STORAGE_KEY = "sayclear:orb-variant-v2";
const AGENT_STORAGE_KEY = "sayclear:orb-agent-v2";

const DEFAULT_VARIANT: OrbVariant = "eleven-vivid";
const DEFAULT_AGENT: AgentState = "idle";

interface OrbStoreState {
  variant: OrbVariant;
  agentState: AgentState;
}

let storeState: OrbStoreState = { variant: DEFAULT_VARIANT, agentState: DEFAULT_AGENT };
let storeHydrated = false;
const storeListeners = new Set<() => void>();

const isValidVariant = (v: unknown): v is OrbVariant =>
  v === "eleven-tuned" || v === "eleven-ui" || v === "eleven-convai" || v === "eleven-vivid";

const isValidAgent = (a: unknown): a is AgentState =>
  a === "talking" || a === "listening" || a === "thinking" || a === "idle";

function emitStore() {
  for (const l of storeListeners) l();
}

function hydrateStoreOnce() {
  if (storeHydrated || typeof window === "undefined") return;
  storeHydrated = true;
  try {
    const savedVariant = window.localStorage.getItem(VARIANT_STORAGE_KEY);
    const savedAgent = window.localStorage.getItem(AGENT_STORAGE_KEY);
    const nextVariant = isValidVariant(savedVariant) ? savedVariant : storeState.variant;
    const nextAgent = isValidAgent(savedAgent) ? savedAgent : storeState.agentState;
    if (nextVariant !== storeState.variant || nextAgent !== storeState.agentState) {
      storeState = { variant: nextVariant, agentState: nextAgent };
      emitStore();
    }
  } catch {
    // Ignore storage errors in restricted contexts.
  }
}

export function setOrbVariant(variant: OrbVariant) {
  if (storeState.variant === variant) return;
  storeState = { ...storeState, variant };
  try {
    window.localStorage.setItem(VARIANT_STORAGE_KEY, variant);
  } catch {
    // Ignore storage write errors.
  }
  emitStore();
}

export function setOrbAgentState(agentState: AgentState) {
  if (storeState.agentState === agentState) return;
  storeState = { ...storeState, agentState };
  try {
    window.localStorage.setItem(AGENT_STORAGE_KEY, agentState);
  } catch {
    // Ignore storage write errors.
  }
  emitStore();
}

const subscribeStore = (listener: () => void) => {
  storeListeners.add(listener);
  return () => storeListeners.delete(listener);
};

const getSnapshot = () => storeState;
const SERVER_SNAPSHOT: OrbStoreState = { variant: DEFAULT_VARIANT, agentState: DEFAULT_AGENT };
const getServerSnapshot = () => SERVER_SNAPSHOT;

export function useOrbSettings(): OrbStoreState {
  const state = useSyncExternalStore(subscribeStore, getSnapshot, getServerSnapshot);
  useEffect(() => {
    hydrateStoreOnce();
    const onStorage = (e: StorageEvent) => {
      if (e.key === VARIANT_STORAGE_KEY && isValidVariant(e.newValue)) {
        storeState = { ...storeState, variant: e.newValue };
        emitStore();
      } else if (e.key === AGENT_STORAGE_KEY && isValidAgent(e.newValue)) {
        storeState = { ...storeState, agentState: e.newValue };
        emitStore();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return state;
}

// --- ElevenLabs WebGL2 Shader Engine (single shared GPU context) ------------

const VERTEX_SHADER_SRC = `#version 300 es
precision highp float;

in vec2 position;
out vec2 vUv;

void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

// Authentic ElevenLabs polar oval + Perlin flow + dual ring + 4-stop colorRamp shader,
// parameterized via uniforms so each variant tunes cleanly for small circular entities.
const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAnimation;
uniform float uRingTime;
uniform float uSpinAngle;
uniform float uThinkingMix;
uniform float uInverted;
uniform float uOffsets[7];
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uInputVolume;
uniform float uOutputVolume;
uniform float uOpacity;
uniform sampler2D uPerlinTexture;

// Variant-specific tuning uniforms for small circles
uniform float uOvalBaseA;
uniform float uOvalVarA;
uniform float uOvalMaxB;
uniform float uOvalMinB;
uniform float uOvalSoftness;
uniform float uOvalGradMix;
uniform float uOvalAlpha;
uniform float uFlowMin;
uniform float uFlowMax;
uniform float uFlowRadial;
uniform float uRingStart1;
uniform float uRingStart2;
uniform float uRingWidth1;
uniform float uRingWidth2;
uniform float uRingSharpness;
uniform float uRingSmooth;
uniform float uRingOpacityBoost;
uniform float uDarkStopMix;
uniform float uEdgeFeather;

in vec2 vUv;
out vec4 outColor;

const float PI = 3.14159265358979323846;

bool drawOval(
  vec2 polarUv,
  vec2 polarCenter,
  float a,
  float b,
  bool reverseGradient,
  float softness,
  float gradMix,
  out vec4 color
) {
  vec2 p = polarUv - polarCenter;
  float oval = (p.x * p.x) / max(0.0001, a * a) + (p.y * p.y) / max(0.0001, b * b);
  float edge = smoothstep(1.0, 1.0 - softness, oval);

  if (edge > 0.0) {
    float gradient = reverseGradient ? (1.0 - (p.x / a + 1.0) / 2.0) : ((p.x / a + 1.0) / 2.0);
    gradient = mix(0.5, gradient, gradMix);
    color = vec4(vec3(gradient), uOvalAlpha * edge);
    return true;
  }
  return false;
}

vec3 colorRamp(float grayscale, vec3 color1, vec3 color2, vec3 color3, vec3 color4) {
  if (grayscale < 0.33) {
    return mix(color1, color2, grayscale * 3.0);
  } else if (grayscale < 0.66) {
    return mix(color2, color3, (grayscale - 0.33) * 3.0);
  } else {
    return mix(color3, color4, (grayscale - 0.66) * 3.0);
  }
}

vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  vec2 u = f * f * (3.0 - 2.0 * f);
  float n = mix(
    mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y
  );

  return 0.5 + 0.5 * n;
}

float sharpRing(vec3 decomposed, float time) {
  float noiseScale = 5.0;
  float noise = mix(
    noise2D(vec2(decomposed.x, time) * noiseScale),
    noise2D(vec2(decomposed.y, time) * noiseScale),
    decomposed.z
  );
  noise = (noise - 0.5) * 2.5;
  return uRingStart1 + noise * uRingWidth1 * 1.5;
}

float smoothRing(vec3 decomposed, float time) {
  float noiseScale = 6.0;
  float noise = mix(
    noise2D(vec2(decomposed.x, time) * noiseScale),
    noise2D(vec2(decomposed.y, time) * noiseScale),
    decomposed.z
  );
  noise = (noise - 0.5) * 5.0;
  return uRingStart2 + noise * uRingWidth2;
}

float flow(vec3 decomposed, float time) {
  return mix(
    texture(uPerlinTexture, vec2(time, decomposed.x / 2.0)).r,
    texture(uPerlinTexture, vec2(time, decomposed.y / 2.0)).r,
    decomposed.z
  );
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float radius = length(uv);
  float rawTheta = atan(uv.y, uv.x);
  float theta = mod(rawTheta - uSpinAngle + 2.0 * PI, 2.0 * PI);

  vec3 decomposed = vec3(
    theta / (2.0 * PI),
    mod(theta / (2.0 * PI) + 0.5, 1.0) + 1.0,
    abs(theta / PI - 1.0)
  );

  float centerCushion = smoothstep(0.0, 0.3, radius);

  float flowNoise = flow(decomposed, radius * uFlowRadial - uAnimation * 0.24) - 0.5;
  theta += flowNoise * mix(uFlowMin, uFlowMax, uOutputVolume) * mix(0.35, 1.0, centerCushion);

  vec4 color = vec4(1.0, 1.0, 1.0, 1.0);

  float centers[7];
  for (int i = 0; i < 7; i++) {
    float baseAngle = float(i) * (2.0 * PI / 7.0);
    centers[i] = mod(baseAngle + 0.65 * sin(uTime * 0.35 + uOffsets[i]), 2.0 * PI);
  }

  for (int i = 0; i < 7; i++) {
    float n = texture(
      uPerlinTexture,
      vec2(mod(centers[i] * 0.15915 + uTime * 0.05, 1.0), 0.17 + float(i) * 0.1)
    ).r;
    float a = uOvalBaseA + n * uOvalVarA;
    float b = (0.52 + n * 0.72) * mix(uOvalMaxB, uOvalMinB, uInputVolume);
    bool reverseGradient = (i % 2 == 1);

    float distTheta = min(
      abs(theta - centers[i]),
      min(
        abs(theta + 2.0 * PI - centers[i]),
        abs(theta - 2.0 * PI - centers[i])
      )
    );
    float effThetaDist = distTheta * mix(0.15, 1.0, centerCushion);
    vec4 ovalColor;
    if (drawOval(vec2(effThetaDist, radius), vec2(0.0, 0.0), a, b, reverseGradient, uOvalSoftness, uOvalGradMix * centerCushion, ovalColor)) {
      color.rgb = mix(color.rgb, ovalColor.rgb, ovalColor.a);
      color.a = max(color.a, ovalColor.a);
    }
  }

  // Organic 2D liquid cloud billows from Perlin noise so the interior flows like orb-1.mp4
  float innerCloud = flow(decomposed, radius * 0.42 - uAnimation * 0.18) - 0.5;
  float crossCloud = flow(decomposed, radius * 0.26 + uTime * 0.07) - 0.5;
  float cloudShift = (innerCloud * 0.7 + crossCloud * 0.3) * mix(0.42, 0.78, uOutputVolume);
  color.rgb = clamp(color.rgb + vec3(cloudShift * (1.0 - radius * 0.18)), 0.06, 0.94);

  float ringRadius1 = sharpRing(decomposed, uRingTime);
  float ringRadius2 = smoothRing(decomposed, uRingTime);

  float inputRadius1 = radius + uInputVolume * 0.2;
  float inputRadius2 = radius + uInputVolume * 0.15;
  float opacity1 = clamp(mix(0.2, 0.6, uInputVolume) * uRingOpacityBoost, 0.0, 0.92);
  float opacity2 = clamp(mix(0.15, 0.45, uInputVolume) * uRingOpacityBoost, 0.0, 0.88);

  float ringAlpha1 = smoothstep(ringRadius1 - uRingSharpness, ringRadius1 + uRingSharpness, inputRadius2) * opacity1;
  float ringAlpha2 = smoothstep(ringRadius2 - uRingSmooth, ringRadius2 + uRingSmooth, inputRadius1) * opacity2;
  float totalRingAlpha = max(ringAlpha1, ringAlpha2);

  vec3 ringColor = vec3(1.0);
  color.rgb = 1.0 - (1.0 - color.rgb) * (1.0 - ringColor * totalRingAlpha);

  if (uThinkingMix > 0.001) {
    // Gentle loading-spinner orbital crescent traveling smoothly around the sphere
    float arcAngle = mod(rawTheta - uSpinAngle + 4.0 * PI, 2.0 * PI);
    float arcTail = smoothstep(PI * 1.35, 0.0, arcAngle) * smoothstep(0.0, 0.28, arcAngle);
    float band = smoothstep(0.32, 0.62, radius) * (1.0 - smoothstep(0.78, 0.96, radius));
    float spinnerGlow = arcTail * band * uThinkingMix;
    float wake = smoothstep(0.15, 0.55, arcAngle) * smoothstep(PI * 1.9, PI * 0.95, arcAngle) * band * uThinkingMix;
    color.rgb = mix(color.rgb, vec3(0.96), spinnerGlow * 0.36);
    color.rgb = mix(color.rgb, color.rgb * 0.8, wake * 0.24);
  }

  vec3 color1 = uColor2 * uDarkStopMix;
  vec3 color2 = uColor1;
  vec3 color3 = uColor2;
  vec3 color4 = vec3(1.0, 1.0, 1.0);

  float luminance = mix(color.r, 1.0 - color.r, uInverted);
  vec3 linearRgb = colorRamp(luminance, color1, color2, color3, color4);

  // Encode linear RGB back to sRGB to match Three.js output color management
  color.rgb = pow(clamp(linearRgb, 0.0, 1.0), vec3(1.0 / 2.2));

  // Crisp anti-aliased circular mask inside the shader
  float circleMask = 1.0 - smoothstep(1.0 - uEdgeFeather, 1.0, radius);
  color.a *= uOpacity * circleMask;

  outColor = color;
}
`;

interface VariantShaderParams {
  ovalBaseA: number;
  ovalVarA: number;
  ovalMaxB: number;
  ovalMinB: number;
  ovalSoftness: number;
  ovalGradMix: number;
  ovalAlpha: number;
  flowMin: number;
  flowMax: number;
  flowRadial: number;
  ringStart1: number;
  ringStart2: number;
  ringWidth1: number;
  ringWidth2: number;
  ringSharpness: number;
  ringSmooth: number;
  ringOpacityBoost: number;
  darkStopMix: number;
  edgeFeather: number;
  allowInvert: boolean;
  volumeScaleAmp: number;
}

const VARIANT_PARAMS: Record<OrbVariant, VariantShaderParams> = {
  "eleven-tuned": {
    ovalBaseA: 0.82,
    ovalVarA: 0.36,
    ovalMaxB: 2.8,
    ovalMinB: 2.1,
    ovalSoftness: 0.72,
    ovalGradMix: 0.1,
    ovalAlpha: 0.86,
    flowMin: 0.16,
    flowMax: 0.4,
    flowRadial: 0.18,
    ringStart1: 1.0,
    ringStart2: 0.9,
    ringWidth1: 0.26,
    ringWidth2: 0.18,
    ringSharpness: 0.014,
    ringSmooth: 0.055,
    ringOpacityBoost: 0.92,
    darkStopMix: 0.24,
    edgeFeather: 0.035,
    allowInvert: false,
    volumeScaleAmp: 0,
  },
  "eleven-ui": {
    ovalBaseA: 0.84,
    ovalVarA: 0.34,
    ovalMaxB: 2.9,
    ovalMinB: 2.15,
    ovalSoftness: 0.72,
    ovalGradMix: 0.1,
    ovalAlpha: 0.86,
    flowMin: 0.14,
    flowMax: 0.36,
    flowRadial: 0.14,
    ringStart1: 1.0,
    ringStart2: 0.9,
    ringWidth1: 0.26,
    ringWidth2: 0.18,
    ringSharpness: 0.016,
    ringSmooth: 0.06,
    ringOpacityBoost: 0.88,
    darkStopMix: 0.16,
    edgeFeather: 0.03,
    allowInvert: true,
    volumeScaleAmp: 0,
  },
  "eleven-convai": {
    ovalBaseA: 0.78,
    ovalVarA: 0.44,
    ovalMaxB: 3.0,
    ovalMinB: 2.2,
    ovalSoftness: 0.68,
    ovalGradMix: 0.18,
    ovalAlpha: 0.88,
    flowMin: 0.2,
    flowMax: 0.48,
    flowRadial: 0.22,
    ringStart1: 0.98,
    ringStart2: 0.88,
    ringWidth1: 0.28,
    ringWidth2: 0.2,
    ringSharpness: 0.014,
    ringSmooth: 0.055,
    ringOpacityBoost: 1.0,
    darkStopMix: 0.16,
    edgeFeather: 0.03,
    allowInvert: false,
    volumeScaleAmp: 0.045,
  },
  "eleven-vivid": {
    ovalBaseA: 0.86,
    ovalVarA: 0.38,
    ovalMaxB: 2.75,
    ovalMinB: 2.05,
    ovalSoftness: 0.78,
    ovalGradMix: 0.12,
    ovalAlpha: 0.86,
    flowMin: 0.24,
    flowMax: 0.54,
    flowRadial: 0.26,
    ringStart1: 1.0,
    ringStart2: 0.9,
    ringWidth1: 0.24,
    ringWidth2: 0.18,
    ringSharpness: 0.035,
    ringSmooth: 0.08,
    ringOpacityBoost: 0.86,
    darkStopMix: 0.28,
    edgeFeather: 0.035,
    allowInvert: false,
    volumeScaleAmp: 0,
  },
};

function easeInOutCubic(p: number) {
  const x = clamp01(p);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

const mixNum = (a: number, b: number, t: number) => a + (b - a) * t;

interface StateSample {
  inVol: number;
  outVol: number;
  timeRate: number;
  animRate: number;
  ringRate: number;
  spinRate: number;
  thinkingMix: number;
}

function computeStateSample(state: AgentState, c: number, seedPhase: number): StateSample {
  if (state === "talking") {
    const phrase = 0.55 + 0.45 * Math.sin(c * 0.45 + seedPhase);
    const syllable =
      0.5 + 0.5 * Math.sin(c * 1.15 + Math.sin(c * 0.5 + seedPhase) * 0.8);
    const voice = phrase * syllable;
    const inVol = clamp01(0.28 + voice * 0.22);
    const outVol = clamp01(0.32 + voice * 0.26);
    return {
      inVol,
      outVol,
      timeRate: 0.28 + outVol * 0.14,
      animRate: 0.11 + outVol * 0.11,
      ringRate: 0.07 + outVol * 0.07,
      spinRate: 0,
      thinkingMix: 0,
    };
  }
  if (state === "listening") {
    const breath = 0.5 + 0.5 * Math.sin(c * 0.55 + seedPhase);
    const quiver = 0.5 + 0.5 * Math.sin(c * 1.05 + seedPhase) * Math.cos(c * 0.45);
    const inVol = clamp01(0.34 + (breath * 0.5 + quiver * 0.5) * 0.18);
    const outVol = clamp01(0.22 + 0.04 * Math.sin(c * 0.5 + seedPhase));
    return {
      inVol,
      outVol,
      timeRate: 0.28,
      animRate: 0.11,
      ringRate: 0.08 + inVol * 0.06,
      spinRate: 0,
      thinkingMix: 0,
    };
  }
  if (state === "thinking") {
    return {
      inVol: clamp01(0.14 + 0.05 * Math.sin(c * 0.45 + seedPhase)),
      outVol: clamp01(0.38 + 0.08 * Math.sin(c * 0.75 + seedPhase)),
      timeRate: 0.3,
      animRate: 0.14,
      ringRate: 0.06,
      spinRate: 0.28,
      thinkingMix: 1,
    };
  }
  // "idle": untouched serene resting drift
  return {
    inVol: clamp01(0.08 + 0.04 * Math.sin(c * 0.8 + seedPhase)),
    outVol: clamp01(0.22 + 0.05 * Math.sin(c * 0.6 + seedPhase)),
    timeRate: 0.35,
    animRate: 0.12,
    ringRate: 0.08,
    spinRate: 0,
    thinkingMix: 0,
  };
}

interface OrbInstanceState {
  id: number;
  hostEl: HTMLSpanElement;
  canvas: HTMLCanvasElement;
  innerEl: HTMLDivElement | null;
  visible: boolean;
  palette: OrbPalette;
  variant: OrbVariant;
  agentState: AgentState;
  cardHovered: boolean;
  effectiveState: AgentState;
  theme: "auto" | "dark" | "light";
  offsets: Float32Array;
  seedPhase: number;
  clock: number;
  uTime: number;
  uAnimation: number;
  uRingTime: number;
  uSpinAngle: number;
  transitionProgress: number;
  fromTimeRate: number;
  fromAnimRate: number;
  fromRingRate: number;
  fromSpinRate: number;
  fromThinkingMix: number;
  fromIn: number;
  fromOut: number;
  curTimeRate: number;
  curAnimRate: number;
  curRingRate: number;
  curSpinRate: number;
  curThinkingMix: number;
  curIn: number;
  curOut: number;
  curColor1: [number, number, number];
  curColor2: [number, number, number];
  targetColor1: [number, number, number];
  targetColor2: [number, number, number];
  hoverBoost: number;
  hoverTarget: number;
}

class SharedElevenLabsOrbEngine {
  private offscreen: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private locs: Record<string, WebGLUniformLocation | null> = {};
  private instances = new Map<number, OrbInstanceState>();
  private rafId = 0;
  private lastNow = 0;
  private nextId = 1;
  private webglFailed = false;
  private isDarkDoc = false;
  private reducedMotion = false;
  private darkObserver: MutationObserver | null = null;
  private motionQuery: MediaQueryList | null = null;

  private ensureInitialized() {
    if (this.gl || this.webglFailed || typeof document === "undefined") return;

    this.isDarkDoc = document.documentElement.classList.contains("dark");
    this.darkObserver = new MutationObserver(() => {
      this.isDarkDoc = document.documentElement.classList.contains("dark");
      if (this.reducedMotion) this.renderSinglePass();
    });
    this.darkObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    this.motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reducedMotion = this.motionQuery.matches;
    this.motionQuery.addEventListener("change", this.onMotionChange);

    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
    });

    if (!gl) {
      this.webglFailed = true;
      return;
    }

    const vs = this.compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    if (!vs || !fs) {
      this.webglFailed = true;
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      this.webglFailed = true;
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      this.webglFailed = true;
      return;
    }

    gl.useProgram(program);

    const quad = new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Seed procedural Perlin-like grayscale texture immediately so frame 0 is never blank
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const fallbackNoise = buildInitialNoiseData(128);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 128, 128, 0, gl.RGBA, gl.UNSIGNED_BYTE, fallbackNoise);
    gl.generateMipmap(gl.TEXTURE_2D);

    // Load ElevenLabs' exact perlin-noise.png texture locally
    const img = new Image();
    img.src = "/images/perlin-noise.png";
    img.onload = () => {
      if (!this.gl || !this.program) return;
      this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);
      this.gl.generateMipmap(this.gl.TEXTURE_2D);
      if (this.reducedMotion) this.renderSinglePass();
    };

    const uniformNames = [
      "uTime",
      "uAnimation",
      "uRingTime",
      "uSpinAngle",
      "uThinkingMix",
      "uInverted",
      "uOffsets",
      "uColor1",
      "uColor2",
      "uInputVolume",
      "uOutputVolume",
      "uOpacity",
      "uPerlinTexture",
      "uOvalBaseA",
      "uOvalVarA",
      "uOvalMaxB",
      "uOvalMinB",
      "uOvalSoftness",
      "uOvalGradMix",
      "uOvalAlpha",
      "uFlowMin",
      "uFlowMax",
      "uFlowRadial",
      "uRingStart1",
      "uRingStart2",
      "uRingWidth1",
      "uRingWidth2",
      "uRingSharpness",
      "uRingSmooth",
      "uRingOpacityBoost",
      "uDarkStopMix",
      "uEdgeFeather",
    ] as const;

    for (const name of uniformNames) {
      this.locs[name] = gl.getUniformLocation(program, name);
    }
    gl.uniform1i(this.locs.uPerlinTexture, 0);
    gl.viewport(0, 0, 256, 256);

    this.offscreen = canvas;
    this.gl = gl;
    this.program = program;
  }

  private compileShader(gl: WebGL2RenderingContext, type: number, src: string) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private onMotionChange = (e: MediaQueryListEvent) => {
    this.reducedMotion = e.matches;
    if (this.reducedMotion) {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = 0;
      }
      this.renderSinglePass();
    } else {
      this.ensureLoop();
    }
  };

  register(opts: {
    hostEl: HTMLSpanElement;
    canvas: HTMLCanvasElement;
    innerEl: HTMLDivElement | null;
    palette: OrbPalette;
    variant: OrbVariant;
    agentState: AgentState;
    theme: "auto" | "dark" | "light";
    seed: number;
  }): number {
    this.ensureInitialized();
    const id = this.nextId++;
    const rand = splitmix32(opts.seed);
    const offsets = new Float32Array(Array.from({ length: 7 }, () => rand() * Math.PI * 2));
    const [c1Hex, c2Hex] = PALETTE_COLORS[opts.palette];
    const c1 = hexToLinearRgb(c1Hex);
    const c2 = hexToLinearRgb(c2Hex);

    const seedPhase = (opts.seed % 97) * 0.13;
    const initSample = computeStateSample(opts.agentState, seedPhase, seedPhase);
    opts.hostEl.dataset.orbEffectiveState = opts.agentState;

    this.instances.set(id, {
      id,
      hostEl: opts.hostEl,
      canvas: opts.canvas,
      innerEl: opts.innerEl,
      visible: true,
      palette: opts.palette,
      variant: opts.variant,
      agentState: opts.agentState,
      cardHovered: false,
      effectiveState: opts.agentState,
      theme: opts.theme,
      offsets,
      seedPhase,
      clock: seedPhase,
      uTime: seedPhase,
      uAnimation: 0.1,
      uRingTime: seedPhase * 0.25,
      uSpinAngle: 0,
      transitionProgress: 1,
      fromTimeRate: initSample.timeRate,
      fromAnimRate: initSample.animRate,
      fromRingRate: initSample.ringRate,
      fromSpinRate: initSample.spinRate,
      fromThinkingMix: initSample.thinkingMix,
      fromIn: initSample.inVol,
      fromOut: initSample.outVol,
      curTimeRate: initSample.timeRate,
      curAnimRate: initSample.animRate,
      curRingRate: initSample.ringRate,
      curSpinRate: initSample.spinRate,
      curThinkingMix: initSample.thinkingMix,
      curIn: initSample.inVol,
      curOut: initSample.outVol,
      curColor1: [...c1],
      curColor2: [...c2],
      targetColor1: c1,
      targetColor2: c2,
      hoverBoost: 0,
      hoverTarget: 0,
    });

    if (this.reducedMotion) {
      this.renderInstance(this.instances.get(id)!, 0);
    } else {
      this.ensureLoop();
    }
    return id;
  }

  update(
    id: number,
    patch: Partial<
      Pick<OrbInstanceState, "palette" | "variant" | "agentState" | "cardHovered" | "theme" | "visible" | "hoverTarget">
    >,
  ) {
    const inst = this.instances.get(id);
    if (!inst) return;
    if (patch.palette && patch.palette !== inst.palette) {
      inst.palette = patch.palette;
      const [c1Hex, c2Hex] = PALETTE_COLORS[patch.palette];
      inst.targetColor1 = hexToLinearRgb(c1Hex);
      inst.targetColor2 = hexToLinearRgb(c2Hex);
    }
    if (patch.variant !== undefined) inst.variant = patch.variant;
    if (patch.agentState !== undefined) inst.agentState = patch.agentState;
    if (patch.cardHovered !== undefined) inst.cardHovered = patch.cardHovered;
    if (patch.theme !== undefined) inst.theme = patch.theme;
    if (patch.visible !== undefined) inst.visible = patch.visible;
    if (patch.hoverTarget !== undefined) inst.hoverTarget = patch.hoverTarget;

    const nextEffective: AgentState = inst.agentState === "idle" && inst.cardHovered ? "talking" : inst.agentState;
    if (nextEffective !== inst.effectiveState) {
      inst.fromTimeRate = inst.curTimeRate;
      inst.fromAnimRate = inst.curAnimRate;
      inst.fromRingRate = inst.curRingRate;
      inst.fromSpinRate = inst.curSpinRate;
      inst.fromThinkingMix = inst.curThinkingMix;
      inst.fromIn = inst.curIn;
      inst.fromOut = inst.curOut;
      inst.effectiveState = nextEffective;
      inst.transitionProgress = 0;
      inst.hostEl.dataset.orbEffectiveState = nextEffective;
    }

    if (this.reducedMotion && inst.visible) {
      this.renderInstance(inst, 0);
    } else if (inst.visible) {
      this.ensureLoop();
    }
  }

  unregister(id: number) {
    this.instances.delete(id);
    if (this.instances.size === 0 && this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private ensureLoop() {
    if (this.reducedMotion || this.rafId) return;
    let anyVisible = false;
    for (const inst of this.instances.values()) {
      if (inst.visible) {
        anyVisible = true;
        break;
      }
    }
    if (!anyVisible) return;
    this.lastNow = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastNow) * 0.001));
    this.lastNow = now;

    let anyVisible = false;
    for (const inst of this.instances.values()) {
      if (!inst.visible) continue;
      anyVisible = true;
      this.renderInstance(inst, dt);
    }

    if (anyVisible && !this.reducedMotion) {
      this.rafId = requestAnimationFrame(this.tick);
    } else {
      this.rafId = 0;
    }
  };

  private renderSinglePass() {
    for (const inst of this.instances.values()) {
      if (inst.visible) this.renderInstance(inst, 0);
    }
  }

  private renderInstance(inst: OrbInstanceState, delta: number) {
    inst.clock += delta;
    inst.hoverBoost += (inst.hoverTarget - inst.hoverBoost) * 0.08;

    const target = computeStateSample(inst.effectiveState, inst.clock, inst.seedPhase);
    const targetIn = clamp01(target.inVol + inst.hoverBoost * 0.12);
    const targetOut = clamp01(target.outVol + inst.hoverBoost * 0.1);

    if (inst.transitionProgress < 1) {
      inst.transitionProgress = Math.min(1, inst.transitionProgress + delta / 1.25);
    }
    const eased = easeInOutCubic(inst.transitionProgress);

    inst.curTimeRate = mixNum(inst.fromTimeRate, target.timeRate, eased);
    inst.curAnimRate = mixNum(inst.fromAnimRate, target.animRate, eased);
    inst.curRingRate = mixNum(inst.fromRingRate, target.ringRate, eased);
    inst.curSpinRate = mixNum(inst.fromSpinRate, target.spinRate, eased);
    inst.curThinkingMix = mixNum(inst.fromThinkingMix, target.thinkingMix, eased);

    const desiredIn = mixNum(inst.fromIn, targetIn, eased);
    const desiredOut = mixNum(inst.fromOut, targetOut, eased);
    inst.curIn += (desiredIn - inst.curIn) * 0.12;
    inst.curOut += (desiredOut - inst.curOut) * 0.12;

    inst.uTime += delta * inst.curTimeRate;
    inst.uAnimation += delta * inst.curAnimRate;
    inst.uRingTime += delta * inst.curRingRate;
    if (inst.curSpinRate > 0.0005) {
      const spinPulse = 0.65 + 0.5 * (0.5 + 0.5 * Math.sin(inst.clock * 1.1));
      inst.uSpinAngle = (inst.uSpinAngle + delta * inst.curSpinRate * spinPulse) % (Math.PI * 2);
    }

    for (let ch = 0; ch < 3; ch++) {
      inst.curColor1[ch] += (inst.targetColor1[ch] - inst.curColor1[ch]) * 0.1;
      inst.curColor2[ch] += (inst.targetColor2[ch] - inst.curColor2[ch]) * 0.1;
    }

    const params = VARIANT_PARAMS[inst.variant];
    if (inst.innerEl) {
      const s =
        params.volumeScaleAmp > 0 && (inst.effectiveState === "talking" || inst.effectiveState === "listening")
          ? 1 + inst.curOut * params.volumeScaleAmp
          : 1;
      inst.innerEl.style.scale = s === 1 ? "1" : s.toFixed(4);
    }

    const targetCtx = inst.canvas.getContext("2d");
    if (!targetCtx) return;

    if (!this.gl || !this.program || !this.offscreen) {
      drawFallback2D(targetCtx, inst.canvas.width, inst.canvas.height, inst.palette, inst.uTime, inst.curOut);
      return;
    }

    const gl = this.gl;
    const isDark = inst.theme === "dark" ? true : inst.theme === "light" ? false : this.isDarkDoc;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform1f(this.locs.uTime, inst.uTime);
    gl.uniform1f(this.locs.uAnimation, inst.uAnimation);
    gl.uniform1f(this.locs.uRingTime, inst.uRingTime);
    gl.uniform1f(this.locs.uSpinAngle, inst.uSpinAngle);
    gl.uniform1f(this.locs.uThinkingMix, inst.curThinkingMix);
    gl.uniform1f(this.locs.uInverted, params.allowInvert && isDark ? 1.0 : 0.0);
    gl.uniform1fv(this.locs.uOffsets, inst.offsets);
    gl.uniform3fv(this.locs.uColor1, inst.curColor1);
    gl.uniform3fv(this.locs.uColor2, inst.curColor2);
    gl.uniform1f(this.locs.uInputVolume, inst.curIn);
    gl.uniform1f(this.locs.uOutputVolume, inst.curOut);
    gl.uniform1f(this.locs.uOpacity, 1.0);

    gl.uniform1f(this.locs.uOvalBaseA, params.ovalBaseA);
    gl.uniform1f(this.locs.uOvalVarA, params.ovalVarA);
    gl.uniform1f(this.locs.uOvalMaxB, params.ovalMaxB);
    gl.uniform1f(this.locs.uOvalMinB, params.ovalMinB);
    gl.uniform1f(this.locs.uOvalSoftness, params.ovalSoftness);
    gl.uniform1f(this.locs.uOvalGradMix, params.ovalGradMix);
    gl.uniform1f(this.locs.uOvalAlpha, params.ovalAlpha);
    gl.uniform1f(this.locs.uFlowMin, params.flowMin);
    gl.uniform1f(this.locs.uFlowMax, params.flowMax);
    gl.uniform1f(this.locs.uFlowRadial, params.flowRadial);
    gl.uniform1f(this.locs.uRingStart1, params.ringStart1);
    gl.uniform1f(this.locs.uRingStart2, params.ringStart2);
    gl.uniform1f(this.locs.uRingWidth1, params.ringWidth1);
    gl.uniform1f(this.locs.uRingWidth2, params.ringWidth2);
    gl.uniform1f(this.locs.uRingSharpness, params.ringSharpness);
    gl.uniform1f(this.locs.uRingSmooth, params.ringSmooth);
    gl.uniform1f(this.locs.uRingOpacityBoost, params.ringOpacityBoost);
    gl.uniform1f(this.locs.uDarkStopMix, params.darkStopMix);
    gl.uniform1f(this.locs.uEdgeFeather, params.edgeFeather);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    targetCtx.clearRect(0, 0, inst.canvas.width, inst.canvas.height);
    targetCtx.imageSmoothingEnabled = true;
    targetCtx.imageSmoothingQuality = "high";
    targetCtx.drawImage(this.offscreen, 0, 0, inst.canvas.width, inst.canvas.height);
  }
}

let sharedEngine: SharedElevenLabsOrbEngine | null = null;
function getEngine() {
  if (!sharedEngine) sharedEngine = new SharedElevenLabsOrbEngine();
  return sharedEngine;
}

/** Tileable initial noise so frame 0 has organic texture before /images/perlin-noise.png finishes decoding. */
function buildInitialNoiseData(dim: number): Uint8Array {
  const data = new Uint8Array(dim * dim * 4);
  for (let y = 0; y < dim; y++) {
    const ny = (y / dim) * Math.PI * 2;
    for (let x = 0; x < dim; x++) {
      const nx = (x / dim) * Math.PI * 2;
      const v =
        0.5 +
        0.24 * Math.sin(nx * 2 + Math.cos(ny * 2)) +
        0.16 * Math.cos(ny * 3 - nx) +
        0.1 * Math.sin(nx * 5 + ny * 4);
      const byte = Math.max(0, Math.min(255, Math.round(v * 255)));
      const idx = (y * dim + x) * 4;
      data[idx] = byte;
      data[idx + 1] = byte;
      data[idx + 2] = byte;
      data[idx + 3] = 255;
    }
  }
  return data;
}

function drawFallback2D(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: OrbPalette,
  t: number,
  vol: number,
) {
  const [c1, c2] = PALETTE_COLORS[palette];
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.5;
  const cy = h * 0.5;
  const r = Math.min(w, h) * 0.5;
  const g = ctx.createRadialGradient(
    cx + Math.cos(t) * r * 0.25,
    cy + Math.sin(t) * r * 0.25,
    r * 0.06,
    cx,
    cy,
    r,
  );
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.45, c2);
  g.addColorStop(0.88, c1);
  g.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r * (0.94 + vol * 0.04), 0, Math.PI * 2);
  ctx.fill();
}

// --- Public <Orb> Component -------------------------------------------------

/** Decorative ElevenLabs-style WebGL2 speech entity. Purely visual, hidden from assistive technology. */
export function Orb({
  palette = "gold",
  size = 48,
  variant: variantOverride,
  agentState: agentStateOverride,
  phaseOffset = 0,
  theme = "auto",
  className,
  style,
}: {
  palette?: OrbPalette;
  size?: number;
  float?: "fast" | "slow";
  variant?: OrbVariant;
  agentState?: AgentState;
  phaseOffset?: number;
  theme?: "auto" | "dark" | "light";
  className?: string;
  style?: React.CSSProperties;
}) {
  const settings = useOrbSettings();
  const variant = variantOverride ?? settings.variant;
  const agentState = agentStateOverride ?? settings.agentState;

  const hostRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instanceIdRef = useRef<number | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(24, Math.round(size * dpr));
    canvas.height = Math.max(24, Math.round(size * dpr));

    const seed = PALETTE_SEED[palette] + Math.round(phaseOffset * 1000);
    const engine = getEngine();
    const id = engine.register({
      hostEl: host,
      canvas,
      innerEl: innerRef.current,
      palette,
      variant,
      agentState,
      theme,
      seed,
    });
    instanceIdRef.current = id;

    const cardEl =
      host.closest("[data-orb-card], article, button, a, .card-featured") ??
      host.parentElement?.closest("[class*='rounded-2xl'], [class*='rounded-3xl']") ??
      host;

    const onCardEnter = () => engine.update(id, { cardHovered: true });
    const onCardLeave = () => engine.update(id, { cardHovered: false });
    cardEl.addEventListener("pointerenter", onCardEnter);
    cardEl.addEventListener("pointerleave", onCardLeave);

    const observer = new IntersectionObserver(
      (entries) => {
        engine.update(id, { visible: entries[0]?.isIntersecting ?? true });
      },
      { rootMargin: "120px" },
    );
    observer.observe(host);

    return () => {
      cardEl.removeEventListener("pointerenter", onCardEnter);
      cardEl.removeEventListener("pointerleave", onCardLeave);
      observer.disconnect();
      engine.unregister(id);
      instanceIdRef.current = null;
    };
    // Register once per size/seed change; live state updates run through the lightweight effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, phaseOffset]);

  useEffect(() => {
    if (instanceIdRef.current === null) return;
    getEngine().update(instanceIdRef.current, {
      palette,
      variant,
      agentState,
      theme,
    });
  }, [palette, variant, agentState, theme]);

  return (
    <span
      ref={hostRef}
      aria-hidden
      data-canvas="true"
      data-orb-variant={variant}
      data-orb-state={agentState}
      onPointerEnter={() => {
        if (instanceIdRef.current !== null) getEngine().update(instanceIdRef.current, { hoverTarget: 1 });
      }}
      onPointerLeave={() => {
        if (instanceIdRef.current !== null) getEngine().update(instanceIdRef.current, { hoverTarget: 0 });
      }}
      className={cn("orb block shrink-0", `orb-${palette}`, className)}
      style={{ width: size, height: size, "--orb-size": `${size}px`, ...style } as React.CSSProperties}
    >
      <div
        ref={innerRef}
        className="relative h-full w-full overflow-hidden rounded-full"
        style={{ scale: "1" }}
      >
        <canvas ref={canvasRef} aria-hidden className="pointer-events-none block h-full w-full" />
      </div>
    </span>
  );
}

/** Palette that reflects how a score went, for use next to results. */
export const paletteForScore = (score: number): OrbPalette => (score >= 80 ? "moss" : score >= 60 ? "gold" : "ember");

/** A loose cluster of orbs for hero and empty areas. The parent must be `relative overflow-hidden`. */
export function OrbCluster({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      <Orb palette="gold" size={120} float="slow" phaseOffset={0.4} className="absolute right-[26%] -top-10" />
      <Orb palette="ember" size={64} float="fast" phaseOffset={1.3} className="absolute right-[4%] top-2" />
      <Orb palette="orchid" size={168} float="fast" phaseOffset={2.1} className="absolute right-[12%] top-[26%]" />
      <Orb palette="sky" size={104} float="slow" phaseOffset={3.0} className="absolute right-[20%] -bottom-10" />
      <Orb palette="moss" size={76} float="fast" phaseOffset={4.2} className="absolute -right-4 bottom-4" />
    </div>
  );
}

// --- Interactive Website Visualisation Showcase & Quick Switcher ------------

const AGENT_STATES: { id: AgentState; label: string; icon: typeof Volume2 }[] = [
  { id: "talking", label: "Talking", icon: Volume2 },
  { id: "listening", label: "Listening", icon: Ear },
  { id: "thinking", label: "Thinking", icon: Loader },
  { id: "idle", label: "Idle", icon: Pause },
];

export function OrbVisualizationShowcase() {
  const { variant: activeVariant, agentState } = useOrbSettings();
  const [stageTone, setStageTone] = useState<"dark" | "surface">("dark");
  const [dockDismissed, setDockDismissed] = useState(false);
  const headingId = useId();

  return (
    <div id="orb-visualisations" className="mt-14 w-full text-left">
      <div className="rounded-3xl border bg-card/85 p-5 shadow-sm backdrop-blur-md md:p-7">
        <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border bg-secondary/70 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5" />
              ElevenLabs WebGL2 Shader · Tuned for small circles
            </div>
            <h3 id={headingId} className="mt-2 text-lg font-semibold tracking-tight md:text-xl">
              Compare 4 tunings — click one to apply across the site
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Built directly on ElevenLabs&apos; polar Perlin oval &amp; dual acoustic-ring GLSL shader. Orbs rest idle
              by default and wake smoothly when you hover any card, or test states directly.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border bg-secondary/60 p-0.5 text-xs" role="group" aria-label="Agent state">
              {AGENT_STATES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setOrbAgentState(id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors",
                    agentState === id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <div className="inline-flex rounded-full border bg-secondary/60 p-0.5 text-xs" role="group" aria-label="Preview backdrop">
              <button
                type="button"
                onClick={() => setStageTone("dark")}
                className={cn(
                  "rounded-full px-3 py-1.5 font-medium transition-colors",
                  stageTone === "dark" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Dark stage
              </button>
              <button
                type="button"
                onClick={() => setStageTone("surface")}
                className={cn(
                  "rounded-full px-3 py-1.5 font-medium transition-colors",
                  stageTone === "surface" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Light stage
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-labelledby={headingId}>
          {ORB_VARIANTS.map((item) => {
            const selected = item.id === activeVariant;
            const stageTheme = stageTone === "dark" ? "dark" : "light";
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setOrbVariant(item.id)}
                className={cn(
                  "group flex flex-col overflow-hidden rounded-2xl border text-left transition-all",
                  selected
                    ? "border-foreground bg-background shadow-md ring-1 ring-foreground/20"
                    : "bg-background/70 hover:border-foreground/45 hover:bg-background",
                )}
              >
                <div
                  className={cn(
                    "relative flex h-44 w-full items-center justify-center overflow-hidden border-b px-4 transition-colors",
                    stageTone === "dark"
                      ? "bg-[radial-gradient(circle_at_50%_45%,#181920_0%,#0b0c10_100%)]"
                      : "bg-[radial-gradient(circle_at_50%_45%,#ffffff_0%,#f1efe9_100%)]",
                  )}
                >
                  <div className="flex items-end gap-4" aria-hidden>
                    <Orb
                      palette="sky"
                      size={38}
                      float="slow"
                      variant={item.id}
                      agentState={agentState}
                      phaseOffset={0}
                      theme={stageTheme}
                    />
                    <Orb
                      palette="orchid"
                      size={60}
                      float="fast"
                      variant={item.id}
                      agentState={agentState}
                      phaseOffset={1.6}
                      theme={stageTheme}
                    />
                    <Orb
                      palette="gold"
                      size={42}
                      float="slow"
                      variant={item.id}
                      agentState={agentState}
                      phaseOffset={3.1}
                      theme={stageTheme}
                    />
                  </div>
                  <span
                    className={cn(
                      "absolute top-3 left-3 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium",
                      stageTone === "dark" ? "bg-white/10 text-white/85" : "bg-black/5 text-neutral-800 ring-1 ring-black/10",
                    )}
                  >
                    {item.index}
                  </span>
                  {selected && (
                    <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white shadow-xs">
                      <Check className="size-3" />
                      Selected
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <h4 className="text-sm font-semibold tracking-tight">{item.title}</h4>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.tagline}</p>

                  <dl className="mt-auto space-y-1.5 border-t pt-3 text-[11px] leading-snug">
                    <div>
                      <dt className="font-medium text-foreground/85">Shader tuning</dt>
                      <dd className="text-muted-foreground">{item.shaderNote}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground/85">Small-circle fit</dt>
                      <dd className="text-muted-foreground">{item.smallCircleNote}</dd>
                    </div>
                  </dl>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {!dockDismissed && (
        <div
          className="fixed right-4 bottom-4 z-40 hidden items-center gap-1.5 rounded-full border bg-background/90 p-1.5 pl-3 text-xs shadow-lg backdrop-blur-md md:flex"
          role="region"
          aria-label="Quick orb tuning switcher"
        >
          <span className="mr-1 font-medium text-muted-foreground">Orb tuning:</span>
          {ORB_VARIANTS.map((v) => {
            const active = v.id === activeVariant;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setOrbVariant(v.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 font-medium transition-colors",
                  active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {v.index} {v.shortLabel}
              </button>
            );
          })}
          <a
            href="#orb-visualisations"
            className="ml-0.5 rounded-full border px-2.5 py-1 text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            Compare
          </a>
          <button
            type="button"
            onClick={() => setDockDismissed(true)}
            aria-label="Close orb tuning switcher"
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
