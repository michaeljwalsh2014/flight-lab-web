import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the finished Flight Lab website", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Flight Lab — Throw\. Measure\. Improve\.<\/title>/i);
  assert.match(html, /Measure a throw/i);
  assert.match(html, /Add to Home Screen/i);
  assert.match(html, /No throws yet/i);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("includes all three browser-friendly measuring tools", async () => {
  const page = await readFile(new URL("../app/flight-lab-app.tsx", import.meta.url), "utf8");
  assert.match(page, /Choose a measuring tool/);
  assert.match(page, /Walk & count/);
  assert.match(page, /Outdoor GPS/);
  assert.match(page, /Tape or Measure app/);
  assert.match(page, /Automatic step counting/);
  assert.match(page, /Allow location & set launch point/);
  assert.match(page, /error\.PERMISSION_DENIED/);
  assert.match(page, /error\.TIMEOUT/);
  assert.match(page, /heightDraft/);
  assert.match(page, /You can erase the current number and type any height/);
});

test("requires one top-view airplane photo and can reject invalid images", async () => {
  const page = await readFile(new URL("../app/flight-lab-app.tsx", import.meta.url), "utf8");
  assert.match(page, /top view/i);
  assert.doesNotMatch(page, /Add bottom photo/i);
  assert.doesNotMatch(page, /photos\.bottom/);
  assert.match(page, /inspectPlanePhoto/);
  assert.match(page, /I can’t verify a paper airplane/);
  assert.match(page, /non-airplane photos will be rejected instead of scored/i);
  assert.match(page, /It wobbles side to side/);
  assert.match(page, /It spirals or corkscrews/);
  assert.doesNotMatch(page, /Math\.max\(55/);
});

test("uses on-device shape analysis, plane pictures, and a labeled distance estimate", async () => {
  const page = await readFile(new URL("../app/flight-lab-app.tsx", import.meta.url), "utf8");
  assert.match(page, /inspectPlanePhoto/);
  assert.match(page, /on-device silhouette and fold analyzer/i);
  assert.match(page, /Running on-device shape checks/);
  assert.match(page, /Analyze this plane/);
  assert.match(page, /Estimated next flight/);
  assert.match(page, /Estimate—not a measurement/);
  assert.match(page, /name: "Dart"/);
  assert.match(page, /name: "Glider"/);
  assert.doesNotMatch(page, /Nakamura Lock/);
  assert.doesNotMatch(page, /Paper Dart|Wide Glider/);
  assert.match(page, /Take a picture or choose one/);
  assert.match(page, /\/plane-presets\/dart\.png/);
  assert.match(page, /\/plane-presets\/nakamura-lock\.png/);
});

test("offers a normal Pro upgrade and recognizes the owner account", async () => {
  const page = await readFile(new URL("../app/flight-lab-app.tsx", import.meta.url), "utf8");
  const accessRoute = await readFile(new URL("../app/api/pro-access/route.ts", import.meta.url), "utf8");
  const accessHelper = await readFile(new URL("../app/pro-access.ts", import.meta.url), "utf8");
  const proPage = await readFile(new URL("../app/pro/page.tsx", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../app/pro/pro-dashboard.tsx", import.meta.url), "utf8");
  const videoLab = await readFile(new URL("../app/pro/pro-video-lab.tsx", import.meta.url), "utf8");
  assert.match(page, /Upgrade to Pro/);
  assert.doesNotMatch(page, />Owner sign in</);
  assert.match(page, /Lifetime Pro is active/);
  assert.match(page, /Pro video lab/);
  assert.match(page, /Video path tracking/);
  assert.match(page, /You will not be charged for Flight Lab Pro/);
  assert.match(page, /signin-with-chatgpt/);
  assert.match(page, /Open Pro video analyzer/);
  assert.match(accessHelper, /FLIGHT_LAB_OWNER_EMAIL/);
  assert.match(accessRoute, /Cache-Control/);
  assert.doesNotMatch(accessHelper, /@gmail\.com|@outlook\.com|@icloud\.com/);
  assert.match(proPage, /getProAccess/);
  assert.match(proPage, /ProDashboard/);
  assert.match(proPage, /redirect\("\/#pro"\)/);
  assert.match(dashboard, /Rate my plane/);
  assert.match(dashboard, /Smart Walk Measure/);
  assert.match(dashboard, /Average distance/);
  assert.match(dashboard, /Newest 5/);
  assert.match(dashboard, /Show all flights/);
  assert.match(dashboard, /flight-lab-v2-throws/);
  assert.match(dashboard, /Experiment Builder/);
  assert.match(dashboard, /Age range · optional/);
  assert.match(dashboard, /This plane&apos;s measured best/);
  assert.match(dashboard, /Your shared hangar/);
  assert.match(dashboard, /＋ Add \{presetId === "dart" \? "Dart" : "Glider"\}/);
  assert.match(dashboard, /flight-lab-v2-planes/);
  assert.match(dashboard, /planesUpdatedEvent/);
  assert.match(dashboard, /activePlaneStorageKey/);
  assert.match(dashboard, /selectPlane/);
  assert.match(dashboard, /deletePlane/);
  assert.match(dashboard, /activeFlightHistory/);
  assert.match(dashboard, /pro-hero-plane-photo/);
  assert.match(videoLab, /accept="video\/\*"/);
  assert.match(videoLab, /analyzeVideo/);
  assert.match(videoLab, /Drag to rotate/);
  assert.match(videoLab, /pinch or scroll to zoom/);
  assert.match(videoLab, /Top map/);
  assert.match(videoLab, /Removing camera shake and false turns/);
  assert.match(videoLab, /turnPenalty/);
  assert.match(videoLab, /forwardFiltered/);
  assert.match(videoLab, /straightness/);
  assert.match(videoLab, /Tracked airtime/);
  assert.match(videoLab, /Flight curve/);
  assert.match(videoLab, /Path stability/);
  assert.match(videoLab, /Relative speed/);
  assert.match(videoLab, /Your video stays on this device/);
});

test("keeps Pro mobile layout vertical and uses full-size controls", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /html \{ max-width: 100%; overflow-x: hidden/);
  assert.match(styles, /html \{[^}]*overscroll-behavior-x: none/);
  assert.match(styles, /\.pro-dashboard \{[\s\S]*?overflow-x: hidden[\s\S]*?overscroll-behavior-x: none[\s\S]*?touch-action: pan-y/);
  assert.match(styles, /\.path-toolbar button \{ min-height: 60px/);
  assert.match(styles, /\.pro-history-tabs button \{ min-height: 64px/);
  assert.match(styles, /\.pro-command-button \{[^}]*min-height: 66px[^}]*font-size: 14px/);
  assert.match(styles, /\.measure-button-row button,[^}]*min-height: 64px[^}]*font-size: 14px/);
  assert.match(styles, /\.pro-dashboard select, \.pro-dashboard input:not\(\.sr-only\) \{[^}]*height: 72px[^}]*font-size: 18px/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.path-toolbar button \{ min-height: 64px[^}]*font-size: 13px/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.pro-dashboard select, \.pro-dashboard input:not\(\.sr-only\) \{ height: 76px/);
  assert.match(styles, /\.pro-plane-panel\.panel-left/);
  assert.match(styles, /\.pro-plane-nose/);
});

test("supports the same no-sign-in Pro Pass route for the dedicated dashboard", async () => {
  const sharePage = await readFile(new URL("../app/pro/share/[token]/page.tsx", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../app/pro/pro-dashboard.tsx", import.meta.url), "utf8");
  assert.match(sharePage, /FLIGHT_LAB_PRO_SHARE_TOKEN/);
  assert.match(sharePage, /ProDashboard/);
  assert.match(sharePage, /sharedPass/);
  assert.match(dashboard, /Pro Pass active/);
  assert.match(dashboard, /ProVideoLab/);
});

test("adds a conversational, evidence-aware zero-cost Flight Lab Coach", async () => {
  const dashboard = await readFile(new URL("../app/pro/pro-dashboard.tsx", import.meta.url), "utf8");
  const coach = await readFile(new URL("../app/pro/pro-coach-chat.tsx", import.meta.url), "utf8");
  const context = await readFile(new URL("../app/pro/pro-ai-context.ts", import.meta.url), "utf8");
  const videoLab = await readFile(new URL("../app/pro/pro-video-lab.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /ProCoachChat/);
  assert.match(coach, /Talk to Coach/);
  assert.match(coach, /Start voice/);
  assert.match(coach, /SpeechRecognition/);
  assert.match(coach, /webkitSpeechRecognition/);
  assert.match(coach, /speechSynthesis/);
  assert.match(coach, /What should I improve/);
  assert.match(coach, /What do you like/);
  assert.match(coach, /Tell me more about that/);
  assert.match(coach, /arithmeticReply/);
  assert.match(coach, /one: 1/);
  assert.match(coach, /youtubeSearchUrl/);
  assert.match(coach, /Foldable Flight’s official Arrowhead tutorial/);
  assert.match(coach, /pairedPlaneRecommendation/);
  assert.match(coach, /youtube\.com\/@walshwonders\/videos/);
  assert.match(coach, /C-13 Cobra/);
  assert.match(coach, /Platinum X/);
  assert.match(coach, /Flapping wing paper airplane/);
  assert.match(coach, /Amazing paper airplane dart/);
  assert.match(coach, /one plane from each creator/);
  assert.match(coach, /noopener noreferrer/);
  assert.match(coach, /How’s it going/);
  assert.match(coach, /no upload required/i);
  assert.match(coach, /nextDeviceVariant/);
  assert.match(coach, /recentReplies\.includes/);
  assert.match(coach, /flight-lab-coach-conversation/);
  assert.match(coach, /flight-lab-coach-lessons/);
  assert.match(coach, /previousUser/);
  assert.match(coach, /isFrustrated/);
  assert.match(coach, /Help me learn what went wrong/);
  assert.match(coach, /It didn’t listen/);
  assert.match(coach, /Not helpful\?/);
  assert.match(coach, /rememberLesson/);
  assert.match(coach, /thinkingDelay/);
  assert.match(coach, /thinkingSteps/);
  assert.match(coach, /Checking trusted plane sources/);
  assert.match(coach, /Preparing a careful answer/);
  assert.match(coach, /shouldLookUpKnowledge/);
  assert.match(coach, /lookUpKnowledge/);
  assert.match(coach, /Checking a live knowledge source/);
  assert.match(coach, /Sourced answer/);
  const knowledge = await readFile(new URL("../app/api/knowledge/route.ts", import.meta.url), "utf8");
  assert.match(knowledge, /Usain Bolt/);
  assert.match(knowledge, /Florence Griffith-Joyner/);
  assert.match(knowledge, /en\.wikipedia\.org\/w\/api\.php/);
  assert.match(knowledge, /Verified record/);
  assert.match(knowledge, /sourceName/);
  assert.match(coach, /Checking your plane history/);
  assert.doesNotMatch(coach, /Open ChatGPT with this scan/);
  assert.doesNotMatch(coach, /https:\/\/chatgpt\.com\//);
  assert.doesNotMatch(coach, /\/api\/pro-coach|OPENAI_API_KEY|RTCPeerConnection|GPT connected|Offline coach/);
  assert.match(coach, /We can talk normally/i);
  assert.match(context, /flight-lab-local-v2/);
  assert.match(videoLab, /publishProAiContext/);
  assert.match(videoLab, /driftDirection/);
  assert.match(videoLab, /On-device coach observations/);
});

test("guides a video-orbit 3D scan and remembers experiment outcomes", async () => {
  const dashboard = await readFile(new URL("../app/pro/pro-dashboard.tsx", import.meta.url), "utf8");
  const context = await readFile(new URL("../app/pro/pro-ai-context.ts", import.meta.url), "utf8");
  const reconstruction = await readFile(new URL("../app/pro/plane-reconstruction.ts", import.meta.url), "utf8");
  const meshViewer = await readFile(new URL("../app/pro/plane-mesh-viewer.tsx", import.meta.url), "utf8");
  const guidedVideo = await readFile(new URL("../app/pro/guided-video-scanner.tsx", import.meta.url), "utf8");
  const scanRoute = await readFile(new URL("../app/api/pro-scan/route.ts", import.meta.url), "utf8");
  assert.match(dashboard, /Guided 3D scan/);
  assert.match(dashboard, /extractGuidedVideoFrames/);
  assert.match(dashboard, /id: "underside"/);
  assert.match(dashboard, /id: "tail"/);
  assert.match(dashboard, /ReconstructedPlaneModel/);
  assert.match(dashboard, /reconstructPlaneMesh/);
  assert.match(dashboard, /Deep visual inspection/);
  assert.match(reconstruction, /PlaneMeshData/);
  assert.match(reconstruction, /triangles/);
  assert.match(reconstruction, /shellLayers: 2/);
  assert.match(reconstruction, /const vertices = \[\.\.\.upper, \.\.\.lower\]/);
  assert.match(reconstruction, /sideHeightProfile/);
  assert.match(reconstruction, /const stations = 17/);
  assert.match(guidedVideo, /getUserMedia/);
  assert.match(guidedVideo, /Start 23-second scan/);
  assert.match(guidedVideo, /Three-pass camera orbit/);
  assert.match(guidedVideo, /Lower the camera—do not move the plane/);
  assert.match(dashboard, /Colored paper works best/);
  assert.match(dashboard, /Upload 1–3 existing orbit videos/);
  assert.match(dashboard, /GoPro users should choose Linear lens mode/);
  assert.match(dashboard, /4300 - \(Date\.now\(\) - analysisStartedAt\)/);
  assert.match(meshViewer, /Drag to rotate/);
  assert.match(meshViewer, /canvas/);
  assert.match(scanRoute, /input_image/);
  assert.match(scanRoute, /detail: "high"/);
  assert.match(scanRoute, /paper_plane_scan/);
  assert.match(scanRoute, /gpt-5\.6-terra/);
  assert.match(dashboard, /what happened\?/i);
  assert.match(dashboard, /recordOutcome\("better"\)/);
  assert.match(dashboard, /chooseFreshTest/);
  assert.match(dashboard, /activeThrows/);
  assert.match(context, /CoachTestMemory/);
  assert.match(context, /recommendationId/);
});

test("can select and delete planes without offering individual throw deletion", async () => {
  const page = await readFile(new URL("../app/flight-lab-app.tsx", import.meta.url), "utf8");
  assert.match(page, /function deletePlane/);
  assert.match(page, /item\.planeId !== plane\.id/);
  assert.match(page, /activePlaneStorageKey/);
  assert.match(page, /savedDataLoaded/);
  assert.match(page, /activeThrows\.map/);
  assert.doesNotMatch(page, /activeThrows\.slice\(0, 5\)/);
  assert.match(page, /aria-label={`Delete \$\{plane\.name\}`}/);
  assert.doesNotMatch(page, /function deleteFlight/);
  assert.doesNotMatch(page, /title="Delete this flight"/);
});
