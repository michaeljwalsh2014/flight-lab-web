"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Level = "beginner" | "intermediate" | "pro";
const completedKey = "flight-lab-pro-welcome-v1";
export const interfaceOptions = [
  { id: "beginner" as const, title: "Easy", detail: "Choose your age range and start walking. Quick distance estimates." },
  { id: "intermediate" as const, title: "Intermediate", detail: "Enter your step length and explore flight videos." },
  { id: "pro" as const, title: "Pro", detail: "Calibrate your walking distance and explore every tool." },
];

export default function ProOnboarding({ level, onChooseLevel, replay }: { level: Level; onChooseLevel: (level: Level) => void; replay: number }) {
  const [screen, setScreen] = useState<"closed" | "welcome" | "tour">("closed");
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [position, setPosition] = useState({ top: 20, left: 20, above: false });
  const dialog = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const steps = [
    { selector: "[data-tour='plane']", title: "Start with your plane", text: "Choose a design, give it a name, then add it. Each plane keeps its own throws and results." },
    { selector: "[data-tour='measure-setup']", title: level === "beginner" ? "Choose your age range" : level === "intermediate" ? "Enter your step length" : "Calibrate your steps", text: level === "beginner" ? "Your age range gives us a rough step length. You only need to choose it once on this device. Distances are estimates." : level === "intermediate" ? "Enter the length of one normal step in feet. We remember it for future throws." : "Mark a known distance, walk it normally, and finish calibration. Hold the iPad the same way when you measure throws." },
    { selector: "[data-tour='measure-start']", title: "Measure a throw", text: "Stand at the launch line and start measuring. Walk normally to your plane, then finish to save. Counting begins after a few steady steps; use + Step or − to correct it." },
    { selector: ".pro-coach-launcher", title: "Ask Coach what to try", text: "Open Coach for help with your plane or your results. Try one small change, then measure another few throws." },
  ];

  useEffect(() => {
    try { if (localStorage.getItem(completedKey) !== "done") setScreen("welcome"); }
    catch { setScreen("welcome"); }
  }, []);
  useEffect(() => { if (replay > 0) { setStep(0); setScreen("tour"); } }, [replay]);

  function finish() {
    try { localStorage.setItem(completedKey, "done"); } catch { /* Keep the tour usable without storage. */ }
    setScreen("closed");
  }

  useEffect(() => {
    if (screen === "closed") return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus({ preventScroll: true });
    };
  }, [screen]);

  useEffect(() => {
    if (screen === "closed") return;
    const frame = requestAnimationFrame(() => dialog.current?.focus({ preventScroll: true }));
    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); finish(); }
      if (event.key !== "Tab") return;
      const items = dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keyboard);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", keyboard); };
  }, [screen, step]);

  useEffect(() => {
    if (screen !== "tour") return;
    const target = document.querySelector<HTMLElement>(steps[step].selector)
      ?? document.querySelector<HTMLElement>(step === 0 ? "#plane-hangar h2" : ".measure-control-card");
    target?.scrollIntoView({ block: "center", behavior: "instant" });
    function update() {
      const bounds = target?.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 32);
      const height = card.current?.offsetHeight ?? 260;
      if (!bounds) { setRect(null); setPosition({ top: Math.max(16, (window.innerHeight - height) / 2), left: (window.innerWidth - width) / 2, above: false }); return; }
      const top = Math.max(8, bounds.top - 6), left = Math.max(8, bounds.left - 6);
      const bottom = Math.min(window.innerHeight - 8, bounds.bottom + 6);
      setRect({ top, left, width: Math.max(0, Math.min(window.innerWidth - 8, bounds.right + 6) - left), height: Math.max(0, bottom - top) });
      const above = bottom + height + 20 > window.innerHeight && top > height + 20;
      setPosition({ top: Math.max(12, Math.min(window.innerHeight - height - 12, above ? top - height - 16 : bottom + 16)), left: Math.max(16, Math.min(window.innerWidth - width - 16, bounds.left)), above });
    }
    update();
    const frame = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [screen, step, level]);

  if (screen === "closed") return null;
  return createPortal(
    <div className={`flight-onboarding ${screen === "welcome" ? "welcome-screen" : "tour-screen"}`}>
      {screen === "tour" && rect && <div className="tour-spotlight" style={rect} aria-hidden="true" />}
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="flight-welcome-title" aria-describedby="flight-welcome-description" className={screen === "welcome" ? "flight-welcome-card" : "flight-tour-dialog"}>
        {screen === "welcome" ? <>
          <span className="welcome-plane" aria-hidden="true">➤</span><p className="welcome-eyebrow">Welcome to Flight Lab</p>
          <h1 id="flight-welcome-title">Choose your level</h1>
          <p id="flight-welcome-description">Start where you feel comfortable. You can change your level anytime.</p>
          <div className="welcome-levels">{interfaceOptions.map((option) => <button key={option.id} type="button" onClick={() => { onChooseLevel(option.id); setStep(0); setScreen("tour"); }}><b>{option.title}</b><span>{option.detail}</span><small>Choose {option.title} →</small></button>)}</div>
          <button className="tour-skip" type="button" onClick={finish}>Keep my current level · skip tour</button>
        </> : <div ref={card} className={`flight-tour-card ${position.above ? "above" : "below"}`} style={{ top: position.top, left: position.left }}>
          <span className="tour-arrow" aria-hidden="true">{position.above ? "↓" : "↑"}</span>
          <p className="welcome-eyebrow">Quick tour · {step + 1} of {steps.length}</p>
          <h2 id="flight-welcome-title">{steps[step].title}</h2><p id="flight-welcome-description">{steps[step].text}</p>
          <div className="tour-buttons"><button className="tour-skip" type="button" onClick={finish}>Skip tour</button>{step > 0 && <button type="button" onClick={() => setStep(step - 1)}>Back</button>}<button className="tour-next" type="button" onClick={() => step === steps.length - 1 ? finish() : setStep(step + 1)}>{step === steps.length - 1 ? "Okay, got it" : "Next"}</button></div>
        </div>}
      </div>
    </div>, document.body,
  );
}
