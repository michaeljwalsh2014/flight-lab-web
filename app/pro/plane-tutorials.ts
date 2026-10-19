export const TRUSTED_PLANE_LINKS = {
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

const PLANE_CATALOG = [
  { name: "Platinum X", focus: "a smooth, easy-to-fold glider", tags: ["glider", "easy", "distance"], url: TRUSTED_PLANE_LINKS.walshWonders.platinumX },
  { name: "Arrowhead", focus: "a locked dart for speed and distance", tags: ["dart", "easy", "fast", "distance"], url: TRUSTED_PLANE_LINKS.arrowhead.video },
  { name: "C-13 Cobra", focus: "a glider built for long, smooth flights", tags: ["glider", "airtime", "smooth"], url: TRUSTED_PLANE_LINKS.walshWonders.cobra },
  { name: "Marauder", focus: "a fast dart with a sharper challenge", tags: ["dart", "fast", "speed"], url: TRUSTED_PLANE_LINKS.marauder.page },
  { name: "Flapping Wing", focus: "an unusual plane whose wings flap in flight", tags: ["unusual", "trick", "cool"], url: TRUSTED_PLANE_LINKS.walshWonders.flappingWing },
  { name: "Walsh Wonders Dart", focus: "a straightforward speed-focused dart", tags: ["dart", "fast", "easy"], url: TRUSTED_PLANE_LINKS.walshWonders.dart },
];

function contextualPlaneRecommendation(message: string, conversation: Array<{ role: string; text: string }>) {
  const question = message.toLowerCase();
  const asksForPlane = /recommend|suggest|pick|choose|find|another|different|else|what.*(?:plane|airplane).*fold|plane.*(?:make|try|build)|favorite.*(?:plane|airplane)/.test(question);
  if (!asksForPlane || !/(plane|airplane|fold|another|different|one)/.test(question)) return null;

  const recentCoachText = conversation.filter((item) => item.role === "assistant").slice(-10).map((item) => item.text.toLowerCase()).join(" ");
  const unused = PLANE_CATALOG.filter((plane) => !recentCoachText.includes(plane.name.toLowerCase()));
  const requestedTags = ["glider", "airtime", "smooth", "dart", "fast", "speed", "distance", "easy", "unusual", "trick", "cool"].filter((tag) => question.includes(tag));
  const matching = unused.filter((plane) => !requestedTags.length || requestedTags.some((tag) => plane.tags.includes(tag)));
  const plane = matching[0] ?? unused[0] ?? PLANE_CATALOG.find((candidate) => !question.includes(candidate.name.toLowerCase())) ?? PLANE_CATALOG[0];
  const followUp = /another|different|else|not that|new one/.test(question);
  return `${followUp ? "Try this one instead" : "Try this one"}: ${plane.name} — ${plane.focus}. ${plane.url}\n\nAfter you fold it, log three throws and I can help compare it with your last plane.`;
}

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

function youtubeSearchUrl(query: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${query} paper airplane tutorial`)}`;
}

function planeDiscoveryReply(message: string) {
  const question = message.toLowerCase();
  if (/walsh wonders|(?:my|your) (?:youtube )?channel|michael'?s plane/.test(question)) {
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
    return `Here are places to find folding instructions. Browse Walsh Wonders: ${TRUSTED_PLANE_LINKS.walshWonders.channel}\nBrowse Foldable Flight’s verified plane library: ${TRUSTED_PLANE_LINKS.library}\nLive YouTube search for “${usefulQuery}”: ${youtubeSearchUrl(usefulQuery)}`;
  }
  return null;
}

// Use saved tutorials for direct discovery requests, not for flight diagnosis.
export function findPlaneTutorialReply(message: string, conversation: Array<{ role: string; text: string }> = []) {
  const question = message.toLowerCase();
  const followUp = /another|different|else|new one/.test(question) && !/throw|flight|test|adjust|change|trim/.test(question)
    && conversation.some((item) => item.role === "assistant" && /youtube\.com|foldableflight\.com/.test(item.text));
  const wantsTutorial = /link|tutorial|video|where.*(?:learn|fold)/.test(question)
    || /how (?:do i |to )?(?:build|make|fold) (?:a |an |the )?(?:paper )?(?:airplane|plane)\b/.test(question)
    || /recommend|suggest|find|pick|choose/.test(question) && /(?:paper|new|another|different|easy|good|fast|best) (?:airplane|plane)|(?:airplane|plane).*(?:build|make|fold|try)|walsh wonders|foldable flight|(?:my|your) (?:youtube )?channel/.test(question);
  const planeTopic = /paper|airplane|plane|fold|walsh wonders|foldable flight|(?:my|your) (?:youtube )?channel|arrowhead|marauder|bandit/.test(question);
  if (!followUp && !(wantsTutorial && planeTopic)) return null;
  if (/walsh wonders|(?:my|your) (?:youtube )?channel/.test(question)) {
    const candidates = PLANE_CATALOG.filter((plane) => plane.url.startsWith("https://www.youtube.com/") && plane.url !== TRUSTED_PLANE_LINKS.arrowhead.video);
    const recent = conversation.filter((item) => item.role === "assistant").map((item) => item.text.toLowerCase()).join(" ");
    const requested = candidates.filter((plane) => plane.tags.some((tag) => question.includes(tag)));
    const choices = requested.length ? requested : candidates;
    const plane = choices.find((plane) => !recent.includes(plane.name.toLowerCase())) ?? choices[0];
    return `Try Walsh Wonders’ ${plane.name} — ${plane.focus}. Folding video: ${plane.url}\n\nMore from your channel: ${TRUSTED_PLANE_LINKS.walshWonders.channel}`;
  }
  const named = PLANE_CATALOG.find((plane) => question.includes(plane.name.toLowerCase()));
  if (named) return `${named.name} — ${named.focus}. Folding instructions: ${named.url}`;
  if (/bandit|design (?:my|your|a|an|own)|make my own/.test(question)) return planeDiscoveryReply(message);
  if (/foldable flight/.test(question)) {
    return /fast|speed|marauder/.test(question)
      ? planeDiscoveryReply("Marauder tutorial")
      : planeDiscoveryReply("Arrowhead tutorial");
  }
  if (/arrowhead|marauder|bandit|design (?:my|your|a|an|own)|make my own/.test(question)) return planeDiscoveryReply(message);
  if (followUp) return contextualPlaneRecommendation(message, conversation);
  return pairedPlaneRecommendation(message) ?? planeDiscoveryReply(message);
}

export const PLANE_TUTORIAL_CONTEXT = `Saved paper-airplane tutorial catalog: ${JSON.stringify(TRUSTED_PLANE_LINKS)}. Walsh Wonders is the builder's channel. Prefer these exact saved URLs when relevant. For other designs, use live search when enabled or label a search-results link clearly. Never invent a video URL or claim a link was just checked.`;
