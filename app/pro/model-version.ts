"use client";

import { useEffect, useState } from "react";

export type CoachModelVersion = "v38" | "v39" | "v40" | "v46";
export const COACH_MODEL_NUMBER: Record<CoachModelVersion, string> = {
  v38: "3.8",
  v39: "3.9",
  v40: "4.0",
  v46: "4.6",
};
export const COACH_MODEL_OPTIONS: Array<{ model: CoachModelVersion; label: string; detail: string }> = [
  { model: "v46", label: "Flight Lab 4.6", detail: "More advanced intelligence" },
  { model: "v40", label: "Flight Lab 4.0", detail: "Advanced intelligence" },
  { model: "v39", label: "Flight Lab 3.9", detail: "Built-in knowledge" },
  { model: "v38", label: "Flight Lab 3.8", detail: "Improved context + memory" },
];
const storageKey = "flight-lab-coach-model";
const changedEvent = "flight-lab-model-changed";

export function normalizeModelVersion(value: string | null): CoachModelVersion {
  if (value === "v46" || value === "v40" || value === "v39" || value === "v38") return value;
  return value === "v37" ? "v38" : "v40";
}

export function useModelVersion() {
  const [model, setModel] = useState<CoachModelVersion>("v40");
  useEffect(() => {
    const sync = () => {
      const saved = window.localStorage.getItem(storageKey);
      const next = normalizeModelVersion(saved);
      setModel(next);
      if (saved === "v37") window.localStorage.setItem(storageKey, next);
    };
    sync();
    window.addEventListener(changedEvent, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(changedEvent, sync); window.removeEventListener("storage", sync); };
  }, []);
  const chooseModel = (next: CoachModelVersion) => {
    window.localStorage.setItem(storageKey, next);
    setModel(next);
    window.dispatchEvent(new Event(changedEvent));
  };
  return [model, chooseModel] as const;
}
