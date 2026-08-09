"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { PRO_AI_CONTEXT_EVENT, readProAiContext, type ProAiContext } from "./pro-ai-context";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  source?: "cloud" | "device";
};

type FlightHistoryContext = {
  planeId: number | null;
  planeName: string;
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
    const planeId = Number(window.localStorage.getItem("flight-lab-v2-active-plane-id")) || null;
    const planes = JSON.parse(window.localStorage.getItem("flight-lab-v2-planes") ?? "[]") as Array<{ id?: number; name?: string }>;
    const throws = JSON.parse(window.localStorage.getItem("flight-lab-v2-throws") ?? "[]") as Array<{ planeId?: number; distance?: number }>;
    const distances = throws.filter((item) => item.planeId === planeId).map((item) => Number(item.distance)).filter((value) => Number.isFinite(value) && value > 0);
    return {
      planeId,
      planeName: planes.find((plane) => plane.id === planeId)?.name ?? "Current plane",
      flightsLogged: distances.length,
      averageDistance: distances.length ? distances.reduce((sum, value) => sum + value, 0) / distances.length : 0,
      bestDistance: distances.length ? Math.max(...distances) : 0,
      recentDistances: distances.slice(0, 5),
    };
  } catch {
    return { planeId: null, planeName: "Current plane", flightsLogged: 0, averageDistance: 0, bestDistance: 0, recentDistances: [] };
  }
}

function nextDeviceVariant() {
  const key = "flight-lab-pro-coach-variation";
  const current = Number(window.localStorage.getItem(key)) || 0;
  const next = (current + 1) % 997;
  window.localStorage.setItem(key, String(next));
  return next;
}

function choice(options: string[], variant: number, offset = 0) {
  return options[(variant + offset) % options.length];
}

