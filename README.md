# FXSynapse AI — Chart Intelligence Engine

> Upload a forex chart screenshot → Get instant AI-annotated analysis with key levels, trade setups, and market structure detection.

## Tech Stack

- **Frontend:** Next.js 15 (App Router) + Tailwind CSS
- **AI Engine:** Claude Sonnet (Vision API)
- **Canvas:** HTML5 Canvas for real-time chart annotations
- **Deploy:** Vercel-ready

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env.local
# Edit .env.local and add your Anthropic API key

# 3. Run dev server
npm run dev
```

Open http://localhost:3000

## Environment Variables

| Variable | Description |
|----------|-------------|
| ANTHROPIC_API_KEY | Your Anthropic API key from console.anthropic.com |

## How It Works

1. Upload — Drag and drop or click to upload a chart screenshot (PNG/JPG)
2. Analyze — Claude Vision API reads the chart visually and returns structured analysis
3. Annotate — Support/resistance lines, supply/demand zones, trendlines, entry/TP/SL markers drawn on canvas
4. View — Split view, full chart, or full analysis modes. Click chart for fullscreen.

## Deploy to Vercel

Add ANTHROPIC_API_KEY in your Vercel project environment variables then deploy.

## Project Structure

```
src/
  app/
    api/analyze/route.ts    — Claude Vision API endpoint
    globals.css             — Global styles and animations
    layout.tsx              — Root layout and metadata
    page.tsx                — Main app component
  components/
    AnnotatedChart.tsx      — Canvas chart with annotations
    FullscreenModal.tsx     — Fullscreen chart viewer
  lib/
    types.ts                — TypeScript types
    prompts.ts              — Claude system/user prompts
    useAnnotatedCanvas.ts   — Shared canvas drawing hook
```
