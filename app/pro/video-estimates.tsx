"use client";
import { useEffect, useRef, useState, type MouseEvent, type KeyboardEvent } from "react";
import type { TrackPoint } from "./flight-tracking";
import { calibratedFlightEstimates, type ReferencePoint } from "./video-coverage";

export function VideoEstimates({ url, points, aspect, interval, confirmed, onConfirm }: { url: string; points: TrackPoint[]; aspect: number; interval: number; confirmed: boolean; onConfirm: (value: boolean) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const still = useRef<HTMLCanvasElement | null>(null);
  const [reference, setReference] = useState<ReferencePoint[]>([]);
  const [active, setActive] = useState(0);
  const [feet, setFeet] = useState("");
  const [samePlane, setSamePlane] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReference([]); setFeet(""); setSamePlane(false); setReady(false); still.current = null; }, [url]);
  function capture() {
    const source = video.current;
    if (!source || source.readyState < 2) return;
    source.pause();
    const image = document.createElement("canvas");
    image.width = 960; image.height = Math.round(960/aspect);
    image.getContext("2d")?.drawImage(source,0,0,image.width,image.height);
    still.current = image;
    setReady(true); setReference([]); setActive(0); setSamePlane(false);
  }
  useEffect(() => {
    const target=canvas.current, image=still.current;
    const context=target?.getContext("2d");
    if (!target || !image || !context) return;
    context.drawImage(image,0,0,target.width,target.height);
    context.lineWidth=3; context.strokeStyle="#c8f34b"; context.fillStyle="#c8f34b"; context.font="bold 22px sans-serif";
    if (reference.length===2) { context.beginPath(); context.moveTo(reference[0].x*target.width,reference[0].y*target.height); context.lineTo(reference[1].x*target.width,reference[1].y*target.height); context.stroke(); }
    reference.forEach((point,i)=>{const x=point.x*target.width,y=point.y*target.height;context.beginPath();context.arc(x,y,9,0,Math.PI*2);context.stroke();context.fillText(String(i+1),x+12,y-12);});
  },[reference,ready]);
  function place(x:number,y:number) {
    setReference(current=>{const next=[...current];next[Math.min(active,next.length)]={x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y))};return next;});
    setActive(1);
  }
  function click(event:MouseEvent<HTMLCanvasElement>) { const bounds=event.currentTarget.getBoundingClientRect();place((event.clientX-bounds.left)/bounds.width,(event.clientY-bounds.top)/bounds.height); }
  function key(event:KeyboardEvent<HTMLCanvasElement>) {
    const point=reference[active]??{x:.5,y:.5};
    if(event.key==="Enter"||event.key===" "){event.preventDefault();place(point.x,point.y);return;}
    const delta:Record<string,[number,number]>={ArrowLeft:[-.01,0],ArrowRight:[.01,0],ArrowUp:[0,-.01],ArrowDown:[0,.01]};
    if(delta[event.key]){event.preventDefault();const [x,y]=delta[event.key];place(point.x+x,point.y+y);setActive(active);}
  }
  const result=calibratedFlightEstimates(points,aspect,interval,reference,Number(feet),confirmed&&samePlane);
  return <section className="video-estimates" aria-label="Optional calibrated video estimates">
    <h4>Optional distance and peak speed estimates</h4>
    <p>Use a steady side-on recording. A known-length reference must be at the same distance from the camera as the flight. A reference nearer the camera will give the wrong scale.</p>
    <label className="video-confirm"><input type="checkbox" checked={confirmed} onChange={event=>onConfirm(event.target.checked)} />I checked the replay: the trace follows the plane from release through ground contact.</label>
    <details><summary>Set a known scale</summary>
      <p>Pause where your reference is visible, then choose “Use this frame.” Mark its two ends in the image below. Keyboard: Enter places a marker; arrow keys move the selected marker.</p>
      <video ref={video} src={url} controls playsInline preload="metadata" aria-label="Choose a calibration frame" />
      <button type="button" onClick={capture}>Use this frame</button>
      {ready && <><div className="video-reference-actions"><button type="button" aria-pressed={active===0} onClick={()=>setActive(0)}>Marker 1</button><button type="button" aria-pressed={active===1} onClick={()=>setActive(1)}>Marker 2</button></div><canvas ref={canvas} width="960" height={Math.round(960/aspect)} tabIndex={0} onClick={click} onKeyDown={key} aria-label={`Mark known-length reference endpoints. ${reference.length} of 2 placed. Marker ${active+1} selected.`} /></>}
      <label>Reference length in feet<input type="number" inputMode="decimal" min="0.1" max="1000" step="0.1" value={feet} onChange={event=>setFeet(event.target.value)} /></label>
      <label className="video-confirm"><input type="checkbox" checked={samePlane} onChange={event=>setSamePlane(event.target.checked)} />The reference and flight are at the same depth, and the camera stays still.</label>
    </details>
    {result ? <><div className="pro-report-metrics compact"><article><span>Estimated horizontal distance</span><b>≈ {result.distanceFeet.toFixed(1)} <small>ft</small></b></article><article><span>Estimated peak speed</span><b>≈ {result.peakMph.toFixed(1)} <small>mph</small></b></article></div><p>Projected side-view estimates from the visible trace. Peak speed uses roughly 0.2-second windows. Perspective, tracking error, and motion toward or away from the camera can change these values. Use Smart Measure to measure the throw.</p></> : <p role="status">Distance and mph appear only after you confirm the trace includes release and ground contact, mark a known scale, and confirm the camera setup. Uncertain points or tracking gaps keep these estimates hidden.</p>}
  </section>;
}
