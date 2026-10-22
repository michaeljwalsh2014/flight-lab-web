"use client";

export type PlaneCoachContext = {
  planeId: number | null;
  planeName: string;
  score: number;
  range: string;
  confidence: number;
  headline: string;
  nextTest: string;
  recommendationId: string;
  evidence: string[];
  symmetry: number;
  outline: number;
  planeStyle: string;
  lastFlight: string;
  ageRange: string;
  throwStrength: string;
  scanMode: "quick" | "multiview";
  viewCount: number;
  localViewsAnalyzed: number;
  deepInspection: "used" | "unavailable" | "off" | "not-applicable";
  vision?: {
    source: string;
    confidence: number;
    observations: string[];
    issues: string[];
    uncertainties: string[];
    noseAlignment: string;
    wingDihedral: string;
    foldDefinition: string;
  };
};

export type CoachTestMemory = {
  planeId: number | null;
  recommendationId: string;
  action: string;
  result: "better" | "same" | "worse";
  createdAt: string;
};

export type FlightTrackerContext = {
  planeId?: number | null;
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
  coachMemory?: CoachTestMemory[];
  videoInspection?: {
    planeId?: number | null;
    canReview: boolean; summary: string; observations: string[];
    uncertainties: string[]; nextTest: string; sampledFrames: number;
    releaseStrength: "gentle" | "normal" | "strong" | "uncertain";
    releaseConfidence: number;
  } | null;
};

export const PRO_AI_CONTEXT_EVENT = "flight-lab-pro-ai-context";
const STORAGE_KEY = "flight-lab-pro-ai-context-v3";
let volatileContext: ProAiContext | undefined;

export function contextForPlane(context: ProAiContext, planeId: number | null): ProAiContext {
  return {
    ...context,
    plane: context.plane?.planeId === planeId ? context.plane : undefined,
    flight: context.flight?.planeId === planeId ? context.flight : undefined,
    videoInspection: context.videoInspection?.planeId === planeId ? context.videoInspection : null,
    coachMemory: context.coachMemory?.filter(item => item.planeId === planeId),
  };
}
export function currentPlaneId(): number | null {
  try {
    const planes = JSON.parse(window.localStorage.getItem("flight-lab-v2-planes") ?? "[]") as Array<{ id: number }>;
    const selected = Number(window.localStorage.getItem("flight-lab-v2-active-plane-id"));
    return planes.some(plane => plane.id === selected) ? selected : planes[0]?.id ?? null;
  } catch { return null; }
}
export function readProAiContext(): ProAiContext {
  if (typeof window === "undefined") return {};
  if (volatileContext) return contextForPlane(volatileContext, currentPlaneId());
  try {
    return contextForPlane(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "{}") as ProAiContext, currentPlaneId());
  } catch {
    return {};
  }
}

export function publishProAiContext(patch: ProAiContext) {
  if (typeof window === "undefined") return;
  const next = { ...readProAiContext(), ...patch };
  try {
    const existing: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) throw new Error("Unreadable evidence");
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    volatileContext = undefined;
  } catch { volatileContext = next; /* Preserve unreadable saved evidence and keep the current session usable. */ }
  window.dispatchEvent(new CustomEvent<ProAiContext>(PRO_AI_CONTEXT_EVENT, { detail: next }));
}
