"use client";

export type PlaneCoachContext = {
  score: number;
  range: string;
  confidence: number;
  headline: string;
  nextTest: string;
  symmetry: number;
  outline: number;
  planeStyle: string;
  lastFlight: string;
};

export type FlightTrackerContext = {
  engine: "flight-lab-local-v2";
  airtime: number;
  curve: number;
  stability: number;
  relativeSpeed: number;
  confidence: number;
  profile: string;
  driftDirection: "left" | "right" | "straight";
  sampledFrames: number;
  observations: string[];
};

export type ProAiContext = {
  plane?: PlaneCoachContext;
  flight?: FlightTrackerContext;
};

export const PRO_AI_CONTEXT_EVENT = "flight-lab-pro-ai-context";
const STORAGE_KEY = "flight-lab-pro-ai-context-v2";

export function readProAiContext(): ProAiContext {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "{}") as ProAiContext;
  } catch {
    return {};
  }
}

export function publishProAiContext(patch: ProAiContext) {
  if (typeof window === "undefined") return;
  const next = { ...readProAiContext(), ...patch };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent<ProAiContext>(PRO_AI_CONTEXT_EVENT, { detail: next }));
}
