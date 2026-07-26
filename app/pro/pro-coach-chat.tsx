"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { PRO_AI_CONTEXT_EVENT, readProAiContext, type ProAiContext } from "./pro-ai-context";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  source?: "terra" | "device";
};

type FlightHistoryContext = {
  flightsLogged: number;
  averageDistance: number;
  bestDistance: number;
  recentDistances: number[];
};

const QUICK_PROMPTS = [
  "What should I improve?",
  "Why did my plane turn?",
  "What should I test next?",
];

function loadFlightHistory(): FlightHistoryContext {
  try {
    const throws = JSON.parse(window.localStorage.getItem("flight-lab-v2-throws") ?? "[]") as Array<{ distance?: number }>;
    const distances = throws.map((item) => Number(item.distance)).filter((value) => Number.isFinite(value) && value > 0);
    return {
      flightsLogged: distances.length,
      averageDistance: distances.length ? distances.reduce((sum, value) => sum + value, 0) / distances.length : 0,
      bestDistance: distances.length ? Math.max(...distances) : 0,
      recentDistances: distances.slice(0, 5),
    };
  } catch {
    return { flightsLogged: 0, averageDistance: 0, bestDistance: 0, recentDistances: [] };
  }
}

function deviceReply(message: string, context: ProAiContext, history: FlightHistoryContext) {
  const question = message.toLowerCase();
  const flight = context.flight;
  const plane = context.plane;
  const advice: string[] = [];

  if (question.includes("turn") && flight) {
    if (flight.driftDirection === "straight") advice.push("The latest tracked path did not show a strong left or right drift.");
    else advice.push(`The latest path drifted ${flight.driftDirection}. First, compare both wingtips and gently flatten any uneven curl.`);
  }
  if (plane && plane.symmetry < 82) advice.push(`The plane scan measured ${plane.symmetry}% symmetry. Matching the wings is the clearest first improvement.`);
  if (flight && flight.stability < 72) advice.push(`Path stability was ${flight.stability}/100. Sharpen the center crease and try a smoother, level release.`);
  if (flight && flight.curve > 38) advice.push(`Flight curve was ${flight.curve}/100. Make one tiny adjustment to the outside rear edge, then retest.`);
  if (plane?.nextTest) advice.push(plane.nextTest);
  if (question.includes("best") || question.includes("distance")) {
    if (history.flightsLogged) advice.push(`Your best saved throw is ${history.bestDistance.toFixed(1)} ft and your average is ${history.averageDistance.toFixed(1)} ft.`);
    else advice.push("Measure three throws before changing the plane so you have a fair starting average.");
  }
  if (!advice.length && flight) advice.push(...flight.observations.slice(0, 2));
  if (!advice.length) advice.push("Run a plane scan or flight-video analysis first. Then I can use the on-device measurements to recommend one specific change.");

  return `${advice.slice(0, 2).join(" ")} Change only one thing, make three similar throws, and compare the average.`;
}

function getCoachId() {
  const key = "flight-lab-pro-coach-id";
  let value = window.localStorage.getItem(key);
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, value);
  }
  return value;
}

export default function ProCoachChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [context, setContext] = useState<ProAiContext>({});
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", source: "device", text: "Hi! I’m your Pro Coach. Analyze a plane or flight, then ask what to improve or test next." },
  ]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setContext(readProAiContext());
    const receiveContext = (event: Event) => setContext((event as CustomEvent<ProAiContext>).detail);
    window.addEventListener(PRO_AI_CONTEXT_EVENT, receiveContext);
    return () => window.removeEventListener(PRO_AI_CONTEXT_EVENT, receiveContext);
  }, []);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, sending]);

  const hasAnalysis = Boolean(context.plane || context.flight);
  const status = useMemo(() => context.flight
    ? `${context.flight.profile} · ${context.flight.confidence}% track`
    : context.plane
      ? `${context.plane.score}/100 plane scan`
      : "Ready for your question", [context]);

  async function askCoach(text: string) {
    const clean = text.trim().slice(0, 600);
    if (!clean || sending) return;
    const userMessage: ChatMessage = { role: "user", text: clean };
    const previous = messages.slice(-6);
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setSending(true);
    const history = loadFlightHistory();

    try {
      const response = await fetch("/api/pro-coach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Flight-Lab-Pro-Path": window.location.pathname,
        },
        body: JSON.stringify({
          message: clean,
          history: previous.map(({ role, text: historyText }) => ({ role, text: historyText })),
          context: { ...context, history },
          coachId: getCoachId(),
        }),
      });
      const payload = await response.json() as { reply?: string };
      if (!response.ok || !payload.reply) throw new Error("Cloud coach unavailable");
      setMessages((current) => [...current, { role: "assistant", source: "terra", text: payload.reply! }]);
    } catch {
      setMessages((current) => [...current, {
        role: "assistant",
        source: "device",
        text: deviceReply(clean, context, history),
      }]);
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void askCoach(input);
  }

  return (
    <aside className={`pro-coach ${open ? "open" : ""}`}>
      {open && <div className="pro-coach-panel" role="dialog" aria-label="Flight Lab Pro Coach">
        <header>
          <div><span><i /> Pro Coach</span><b>{status}</b></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close Pro Coach">×</button>
        </header>
        {!hasAnalysis && <p className="pro-coach-context">For the smartest answer, run a plane scan or video analysis first. Photos and videos stay on your device; only the measurements and your message can be sent to Terra.</p>}
        <div className="pro-coach-messages" aria-live="polite">
          {messages.map((message, index) => <div className={message.role} key={`${message.role}-${index}`}>
            {message.role === "assistant" && <small>{message.source === "terra" ? "Terra cloud coach" : "On-device coach"}</small>}
            <p>{message.text}</p>
          </div>)}
          {sending && <div className="assistant thinking"><small>Pro Coach</small><p><i /><i /><i /></p></div>}
          <div ref={endRef} />
        </div>
        <div className="pro-coach-prompts">
          {QUICK_PROMPTS.map((prompt) => <button type="button" key={prompt} onClick={() => void askCoach(prompt)}>{prompt}</button>)}
        </div>
        <form onSubmit={submit}>
          <label className="sr-only" htmlFor="pro-coach-input">Ask the Pro Coach</label>
          <textarea id="pro-coach-input" rows={2} maxLength={600} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask what to change, test, or improve…" />
          <button type="submit" disabled={!input.trim() || sending} aria-label="Send message">➤</button>
        </form>
      </div>}
      <button className="pro-coach-launcher" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>AI</span><b>{open ? "Close coach" : "Ask Pro Coach"}</b>
      </button>
    </aside>
  );
}
