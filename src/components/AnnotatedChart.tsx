"use client";
import { useRef, useState, useEffect } from "react";
import { Annotation, ChartBounds } from "@/lib/types";
import { useAnnotatedCanvas } from "@/lib/useAnnotatedCanvas";

interface Props {
  dataUrl: string | null;
  annotations: Annotation[];
  chartBounds?: ChartBounds;
  isVisible: boolean;
  onClick?: () => void;
}

const LEGEND = [
  { c: "#00e5a0", l: "Support / Entry", glow: "0 0 8px rgba(0,229,160,.3)" },
  { c: "#ff4d6a", l: "Resistance / SL", glow: "0 0 8px rgba(255,77,106,.3)" },
  { c: "#4da0ff", l: "Trend / TP", glow: "0 0 8px rgba(77,160,255,.3)" },
  { c: "#f0b90b", l: "Liquidity / OB", glow: "0 0 8px rgba(240,185,11,.3)" },
];

export default function AnnotatedChart({ dataUrl, annotations, chartBounds, isVisible, onClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [prog, setProg] = useState(0);
  const [showAnn, setShowAnn] = useState(true);

  useEffect(() => {
    if (!isVisible) return;
    let start: number | null = null;
    const dur = 2500; // Slightly longer for premium feel
    const go = (ts: number) => {
      if (!start) start = ts;
      const t = Math.min((ts - start) / dur, 1);
      // Smooth cubic bezier easing
      setProg(t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      if (t < 1) requestAnimationFrame(go);
    };
    const timer = setTimeout(() => requestAnimationFrame(go), 400);
    return () => clearTimeout(timer);
  }, [isVisible]);

  useEffect(() => {
    if (!dataUrl || !boxRef.current) return;
    const img = new Image();
    img.onload = () => {
      const maxW = boxRef.current!.clientWidth;
      const ratio = img.height / img.width;
      const maxH = ratio > 1.2 ? 600 : 480;
      setDims({ w: maxW, h: Math.min(maxW * ratio, maxH) });
    };
    img.src = dataUrl;
  }, [dataUrl]);

  useAnnotatedCanvas(canvasRef, dataUrl, annotations, dims, prog, showAnn, chartBounds);

  return (
    <div ref={boxRef} className="w-full relative group">
      <canvas
        ref={canvasRef}
        onClick={onClick}
        className="w-full block cursor-pointer"
        style={{ height: dims.h || 300, borderRadius: "20px 20px 0 0", background: "#0a0b0f" }}
      />

      {/* Top controls — frosted glass */}
      <div className="absolute top-3 right-3 flex gap-2" style={{ animation: prog > 0.1 ? "fadeUp 0.5s ease forwards" : "none", opacity: prog > 0.1 ? 1 : 0 }}>
        <button
          onClick={(e) => { e.stopPropagation(); setShowAnn(!showAnn); }}
          className="text-[10px] font-semibold font-mono px-3 py-1.5 rounded-xl cursor-pointer transition-all duration-300"
          style={{
            background: showAnn ? "rgba(0,229,160,0.15)" : "rgba(0,0,0,0.5)",
            border: `1px solid ${showAnn ? "rgba(0,229,160,.25)" : "rgba(255,255,255,.1)"}`,
            color: showAnn ? "#00e5a0" : "rgba(255,255,255,.5)",
            backdropFilter: "blur(16px) saturate(1.5)",
            WebkitBackdropFilter: "blur(16px) saturate(1.5)",
            boxShadow: showAnn ? "0 2px 12px rgba(0,229,160,.15)" : "0 2px 8px rgba(0,0,0,.3)",
          }}
        >
          {showAnn ? "◉ Annotations" : "○ Annotations"}
        </button>
        {onClick && (
          <button
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className="text-[10px] font-semibold font-mono px-3 py-1.5 rounded-xl cursor-pointer transition-all duration-300 hover:scale-105"
            style={{
              background: "rgba(0,0,0,0.5)",
              border: "1px solid rgba(255,255,255,.1)",
              color: "rgba(255,255,255,.6)",
              backdropFilter: "blur(16px) saturate(1.5)",
              WebkitBackdropFilter: "blur(16px) saturate(1.5)",
              boxShadow: "0 2px 8px rgba(0,0,0,.3)",
            }}
          >
            ⤢ Fullscreen
          </button>
        )}
      </div>

      {/* AI badge — top left */}
      <div className="absolute top-3 left-3" style={{ opacity: prog > 0.3 ? 1 : 0, transition: "opacity 0.6s ease" }}>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl" style={{
          background: "rgba(0,0,0,0.5)",
          border: "1px solid rgba(0,229,160,.12)",
          backdropFilter: "blur(16px) saturate(1.5)",
          boxShadow: "0 2px 12px rgba(0,0,0,.3)",
        }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00e5a0", boxShadow: "0 0 6px #00e5a0" }} />
          <span className="text-[9px] font-mono font-bold tracking-wider" style={{ color: "#00e5a0" }}>AI ANALYZED</span>
        </div>
      </div>

      {/* Premium legend — frosted bar */}
      {showAnn && prog > 0.7 && (
        <div
          className="absolute bottom-3 left-3 right-3 flex items-center justify-between px-3 py-2 rounded-2xl"
          style={{
            background: "rgba(0,0,0,.6)",
            backdropFilter: "blur(20px) saturate(1.5)",
            WebkitBackdropFilter: "blur(20px) saturate(1.5)",
            border: "1px solid rgba(255,255,255,.06)",
            boxShadow: "0 4px 20px rgba(0,0,0,.4)",
            animation: "fadeUp 0.5s ease forwards",
          }}
        >
          <div className="flex gap-3 flex-wrap">
            {LEGEND.map((x, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: x.c, boxShadow: x.glow }} />
                <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.5)" }}>{x.l}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-mono tracking-widest" style={{ color: "rgba(255,255,255,.2)" }}>FXSynapse AI</span>
          </div>
        </div>
      )}
    </div>
  );
}
