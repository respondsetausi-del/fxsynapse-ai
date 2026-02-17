"use client";
import { useEffect, useRef } from "react";
import { Annotation } from "@/lib/types";

export function useAnnotatedCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  dataUrl: string | null,
  annotations: Annotation[],
  dims: { w: number; h: number },
  prog: number,
  showAnn: boolean
) {
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
    };
    img.src = dataUrl;
  }, [dataUrl]);

  useEffect(() => {
    if (!canvasRef.current || !imgRef.current || dims.w === 0) return;
    const c = canvasRef.current;
    const dpr = 2;
    c.width = dims.w * dpr;
    c.height = dims.h * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const { w, h } = dims;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(imgRef.current, 0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(0, 0, w, h);

    if (!showAnn || prog === 0) return;

    const fontSize = w > 700 ? 12 : 10;
    const lbl = (
      text: string,
      x: number,
      y: number,
      bg: string,
      fg: string,
      align: "left" | "right"
    ) => {
      ctx.font = `bold ${fontSize}px monospace`;
      const m = ctx.measureText(text);
      const p = 5,
        bw = m.width + p * 2,
        bh = fontSize + 6;
      const bx = align === "right" ? x - bw : x;
      ctx.fillStyle = bg;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, y - bh / 2, bw, bh, 3);
      else ctx.rect(bx, y - bh / 2, bw, bh);
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(text, bx + p, y);
    };

    const lw = w > 700 ? 2 : 1.5;

    annotations.forEach((a) => {
      ctx.globalAlpha = prog * 0.9;

      if (a.type === "zone" && a.y1 !== undefined && a.y2 !== undefined) {
        const zh = (a.y2 - a.y1) * h;
        ctx.fillStyle = a.color;
        ctx.fillRect(0, a.y1 * h, w * prog, zh);
        ctx.strokeStyle = (a.bc || a.color) + "50";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(0, a.y1 * h, w * prog, zh);
        ctx.setLineDash([]);
        if (prog > 0.5 && a.label)
          lbl(
            a.label,
            8,
            (a.y1 + (a.y2 - a.y1) / 2) * h,
            (a.bc || a.color) + "25",
            a.bc || a.color,
            "left"
          );
      }

      if (a.type === "line" && a.y !== undefined) {
        ctx.beginPath();
        ctx.setLineDash([8, 5]);
        ctx.strokeStyle = a.color + "bb";
        ctx.lineWidth = lw;
        ctx.moveTo(0, a.y * h);
        ctx.lineTo(w * prog, a.y * h);
        ctx.stroke();
        ctx.setLineDash([]);
        if (prog > 0.3 && a.label)
          lbl(a.label, w * prog - 6, a.y * h - 13, a.color + "22", a.color, "right");
      }

      if (
        a.type === "trend" &&
        a.x1 !== undefined &&
        a.y1 !== undefined &&
        a.x2 !== undefined &&
        a.y2 !== undefined
      ) {
        const dx = (a.x2 - a.x1) * w * prog;
        const dy = (a.y2 - a.y1) * h * prog;
        ctx.beginPath();
        ctx.strokeStyle = a.color + "99";
        ctx.lineWidth = lw;
        ctx.setLineDash([]);
        ctx.moveTo(a.x1 * w, a.y1 * h);
        ctx.lineTo(a.x1 * w + dx, a.y1 * h + dy);
        ctx.stroke();
        if (prog > 0.7 && a.label)
          lbl(
            a.label,
            a.x1 * w + dx / 2,
            a.y1 * h + dy / 2 - 12,
            a.color + "28",
            a.color,
            "left"
          );
      }

      if (a.type === "point" && a.x !== undefined && a.y !== undefined && prog > 0.5) {
        const px = a.x * w,
          py = a.y * h;
        const r = (w > 700 ? 16 : 13) * prog;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = a.color + "15";
        ctx.fill();
        ctx.strokeStyle = a.color + "99";
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = a.color + "25";
        ctx.lineWidth = 1;
        ctx.stroke();
        if (a.label) lbl(a.label, px + 20, py, a.color + "28", a.color, "left");
      }

      if (
        a.type === "arrow" &&
        a.x !== undefined &&
        a.y1 !== undefined &&
        a.y2 !== undefined &&
        prog > 0.6
      ) {
        const px = a.x * w,
          sy = a.y1 * h,
          ey = a.y2 * h;
        const ap = Math.min((prog - 0.6) / 0.4, 1);
        const cy = sy + (ey - sy) * ap;
        ctx.beginPath();
        ctx.strokeStyle = a.color;
        ctx.lineWidth = 2.5;
        ctx.moveTo(px, sy);
        ctx.lineTo(px, cy);
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = a.color;
        ctx.moveTo(px, cy);
        ctx.lineTo(px - 6, cy + (ey < sy ? -10 : 10));
        ctx.lineTo(px + 6, cy + (ey < sy ? -10 : 10));
        ctx.closePath();
        ctx.fill();
      }
    });

    ctx.globalAlpha = 1;
    if (prog > 0.8) {
      ctx.globalAlpha = 0.45;
      ctx.font = `bold ${w > 700 ? 13 : 11}px monospace`;
      ctx.fillStyle = "#00e5a0";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText("FXSynapse AI", w - 10, h - 10);
      ctx.globalAlpha = 1;
    }
  }, [canvasRef, dims, prog, annotations, showAnn, dataUrl]);
}
