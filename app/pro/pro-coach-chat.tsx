"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { PRO_AI_CONTEXT_EVENT, readProAiContext, type ProAiContext } from "./pro-ai-context";

type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  text: string;
  source?: "cloud" | "device" | "web";
};

type FlightHistoryContext = {
  planeId: number | null;
  planeName: string;
  flightsLogged: number;
  averageDistance: number;
  bestDistance: number;
  recentDistances: number[];
};

type FeedbackReason = "wrong" | "unrelated" | "repetitive" | "too-plane-focused";
type CoachLesson = { reason: FeedbackReason; cue: string; createdAt: number };
type PendingRepair = { cue: string; reply: string };
type KnowledgeAnswer = { answer: string; source: string; sourceName: string };

const FEEDBACK_OPTIONS: Array<{ reason: FeedbackReason; label: string }> = [
  { reason: "wrong", label: "It was wrong" },
  { reason: "unrelated", label: "It didn’t listen" },
  { reason: "repetitive", label: "It repeated itself" },
  { reason: "too-plane-focused", label: "Too much plane talk" },
];

const QUICK_PROMPTS = [
  "How’s it going?",
  "Find me a plane to fold",
  "What do you like to do?",
  "What should I improve?",
  "Why did my plane turn?",
  "What should I test next?",
];

const TRUSTED_PLANE_LINKS = {
  arrowhead: {
    page: "https://www.foldableflight.com/arrowhead-paper-airplane",
    video: "https://www.youtube.com/watch?v=3-IyNvisOcc",
  },
  marauder: {
    page: "https://www.foldableflight.com/marauder-paper-airplane",
  },
  designYourOwn: {
    guide: "https://www.foldableflight.com/post/how-to-design-your-own-paper-airplane",
    video: "https://www.youtube.com/watch?v=ctvbtzJU9j8",
  },
  library: "https://www.foldableflight.com/the-planes",
  walshWonders: {
    channel: "https://www.youtube.com/@walshwonders/videos",
    cobra: "https://www.youtube.com/watch?v=JTKSXclJboM",
    platinumX: "https://www.youtube.com/watch?v=rQwIQ3wBm8k",
    flappingWing: "https://www.youtube.com/watch?v=4JIk7im3XHM",
    dart: "https://www.youtube.com/watch?v=GjGayirpzB0",
    shockedMe: "https://www.youtube.com/watch?v=fCU6eZP07xw",
  },
};

