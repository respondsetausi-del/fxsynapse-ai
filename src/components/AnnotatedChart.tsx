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
  { c: "#2ca87a", l: "Support / Entry" },
  { c: "#c75465", l: "Resistance / SL" },
  { c: "#4183c4", l: "Trend / TP" },
  { c: "#b89730", l: "Liquidity / OB" },
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
    const dur = 2200;
    const go = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      setProg(1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(go);
    };
    const t = setTimeout(() => requestAnimationFrame(go), 500);
    return () => clearTimeout(t);
  }, [isVisible]);

  useEffect(() => {
    if (!dataUrl || !boxRef.current) return;
    const img = new Image();
    img.onload = () => {
      const maxW = boxRef.current!.clientWidth;
      const ratio = img.height / img.width;
      const maxH = ratio > 1.2 ? 600 : 460;
      setDims({ w: maxW, h: Math.min(maxW * ratio, maxH) });
    };
    img.src = dataUrl;
  }, [dataUrl]);

  useAnnotatedCanvas(canvasRef, dataUrl, annotations, dims, prog, showAnn, chartBounds);

  return (
    <div ref={boxRef} className="w-full relative">
      <canvas
        ref={canvasRef}
        onClick={onClick}
        className="w-full block cursor-pointer"
        style={{ height: dims.h || 300, borderRadius: "14px 14px 0 0", background: "#0a0b0f" }}
      />
      {/* Top controls */}
      <div className="absolute top-2.5 right-2.5 flex gap-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); setShowAnn(!showAnn); }}
          className="text-[10px] font-semibold font-mono px-2.5 py-1 rounded-lg cursor-pointer transition-all duration-200"
          style={{
            background: showAnn ? "rgba(44,168,122,0.15)" : "rgba(0,0,0,0.55)",
            border: `1px solid ${showAnn ? "rgba(44,168,122,.25)" : "rgba(255,255,255,.08)"}`,
            color: showAnn ? "#2ca87a" : "rgba(255,255,255,.4)",
            backdropFilter: "blur(12px)",
          }}
        >
          {showAnn ? "◉ Annotations" : "○ Annotations"}
        </button>
        {onClick && (
          <button
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className="text-[10px] font-semibold font-mono px-2.5 py-1 rounded-lg cursor-pointer transition-all duration-200"
            style={{
              background: "rgba(0,0,0,0.55)",
              border: "1px solid rgba(255,255,255,.08)",
              color: "rgba(255,255,255,.4)",
              backdropFilter: "blur(12px)",
            }}
          >
            ⤢ Expand
          </button>
        )}
      </div>
      {/* Legend bar */}
      {showAnn && prog > 0.8 && (
        <div
          className="absolute bottom-2.5 left-2.5 flex gap-2.5 px-2.5 py-1.5 rounded-lg"
          style={{
            background: "rgba(10,11,16,.8)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,.05)",
          }}
        >
          {LEGEND.map((x, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-sm" style={{ background: x.c }} />
              <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.4)" }}>{x.l}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
