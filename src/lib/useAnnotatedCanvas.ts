"use client";
import { useEffect, useRef } from "react";
import { Annotation, ChartBounds } from "@/lib/types";

const DEFAULT_BOUNDS: ChartBounds = { x: 0.02, y: 0.18, w: 0.78, h: 0.65 };
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
const FIB_COLORS: Record<number, string> = {
  0: "#ff4d6a", 0.236: "#ff8c42", 0.382: "#f0b90b", 0.5: "#a0a0a0",
  0.618: "#4da0ff", 0.786: "#9b59b6", 1.0: "#00e5a0",
};

// ─── Helpers ───
const hexToRGBA = (hex: string, a: number): string => {
  const clean = hex.replace("#", "").replace(/[^0-9a-fA-F]/g, "");
  if (clean.length < 6) return `rgba(128,128,128,${a})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
};

const ease = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

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
    const ctx = c.getContext("2d")!;
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const { w, h } = dims;

    // ── Draw base image ──
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(imgRef.current, 0, 0, w, h);
    
    // Cinematic overlay - subtle vignette + darken
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, w, h);
    
    // Vignette
    const vg = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.3, w/2, h/2, Math.max(w,h)*0.7);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.15)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    if (!showAnn || prog === 0) return;

    const b = chartBounds && chartBounds.w > 0 ? chartBounds : DEFAULT_BOUNDS;
    const bx = b.x * w, by = b.y * h, bw = b.w * w, bh = b.h * h;

    const clamp = (v: number) => Math.max(0.01, Math.min(0.99, v));
    const toX = (ax: number) => bx + clamp(ax) * bw;
    const toY = (ay: number) => by + clamp(ay) * bh;

    const fs = w > 700 ? 11 : w > 400 ? 10 : 9;
    const fsS = w > 700 ? 9 : w > 400 ? 8 : 7;
    const lw = w > 700 ? 1.8 : 1.4;

    // ── Rounded rect helper ──
    const rrect = (x: number, y: number, w2: number, h2: number, r: number) => {
      ctx.beginPath();
      if ((ctx as any).roundRect) (ctx as any).roundRect(x, y, w2, h2, r);
      else ctx.rect(x, y, w2, h2);
    };

    // ── Premium label with glow + shadow ──
    const drawLabel = (
      text: string, x: number, y: number,
      color: string, align: "left" | "right", size: number = fs
    ) => {
      ctx.save();
      ctx.font = `600 ${size}px "SF Mono", "JetBrains Mono", monospace`;
      const m = ctx.measureText(text);
      const px = 7, py = 4;
      const tw = m.width + px * 2;
      const th = size + py * 2 + 1;
      let lx = align === "right" ? x - tw : x;
      lx = Math.max(bx + 2, Math.min(bx + bw - tw - 2, lx));
      let ly = y - th / 2;
      ly = Math.max(by + 2, Math.min(by + bh - th - 2, ly));

      // Shadow
      ctx.shadowColor = hexToRGBA(color, 0.25);
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 2;

      // Background — frosted pill
      ctx.fillStyle = hexToRGBA(color, 0.12);
      rrect(lx, ly, tw, th, 6);
      ctx.fill();

      // Left accent bar
      ctx.shadowColor = "transparent";
      ctx.fillStyle = hexToRGBA(color, 0.6);
      rrect(lx, ly, 2.5, th, 6);
      ctx.fill();

      // Border
      ctx.strokeStyle = hexToRGBA(color, 0.2);
      ctx.lineWidth = 0.5;
      rrect(lx, ly, tw, th, 6);
      ctx.stroke();

      // Text
      ctx.fillStyle = color;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(text, lx + px + 2, ly + th / 2);
      ctx.restore();
    };

    // ── Premium badge (for BOS/CHoCH/patterns) ──
    const drawBadge = (text: string, x: number, y: number, color: string) => {
      ctx.save();
      ctx.font = `700 ${fsS}px "SF Mono", "JetBrains Mono", monospace`;
      const m = ctx.measureText(text);
      const px = 5, py = 3;
      const tw = m.width + px * 2;
      const th = fsS + py * 2 + 1;
      const lx = x - tw / 2;
      const ly = y - th - 8;

      ctx.shadowColor = hexToRGBA(color, 0.3);
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 2;

      // Pill background
      ctx.fillStyle = hexToRGBA(color, 0.18);
      rrect(lx, ly, tw, th, th / 2);
      ctx.fill();

      // Border
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = hexToRGBA(color, 0.3);
      ctx.lineWidth = 0.5;
      rrect(lx, ly, tw, th, th / 2);
      ctx.stroke();

      // Pointer
      ctx.fillStyle = hexToRGBA(color, 0.18);
      ctx.beginPath();
      ctx.moveTo(x - 3, ly + th);
      ctx.lineTo(x, ly + th + 4);
      ctx.lineTo(x + 3, ly + th);
      ctx.closePath();
      ctx.fill();

      // Text
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, ly + th / 2);
      ctx.restore();
    };

    // ── Glow line helper ──
    const glowLine = (x1: number, y1: number, x2: number, y2: number, color: string, width: number, dash?: number[]) => {
      ctx.save();
      // Outer glow
      ctx.beginPath();
      ctx.strokeStyle = hexToRGBA(color, 0.08);
      ctx.lineWidth = width + 6;
      ctx.setLineDash(dash || []);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // Inner glow
      ctx.beginPath();
      ctx.strokeStyle = hexToRGBA(color, 0.15);
      ctx.lineWidth = width + 3;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // Core line
      ctx.beginPath();
      ctx.strokeStyle = hexToRGBA(color, 0.75);
      ctx.lineWidth = width;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    };

    // ── Pulse dot at position ──
    const pulseDot = (x: number, y: number, color: string, size: number = 4) => {
      ctx.save();
      // Outer pulse ring
      ctx.beginPath();
      ctx.arc(x, y, size + 4, 0, Math.PI * 2);
      ctx.fillStyle = hexToRGBA(color, 0.08);
      ctx.fill();
      // Mid ring
      ctx.beginPath();
      ctx.arc(x, y, size + 2, 0, Math.PI * 2);
      ctx.fillStyle = hexToRGBA(color, 0.15);
      ctx.fill();
      // Core
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = hexToRGBA(color, 0.9);
      ctx.fill();
      // Highlight
      ctx.beginPath();
      ctx.arc(x - size * 0.25, y - size * 0.25, size * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fill();
      ctx.restore();
    };

    // ═══════════════════════════════════════
    // RENDER ANNOTATIONS
    // ═══════════════════════════════════════
    const p = prog; // shorthand

    annotations.forEach((a) => {
      ctx.globalAlpha = ease(p) * 0.92;

      // ── ZONE / FVG — gradient fill with soft edges ──
      if ((a.type === "zone" || a.type === "fvg") && a.y1 !== undefined && a.y2 !== undefined) {
        const zy1 = toY(a.y1), zy2 = toY(a.y2);
        const ztop = Math.min(zy1, zy2), zh = Math.abs(zy2 - zy1);
        const drawW = bw * ease(p);
        const baseColor = a.bc || a.color;

        // Gradient fill — fades at edges
        const grd = ctx.createLinearGradient(bx, ztop, bx, ztop + zh);
        grd.addColorStop(0, hexToRGBA(baseColor, 0.01));
        grd.addColorStop(0.15, hexToRGBA(baseColor, a.type === "fvg" ? 0.06 : 0.08));
        grd.addColorStop(0.5, hexToRGBA(baseColor, a.type === "fvg" ? 0.08 : 0.1));
        grd.addColorStop(0.85, hexToRGBA(baseColor, a.type === "fvg" ? 0.06 : 0.08));
        grd.addColorStop(1, hexToRGBA(baseColor, 0.01));
        ctx.fillStyle = grd;
        ctx.fillRect(bx, ztop, drawW, zh);

        // Top & bottom border lines with glow
        glowLine(bx, ztop, bx + drawW, ztop, baseColor, 1, [6, 4]);
        glowLine(bx, ztop + zh, bx + drawW, ztop + zh, baseColor, 1, [6, 4]);

        // Left edge accent
        ctx.fillStyle = hexToRGBA(baseColor, 0.3);
        ctx.fillRect(bx, ztop, 2, zh);

        if (p > 0.5 && a.label) {
          drawLabel(a.label, bx + 8, ztop + zh / 2, baseColor, "left");
        }
      }

      // ── LINE / LIQUIDITY — glow line with pulse dot ──
      if ((a.type === "line" || a.type === "liquidity") && a.y !== undefined) {
        const ly = toY(a.y);
        const endX = bx + bw * ease(p);
        const dash = a.type === "liquidity" || a.style === "dotted" ? [2, 4] : [8, 5];
        const width = a.type === "liquidity" ? lw * 0.7 : lw;

        glowLine(bx, ly, endX, ly, a.color, width, dash);

        // Pulse dot at end of line
        if (p > 0.4) pulseDot(endX, ly, a.color, 3);

        if (p > 0.3 && a.label) {
          drawLabel(a.label, endX - 6, ly - 15, a.color, "right");
        }
      }

      // ── TRENDLINE — smooth glow line ──
      if (a.type === "trend" && a.x1 !== undefined && a.y1 !== undefined && a.x2 !== undefined && a.y2 !== undefined) {
        const tx1 = toX(a.x1), ty1 = toY(a.y1);
        const tx2 = toX(a.x2), ty2 = toY(a.y2);
        const dx = (tx2 - tx1) * ease(p);
        const dy = (ty2 - ty1) * ease(p);

        glowLine(tx1, ty1, tx1 + dx, ty1 + dy, a.color, lw);

        // Dots at endpoints
        pulseDot(tx1, ty1, a.color, 3);
        if (p > 0.6) pulseDot(tx1 + dx, ty1 + dy, a.color, 3);

        if (p > 0.7 && a.label) {
          drawLabel(a.label, tx1 + dx / 2, ty1 + dy / 2 - 14, a.color, "left");
        }
      }

      // ── FIBONACCI — premium gradient bands ──
      if (a.type === "fib" && a.y_0 !== undefined && a.y_100 !== undefined && p > 0.3) {
        const y0px = toY(a.y_0), y100px = toY(a.y_100);
        const range = y100px - y0px;
        const fibW = bw * Math.min(ease(p) * 1.2, 1);
        const ap = Math.min((p - 0.3) / 0.4, 1);
        ctx.globalAlpha = ap * 0.55;

        FIB_LEVELS.forEach((level) => {
          const fibY = y0px + range * level;
          if (fibY < by || fibY > by + bh) return;
          const color = FIB_COLORS[level] || "#888";
          glowLine(bx, fibY, bx + fibW, fibY, color, 0.8, [3, 5]);

          ctx.font = `600 ${fsS}px "SF Mono", monospace`;
          ctx.fillStyle = hexToRGBA(color, 0.8);
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(`${(level * 100).toFixed(1)}%`, bx + 4, fibY - 8);
        });

        // Golden pocket — premium gradient
        const gp1 = y0px + range * 0.5, gp2 = y0px + range * 0.618;
        const gpGrd = ctx.createLinearGradient(bx, gp1, bx, gp2);
        gpGrd.addColorStop(0, hexToRGBA("#4da0ff", 0.04));
        gpGrd.addColorStop(0.5, hexToRGBA("#4da0ff", 0.08));
        gpGrd.addColorStop(1, hexToRGBA("#4da0ff", 0.04));
        ctx.fillStyle = gpGrd;
        ctx.fillRect(bx, gp1, fibW, gp2 - gp1);
        ctx.globalAlpha = ease(p) * 0.92;
      }

      // ── PATTERN — diamond with glow ring ──
      if (a.type === "pattern" && a.x !== undefined && a.y !== undefined && p > 0.5) {
        const px2 = toX(a.x), py = toY(a.y);
        const ap = Math.min((p - 0.5) / 0.3, 1);
        ctx.globalAlpha = ap * 0.9;

        const sz = w > 700 ? 7 : 5;
        // Glow ring
        ctx.beginPath();
        ctx.arc(px2, py, sz + 5, 0, Math.PI * 2);
        ctx.fillStyle = hexToRGBA(a.color, 0.08);
        ctx.fill();
        // Diamond
        ctx.beginPath();
        ctx.moveTo(px2, py - sz); ctx.lineTo(px2 + sz, py);
        ctx.lineTo(px2, py + sz); ctx.lineTo(px2 - sz, py);
        ctx.closePath();
        ctx.fillStyle = hexToRGBA(a.color, 0.8);
        ctx.fill();
        ctx.strokeStyle = a.color;
        ctx.lineWidth = 1;
        ctx.stroke();

        if (a.label) drawBadge(a.label, px2, py - sz, a.color);
        ctx.globalAlpha = ease(p) * 0.92;
      }

      // ── BOS / CHoCH — structural markers ──
      if ((a.type === "bos" || a.type === "choch") && a.x !== undefined && a.y !== undefined && p > 0.4) {
        const px2 = toX(a.x), py = toY(a.y);
        const ap = Math.min((p - 0.4) / 0.3, 1);
        ctx.globalAlpha = ap * 0.9;

        const lineLen = bw * 0.25;
        const dash = a.type === "bos" ? [6, 3] : [3, 3];
        glowLine(px2 - lineLen / 2, py, px2 + lineLen / 2, py, a.color, lw * 0.8, dash);

        // Circle marker with glow
        pulseDot(px2, py, a.color, 4);

        if (a.label) drawBadge(a.label, px2, py, a.color);
        ctx.globalAlpha = ease(p) * 0.92;
      }
    });

    // ═══════════════════════════════════════
    // TRADE SETUP — Premium price tags + R:R visualization
    // ═══════════════════════════════════════
    if (p > 0.5) {
      const points = annotations.filter(a => a.type === "point" && a.y !== undefined);
      const entry = points.find(a => a.label === "Entry");
      const tp = points.find(a => a.label === "TP");
      const sl = points.find(a => a.label === "SL");

      if (points.length > 0) {
        const tagW = w > 700 ? 62 : w > 400 ? 52 : 44;
        const tagH = w > 700 ? 22 : w > 400 ? 20 : 17;
        const tagX = bx + bw - tagW - 4;
        const tagFs = w > 700 ? 10 : w > 400 ? 9 : 8;
        const ap = Math.min((p - 0.5) / 0.5, 1);

        // ── R:R gradient zones ──
        if (entry && tp && sl && p > 0.6) {
          const ePx = toY(entry.y!), tPx = toY(tp.y!), sPx = toY(sl.y!);
          const zL = bx + bw * 0.55, zR = tagX - 16, zW = zR - zL;
          const zap = Math.min((p - 0.6) / 0.3, 1);

          // TP zone — gradient green
          const tpGrd = ctx.createLinearGradient(zL, 0, zR, 0);
          tpGrd.addColorStop(0, "rgba(0,229,160,0)");
          tpGrd.addColorStop(0.4, hexToRGBA("#00e5a0", 0.08 * zap));
          tpGrd.addColorStop(1, hexToRGBA("#00e5a0", 0.12 * zap));
          ctx.fillStyle = tpGrd;
          const tpTop = Math.min(ePx, tPx), tpH = Math.abs(ePx - tPx);
          ctx.fillRect(zL, tpTop, zW, tpH);

          // SL zone — gradient red
          const slGrd = ctx.createLinearGradient(zL, 0, zR, 0);
          slGrd.addColorStop(0, "rgba(255,77,106,0)");
          slGrd.addColorStop(0.4, hexToRGBA("#ff4d6a", 0.06 * zap));
          slGrd.addColorStop(1, hexToRGBA("#ff4d6a", 0.1 * zap));
          ctx.fillStyle = slGrd;
          const slTop = Math.min(ePx, sPx), slH = Math.abs(ePx - sPx);
          ctx.fillRect(zL, slTop, zW, slH);
        }

        const pointData: { py: number; color: string; label: string }[] = [];

        points.forEach((a) => {
          if (a.y === undefined) return;
          let py = toY(a.y);
          py = Math.max(by + 10, Math.min(by + bh - 10, py));
          pointData.push({ py, color: a.color, label: a.label || "" });

          // Dashed guide line with glow
          ctx.globalAlpha = ap * 0.3;
          glowLine(bx, py, tagX - 2, py, a.color, 0.6, [3, 5]);

          // ── Premium arrow-shape price tag ──
          ctx.globalAlpha = ap * 0.95;
          const tagY = py - tagH / 2;

          ctx.save();
          ctx.shadowColor = hexToRGBA(a.color, 0.3);
          ctx.shadowBlur = 12;
          ctx.shadowOffsetY = 2;

          // Tag body with arrow point
          ctx.beginPath();
          const r = 5;
          ctx.moveTo(tagX + r, tagY);
          ctx.lineTo(tagX + tagW - r, tagY);
          ctx.arcTo(tagX + tagW, tagY, tagX + tagW, tagY + r, r);
          ctx.lineTo(tagX + tagW, tagY + tagH - r);
          ctx.arcTo(tagX + tagW, tagY + tagH, tagX + tagW - r, tagY + tagH, r);
          ctx.lineTo(tagX + r, tagY + tagH);
          ctx.arcTo(tagX, tagY + tagH, tagX, tagY + tagH - r, r);
          ctx.lineTo(tagX, py + 3);
          ctx.lineTo(tagX - 6, py);
          ctx.lineTo(tagX, py - 3);
          ctx.lineTo(tagX, tagY + r);
          ctx.arcTo(tagX, tagY, tagX + r, tagY, r);
          ctx.closePath();

          ctx.fillStyle = hexToRGBA(a.color, 0.85);
          ctx.fill();
          ctx.restore();

          // Tag text
          ctx.font = `700 ${tagFs}px "SF Mono", "JetBrains Mono", monospace`;
          ctx.fillStyle = "#050507";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(a.label || "", tagX + tagW / 2, py);
        });

        // ── Vertical connector — gradient line ──
        if (pointData.length >= 2) {
          const sorted = [...pointData].sort((a, b) => a.py - b.py);
          const topPt = sorted[0], botPt = sorted[sorted.length - 1];
          const cx2 = tagX - 10;

          // Gradient connector
          const connGrd = ctx.createLinearGradient(0, topPt.py, 0, botPt.py);
          connGrd.addColorStop(0, hexToRGBA(topPt.color, 0.5));
          connGrd.addColorStop(0.5, "rgba(255,255,255,0.15)");
          connGrd.addColorStop(1, hexToRGBA(botPt.color, 0.5));

          ctx.globalAlpha = ap * 0.8;
          ctx.beginPath();
          ctx.strokeStyle = connGrd;
          ctx.lineWidth = 1.5;
          ctx.moveTo(cx2, topPt.py);
          ctx.lineTo(cx2, botPt.py);
          ctx.stroke();

          // Connector dots
          pointData.forEach(({ py, color }) => pulseDot(cx2, py, color, 3));

          // R:R labels
          if (entry && tp && sl && p > 0.8) {
            const eY = toY(entry.y!), tY = toY(tp.y!), sY = toY(sl.y!);
            const bracX = cx2 - 16;
            ctx.globalAlpha = ap * 0.7;
            ctx.font = `700 ${tagFs - 1}px "SF Mono", monospace`;

            // Reward label
            ctx.fillStyle = "#00e5a0";
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillText("R", bracX, (eY + tY) / 2);

            // Risk label
            ctx.fillStyle = "#ff4d6a";
            ctx.fillText("R", bracX, (eY + sY) / 2);
          }
        }
        ctx.globalAlpha = ap;
      }
    }

    // ── ARROW — animated direction with glow ──
    annotations.forEach((a) => {
      if (a.type === "arrow" && a.y1 !== undefined && a.y2 !== undefined && p > 0.6) {
        const tagW = w > 700 ? 62 : w > 400 ? 52 : 44;
        const arrowX = bx + bw - tagW - 22;
        const sy = toY(a.y1), ey = toY(a.y2);
        const ap = Math.min((p - 0.6) / 0.4, 1);
        const cy = sy + (ey - sy) * ease(ap);

        ctx.globalAlpha = ap * 0.85;

        // Outer glow
        ctx.beginPath();
        ctx.strokeStyle = hexToRGBA(a.color, 0.1);
        ctx.lineWidth = 8;
        ctx.moveTo(arrowX, sy); ctx.lineTo(arrowX, cy);
        ctx.stroke();

        // Inner glow
        ctx.beginPath();
        ctx.strokeStyle = hexToRGBA(a.color, 0.25);
        ctx.lineWidth = 4;
        ctx.moveTo(arrowX, sy); ctx.lineTo(arrowX, cy);
        ctx.stroke();

        // Core
        ctx.beginPath();
        ctx.strokeStyle = hexToRGBA(a.color, 0.9);
        ctx.lineWidth = 2;
        ctx.moveTo(arrowX, sy); ctx.lineTo(arrowX, cy);
        ctx.stroke();

        // Arrowhead
        const hs = w > 700 ? 8 : 6;
        const dir = ey < sy ? -1 : 1;
        ctx.beginPath();
        ctx.fillStyle = a.color;
        ctx.moveTo(arrowX, cy);
        ctx.lineTo(arrowX - hs, cy - dir * hs * 1.5);
        ctx.lineTo(arrowX + hs, cy - dir * hs * 1.5);
        ctx.closePath();
        ctx.fill();

        // Start dot
        pulseDot(arrowX, sy, a.color, 3);
      }
    });

    ctx.globalAlpha = 1;

    // ── Premium watermark ──
    if (p > 0.8) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.font = `800 ${w > 700 ? 12 : 10}px "SF Mono", "JetBrains Mono", monospace`;
      ctx.fillStyle = "#00e5a0";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      const wmX = bx + bw - 8, wmY = by + bh - 8;

      // Glow behind text
      ctx.shadowColor = "rgba(0,229,160,0.3)";
      ctx.shadowBlur = 8;
      ctx.fillText("⬢ FXSynapse AI", wmX, wmY);
      ctx.restore();
    }

    // ── Scan progress beam (during animation) ──
    if (p > 0 && p < 0.95) {
      const beamX = bx + bw * ease(p);
      ctx.save();
      ctx.globalAlpha = 0.15 * (1 - p);
      const beamGrd = ctx.createLinearGradient(beamX - 20, 0, beamX + 20, 0);
      beamGrd.addColorStop(0, "rgba(0,229,160,0)");
      beamGrd.addColorStop(0.5, "rgba(0,229,160,0.6)");
      beamGrd.addColorStop(1, "rgba(0,229,160,0)");
      ctx.fillStyle = beamGrd;
      ctx.fillRect(beamX - 20, by, 40, bh);
      ctx.restore();
    }

  }, [canvasRef, dims, prog, annotations, showAnn, dataUrl, chartBounds]);
}