function pairedPlaneRecommendation(message: string) {
  const question = message.toLowerCase();
  if (!/recommend|suggest|pick|choose|find me|what.*(plane|airplane).*fold|plane.*(make|try|build)|favorite.*(plane|airplane)/.test(question)) return null;

  if (/flap|bird|unusual|weird|unique|cool-looking|trick/.test(question)) {
    return `Here are two different planes to try:\n\nWalsh Wonders: “Flapping wing paper airplane!!!” — an unusual design whose wings flap in flight. ${TRUSTED_PLANE_LINKS.walshWonders.flappingWing}\n\nFoldable Flight: Arrowhead — an easy, locked dart built for fast, long flights. ${TRUSTED_PLANE_LINKS.arrowhead.video}\n\nWant another pair for distance, gliding, or easy folding?`;
  }
  if (/dart|fast|speed/.test(question)) {
    return `Here are two fast-plane choices:\n\nWalsh Wonders: “Amazing paper airplane dart.” ${TRUSTED_PLANE_LINKS.walshWonders.dart}\n\nFoldable Flight: Marauder — one of the fastest darts in its official library. ${TRUSTED_PLANE_LINKS.marauder.page}\n\nTry both with the same paper and compare three throws each.`;
  }
  if (/glid|airtime|slow|smooth/.test(question)) {
    return `Here are two gliders to compare:\n\nWalsh Wonders: C-13 Cobra — described on the channel as one of its best gliders. ${TRUSTED_PLANE_LINKS.walshWonders.cobra}\n\nFoldable Flight: browse its verified glider collection and choose one at your preferred difficulty. ${TRUSTED_PLANE_LINKS.library}\n\nMeasure three flights from each before choosing a winner.`;
  }
  return `I’d try one plane from each creator:\n\nWalsh Wonders: Platinum X — an easy-to-fold glider that the channel describes as one of its best. ${TRUSTED_PLANE_LINKS.walshWonders.platinumX}\n\nFoldable Flight: Arrowhead — an easy dart with a strong locking fold and an official step-by-step tutorial. ${TRUSTED_PLANE_LINKS.arrowhead.video}\n\nThey make a good comparison: Platinum X for gliding, Arrowhead for speed and distance. More Walsh Wonders planes: ${TRUSTED_PLANE_LINKS.walshWonders.channel}`;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

function numberFromToken(token: string) {
  const normalized = token.toLowerCase();
  if (normalized in NUMBER_WORDS) return NUMBER_WORDS[normalized];
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function arithmeticReply(message: string) {
  const normalized = message.toLowerCase().replace(/[?,!]/g, " ").replace(/what(?:'s| is)|calculate|solve|equals?/g, " ").replace(/\s+/g, " ").trim();
  const match = normalized.match(/^(-?\d+(?:\.\d+)?|[a-z]+)\s*(plus|add|added to|\+|minus|subtract|less|−|-|times|multiplied by|x|×|\*|divided by|over|\/|÷)\s*(-?\d+(?:\.\d+)?|[a-z]+)$/);
  if (!match) return null;
  const left = numberFromToken(match[1]);
  const right = numberFromToken(match[3]);
  if (left === null || right === null) return null;
  const operator = match[2];
  let result: number;
  if (/plus|add|added to|\+/.test(operator)) result = left + right;
  else if (/minus|subtract|less|−|-/.test(operator)) result = left - right;
  else if (/times|multiplied by|^x$|×|\*/.test(operator)) result = left * right;
  else {
    if (right === 0) return "You can’t divide by zero.";
    result = left / right;
  }
  return `${left} ${operator} ${right} = ${Number.isInteger(result) ? result : Number(result.toFixed(6))}.`;
}

function youtubeSearchUrl(query: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${query} paper airplane tutorial`)}`;
}

function planeDiscoveryReply(message: string) {
  const question = message.toLowerCase();
  const paired = pairedPlaneRecommendation(message);
  if (paired) return paired;
  if (/walsh wonders|your (youtube )?channel|michael'?s plane/.test(question)) {
    return `Walsh Wonders has several verified plane videos. Try C-13 Cobra for gliding: ${TRUSTED_PLANE_LINKS.walshWonders.cobra}\nOr the flapping-wing paper airplane for something unusual: ${TRUSTED_PLANE_LINKS.walshWonders.flappingWing}\nChannel: ${TRUSTED_PLANE_LINKS.walshWonders.channel}`;
  }
  if (/favorite.*(paper )?(plane|airplane)|which (paper )?(plane|airplane) do you (like|love)/.test(question)) {
    return `Arrowhead is one of my favorites from Foldable Flight. It is easy to fold, has a strong locking fold, and is built for fast, long flights. Official tutorial: ${TRUSTED_PLANE_LINKS.arrowhead.video}\nDesign page: ${TRUSTED_PLANE_LINKS.arrowhead.page}`;
  }
  if (/design (my|your|a|an|own)|make my own|invent.*(plane|airplane)|how.*design/.test(question)) {
    return `Start with Foldable Flight’s guide to designing your own paper airplane. It explains how lift, drag, thrust, wing size, and strong leading edges work together. Guide: ${TRUSTED_PLANE_LINKS.designYourOwn.guide}\nVideo: ${TRUSTED_PLANE_LINKS.designYourOwn.video}`;
  }
  if (/arrowhead/.test(question)) {
    return `Here is Foldable Flight’s official Arrowhead tutorial: ${TRUSTED_PLANE_LINKS.arrowhead.video}\nPlane details: ${TRUSTED_PLANE_LINKS.arrowhead.page}`;
  }
  if (/marauder/.test(question)) {
    return `Marauder is a very fast Foldable Flight dart. Start with its official design page: ${TRUSTED_PLANE_LINKS.marauder.page}\nYouTube results: ${youtubeSearchUrl("Foldable Flight Marauder")}`;
  }
  if (/bandit/.test(question)) {
    return `I couldn’t verify a Foldable Flight design named Bandit in my trusted saved catalog, so I won’t invent details. Here is a live YouTube search you can check: ${youtubeSearchUrl("Foldable Flight Bandit")}`;
  }
  if (/find|search|youtube|video|tutorial|fold|plane design|paper airplane to make|recommend.*(plane|airplane)/.test(question)) {
    const usefulQuery = message.replace(/\b(find|search|show|give|tell|youtube|video|tutorial|please|me|for)\b/gi, " ").replace(/\s+/g, " ").trim() || "Foldable Flight easy";
    return `I can help you look for a design without a paid AI account. Browse Walsh Wonders: ${TRUSTED_PLANE_LINKS.walshWonders.channel}\nBrowse Foldable Flight’s verified plane library: ${TRUSTED_PLANE_LINKS.library}\nLive YouTube search for “${usefulQuery}”: ${youtubeSearchUrl(usefulQuery)}`;
  }
  return null;
}

function messageWithLinks(text: string) {
  const pieces = text.split(/(https?:\/\/[^\s]+)/g);
  return pieces.map((piece, index) => piece.startsWith("http")
    ? <a key={`${piece}-${index}`} href={piece} target="_blank" rel="noopener noreferrer">{piece}</a>
    : piece);
}

function shouldLookUpKnowledge(message: string) {
  if (arithmeticReply(message) || planeDiscoveryReply(message)) return false;
  const question = message.trim().toLowerCase();
  const explicitlyRequestsLookup = /\b(look up|search (?:for|the web|online)|browse|google|find (?:a )?source|cite (?:a |your )?source|give me (?:a )?source|verify online|check online|check the web)\b/.test(question);
  const clearlyNeedsFreshInformation = /\b(latest|right now|currently|current (?:record|holder|president|leader|champion|score|price|weather)|today(?:'s)?|tonight(?:'s)?|this (?:week|month|year)|live (?:score|result|weather)|weather (?:today|tomorrow|in)|score (?:today|tonight|of))\b/.test(question);
  return explicitlyRequestsLookup || clearlyNeedsFreshInformation;
}

async function lookUpKnowledge(question: string): Promise<KnowledgeAnswer | null> {
  try {
    const response = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Flight-Lab-Pro-Path": window.location.pathname },
      body: JSON.stringify({ question }),
    });
    if (!response.ok) return null;
    const result = await response.json() as Partial<KnowledgeAnswer>;
    return typeof result.answer === "string" && typeof result.source === "string" && typeof result.sourceName === "string"
      ? result as KnowledgeAnswer
      : null;
  } catch {
    return null;
  }
}

async function askConversationalCoach(message: string, history: ChatMessage[], context: ProAiContext) {
  try {
    const response = await fetch("/api/pro-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Flight-Lab-Pro-Path": window.location.pathname },
      body: JSON.stringify({ message, history, context, coachId: getScanClientId() }),
    });
    if (!response.ok) return null;
    const reply = (await response.text()).trim();
    return reply || null;
  } catch {
    return null;
  }
}

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

