"use client";
import { useEffect, useRef } from "react";
import { Annotation, ChartBounds } from "@/lib/types";

const DEFAULT_BOUNDS: ChartBounds = {
  x: 0.02,
  y: 0.18,
  w: 0.78,
  h: 0.65,
};

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
const FIB_COLORS: Record<number, string> = {
  0: "#ff4d6a",
  0.236: "#ff8c42",
  0.382: "#f0b90b",
  0.5: "#a0a0a0",
  0.618: "#4da0ff",
  0.786: "#9b59b6",
  1.0: "#00e5a0",
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
    img.onload = () => { imgRef.current = img; };
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
    const bx = b.x * w;
    const by = b.y * h;
    const bw = b.w * w;
    const bh = b.h * h;

    const clamp = (v: number) => Math.max(0.01, Math.min(0.99, v));
    const toPixelX = (ax: number) => bx + clamp(ax) * bw;
    const toPixelY = (ay: number) => by + clamp(ay) * bh;

    const fontSize = w > 700 ? 12 : w > 400 ? 11 : 10;
    const smallFont = w > 700 ? 10 : w > 400 ? 9 : 8;

    // ── Label drawing helper ──
    const lbl = (
      text: string, x: number, y: number,
      bg: string, fg: string, align: "left" | "right"
    ) => {
      ctx.font = `bold ${fontSize}px monospace`;
      const m = ctx.measureText(text);
      const p = 5;
      const bw2 = m.width + p * 2;
      const bh2 = fontSize + 6;
      let lx = align === "right" ? x - bw2 : x;
      if (lx < bx) lx = bx + 2;
      if (lx + bw2 > bx + bw) lx = bx + bw - bw2 - 2;
      let ly = y - bh2 / 2;
      if (ly < by) ly = by + 2;
      if (ly + bh2 > by + bh) ly = by + bh - bh2 - 2;

      ctx.fillStyle = bg;
      ctx.beginPath();
      if ((ctx as any).roundRect) {
        (ctx as any).roundRect(lx, ly, bw2, bh2, 3);
      } else {
        ctx.rect(lx, ly, bw2, bh2);
      }
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(text, lx + p, ly + bh2 / 2);
    };

    const lw = w > 700 ? 2 : 1.5;

    annotations.forEach((a) => {
      ctx.globalAlpha = prog * 0.9;

      // ── ZONE ──
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
          lbl(a.label, bx + 8, zy1 + zh / 2, (a.bc || a.color) + "25", a.bc || a.color, "left");
        }
      }

      // ── LINE ──
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

      // ── TRENDLINE ──
      if (a.type === "trend" && a.x1 !== undefined && a.y1 !== undefined && a.x2 !== undefined && a.y2 !== undefined) {
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
          lbl(a.label, tx1 + dx / 2, ty1 + dy / 2 - 12, a.color + "28", a.color, "left");
        }
      }

      // ── FIBONACCI RETRACEMENT ──
      if (a.type === "fib" && a.y_0 !== undefined && a.y_100 !== undefined && prog > 0.3) {
        const y0px = toPixelY(a.y_0);   // 0% = swing high
        const y100px = toPixelY(a.y_100); // 100% = swing low
        const range = y100px - y0px;
        const fibDrawW = bw * Math.min(prog * 1.2, 1);
        const ap = Math.min((prog - 0.3) / 0.4, 1);

        ctx.globalAlpha = ap * 0.6;

        FIB_LEVELS.forEach((level) => {
          const fibY = y0px + range * level;
          if (fibY < by || fibY > by + bh) return;

          const color = FIB_COLORS[level] || "#888";
          ctx.beginPath();
          ctx.setLineDash([3, 5]);
          ctx.strokeStyle = color + "66";
          ctx.lineWidth = 1;
          ctx.moveTo(bx, fibY);
          ctx.lineTo(bx + fibDrawW, fibY);
          ctx.stroke();
          ctx.setLineDash([]);

          // Fib level label
          ctx.font = `bold ${smallFont}px monospace`;
          ctx.fillStyle = color + "aa";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(`${(level * 100).toFixed(1)}%`, bx + 4, fibY - 7);
        });

        // Shaded zone between 0.5 and 0.618 (golden pocket)
        const gp1 = y0px + range * 0.5;
        const gp2 = y0px + range * 0.618;
        ctx.fillStyle = "rgba(77,160,255,0.06)";
        ctx.fillRect(bx, gp1, fibDrawW, gp2 - gp1);
        ctx.globalAlpha = prog * 0.9;
      }

      // ── PATTERN MARKER ──
      if (a.type === "pattern" && a.x !== undefined && a.y !== undefined && prog > 0.5) {
        const px = toPixelX(a.x);
        const py = toPixelY(a.y);
        const ap = Math.min((prog - 0.5) / 0.3, 1);
        ctx.globalAlpha = ap * 0.9;

        // Diamond marker
        const sz = w > 700 ? 6 : 5;
        ctx.beginPath();
        ctx.moveTo(px, py - sz);
        ctx.lineTo(px + sz, py);
        ctx.lineTo(px, py + sz);
        ctx.lineTo(px - sz, py);
        ctx.closePath();
        ctx.fillStyle = a.color + "cc";
        ctx.fill();
        ctx.strokeStyle = a.color;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Pattern label
        if (a.label) {
          ctx.font = `bold ${smallFont}px monospace`;
          const tm = ctx.measureText(a.label);
          const lbx = px - tm.width / 2 - 4;
          const lby = py - sz - fontSize - 4;

          ctx.fillStyle = a.color + "20";
          ctx.beginPath();
          if ((ctx as any).roundRect) {
            (ctx as any).roundRect(lbx, lby, tm.width + 8, fontSize + 4, 3);
          } else {
            ctx.rect(lbx, lby, tm.width + 8, fontSize + 4);
          }
          ctx.fill();
          ctx.fillStyle = a.color;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(a.label, px, lby + (fontSize + 4) / 2);
        }
        ctx.globalAlpha = prog * 0.9;
      }
    });

    // ── TRADE SETUP (Entry/TP/SL as right-edge price tags + connector + R:R shading) ──
    if (prog > 0.5) {
      const points = annotations.filter(a => a.type === "point" && a.y !== undefined);
      const entry = points.find(a => a.label === "Entry");
      const tp = points.find(a => a.label === "TP");
      const sl = points.find(a => a.label === "SL");

      if (points.length > 0) {
        const tagW = w > 700 ? 58 : w > 400 ? 50 : 44;
        const tagH = w > 700 ? 20 : w > 400 ? 18 : 16;
        const tagX = bx + bw - tagW - 2;
        const tagFontSize = w > 700 ? 10 : w > 400 ? 9 : 8;
        const ap = Math.min((prog - 0.5) / 0.5, 1);

        // ── Risk/Reward shaded zones ──
        if (entry && tp && sl && prog > 0.6) {
          const entryPx = toPixelY(entry.y!);
          const tpPx = toPixelY(tp.y!);
          const slPx = toPixelY(sl.y!);
          const zoneLeft = bx + bw * 0.6;
          const zoneRight = tagX - 14;
          const zoneW = zoneRight - zoneLeft;
          const zap = Math.min((prog - 0.6) / 0.3, 1);

          ctx.globalAlpha = zap * 0.12;
          // TP zone (green)
          ctx.fillStyle = "#00e5a0";
          const tpTop = Math.min(entryPx, tpPx);
          const tpBot = Math.max(entryPx, tpPx);
          ctx.fillRect(zoneLeft, tpTop, zoneW, tpBot - tpTop);

          // SL zone (red)
          ctx.fillStyle = "#ff4d6a";
          const slTop = Math.min(entryPx, slPx);
          const slBot = Math.max(entryPx, slPx);
          ctx.fillRect(zoneLeft, slTop, zoneW, slBot - slTop);
          ctx.globalAlpha = ap;
        }

        const pointYs: { py: number; color: string; label: string }[] = [];

        points.forEach((a) => {
          if (a.y === undefined) return;
          let py = toPixelY(a.y);
          py = Math.max(by + 8, Math.min(by + bh - 8, py));
          pointYs.push({ py, color: a.color, label: a.label || "" });

          // Horizontal dashed line
          ctx.globalAlpha = ap * 0.35;
          ctx.beginPath();
          ctx.setLineDash([3, 4]);
          ctx.strokeStyle = a.color + "55";
          ctx.lineWidth = 1;
          ctx.moveTo(bx, py);
          ctx.lineTo(tagX, py);
          ctx.stroke();
          ctx.setLineDash([]);

          // Price tag badge
          ctx.globalAlpha = ap * 0.95;
          const tagY = py - tagH / 2;

          ctx.beginPath();
          ctx.moveTo(tagX + 4, tagY);
          ctx.lineTo(tagX + tagW, tagY);
          ctx.lineTo(tagX + tagW, tagY + tagH);
          ctx.lineTo(tagX + 4, tagY + tagH);
          ctx.lineTo(tagX - 3, py);
          ctx.closePath();
          ctx.fillStyle = a.color + "dd";
          ctx.fill();

          ctx.font = `bold ${tagFontSize}px monospace`;
          ctx.fillStyle = "#0a0b0f";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(a.label || "", tagX + tagW / 2 + 2, py);
        });

        // ── Vertical connector ──
        if (pointYs.length >= 2) {
          const sortedYs = [...pointYs].sort((a, b) => a.py - b.py);
          const topY = sortedYs[0].py;
          const botY = sortedYs[sortedYs.length - 1].py;
          const connX = tagX - 8;

          ctx.globalAlpha = ap * 0.7;
          ctx.beginPath();
          ctx.strokeStyle = "rgba(255,255,255,0.2)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([]);
          ctx.moveTo(connX, topY);
          ctx.lineTo(connX, botY);
          ctx.stroke();

          pointYs.forEach(({ py, color }) => {
            ctx.beginPath();
            ctx.arc(connX, py, 3, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
          });

          // R:R labels
          if (entry && tp && sl && prog > 0.8) {
            const entryY = toPixelY(entry.y!);
            const tpY = toPixelY(tp.y!);
            const slY = toPixelY(sl.y!);
            const bracketX = connX - 14;

            ctx.globalAlpha = ap * 0.6;
            ctx.font = `bold ${tagFontSize - 1}px monospace`;
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";

            // Reward label
            ctx.fillStyle = "#00e5a0";
            ctx.fillText("R", bracketX, (entryY + tpY) / 2);

            // Risk label
            ctx.fillStyle = "#ff4d6a";
            ctx.fillText("R", bracketX, (entryY + slY) / 2);
          }
        }

        ctx.globalAlpha = ap;
      }
    }

    // ── ARROW ──
    annotations.forEach((a) => {
      if (a.type === "arrow" && a.x !== undefined && a.y1 !== undefined && a.y2 !== undefined && prog > 0.6) {
        const tagW = w > 700 ? 58 : w > 400 ? 50 : 44;
        const arrowX = bx + bw - tagW - 18;
        const sy = toPixelY(a.y1);
        const ey = toPixelY(a.y2);

        const ap = Math.min((prog - 0.6) / 0.4, 1);
        const cy = sy + (ey - sy) * ap;

        ctx.globalAlpha = ap * 0.8;

        // Glow effect
        ctx.beginPath();
        ctx.strokeStyle = a.color + "30";
        ctx.lineWidth = 6;
        ctx.moveTo(arrowX, sy);
        ctx.lineTo(arrowX, cy);
        ctx.stroke();

        // Arrow shaft
        ctx.beginPath();
        ctx.strokeStyle = a.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.moveTo(arrowX, sy);
        ctx.lineTo(arrowX, cy);
        ctx.stroke();

        // Arrow head
        const headSize = w > 700 ? 7 : 5;
        ctx.beginPath();
        ctx.fillStyle = a.color;
        ctx.moveTo(arrowX, cy);
        ctx.lineTo(arrowX - headSize, cy + (ey < sy ? -headSize * 1.5 : headSize * 1.5));
        ctx.lineTo(arrowX + headSize, cy + (ey < sy ? -headSize * 1.5 : headSize * 1.5));
        ctx.closePath();
        ctx.fill();
      }
    });

    ctx.globalAlpha = 1;

    // ── Watermark ──
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