function deviceReply(message: string, context: ProAiContext, history: FlightHistoryContext, recentReplies: string[]) {
  const question = message.toLowerCase();
  const flight = context.flight;
  const plane = context.plane;
  const lastTest = context.coachMemory?.filter((item) => item.planeId === history.planeId).slice(-1)[0];
  let variant = nextDeviceVariant();

  function compose(currentVariant: number) {
    if (!plane && !flight) {
      return choice([
        "I need one real measurement before I choose an adjustment. Run Rate My Plane or analyze a flight, then ask again.",
        "Let’s start with evidence instead of guessing. Scan the plane or track one flight so I can identify the first useful change.",
        "No scan is loaded yet. Add a top-view plane scan or a flight video and I’ll turn its measurements into one focused test.",
      ], currentVariant);
    }

    const asksAboutTurn = /turn|left|right|curve|drift/.test(question);
    const asksAboutDistance = /distance|far|best|range/.test(question);
    const asksForTest = /test|next|try|improve|change/.test(question);
    let issue: "drift" | "symmetry" | "stability" | "curve" | "outline" | "distance" | "general" = "general";
    if (asksAboutTurn && flight?.driftDirection && flight.driftDirection !== "straight") issue = "drift";
    else if (asksAboutDistance) issue = "distance";
    else if (plane && plane.symmetry < 82) issue = "symmetry";
    else if (flight && flight.stability < 72) issue = "stability";
    else if (flight && flight.curve > 38) issue = "curve";
    else if (plane && plane.outline < 68) issue = "outline";

    const evidence = {
      drift: flight ? `The tracked path drifted ${flight.driftDirection} with a curve score of ${flight.curve}/100.` : "",
      symmetry: plane ? `${plane.planeName}'s clearest scan signal is wing symmetry at ${plane.symmetry}%.` : "",
      stability: flight ? `The clearest flight signal is stability at ${flight.stability}/100.` : "",
      curve: flight ? `The path curve measured ${flight.curve}/100 and drifted ${flight.driftDirection}.` : "",
      outline: plane ? `The plane outline scored ${plane.outline}/100, so the wing shape deserves the first check.` : "",
      distance: history.flightsLogged
        ? `Your saved best is ${history.bestDistance.toFixed(1)} ft and your average is ${history.averageDistance.toFixed(1)} ft across ${history.flightsLogged} flights.`
        : "There are no saved distances yet, so the first goal is a trustworthy three-throw average.",
      general: plane
        ? `${plane.planeName}'s ${plane.viewCount}-view scan scored ${plane.score}/100 with ${plane.symmetry}% symmetry. ${plane.evidence[0] ?? ""}`
        : flight
          ? `The latest ${flight.profile.toLowerCase()} path scored ${flight.stability}/100 for stability with ${flight.confidence}% tracking confidence.`
          : "",
    }[issue];

    const action = {
      drift: choice([
        `Compare both wingtips, then gently flatten any extra curl on the ${flight?.driftDirection} side.`,
        `Set the plane on a table and check whether the ${flight?.driftDirection} wingtip sits higher; correct only that tiny mismatch.`,
        `Make one very small adjustment to the outside rear edge opposite the ${flight?.driftDirection} drift.`,
      ], currentVariant, 1),
      symmetry: choice([
        "Line up the wing edges and press the center crease again without changing the wing angle.",
        "Fold the wings together and correct only the side that does not match.",
        "Check the two wingtips at eye level, then flatten the higher one by a tiny amount.",
      ], currentVariant, 1),
      stability: choice([
        "Sharpen the center crease and use a smoother, level release.",
        "Check that both wings have the same stiffness, then throw at less upward angle.",
        "Flatten any uneven wingtip curl and keep the next release level.",
      ], currentVariant, 1),
      curve: choice([
        "Make one tiny correction to the outside rear edge and leave every other fold alone.",
        "Match the wingtip angles first; if they already match, flatten the more curved rear edge slightly.",
        "Correct only the wingtip that points higher when the plane rests on a level table.",
      ], currentVariant, 1),
      outline: choice([
        "Compare the wing widths and straighten the edge that is narrower or more curled.",
        "Refold the two wings together so their outlines match from nose to tail.",
        "Check the nose-to-wing alignment and fix only the side with the uneven outline.",
      ], currentVariant, 1),
      distance: history.flightsLogged
        ? choice([
          "Keep the current folds and test a smoother, level release before modifying the plane.",
          "Use the same launch spot and compare one normal throw with one slightly gentler throw.",
          "Leave the design unchanged for the next set so the average shows whether the release is the real difference.",
        ], currentVariant, 1)
        : "Measure three normal throws with the current design before making any fold changes.",
      general: asksForTest && plane?.nextTest
        ? plane.nextTest
        : choice([
          "Keep the plane unchanged and collect three comparable throws so the next adjustment is based on a pattern.",
          "Repeat the same launch three times and watch whether the same behavior appears each time.",
          "Use one controlled three-throw set before deciding whether the design or the release needs work.",
        ], currentVariant, 1),
    }[issue];

    const closer = choice([
      "Change only that one thing, then compare three throws.",
      "Retest it three times from the same spot before making another adjustment.",
      "Use three similar throws so the average—not one lucky flight—decides whether it helped.",
      "Keep every other fold unchanged for the next three-flight test.",
    ], currentVariant, 2);
    const outcomeNote = lastTest
      ? lastTest.result === "better"
        ? `Your last change helped, so keep it while testing the next variable.`
        : `Your last test was ${lastTest.result}; I will not repeat “${lastTest.action}”.`
      : "";
    const safeAction = lastTest && lastTest.result !== "better" && action === lastTest.action
      ? (plane?.nextTest ?? "Keep the folds unchanged and collect three comparable throws.")
      : action;
    return `${evidence} ${outcomeNote} ${safeAction} ${closer}`.trim();
  }

  let reply = compose(variant);
  if (recentReplies.includes(reply)) {
    variant += 1;
    reply = compose(variant);
  }
  return reply;
}