function isFrustrated(message: string) {
  const text = message.toLowerCase();
  return /\b(you('| a)?re|you are|that (answer|reply)|this (answer|reply)|your answer|coach).{0,28}\b(stupid|dumb|bad|useless|terrible|wrong|annoying)\b/.test(text)
    || /\b(didn'?t listen|not listening|not helpful|stop repeating|that made no sense)\b/.test(text);
}

function thinkingDelay(message: string, hasEvidence: boolean) {
  if (isFrustrated(message) || /^(hi|hey|hello|thanks|bye)[!. ]*$/i.test(message)) return 900;
  if (planeDiscoveryReply(message)) return 5200;
  if (arithmeticReply(message)) return 3600;
  if (shouldLookUpKnowledge(message)) return 4200;
  if (hasEvidence || /turn|dive|stall|wobble|distance|improve|test|flight|wing/i.test(message)) return 5000;
  return 1800;
}

function thinkingLabel(message: string, hasEvidence: boolean) {
  if (isFrustrated(message)) return "Reviewing what I missed";
  if (planeDiscoveryReply(message)) return "Understanding what you want to build";
  if (arithmeticReply(message)) return "Checking the calculation";
  if (shouldLookUpKnowledge(message)) return "Checking the question";
  if (hasEvidence) return "Checking your plane history";
  if (/turn|dive|stall|wobble|distance|flight|wing/i.test(message)) return "Working through the flight clues";
  return "Thinking about your question";
}

function thinkingSteps(message: string, hasEvidence: boolean) {
  if (planeDiscoveryReply(message)) return ["Understanding what you want to build", "Checking trusted plane sources", "Preparing useful links"];
  if (arithmeticReply(message)) return ["Reading the calculation", "Checking the operation", "Verifying the result"];
  if (shouldLookUpKnowledge(message)) return ["Understanding the question", "Checking a current source", "Verifying the answer and link"];
  if (hasEvidence) return ["Checking your plane history", "Comparing the flight clues", "Choosing one careful next test"];
  return [thinkingLabel(message, hasEvidence), "Thinking about what you meant", "Answering directly"];
}

function deviceReply(message: string, context: ProAiContext, history: FlightHistoryContext, conversation: ChatMessage[], lessons: CoachLesson[]) {
  const question = message.toLowerCase();
  const flight = context.flight;
  const plane = context.plane;
  const lastTest = context.coachMemory?.filter((item) => item.planeId === history.planeId).slice(-1)[0];
  const recentReplies = conversation.filter((item) => item.role === "assistant").slice(-4).map((item) => item.text);
  const previousUser = [...conversation].reverse().find((item) => item.role === "user")?.text.toLowerCase() ?? "";
  const topicQuestion = /\b(it|that|this|the same|still)\b/.test(question) ? `${previousUser} ${question}` : question;
  let variant = nextDeviceVariant();
  const recentLessons = lessons.slice(-12);
  const avoidPlanePivot = recentLessons.some((lesson) => lesson.reason === "too-plane-focused");
  const clarifyWhenUnsure = recentLessons.some((lesson) => lesson.reason === "wrong" || lesson.reason === "unrelated");
  variant += recentLessons.filter((lesson) => lesson.reason === "repetitive").length;

  const arithmetic = arithmeticReply(message);
  if (arithmetic) return arithmetic;

  const discovery = planeDiscoveryReply(message);
  if (discovery) return discovery;

  if (isFrustrated(message)) {
    return "I can tell my last answer missed what you wanted. I’m sorry. Tell me what went wrong below, and I’ll remember it on this device instead of repeating the same mistake.";
  }

  if (/\b(how((?:['’]s)| is) (your )?day|how are you|how((?:['’]s)| is) it going|what['’]?s up)\b/.test(question)) {
    return choice([
      "I’m doing well—thanks for asking! I’m here to chat, and whenever you feel like working on a plane, I can help with that too.",
      "Pretty good! I’ve been thinking about tiny wings and big flights, but we can just talk too. How’s your day going?",
      "I’m doing great. No photo required—we can chat normally, or look at your plane whenever you’re ready.",
    ], variant);
  }
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)[!. ]*$/.test(question.trim())) {
    return choice([
      "Hey! Good to see you. What’s on your mind?",
      "Hi! How’s it going?",
      "Hey there—I’m listening.",
    ], variant);
  }
  if (/\b(thank you|thanks|appreciate it)\b/.test(question)) {
    return choice(["You’re welcome!", "Anytime!", "Of course—happy to help."], variant);
  }
  if (/\b(what do you (like|love)|what are you into|your favorite thing)\b/.test(question)) {
    if (avoidPlanePivot) return "I like solving puzzles, noticing patterns, and hearing what people are building or thinking about. What do you like to do?";
    return choice([
      "I like helping people turn one sheet of paper into a better-flying plane. Tiny fold changes can make a surprisingly big difference. What do you like building?",
      "Paper airplanes are definitely my thing—especially figuring out why one dives, stalls, or suddenly flies perfectly. What are you into?",
      "I like experiments: one small change, three fair test flights, and a clear result. Outside of planes, I’m always happy to hear what you enjoy.",
    ], variant);
  }
  if (/\bwhat (?:are you|you['’]?re) (?:going to|gonna) do\b|\bwhat will you do\b/.test(question)) {
    return "I’m going to answer what you actually ask, help when you want it, and only look something up when the question really needs fresh information. What do you feel like doing?";
  }
  if (/\b(who are you|what are you|what can you do|how can you help)\b/.test(question)) {
    return "I’m the Flight Lab Coach. I can chat, help diagnose dives, stalls, turns, wobbling, and distance problems, and use your saved scans and test flights when you have them.";
  }
  if (/\b(what('?s| is) your name|your name)\b/.test(question)) return "You can call me Flight Lab Coach. What should I call you?";
  if (/\b(joke|make me laugh)\b/.test(question)) {
    return choice([
      "Why did the paper airplane get promoted? It always went above and beyond.",
      "My favorite kind of paperwork is the kind that flies across the room.",
      "A paper airplane walked into a hangar. The mechanic said, ‘You look a little folded.’",
    ], variant);
  }
  if (/\b(bye|goodbye|see you|gotta go)\b/.test(question)) return "See you next flight! Keep the changes small and the test throws fair.";
  if (/\b(i('?m| am) (good|great|awesome|happy)|my day('?s| is) (good|great))\b/.test(question)) return "That’s great to hear! What’s been the best part?";
  if (/\b(i('?m| am) (bad|sad|tired|upset)|rough day|not good)\b/.test(question)) return "I’m sorry it’s been rough. We can talk for a bit, or do a small plane experiment if you want a change of pace.";
  if (/\b(why|how).*(plane|airplane).*(fly|flies|stay up)\b|\blift\b/.test(question)) {
    return "A paper airplane stays up because moving air pushes on its wings while its forward speed carries it ahead. The folds, balance point, wing angle, and throw decide whether that airflow becomes a smooth glide or a dive, stall, or turn.";
  }
  if (/\b(best paper|which plane|dart or glider)\b/.test(question)) return "Choose Dart for speed and distance, or Glider for a slower, steadier flight. The better one depends on whether you want range or airtime.";
  if (/\b(can you (hear|talk|speak)|voice)\b/.test(question)) return "Yes—tap Start voice and I’ll use your browser’s built-in listening and speaking tools. You can also type anytime.";

  function compose(currentVariant: number) {
    if (!plane && !flight) {
      if (/turn|left|right|curve|drift/.test(topicQuestion)) return "Let’s narrow down the turn. Does it curve immediately after release, or begin turning near the end of the flight—and which direction does it go?";
      if (/dive|nose.?down|ground/.test(topicQuestion)) return "Does it dive immediately, or glide first and then drop? An immediate dive usually points to balance or launch angle; a later drop can mean it simply ran out of speed.";
      if (/stall|climb|loop|nose.?up/.test(topicQuestion)) return "Does it climb steeply and then fall backward? If so, try one smoother, more level throw before changing any folds.";
      if (/wobble|shake|rock|unstable/.test(topicQuestion)) return "Check the plane from the front: do both wings rise by the same amount? Uneven wing angles are a common cause of wobbling.";
      if (/distance|far|range/.test(topicQuestion)) return "For more distance, tell me whether you’re flying a Dart or Glider and whether it dives, stalls, turns, or simply slows down.";
      if (/improve|help|wrong|fix|test next/.test(topicQuestion)) return "Tell me what the plane does most often: dives, stalls, turns, wobbles, or flies straight but not very far. I’ll choose one small test from that.";
      if (clarifyWhenUnsure) return "I don’t want to guess past your question again. What part should I focus on?";
      return choice([
        "I’m best at paper airplanes, but we can still chat. Tell me a little more about what you mean.",
        "I’m listening. If this is about a plane, describe what it does in the air; otherwise, tell me more.",
        "Tell me more about that. I won’t ask for a scan unless measurements would actually help.",
      ], currentVariant);
    }

    const asksAboutTurn = /turn|left|right|curve|drift/.test(topicQuestion);
    const asksAboutDistance = /distance|far|best|range/.test(topicQuestion);
    const asksForTest = /test|next|try|improve|change/.test(topicQuestion);
    let issue: "drift" | "visual" | "symmetry" | "stability" | "curve" | "outline" | "distance" | "general" = "general";
    if (asksAboutTurn && flight?.driftDirection && flight.driftDirection !== "straight") issue = "drift";
    else if (asksAboutDistance) issue = "distance";
    else if (plane?.vision?.issues.length) issue = "visual";
    else if (plane && plane.symmetry < 82) issue = "symmetry";
    else if (flight && flight.stability < 72) issue = "stability";
    else if (flight && flight.curve > 38) issue = "curve";
    else if (plane && plane.outline < 68) issue = "outline";

    const evidence = {
      drift: flight ? `The tracked path drifted ${flight.driftDirection} with a curve score of ${flight.curve}/100.` : "",
      visual: plane?.vision ? `Cloud vision found “${plane.vision.issues[0]}” at ${plane.vision.confidence}% inspection confidence; the reconstructed mesh measured ${plane.mesh?.leftRightBalance ?? plane.symmetry}% left/right balance.` : "",
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
      visual: plane?.vision?.noseAlignment === "left" || plane?.vision?.noseAlignment === "right"
        ? `Set the plane on a table and realign only the nose fold that points ${plane.vision.noseAlignment}; leave both wings unchanged.`
        : plane?.vision?.wingDihedral === "uneven"
          ? "View the plane directly from the nose and match the two wing-rise angles without changing the rear edges."
          : plane?.vision?.foldDefinition === "soft"
            ? "Sharpen only the center crease from nose to tail, keeping the wing angles unchanged."
            : (plane?.nextTest ?? "Correct only the clearest mismatch from the visual inspection, then keep every other fold fixed."),
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

type VoiceState = "idle" | "listening" | "speaking" | "error";
type BrowserRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type BrowserRecognitionConstructor = new () => BrowserRecognition;

function getRecognitionConstructor() {
  const voiceWindow = window as typeof window & {
    SpeechRecognition?: BrowserRecognitionConstructor;
    webkitSpeechRecognition?: BrowserRecognitionConstructor;
  };
  return voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition ?? null;
}

export default function ProCoachChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState("Thinking about your question");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceError, setVoiceError] = useState("");
  const [context, setContext] = useState<ProAiContext>({});
  const [lessons, setLessons] = useState<CoachLesson[]>([]);
  const [pendingRepair, setPendingRepair] = useState<PendingRepair | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", source: "device", text: "Hey! I’m your Flight Lab Coach. We can talk normally, and whenever you’re ready I can help understand a flight or plan the next plane test." },
  ]);
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const voiceActiveRef = useRef(false);
  const speakingRef = useRef(false);
  const messagesReadyRef = useRef(false);
  const askCoachRef = useRef<(text: string, speakReply?: boolean) => void>(() => undefined);

  useEffect(() => {
    setContext(readProAiContext());
    const receiveContext = (event: Event) => setContext((event as CustomEvent<ProAiContext>).detail);
    window.addEventListener(PRO_AI_CONTEXT_EVENT, receiveContext);
    return () => window.removeEventListener(PRO_AI_CONTEXT_EVENT, receiveContext);
  }, []);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem("flight-lab-coach-conversation") ?? "[]") as ChatMessage[];
      const safe = stored.filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.text === "string").slice(-20);
      if (safe.length) setMessages(safe);
      const storedLessons = JSON.parse(window.localStorage.getItem("flight-lab-coach-lessons") ?? "[]") as CoachLesson[];
      const safeLessons = storedLessons.filter((item) => item && FEEDBACK_OPTIONS.some((option) => option.reason === item.reason) && typeof item.cue === "string").slice(-30);
      if (safeLessons.length) setLessons(safeLessons);
    } catch { /* Start a fresh conversation. */ }
    queueMicrotask(() => { messagesReadyRef.current = true; });
  }, []);

  useEffect(() => {
    if (!messagesReadyRef.current) return;
    window.localStorage.setItem("flight-lab-coach-conversation", JSON.stringify(messages.slice(-20)));
  }, [messages]);

  useEffect(() => () => {
    voiceActiveRef.current = false;
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
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

  function stopVoice() {
    voiceActiveRef.current = false;
    speakingRef.current = false;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    window.speechSynthesis?.cancel();
    setVoiceState("idle");
  }

  function resumeListening() {
    if (!voiceActiveRef.current || speakingRef.current || !recognitionRef.current) return;
    try {
      recognitionRef.current.start();
      setVoiceState("listening");
    } catch { /* The browser is already restarting recognition. */ }
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    speakingRef.current = true;
    setVoiceState("speaking");
    recognitionRef.current?.stop();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.03;
    utterance.pitch = 1;
    utterance.onend = () => {
      speakingRef.current = false;
      if (voiceActiveRef.current) window.setTimeout(resumeListening, 180);
      else setVoiceState("idle");
    };
    utterance.onerror = () => {
      speakingRef.current = false;
      if (voiceActiveRef.current) resumeListening();
    };
    window.speechSynthesis.speak(utterance);
  }

  function startVoice() {
    if (voiceState !== "idle" && voiceState !== "error") return;
    setOpen(true);
    setVoiceError("");
    const Recognition = getRecognitionConstructor();
    if (!Recognition || !("speechSynthesis" in window)) {
      setVoiceState("error");
      setVoiceError("Built-in voice is not supported by this browser. You can keep chatting by typing.");
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result?.[0]?.transcript?.trim() ?? "";
      if (transcript) askCoachRef.current(transcript, true);
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      voiceActiveRef.current = false;
      setVoiceState("error");
      setVoiceError(event.error === "not-allowed"
        ? "Microphone access was blocked. Allow it in your browser, or keep chatting by typing."
        : "Browser voice stopped working. Tap Start voice to try again, or keep typing.");
    };
    recognition.onend = () => {
      if (voiceActiveRef.current && !speakingRef.current) window.setTimeout(resumeListening, 180);
    };
    recognitionRef.current = recognition;
    voiceActiveRef.current = true;
    resumeListening();
  }

  function askCoach(text: string, speakReply = false) {
    const clean = text.trim().slice(0, 600);
    if (!clean || sending) return;
    const userMessage: ChatMessage = { role: "user", text: clean };
    const previous = messages.slice(-10);
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setSending(true);
    const steps = thinkingSteps(clean, hasAnalysis);
    const delay = thinkingDelay(clean, hasAnalysis);
    setThinkingStatus(steps[0]);
    if (delay >= 3000) {
      window.setTimeout(() => setThinkingStatus(steps[1]), Math.min(1800, delay * .38));
      window.setTimeout(() => setThinkingStatus(steps[2]), Math.min(3600, delay * .72));
    }
    const history = loadFlightHistory();
    const webReply = planeDiscoveryReply(clean);
    const reply = deviceReply(clean, context, history, previous, lessons);
    const needsLookup = shouldLookUpKnowledge(clean);
    const knowledgePromise = needsLookup ? lookUpKnowledge(clean) : Promise.resolve(null);
    const coachPromise = needsLookup || webReply ? Promise.resolve(null) : askConversationalCoach(clean, previous, context);
    if (isFrustrated(clean)) {
      const cue = [...previous].reverse().find((item) => item.role === "user")?.text ?? clean;
      const lastReply = [...previous].reverse().find((item) => item.role === "assistant")?.text ?? "";
      setPendingRepair({ cue, reply: lastReply });
    }
    window.setTimeout(async () => {
      const [knowledge, cloudReply] = await Promise.all([knowledgePromise, coachPromise]);
      const finalReply = knowledge ? `${knowledge.answer}\n\nSource: ${knowledge.sourceName}\n${knowledge.source}` : cloudReply ?? reply;
      const source: ChatMessage["source"] = knowledge || webReply ? "web" : cloudReply ? "cloud" : "device";
      setMessages((current) => [...current, { id: globalThis.crypto?.randomUUID?.(), role: "assistant", source, text: finalReply }]);
      setSending(false);
      if (speakReply && voiceActiveRef.current) speak(knowledge?.answer ?? cloudReply ?? reply);
    }, delay);
  }

  function requestRepair(reply: string, index: number) {
    const cue = [...messages.slice(0, index)].reverse().find((item) => item.role === "user")?.text ?? "General conversation";
    setPendingRepair({ cue, reply });
  }

  function rememberLesson(reason: FeedbackReason) {
    if (!pendingRepair) return;
    const lesson: CoachLesson = { reason, cue: pendingRepair.cue.slice(0, 180), createdAt: Date.now() };
    setLessons((current) => {
      const next = [...current, lesson].slice(-30);
      window.localStorage.setItem("flight-lab-coach-lessons", JSON.stringify(next));
      return next;
    });
    const acknowledgement = {
      wrong: "Got it. I’ll be more careful about claiming an answer is correct when I don’t have enough evidence.",
      unrelated: "Got it. I’ll focus on the exact question and ask for clarification when I’m unsure.",
      repetitive: "Got it. I’ll avoid that response pattern and choose a different approach next time.",
      "too-plane-focused": "Got it. I’ll keep normal conversation normal instead of steering everything back to airplanes.",
    }[reason];
    setPendingRepair(null);
    setMessages((current) => [...current, { id: globalThis.crypto?.randomUUID?.(), role: "assistant", source: "device", text: acknowledgement }]);
  }

  askCoachRef.current = askCoach;

  function submit(event: FormEvent) {
    event.preventDefault();
    askCoach(input);
  }

  return (
    <aside className={`pro-coach ${open ? "open" : ""}`}>
      {open && <div className="pro-coach-panel" role="dialog" aria-label="Flight Lab Coach">
        <header>
          <div><span><i /> Flight Lab Coach</span><b>{voiceState === "speaking" ? "Coach is speaking" : voiceState === "listening" ? "Listening" : status}</b></div>
          <button type="button" onClick={() => { stopVoice(); setOpen(false); }} aria-label="Close Flight Lab Coach">×</button>
        </header>
        {!hasAnalysis && <p className="pro-coach-context">You can chat with me normally—no upload required. I answer directly and only check outside sources when you ask me to look something up or the answer clearly needs current information.</p>}
        <div className={`pro-coach-voice ${voiceState}`}>
          <div className="voice-orb" aria-hidden="true"><i /><i /><i /><i /></div>
          <div><b>{voiceState === "listening" ? "I’m listening" : voiceState === "speaking" ? "Coach is talking" : "Talk with your coach"}</b><small>Free browser voice—no paid AI account needed.</small></div>
          {voiceState === "idle" || voiceState === "error"
            ? <button type="button" onClick={startVoice}>Start voice</button>
            : <div className="voice-actions"><button type="button" onClick={stopVoice}>End voice</button></div>}
        </div>
        <small className="voice-privacy">Voice uses your browser’s built-in speech tools. Your conversation memory stays on this device.</small>
        {voiceError && <p className="pro-coach-voice-error" role="status">{voiceError}</p>}
        <div className="pro-coach-messages" aria-live="polite">
          {messages.map((message, index) => <div className={message.role} key={message.id ?? `${message.role}-${index}`}>
            {message.role === "assistant" && <small>{message.source === "web" ? "Flight Lab Coach · Sourced answer" : "Flight Lab Coach"}</small>}
            <p>{message.text ? messageWithLinks(message.text) : "Thinking…"}</p>
            {message.role === "assistant" && index > 0 && <button className="coach-feedback-button" type="button" onClick={() => requestRepair(message.text, index)}>Not helpful?</button>}
          </div>)}
          {sending && <div className="assistant thinking"><small>{thinkingStatus}</small><p><i /><i /><i /></p></div>}
          <div ref={endRef} />
        </div>
        {pendingRepair && <div className="coach-repair" role="group" aria-label="Teach the Flight Lab Coach">
          <b>Help me learn what went wrong</b>
          <small>{pendingRepair.reply ? `About: “${pendingRepair.reply.slice(0, 90)}${pendingRepair.reply.length > 90 ? "…" : ""}”` : "Choose the closest reason."}</small>
          <div>{FEEDBACK_OPTIONS.map((option) => <button type="button" key={option.reason} onClick={() => rememberLesson(option.reason)}>{option.label}</button>)}</div>
          <button className="coach-repair-cancel" type="button" onClick={() => setPendingRepair(null)}>Never mind</button>
        </div>}
        <div className="pro-coach-prompts">
          {QUICK_PROMPTS.map((prompt) => <button type="button" key={prompt} onClick={() => askCoach(prompt)}>{prompt}</button>)}
        </div>
        <form onSubmit={submit}>
          <label className="sr-only" htmlFor="pro-coach-input">Ask the Flight Lab Coach</label>
          <textarea id="pro-coach-input" rows={2} maxLength={600} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask me anything…" />
          <button type="submit" disabled={!input.trim() || sending} aria-label="Send message">➤</button>
        </form>
      </div>}
      <button className="pro-coach-launcher" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>FL</span><b>{open ? "Close coach" : "Talk to Coach"}</b>
      </button>
    </aside>
  );
}
