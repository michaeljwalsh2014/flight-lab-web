"use client";
import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { scrollToReplyStart } from "./coach-scroll";
import type { FreeUsage } from "./free-usage";
export const FREE_USAGE_EVENT = "flight-lab-free-usage-updated";
export function useFreeAllowance(enabled = true) {
  const [usage, setUsage] = useState<FreeUsage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/free-ai"); const data = await response.json() as FreeUsage & { message?: string };
        if (!active) return;
        if (response.ok || response.status === 401) { setUsage(data); setError(""); }
        else setError(data.message || "Your free allowance could not be loaded.");
      } catch { if (active) setError("Your free allowance could not be loaded. Try again shortly."); }
    };
    void refresh();
    window.addEventListener(FREE_USAGE_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener(FREE_USAGE_EVENT, refresh); window.removeEventListener("focus", refresh); };
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !usage?.resetsAt) return;
    const delay = Math.max(1000, new Date(usage.resetsAt).getTime() - Date.now() + 250);
    if (!Number.isFinite(delay)) return;
    const timer = window.setTimeout(() => window.dispatchEvent(new Event(FREE_USAGE_EVENT)), Math.min(delay, 86400000));
    return () => window.clearTimeout(timer);
  }, [enabled, usage]);
  return { usage, error, setUsage };
}
export default function FreeCoach({ context }: { context: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const { usage, error: allowanceError, setUsage } = useFreeAllowance();
  const messageList = useRef<HTMLDivElement>(null);
  const latestReply = useRef<HTMLParagraphElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (window.location.hash === "#free-coach") setOpen(true); }, []);
  useLayoutEffect(() => {
    if (open && messageList.current && latestReply.current) scrollToReplyStart(messageList.current, latestReply.current);
  }, [open, messages]);
  useEffect(() => {
    if (!open) return;
    textarea.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); launcher.current?.focus(); } };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, [open]);
  async function send(event: FormEvent) {
    event.preventDefault(); const message = input.trim();
    if (!message || busy || !usage?.authenticated || usage.messagesRemaining <= 0) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/free-ai", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(28000), body: JSON.stringify({ action: "message", message, history: messages.slice(-10), context }) });
      const data = await response.json() as { reply?: string; usage?: FreeUsage; message?: string };
      if (data.usage) setUsage(data.usage);
      if (!response.ok || typeof data.reply !== "string") { if (response.status === 401) setUsage({ authenticated: false } as FreeUsage); setError(data.message || "Coach could not respond. Try again shortly."); window.dispatchEvent(new Event(FREE_USAGE_EVENT)); return; }
      setMessages(current => [...current, { role: "user", text: message }, { role: "assistant", text: data.reply }].slice(-40) as typeof messages);
      setInput(""); window.dispatchEvent(new Event(FREE_USAGE_EVENT));
    } catch { setError("The connection was interrupted. Your question is still here; try again shortly."); }
    finally { setBusy(false); }
  }
  return <aside className="free-coach" aria-label="Free Flight Lab Coach">
    {open && <section id="free-coach-panel" className="free-coach-panel" role="dialog" aria-label="Flight Lab Coach">
      <header><div><span className="kicker">Your flying partner</span><h2>Flight Lab Coach</h2></div><button type="button" aria-label="Close free Coach" onClick={() => { setOpen(false); launcher.current?.focus(); }}>×</button></header>
      <p className="free-coach-allowance">{usage?.authenticated ? `${usage.messagesRemaining} of 20 messages left today` : "20 Coach messages every day, free."}</p>
      <div ref={messageList} className="free-coach-messages" aria-live="polite"><p className="assistant">Hi! Ask me about a flight, a fold, or your next experiment. We can chat without a photo.</p>{messages.map((item, index) => <p ref={item.role === "assistant" && index === messages.length - 1 ? latestReply : undefined} className={item.role} key={index}><small>{item.role === "user" ? "You" : "Coach"}</small>{item.text}</p>)}{busy && <p role="status">Coach is thinking…</p>}</div>
      <button type="button" className="free-coach-more" aria-expanded={expanded} aria-controls="free-coach-details" onClick={() => setExpanded(value => !value)}>{expanded ? "Show less" : "Show more"}</button>
      {expanded && <div id="free-coach-details"><p>Includes 20 messages and three photo inspections every day. Both reset at 6 a.m. Central, with daylight saving time handled automatically.</p>{usage?.authenticated && <p>{usage.photosRemaining} inspections remaining. Resets at 6 a.m. Central on {new Date(usage.resetsAt).toLocaleDateString("en-US", { timeZone: "America/Chicago" })}.</p>}<p>Photo checks run on your device. Coach receives your question and a brief summary of the current plane.</p></div>}
      {usage && !usage.authenticated && <p className="free-coach-signin"><a href="/signin-with-chatgpt?return_to=%2F%23free-coach">Sign in free to start</a><small>Your allowance follows your account across devices.</small></p>}
      {usage?.authenticated && usage.messagesRemaining === 0 && <p role="status">You’ve used your 20 messages. Your free allowance resets at 6 a.m. Central on {new Date(usage.resetsAt).toLocaleDateString("en-US", { timeZone: "America/Chicago" })}.</p>}
      {(error || allowanceError) && <p role="alert" className="free-coach-error">{error || allowanceError}</p>}
      <form onSubmit={send}><label className="sr-only" htmlFor="free-coach-question">Ask the free Coach</label><textarea ref={textarea} id="free-coach-question" rows={2} maxLength={600} value={input} onChange={event => setInput(event.target.value)} placeholder="Ask about your next flight…" disabled={busy || !usage?.authenticated || usage.messagesRemaining === 0} /><button type="submit" disabled={busy || !input.trim() || !usage?.authenticated || usage.messagesRemaining === 0}>{busy ? "Thinking…" : "Send"}</button></form>
    </section>}
    <button ref={launcher} id="free-coach" type="button" className="free-coach-launcher" aria-expanded={open} aria-controls="free-coach-panel" onClick={() => setOpen(value => !value)}><svg className="free-coach-plane-icon" aria-hidden="true" viewBox="0 0 32 32" fill="none"><path d="M3 14.5 28 4l-8.5 24-5-9-11.5-4.5Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"/><path d="m14.5 19 13.5-15M14.5 19l-2 8 7-5" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"/></svg>{open ? "Close Coach" : "Talk to Coach"}</button>
  </aside>;
}
