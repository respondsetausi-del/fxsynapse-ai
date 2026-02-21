"use client";
import { useEffect, useRef } from "react";
import { Annotation, ChartBounds } from "@/lib/types";

// Default bounds fallback if Claude doesn't return them
// Conservative estimate that works for most chart screenshots
const DEFAULT_BOUNDS: ChartBounds = {
  x: 0.02,
  y: 0.18,
  w: 0.78,
  h: 0.65,
};

export function useAnnotatedCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  dataUrl: string | null,
  annotations: Annotation[],
  dims: { w: number; h: number },
  prog: number,
  showAnn: boolean,
  chartBounds?: ChartBounds
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

    // ── Chart bounds (pixel coords) ──
    const b = chartBounds && chartBounds.w > 0 ? chartBounds : DEFAULT_BOUNDS;
    const bx = b.x * w; // chart area left edge in pixels
    const by = b.y * h; // chart area top edge in pixels
    const bw = b.w * w; // chart area width in pixels
    const bh = b.h * h; // chart area height in pixels

    // Helper: convert annotation coords (0-1 within bounds) to pixel coords
    const toPixelX = (ax: number) => bx + ax * bw;
    const toPixelY = (ay: number) => by + ay * bh;

    const fontSize = w > 700 ? 12 : w > 400 ? 11 : 10;

    // ── Label drawing helper ──
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
      const p = 5;
      const bw2 = m.width + p * 2;
      const bh2 = fontSize + 6;
      let lx = align === "right" ? x - bw2 : x;

      // Clamp label within chart bounds
      if (lx < bx) lx = bx + 2;
      if (lx + bw2 > bx + bw) lx = bx + bw - bw2 - 2;
      let ly = y - bh2 / 2;
      if (ly < by) ly = by + 2;
      if (ly + bh2 > by + bh) ly = by + bh - bh2 - 2;

      ctx.fillStyle = bg;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(lx, ly, bw2, bh2, 3);
      else ctx.rect(lx, ly, bw2, bh2);
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(text, lx + p, ly + bh2 / 2);
    };

    const lw = w > 700 ? 2 : 1.5;

    annotations.forEach((a) => {
      ctx.globalAlpha = prog * 0.9;

      // ── ZONE ── (spans chart area width only)
      if (a.type === "zone" && a.y1 !== undefined && a.y2 !== undefined) {
        const zy1 = toPixelY(a.y1);
        const zy2 = toPixelY(a.y2);
        const zh = zy2 - zy1;
        const zoneDrawW = bw * prog;

        ctx.fillStyle = a.color;
        ctx.fillRect(bx, zy1, zoneDrawW, zh);
        ctx.strokeStyle = (a.bc || a.color) + "50";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(bx, zy1, zoneDrawW, zh);
        ctx.setLineDash([]);
        if (prog > 0.5 && a.label) {
          lbl(
            a.label,
            bx + 8,
            zy1 + zh / 2,
            (a.bc || a.color) + "25",
            a.bc || a.color,
            "left"
          );
        }
      }

      // ── LINE ── (horizontal, spans chart area width only)
      if (a.type === "line" && a.y !== undefined) {
        const ly2 = toPixelY(a.y);
        const lineEndX = bx + bw * prog;

        ctx.beginPath();
        ctx.setLineDash([8, 5]);
        ctx.strokeStyle = a.color + "bb";
        ctx.lineWidth = lw;
        ctx.moveTo(bx, ly2);
        ctx.lineTo(lineEndX, ly2);
        ctx.stroke();
        ctx.setLineDash([]);
        if (prog > 0.3 && a.label) {
          lbl(a.label, lineEndX - 6, ly2 - 13, a.color + "22", a.color, "right");
        }
      }

      // ── TRENDLINE ── (within chart bounds)
      if (
        a.type === "trend" &&
        a.x1 !== undefined &&
        a.y1 !== undefined &&
        a.x2 !== undefined &&
        a.y2 !== undefined
      ) {
        const tx1 = toPixelX(a.x1);
        const ty1 = toPixelY(a.y1);
        const tx2 = toPixelX(a.x2);
        const ty2 = toPixelY(a.y2);
        const dx = (tx2 - tx1) * prog;
        const dy = (ty2 - ty1) * prog;

        ctx.beginPath();
        ctx.strokeStyle = a.color + "99";
        ctx.lineWidth = lw;
        ctx.setLineDash([]);
        ctx.moveTo(tx1, ty1);
        ctx.lineTo(tx1 + dx, ty1 + dy);
        ctx.stroke();
        if (prog > 0.7 && a.label) {
          lbl(
            a.label,
            tx1 + dx / 2,
            ty1 + dy / 2 - 12,
            a.color + "28",
            a.color,
            "left"
          );
        }
      }

      // ── POINT ── (Entry/TP/SL — within chart bounds)
      if (a.type === "point" && a.x !== undefined && a.y !== undefined && prog > 0.5) {
        let px = toPixelX(a.x);
        let py = toPixelY(a.y);

        // Clamp within chart bounds with padding
        const pad = 15;
        px = Math.max(bx + pad, Math.min(bx + bw - pad, px));
        py = Math.max(by + pad, Math.min(by + bh - pad, py));

        const r = (w > 700 ? 16 : w > 400 ? 14 : 12) * prog;

        // Outer glow
        ctx.beginPath();
        ctx.arc(px, py, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = a.color + "25";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Inner fill
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = a.color + "15";
        ctx.fill();
        ctx.strokeStyle = a.color + "99";
        ctx.lineWidth = lw;
        ctx.stroke();

        // Label — position to the left if too close to right edge
        if (a.label) {
          const labelAlign = px > bx + bw * 0.75 ? "right" : "left";
          const labelX = labelAlign === "right" ? px - 20 : px + 20;
          lbl(a.label, labelX, py, a.color + "28", a.color, labelAlign);
        }
      }

      // ── ARROW ── (directional, within chart bounds)
      if (
        a.type === "arrow" &&
        a.x !== undefined &&
        a.y1 !== undefined &&
        a.y2 !== undefined &&
        prog > 0.6
      ) {
        let px = toPixelX(a.x);
        const sy = toPixelY(a.y1);
        const ey = toPixelY(a.y2);

        // Clamp x within chart bounds
        px = Math.max(bx + 10, Math.min(bx + bw - 10, px));

        const ap = Math.min((prog - 0.6) / 0.4, 1);
        const cy = sy + (ey - sy) * ap;

        ctx.beginPath();
        ctx.strokeStyle = a.color;
        ctx.lineWidth = 2.5;
        ctx.moveTo(px, sy);
        ctx.lineTo(px, cy);
        ctx.stroke();

        // Arrow head
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

    // Watermark — bottom-right of chart area
    if (prog > 0.8) {
      ctx.globalAlpha = 0.45;
      ctx.font = `bold ${w > 700 ? 13 : 11}px monospace`;
      ctx.fillStyle = "#00e5a0";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText("FXSynapse AI", bx + bw - 5, by + bh - 5);
      ctx.globalAlpha = 1;
    }
  }, [canvasRef, dims, prog, annotations, showAnn, dataUrl, chartBounds]);
}
