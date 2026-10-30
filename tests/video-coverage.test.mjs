import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const cache=new Map();
let responseCoverage, refunded=0;
function load(name){
 if(name==='next/server') return {NextResponse:{json:(body,options)=>Response.json(body,options)}};
 if(name==='@/app/pro-access')return {getProAccess:async()=>({hasPro:true})};
 if(name==='@/app/ai-usage')return {reserveProReview:async()=> 'allowed',refundProReview:async()=>{refunded++;}};
 if(name==='@/app/gemini-server')return {generateGeminiResult:async()=>({text:JSON.stringify({canReview:true,summary:'Move the camera farther back.',observations:['Move the camera to another angle.'],uncertainties:[],nextTest:'Record again from a wider angle.',releaseStrength:'uncertain',releaseConfidence:0,coverage:responseCoverage}),model:'test'}),publicAIError:()=>({body:{error:'invalid'},status:502})};
 if(name==='@/app/usage-message')return {exhaustedUsageMessage:()=> 'exhausted'};
 if(cache.has(name))return cache.get(name);
 const file=new URL('../'+name.replace('@/','')+'.ts',import.meta.url);
 const exports={};cache.set(name,exports);
 new Function('require','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(load,exports);return exports;
}
const api=load('@/app/pro/video-coverage');
const coverage=(launch='visible',landing='visible',confidence=95)=>({launch,landing,continuity:"visible",confidence,evidence:'0.1s release; 2.0s plane at ground contact.'});
test('complete footage does not request a new position',()=>{assert.equal(api.coverageDecision(coverage()),'complete');assert.match(api.coverageMessage(coverage()),/No camera change/);});
test('uncertain landing or sparse evidence cannot become a camera-placement warning',()=>{
 for(const value of [undefined,coverage('visible','uncertain',99),coverage('visible','outside_frame',89),{...coverage(),evidence:''}])assert.equal(api.coverageDecision(value),'uncertain');
 assert.match(api.coverageMessage(coverage('visible','uncertain')),/does not mean/);
});
test('high-evidence frame exit is distinct from a recording stopped too early',()=>{
 assert.equal(api.coverageDecision(coverage('visible','outside_frame',95)),'partial');
 assert.match(api.coverageMessage(coverage('visible','outside_frame')),/farther back/);
 const message=api.coverageMessage(coverage('not_recorded','visible'));
 assert.match(message,/Record a little before/);assert.doesNotMatch(message,/move the camera/);
});
test('user can correct an AI coverage assessment after checking the replay',()=>assert.equal(api.coverageDecision(coverage('visible','outside_frame'),true),'complete'));
const points=Array.from({length:25},(_,i)=>({x:.1+i*.02,y:.5,time:i/24,confidence:85}));
const estimate=(p=points,feet=10,complete=true,ref=[{x:0,y:.5},{x:1,y:.5}])=>api.calibratedFlightEstimates(p,16/9,1/24,ref,feet,complete);
test('calibration produces known projected distance and windowed speed',()=>{
 const result=estimate();assert.ok(Math.abs(result.distanceFeet-4.8)<1e-8);assert.ok(Math.abs(result.peakMph-4.8*3600/5280)<1e-8);
 assert.ok(Math.abs(estimate(points,20).distanceFeet-9.6)<1e-8);
});
test('no physical estimate without full trace confirmation, valid scale and continuous confident tracking',()=>{
 assert.equal(estimate(points,10,false),null);assert.equal(estimate(points,0),null);assert.equal(estimate(points,NaN),null);assert.equal(estimate(points,10,true,[]),null);
 assert.equal(estimate(points.map((p,i)=>({...p,time:i>12?p.time+.3:p.time}))),null);
 assert.equal(estimate(points.map((p,i)=>({...p,confidence:i===5?20:85}))),null);
});
test('one-frame peak error cannot become a huge maximum speed',()=>{
 const noisy=points.map((p,i)=>({...p,x:i===12?p.x+.08:p.x}));assert.ok(estimate(noisy).peakMph<estimate().peakMph*1.4);
});
test('coverage schema rejects malformed or out-of-range results',()=>{
 for(const item of [null,{},coverage('missing','visible'),coverage('visible','visible',NaN),coverage('visible','visible',101)])assert.equal(api.validCoverage(item),false);
});
test('video endpoint suppresses unsubstantiated placement advice and rejects malformed coverage with a refund',async()=>{
 const route=load('@/app/api/pro-video/route');
 const send=()=>route.POST(new Request('https://flight.test/api/pro-video',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({modelVersion:'v40',duration:3,coachId:'test-coach-123',frames:[0,1,2,3].map(time=>({time,image:'data:image/jpeg;base64,AAAA'}))})}));
 responseCoverage=coverage('visible','uncertain');
 const response=await send();assert.equal(response.status,200);const result=await response.json();
 assert.doesNotMatch(result.analysis.nextTest,/Record again/);assert.doesNotMatch(result.analysis.summary,/Move the camera/);
 responseCoverage=coverage();const complete=await(await send()).json();assert.doesNotMatch(complete.analysis.observations.join(' '),/Move the camera/);
 responseCoverage={launch:'unknown'};assert.equal((await send()).status,502);assert.equal(refunded,1);
});

test('AI review includes clip endpoints and close samples around the tracked release and finish',()=>{
 const times=api.reviewFrameTimes(10,[{time:2},{time:5}]);
 assert.ok(times.includes(0));assert.ok(times.includes(9.975));assert.ok(times.includes(1.88));assert.ok(times.includes(5.12));
 assert.ok(times.length<=12);assert.ok(times.every((t,i)=>!i||t>times[i-1]));
 assert.equal(api.reviewFrameTimes(.5).length,12);
});

test('visible endpoints alone do not imply the middle of the flight was captured',()=>{assert.equal(api.coverageDecision({...coverage(),continuity:"uncertain"}),'uncertain');assert.equal(api.coverageDecision({...coverage(),continuity:"outside_frame"}),'partial');});
