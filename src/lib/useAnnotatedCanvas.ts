"use client";
import { useEffect, useRef } from "react";
import { Annotation, ChartBounds } from "@/lib/types";

const DEFAULT_BOUNDS: ChartBounds = { x: 0.02, y: 0.18, w: 0.78, h: 0.65 };
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
const FIB_COLORS: Record<number, string> = {
  0: "#c74b5f", 0.236: "#c77a3e", 0.382: "#b89730", 0.5: "#808080",
  0.618: "#4183c4", 0.786: "#7b4fa6", 1.0: "#3bac7a",
};

// ── Muted professional palette ──
const MUTED: Record<string, string> = {
  "#00e5a0": "#2ca87a", "#ff4d6a": "#c75465", "#4da0ff": "#4183c4",
  "#f0b90b": "#b89730", "#a855f7": "#8b5fb5", "#9b59b6": "#7b4fa6",
};
const mute = (c: string) => MUTED[c] || c;

const hex2rgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "").replace(/[^0-9a-fA-F]/g, "");
  if (h.length < 6) return [128, 128, 128];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const rgba = (hex: string, a: number) => { const [r, g, b] = hex2rgb(mute(hex)); return `rgba(${r},${g},${b},${a})`; };

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
    img.crossOrigin = "anonymous";
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

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(imgRef.current, 0, 0, w, h);
    // Subtle darken only
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(0, 0, w, h);

    if (!showAnn || prog === 0) return;

    const b = chartBounds && chartBounds.w > 0 ? chartBounds : DEFAULT_BOUNDS;
    const bx = b.x * w, by = b.y * h, bw = b.w * w, bh = b.h * h;
    const clamp = (v: number) => Math.max(0.01, Math.min(0.99, v));
    const toX = (ax: number) => bx + clamp(ax) * bw;
    const toY = (ay: number) => by + clamp(ay) * bh;

    const fs = w > 700 ? 10 : w > 400 ? 9 : 8;
    const fsS = w > 700 ? 8 : 7;
    const lw = w > 700 ? 1.5 : 1.2;
    const p = prog;

    // ── Rounded rect ──
    const rr = (x: number, y: number, w2: number, h2: number, r: number) => {
      ctx.beginPath();
      if ((ctx as any).roundRect) (ctx as any).roundRect(x, y, w2, h2, r);
      else ctx.rect(x, y, w2, h2);
    };

    // ── Clean label — dark bg, readable text ──
    const label = (text: string, x: number, y: number, color: string, align: "left" | "right") => {
      const mc = mute(color);
      ctx.font = `600 ${fs}px "JetBrains Mono", monospace`;
      const m = ctx.measureText(text);
      const px = 6, py = 3;
      const tw = m.width + px * 2, th = fs + py * 2 + 1;
      let lx = align === "right" ? x - tw : x;
      lx = Math.max(bx + 1, Math.min(bx + bw - tw - 1, lx));
      let ly = y - th / 2;
      ly = Math.max(by + 1, Math.min(by + bh - th - 1, ly));

      // Dark frosted background
      ctx.fillStyle = "rgba(10,11,16,0.85)";
      rr(lx, ly, tw, th, 4);
      ctx.fill();
      // Left accent — bright
      ctx.fillStyle = rgba(color, 0.9);
      ctx.fillRect(lx, ly + 2, 2, th - 4);
      // Border
      ctx.strokeStyle = rgba(mc, 0.3);
      ctx.lineWidth = 0.5;
      rr(lx, ly, tw, th, 4);
      ctx.stroke();
      // Text — BRIGHT, use original color not muted
      ctx.fillStyle = rgba(color, 1);
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(text, lx + px + 1, ly + th / 2);
    };

    // ── Small badge — bright text on dark bg ──
    const badge = (text: string, x: number, y: number, color: string) => {
      ctx.font = `700 ${fsS}px "JetBrains Mono", monospace`;
      const m = ctx.measureText(text);
      const px = 4, py = 2;
      const tw = m.width + px * 2, th = fsS + py * 2 + 1;
      const lx = x - tw / 2, ly = y - th - 6;

      ctx.fillStyle = "rgba(10,11,16,0.85)";
      rr(lx, ly, tw, th, th / 2);
      ctx.fill();
      ctx.strokeStyle = rgba(color, 0.35);
      ctx.lineWidth = 0.5;
      rr(lx, ly, tw, th, th / 2);
      ctx.stroke();
      // Pointer
      ctx.fillStyle = "rgba(10,11,16,0.85)";
      ctx.beginPath();
      ctx.moveTo(x - 3, ly + th);
      ctx.lineTo(x, ly + th + 3);
      ctx.lineTo(x + 3, ly + th);
      ctx.closePath();
      ctx.fill();

      // Text — BRIGHT
      ctx.fillStyle = rgba(color, 1);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, ly + th / 2);
    };

    // ── Thin line with subtle glow ──
    const drawLine = (x1: number, y1: number, x2: number, y2: number, color: string, width: number, dash?: number[]) => {
      const mc = mute(color);
      ctx.save();
      ctx.setLineDash(dash || []);
      // Subtle glow only
      ctx.beginPath();
      ctx.strokeStyle = rgba(mc, 0.08);
      ctx.lineWidth = width + 3;
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.stroke();
      // Core
      ctx.beginPath();
      ctx.strokeStyle = rgba(mc, 0.65);
      ctx.lineWidth = width;
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    };

    // ═══════════════════════════════════════
    // RENDER ANNOTATIONS — Clean priority system
    // ═══════════════════════════════════════

    // Collect all position tool Y positions to avoid label overlap
    const ptAnns = annotations.filter(a => a.type === "point");
    const entryAnn = ptAnns.find(a => a.label?.toLowerCase().includes("entry"));
    const tpAnn = ptAnns.find(a => a.label?.toUpperCase() === "TP");
    const slAnn = ptAnns.find(a => a.label?.toUpperCase() === "SL");
    const positionYs = [entryAnn, tpAnn, slAnn].filter(Boolean).map(a => toY(a!.y!));
    const posToolActive = entryAnn && tpAnn && slAnn;
    const posToolLeft = bx + bw * 0.58;

    // Check if a Y position is near the position tool
    const nearPosTool = (y: number, margin: number = 25) => positionYs.some(py => Math.abs(y - py) < margin);

    annotations.forEach((a) => {
      ctx.globalAlpha = Math.min(p * 1.1, 0.88);
      const mc = mute(a.color);

      // ── ZONE / FVG — subtle fills, small left-edge badges ──
      if ((a.type === "zone" || a.type === "fvg") && a.y1 !== undefined && a.y2 !== undefined) {
        const zy1 = toY(a.y1), zy2 = toY(a.y2);
        const ztop = Math.min(zy1, zy2), zh = Math.abs(zy2 - zy1);
        // If position tool is active, only draw zone up to the tool area
        const drawW = posToolActive ? (posToolLeft - bx - 4) : bw * Math.min(p * 1.1, 1);
        const bc = mute(a.bc || a.color);

        // Soft gradient fill
        const grd = ctx.createLinearGradient(bx, ztop, bx + drawW, ztop);
        grd.addColorStop(0, rgba(bc, 0.06));
        grd.addColorStop(0.7, rgba(bc, a.type === "fvg" ? 0.03 : 0.04));
        grd.addColorStop(1, rgba(bc, 0.01));
        ctx.fillStyle = grd;
        ctx.fillRect(bx, ztop, drawW, zh);

        // Subtle top/bottom borders
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = rgba(bc, 0.2);
        ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(bx, ztop); ctx.lineTo(bx + drawW, ztop); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx, ztop + zh); ctx.lineTo(bx + drawW, ztop + zh); ctx.stroke();
        ctx.setLineDash([]);

        // Small subtle label — left edge only, reduced opacity
        if (p > 0.5 && a.label) {
          const shortLabel = a.label.replace("Zone", "").replace("zone", "").trim();
          ctx.globalAlpha = 0.7;
          const mc2 = a.bc || a.color;
          ctx.font = `600 ${fsS}px "JetBrains Mono", monospace`;
          const m = ctx.measureText(shortLabel);
          const px = 4, py = 2;
          const tw = m.width + px * 2, th = fsS + py * 2;
          const lx = bx + 4, ly = ztop + (zh - th) / 2;

          ctx.fillStyle = "rgba(10,11,16,0.8)";
          rr(lx, ly, tw, th, 3);
          ctx.fill();
          ctx.fillStyle = rgba(mc2, 1);
          ctx.textBaseline = "middle";
          ctx.textAlign = "left";
          ctx.fillText(shortLabel, lx + px, ly + th / 2);
          ctx.globalAlpha = Math.min(p * 1.1, 0.88);
        }
      }

      // ── LINE / LIQUIDITY — skip labels near position tool ──
      if ((a.type === "line" || a.type === "liquidity") && a.y !== undefined) {
        const ly = toY(a.y);
        // Don't draw line through position tool area
        const endX = posToolActive ? Math.min(posToolLeft - 4, bx + bw * Math.min(p * 1.1, 1)) : bx + bw * Math.min(p * 1.1, 1);
        const dash = a.type === "liquidity" || a.style === "dotted" ? [2, 4] : [6, 4];

        // Reduce opacity if near a position tool level
        if (nearPosTool(ly)) ctx.globalAlpha *= 0.35;
        drawLine(bx, ly, endX, ly, mc, a.type === "liquidity" ? lw * 0.5 : lw * 0.8, dash);

        // Only show label if NOT near position tool
        if (p > 0.35 && a.label && !nearPosTool(ly, 35)) {
          label(a.label, endX - 6, ly - 12, mc, "right");
        }
        ctx.globalAlpha = Math.min(p * 1.1, 0.88);
      }

      // ── TRENDLINE ──
      if (a.type === "trend" && a.x1 !== undefined && a.y1 !== undefined && a.x2 !== undefined && a.y2 !== undefined) {
        const tx1 = toX(a.x1), ty1 = toY(a.y1);
        const dx = (toX(a.x2) - tx1) * p, dy = (toY(a.y2) - ty1) * p;
        drawLine(tx1, ty1, tx1 + dx, ty1 + dy, mc, lw);
        if (p > 0.7 && a.label) label(a.label, tx1 + dx / 2, ty1 + dy / 2 - 12, mc, "left");
      }

      // ── FIBONACCI ──
      if (a.type === "fib" && a.y_0 !== undefined && a.y_100 !== undefined && p > 0.3) {
        const y0 = toY(a.y_0), y100 = toY(a.y_100);
        const range = y100 - y0;
        const fibW = bw * Math.min(p * 1.2, 1);
        ctx.globalAlpha = Math.min((p - 0.3) / 0.4, 1) * 0.5;

        FIB_LEVELS.forEach((level) => {
          const fy = y0 + range * level;
          if (fy < by || fy > by + bh) return;
          const fc = FIB_COLORS[level] || "#888";
          ctx.setLineDash([3, 5]);
          ctx.strokeStyle = rgba(fc, 0.45);
          ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.moveTo(bx, fy); ctx.lineTo(bx + fibW, fy); ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = `600 ${fsS}px monospace`;
          ctx.fillStyle = rgba(fc, 0.6);
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(`${(level * 100).toFixed(1)}%`, bx + 3, fy - 6);
        });

        // Golden pocket
        const gp1 = y0 + range * 0.5, gp2 = y0 + range * 0.618;
        ctx.fillStyle = rgba("#4183c4", 0.04);
        ctx.fillRect(bx, gp1, fibW, gp2 - gp1);
        ctx.globalAlpha = Math.min(p * 1.1, 0.88);
      }

      // ── PATTERN ──
      if (a.type === "pattern" && a.x !== undefined && a.y !== undefined && p > 0.5) {
        const px2 = toX(a.x), py = toY(a.y);
        ctx.globalAlpha = Math.min((p - 0.5) / 0.3, 1) * 0.85;
        const sz = w > 700 ? 5 : 4;
        ctx.beginPath();
        ctx.moveTo(px2, py - sz); ctx.lineTo(px2 + sz, py);
        ctx.lineTo(px2, py + sz); ctx.lineTo(px2 - sz, py);
        ctx.closePath();
        ctx.fillStyle = rgba(mc, 0.7);
        ctx.fill();
        if (a.label) badge(a.label, px2, py - sz, mc);
        ctx.globalAlpha = Math.min(p * 1.1, 0.88);
      }

      // ── BOS / CHoCH ──
      if ((a.type === "bos" || a.type === "choch") && a.x !== undefined && a.y !== undefined && p > 0.4) {
        const px2 = toX(a.x), py = toY(a.y);
        ctx.globalAlpha = Math.min((p - 0.4) / 0.3, 1) * 0.85;
        const lineLen = bw * 0.2;
        drawLine(px2 - lineLen / 2, py, px2 + lineLen / 2, py, mc, lw * 0.7, a.type === "bos" ? [5, 3] : [2, 3]);
        // Small dot
        ctx.beginPath();
        ctx.arc(px2, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = rgba(mc, 0.6);
        ctx.fill();
        if (a.label) badge(a.label, px2, py, mc);
        ctx.globalAlpha = Math.min(p * 1.1, 0.88);
      }
    });

    // ═══════════════════════════════════════
    // TRADINGVIEW-STYLE R:R POSITION TOOL
    // ═══════════════════════════════════════
    if (p > 0.5) {
      const points = annotations.filter(a => a.type === "point" && a.y !== undefined);
      const entry = points.find(a => a.label === "Entry");
      const tp = points.find(a => a.label === "TP");
      const sl = points.find(a => a.label === "SL");

      if (entry && tp && sl) {
        const eY = toY(entry.y!);
        const tY = toY(tp.y!);
        const sY = toY(sl.y!);
        const ap = Math.min((p - 0.5) / 0.4, 1);

        // Position tool dimensions — right portion of chart
        const boxLeft = bx + bw * 0.58;
        const boxRight = bx + bw - 4;
        const boxW = boxRight - boxLeft;

        ctx.globalAlpha = ap;

        // ── TP Zone (green) ──
        const tpTop = Math.min(eY, tY), tpH = Math.abs(eY - tY);
        const tpGrd = ctx.createLinearGradient(boxLeft, 0, boxRight, 0);
        tpGrd.addColorStop(0, "rgba(44,168,122,0.0)");
        tpGrd.addColorStop(0.15, "rgba(44,168,122,0.10)");
        tpGrd.addColorStop(1, "rgba(44,168,122,0.15)");
        ctx.fillStyle = tpGrd;
        ctx.fillRect(boxLeft, tpTop, boxW, tpH);
        // TP border
        ctx.strokeStyle = "rgba(44,168,122,0.35)";
        ctx.lineWidth = 0.8;
        ctx.setLineDash([]);
        ctx.strokeRect(boxLeft, tpTop, boxW, tpH);

        // ── SL Zone (red) ──
        const slTop = Math.min(eY, sY), slH = Math.abs(eY - sY);
        const slGrd = ctx.createLinearGradient(boxLeft, 0, boxRight, 0);
        slGrd.addColorStop(0, "rgba(199,84,101,0.0)");
        slGrd.addColorStop(0.15, "rgba(199,84,101,0.08)");
        slGrd.addColorStop(1, "rgba(199,84,101,0.13)");
        ctx.fillStyle = slGrd;
        ctx.fillRect(boxLeft, slTop, boxW, slH);
        // SL border
        ctx.strokeStyle = "rgba(199,84,101,0.3)";
        ctx.lineWidth = 0.8;
        ctx.strokeRect(boxLeft, slTop, boxW, slH);

        // ── Entry line (solid white) ──
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([]);
        ctx.moveTo(boxLeft, eY);
        ctx.lineTo(boxRight, eY);
        ctx.stroke();

        // ── TP line (dashed green) ──
        ctx.beginPath();
        ctx.strokeStyle = "rgba(44,168,122,0.6)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.moveTo(boxLeft, tY);
        ctx.lineTo(boxRight, tY);
        ctx.stroke();

        // ── SL line (dashed red) ──
        ctx.beginPath();
        ctx.strokeStyle = "rgba(199,84,101,0.5)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.moveTo(boxLeft, sY);
        ctx.lineTo(boxRight, sY);
        ctx.stroke();
        ctx.setLineDash([]);

        // ── Price tags — anti-overlap ──
        const tagW = w > 700 ? 56 : w > 400 ? 48 : 40;
        const tagH = w > 700 ? 19 : w > 400 ? 17 : 15;
        const tagFs = w > 700 ? 9 : w > 400 ? 8 : 7;
        const tagX = boxRight + 2;
        const minGap = tagH + 3; // Minimum spacing between tags

        // Sort points by Y position and apply anti-overlap
        const rawTags = [
          { label: "TP", y: tY, color: "#2ca87a", bg: "rgba(44,168,122,0.85)" },
          { label: "Entry", y: eY, color: "#ffffff", bg: "rgba(255,255,255,0.8)" },
          { label: "SL", y: sY, color: "#c75465", bg: "rgba(199,84,101,0.8)" },
        ].sort((a, b) => a.y - b.y);

        // Anti-overlap: push tags apart
        const tags = rawTags.map(t => ({ ...t, drawY: t.y }));
        for (let i = 1; i < tags.length; i++) {
          if (tags[i].drawY - tags[i - 1].drawY < minGap) {
            tags[i].drawY = tags[i - 1].drawY + minGap;
          }
        }
        // Push back up if overflowed
        if (tags[tags.length - 1].drawY > by + bh - tagH) {
          tags[tags.length - 1].drawY = by + bh - tagH;
          for (let i = tags.length - 2; i >= 0; i--) {
            if (tags[i + 1].drawY - tags[i].drawY < minGap) {
              tags[i].drawY = tags[i + 1].drawY - minGap;
            }
          }
        }

        tags.forEach((t) => {
          ctx.globalAlpha = ap * 0.95;
          const ty = t.drawY - tagH / 2;

          // Connector line from actual price to tag
          if (Math.abs(t.drawY - t.y) > 2) {
            ctx.beginPath();
            ctx.strokeStyle = rgba(t.color, 0.2);
            ctx.lineWidth = 0.5;
            ctx.setLineDash([2, 2]);
            ctx.moveTo(tagX, t.y);
            ctx.lineTo(tagX, t.drawY);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Tag body — rounded with arrow
          ctx.beginPath();
          const r = 3;
          ctx.moveTo(tagX + r, ty);
          ctx.lineTo(tagX + tagW - r, ty);
          ctx.arcTo(tagX + tagW, ty, tagX + tagW, ty + r, r);
          ctx.lineTo(tagX + tagW, ty + tagH - r);
          ctx.arcTo(tagX + tagW, ty + tagH, tagX + tagW - r, ty + tagH, r);
          ctx.lineTo(tagX + r, ty + tagH);
          ctx.arcTo(tagX, ty + tagH, tagX, ty + tagH - r, r);
          ctx.lineTo(tagX, t.drawY + 2);
          ctx.lineTo(tagX - 4, t.drawY);
          ctx.lineTo(tagX, t.drawY - 2);
          ctx.lineTo(tagX, ty + r);
          ctx.arcTo(tagX, ty, tagX + r, ty, r);
          ctx.closePath();

          ctx.fillStyle = t.bg;
          ctx.fill();

          // Text
          ctx.font = `700 ${tagFs}px "JetBrains Mono", monospace`;
          ctx.fillStyle = t.label === "Entry" ? "#0a0b0f" : "#fff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(t.label, tagX + tagW / 2, t.drawY);
        });

        // ── R:R ratio text inside zones ──
        if (p > 0.75) {
          ctx.globalAlpha = ap * 0.55;
          ctx.font = `600 ${w > 700 ? 10 : 8}px "JetBrains Mono", monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const reward = Math.abs(eY - tY);
          const risk = Math.abs(eY - sY);
          const rr2 = risk > 0 ? (reward / risk).toFixed(1) : "—";

          // Reward label in TP zone
          ctx.fillStyle = "rgba(44,168,122,0.6)";
          ctx.fillText(`${rr2}R`, boxLeft + boxW / 2, (eY + tY) / 2);

          // Risk label in SL zone
          ctx.fillStyle = "rgba(199,84,101,0.5)";
          ctx.fillText("1R", boxLeft + boxW / 2, (eY + sY) / 2);
        }

        ctx.globalAlpha = ap;
      } else if (points.length > 0) {
        // Fallback for partial points
        points.forEach((a) => {
          if (a.y === undefined) return;
          const py = Math.max(by + 8, Math.min(by + bh - 8, toY(a.y)));
          const ap = Math.min((p - 0.5) / 0.5, 1);
          ctx.globalAlpha = ap * 0.3;
          drawLine(bx, py, bx + bw - 4, py, mute(a.color), 0.6, [3, 4]);
          ctx.globalAlpha = ap * 0.9;
          if (a.label) label(a.label, bx + bw - 6, py - 12, mute(a.color), "right");
        });
      }
    }

    // ── ARROW ──
    annotations.forEach((a) => {
      if (a.type === "arrow" && a.y1 !== undefined && a.y2 !== undefined && p > 0.6) {
        const mc = mute(a.color);
        const arrowX = bx + bw * 0.55;
        const sy = toY(a.y1), ey = toY(a.y2);
        const ap = Math.min((p - 0.6) / 0.4, 1);
        const cy = sy + (ey - sy) * ap;

        ctx.globalAlpha = ap * 0.6;
        // Shaft
        ctx.beginPath();
        ctx.strokeStyle = rgba(mc, 0.5);
        ctx.lineWidth = 1.5;
        ctx.moveTo(arrowX, sy);
        ctx.lineTo(arrowX, cy);
        ctx.stroke();
        // Head
        const hs = w > 700 ? 6 : 5;
        const dir = ey < sy ? -1 : 1;
        ctx.beginPath();
        ctx.fillStyle = rgba(mc, 0.6);
        ctx.moveTo(arrowX, cy);
        ctx.lineTo(arrowX - hs, cy - dir * hs * 1.4);
        ctx.lineTo(arrowX + hs, cy - dir * hs * 1.4);
        ctx.closePath();
        ctx.fill();
      }
    });

    ctx.globalAlpha = 1;

    // ── Watermark ──
    if (p > 0.8) {
      ctx.globalAlpha = 0.35;
      ctx.font = `700 ${w > 700 ? 10 : 9}px "JetBrains Mono", monospace`;
      ctx.fillStyle = "#2ca87a";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText("FXSynapse AI", bx + bw - 6, by + bh - 6);
      ctx.globalAlpha = 1;
    }
  }, [canvasRef, dims, prog, annotations, showAnn, dataUrl, chartBounds]);
}
