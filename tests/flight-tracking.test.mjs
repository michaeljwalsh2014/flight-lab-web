import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const exports = {};
new Function('exports', ts.transpileModule(readFileSync(new URL('../app/pro/flight-tracking.ts', import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
const candidate=(frame,x,y=.4)=>({frame,time:frame/24,x,y,area:12,energy:600});
test('reconnects after missing samples without accelerating the predicted velocity',()=>{
 const frames=Array.from({length:25},(_,i)=>i===8||i===9||i===16?[]:[candidate(i,.1+i*.02)]);
 const track=exports.buildBestTrack(frames);
 assert.equal(track.length,22);
 assert.equal(track.at(-1).frame,24);
 assert.ok(Math.abs(track.find(p=>p.frame===10).velocityX-.02)<.002);
});
test('retains a visible curved return instead of enforcing forward-only motion',()=>{
 const points=Array.from({length:25},(_,i)=>candidate(i,.1+.6*Math.sin(i/24*Math.PI),.2+i*.018));
 const cleaned=exports.cleanTrack(points,25);
 assert.equal(cleaned.length,25);
 assert.equal(cleaned[0].x,points[0].x);
 assert.equal(cleaned.at(-1).y,points.at(-1).y);
 assert.ok(cleaned[12].x>cleaned.at(-1).x+.5);
});
test('does not smooth across missing samples and lowers evidence there',()=>{
 const points=Array.from({length:10},(_,i)=>candidate(i<5?i:i+2,.1+i*.04));
 const cleaned=exports.cleanTrack(points,12);
 assert.equal(cleaned[5].x,points[5].x);
 assert.ok(cleaned[5].confidence<cleaned[4].confidence);
 assert.equal(exports.isTrackingGap(cleaned[4],cleaned[5],1/24),true);
 assert.equal(exports.isTrackingGap(cleaned[2],cleaned[3],1/24),false);
});
test('side view preserves image aspect and horizontal motion instead of using elapsed time',()=>{
 const points=[{x:.2,y:.2,time:0,confidence:80},{x:.8,y:.5,time:1,confidence:80},{x:.4,y:.8,time:4,confidence:80}];
 const projected=exports.projectSidePath(points,1200,620,16/9);
 assert.ok(projected[2].x<projected[1].x);
 const scaleX=(projected[1].x-projected[0].x)/.6;
 const scaleY=(projected[1].y-projected[0].y)/.3;
 assert.ok(Math.abs(scaleX/scaleY-16/9)<1e-9);
});