function buildChatGptPrompt(context: ProAiContext, history: FlightHistoryContext) {
  const plane = context.plane;
  const flight = context.flight;
  const lines = [
    "Act as my paper-airplane flight coach. Use only the measurements below, explain the most important issue in plain language, and recommend one safe change followed by three comparable test throws. Do not invent measurements.",
    "",
    "PLANE SCAN",
    plane
      ? `Plane: ${plane.planeName}; style: ${plane.planeStyle}; scan: ${plane.scanMode} with ${plane.viewCount} views; score: ${plane.score}/100; symmetry: ${plane.symmetry}%; outline: ${plane.outline}/100; predicted range: ${plane.range}; confidence: ${plane.confidence}%; last flight: ${plane.lastFlight}; evidence: ${plane.evidence.join(" | ")}; scan note: ${plane.headline}; suggested test: ${plane.nextTest}`
      : "No plane scan is loaded.",
    "",
    "FLIGHT TRACKER",
    flight
      ? `Profile: ${flight.profile}; airtime: ${flight.airtime}s; curve: ${flight.curve}/100; stability: ${flight.stability}/100; relative speed: ${flight.relativeSpeed}/100; drift: ${flight.driftDirection}; confidence: ${flight.confidence}%; observations: ${flight.observations.join(" | ")}`
      : "No tracked flight is loaded.",
    "",
    "SAVED FLIGHTS",
    history.flightsLogged
      ? `${history.planeName}: ${history.flightsLogged} flights; average ${history.averageDistance.toFixed(1)} ft; best ${history.bestDistance.toFixed(1)} ft; recent distances ${history.recentDistances.map((value) => `${value.toFixed(1)} ft`).join(", ")}`
      : "No saved distance measurements.",
    "",
    "PREVIOUS TEST RESULTS",
    context.coachMemory?.length ? context.coachMemory.map((item) => `${item.action} => ${item.result}`).join(" | ") : "No completed coach tests yet.",
    "",
    "Start by telling me the single best thing to test next and why.",
  ];
  return lines.join("\n");
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
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
  const [handoffStatus, setHandoffStatus] = useState("");
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
      setMessages((current) => [...current, { role: "assistant", source: "cloud", text: payload.reply! }]);
    } catch {
      setMessages((current) => [...current, {
        role: "assistant",
        source: "device",
        text: deviceReply(clean, context, history, current.filter((item) => item.role === "assistant").slice(-4).map((item) => item.text)),
      }]);
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void askCoach(input);
  }

  function askChatGPT() {
    const history = loadFlightHistory();
    const prompt = buildChatGptPrompt(context, history);
    window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    void copyText(prompt).then(() => {
      setHandoffStatus("Scan report copied. Paste it into the ChatGPT tab that just opened.");
    });
  }

  return (
    <aside className={`pro-coach ${open ? "open" : ""}`}>
      {open && <div className="pro-coach-panel" role="dialog" aria-label="Flight Lab Pro Coach">
        <header>
          <div><span><i /> Pro Coach</span><b>{status}</b></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close Pro Coach">×</button>
        </header>
        {!hasAnalysis && <p className="pro-coach-context">For the smartest answer, run a plane scan or video analysis first. Photos and videos stay on your device; only measurements, test results, and your message can be sent to the cloud coach.</p>}
        <div className="pro-coach-messages" aria-live="polite">
          {messages.map((message, index) => <div className={message.role} key={`${message.role}-${index}`}>
            {message.role === "assistant" && <small>{message.source === "cloud" ? "Evidence-aware cloud coach" : "On-device coach"}</small>}
            <p>{message.text}</p>
          </div>)}
          {sending && <div className="assistant thinking"><small>Pro Coach</small><p><i /><i /><i /></p></div>}
          <div ref={endRef} />
        </div>
        <div className="pro-coach-prompts">
          {QUICK_PROMPTS.map((prompt) => <button type="button" key={prompt} onClick={() => void askCoach(prompt)}>{prompt}</button>)}
        </div>
        <div className="pro-chatgpt-handoff">
          <button type="button" onClick={askChatGPT}>Open ChatGPT with this scan</button>
          {handoffStatus && <small role="status">{handoffStatus}</small>}
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
