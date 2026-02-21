"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { Annotation, AnalysisResult } from "@/lib/types";
import { useAnnotatedCanvas } from "@/lib/useAnnotatedCanvas";

interface Props {
  dataUrl: string;
  annotations: Annotation[];
  analysis: AnalysisResult;
  onClose: () => void;
}

export default function FullscreenModal({ dataUrl, annotations, analysis, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [showAnn, setShowAnn] = useState(true);
  const [prog, setProg] = useState(0);
  const [visible, setVisible] = useState(false);

  const stableClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    let start: number | null = null;
    const dur = 1200;
    const go = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      setProg(1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(go);
    };
    requestAnimationFrame(go);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") stableClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [stableClose]);

  useEffect(() => {
    if (!dataUrl || !boxRef.current) return;
    const img = new Image();
    img.onload = () => {
      const maxW = Math.min(boxRef.current!.clientWidth - 40, 1200);
      const maxH = boxRef.current!.clientHeight - 100;
      const ratio = img.height / img.width;
      let w = maxW;
      let h = w * ratio;
      if (h > maxH) { h = maxH; w = h / ratio; }
      setDims({ w, h });
    };
    img.src = dataUrl;
  }, [dataUrl]);

  useAnnotatedCanvas(canvasRef, dataUrl, annotations, dims, prog, showAnn, analysis.chart_bounds);

  const cc = (v: number) => (v >= 75 ? "#00e5a0" : v >= 50 ? "#f0b90b" : "#ff4d6a");

  return (
    <div
      onClick={stableClose}
      className="fixed inset-0 flex flex-col items-center justify-center cursor-pointer"
      style={{
        zIndex: 9999,
        background: visible ? "rgba(0,0,0,0.92)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(20px)" : "blur(0)",
        transition: "all 0.4s ease",
        opacity: visible ? 1 : 0,
      }}
    >
      {/* Top bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-between mb-3 px-1"
        style={{ width: Math.min(dims.w || 800, 1200), maxWidth: "calc(100vw - 40px)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-[30px] h-[30px] rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0a0b0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12" /><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12" /><circle cx="12" cy="12" r="3" /></svg>
          </div>
          <span className="text-[15px] font-bold text-white" style={{ fontFamily: "'Outfit',sans-serif" }}>
            FXSynapse<span style={{ color: "#00e5a0" }}> AI</span>
          </span>
          <span className="text-[10px] font-mono ml-1" style={{ color: "rgba(255,255,255,.3)" }}>
            {analysis.pair} • {analysis.timeframe}
          </span>
        </div>
        <div className="flex gap-1.5 items-center">
          <button
            onClick={(e) => { e.stopPropagation(); setShowAnn(!showAnn); }}
            className="px-3 py-1 rounded-md text-[10px] font-semibold font-mono cursor-pointer"
            style={{
              background: showAnn ? "rgba(0,229,160,0.2)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${showAnn ? "rgba(0,229,160,.35)" : "rgba(255,255,255,.12)"}`,
              color: showAnn ? "#00e5a0" : "rgba(255,255,255,.5)",
            }}
          >
            {showAnn ? "◉ Annotations" : "○ Annotations"}
          </button>
          <button
            onClick={stableClose}
            className="px-3 py-1 rounded-md text-[10px] font-semibold font-mono cursor-pointer"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: "rgba(255,255,255,.6)",
            }}
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={boxRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full flex items-center justify-center cursor-default"
        style={{ height: "calc(100vh - 120px)" }}
      >
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            boxShadow: "0 20px 80px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.06)",
            transform: visible ? "scale(1)" : "scale(0.9)",
            transition: "transform 0.5s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <canvas ref={canvasRef} style={{ display: "block", width: dims.w || 800, height: dims.h || 500, background: "#111" }} />
          {/* Legend */}
          {showAnn && prog > 0.7 && (
            <div
              className="absolute bottom-3.5 left-3.5 flex gap-2.5 px-3.5 py-2 rounded-lg"
              style={{ background: "rgba(0,0,0,.8)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,.08)" }}
            >
              {[
                { c: "#00e5a0", l: "Support / Entry" },
                { c: "#ff4d6a", l: "Resistance / SL" },
                { c: "#4da0ff", l: "Trend / TP" },
              ].map((x, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-sm" style={{ background: x.c }} />
                  <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.6)" }}>{x.l}</span>
                </div>
              ))}
            </div>
          )}
          {/* Info badges */}
          <div className="absolute top-3.5 left-3.5 flex gap-1.5">
            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold font-mono" style={{ background: "rgba(0,229,160,.15)", border: "1px solid rgba(0,229,160,.25)", color: "#00e5a0" }}>
              S: {analysis.support}
            </span>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold font-mono" style={{ background: "rgba(255,77,106,.12)", border: "1px solid rgba(255,77,106,.25)", color: "#ff4d6a" }}>
              R: {analysis.resistance}
            </span>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold font-mono" style={{ background: cc(analysis.confidence) + "15", border: `1px solid ${cc(analysis.confidence)}25`, color: cc(analysis.confidence) }}>
              {analysis.trend} • {analysis.confidence}%
            </span>
          </div>
        </div>
      </div>

      <div className="mt-2.5">
        <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>
          Press ESC or click outside to close
        </span>
      </div>
    </div>
  );
}
