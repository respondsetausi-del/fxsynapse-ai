# FXSynapse AI — v2 Conversion Update Deployment Guide

## 🔥 What Changed

### Auth Fix (No more email confirmation)
- Signup now auto-logs users in — no email verification required
- Added confirm password field
- **CRITICAL: You MUST disable email confirmation in Supabase:**
  1. Go to Supabase Dashboard → Authentication → Providers → Email
  2. Toggle OFF "Confirm email"
  3. Save changes

### Phase 1: Restrict & Gate
- Free tier: **1 scan/day** (was 3)
- Trade setups (Entry/TP/SL/R:R) **locked behind Pro** — free users see upgrade CTA
- Scan history: **3 scans for free**, unlimited for paid
- Upgrade banner in dashboard for free users
- Enhanced paywall with countdown + launch promo

### Phase 2: Monetize  
- Plans: Free (R0) / Pro (R99/mo) / Premium (R249/mo)
- Pro: 15 scans/day, full analysis, full history
- Premium: Unlimited, priority, download
- New R15 credit pack (10 credits) added
- Pricing page with feature comparison table
- Launch promo: 50% off with code LAUNCH50

### Phase 3: Engage & Convert
- Admin can gift Pro trials (3/7/14/30 days) to any free user
- Sidebar shows hidden scan count with upgrade CTA
- Paywall shows "Next free scan resets at midnight"
- Dashboard shows remaining scans count

### Phase 4: Grow
- Social proof on landing page (40+ traders, 500+ charts, <10s)
- Launch promo banner on pricing page
- Landing page updated with new tier messaging
- Feature comparison table (Free vs Pro vs Premium)

## 📋 Deployment Steps

### 1. Supabase Settings
```
Authentication → Providers → Email → Turn OFF "Confirm email"
```

### 2. Run SQL Migration
Copy contents of `migration-v2-pricing.sql` into Supabase SQL Editor and run it.

### 3. Deploy Code
```bash
git add -A
git commit -m "v2: conversion engine — restrict free, feature-gate, pricing, admin trials"
git push
```

### 4. Verify
- [ ] New signup goes straight to dashboard (no email)
- [ ] Free user sees 1 scan/day
- [ ] Free user sees locked trade setup after scan
- [ ] Free user sees only 3 scans in history
- [ ] Paywall triggers after 1 scan
- [ ] Pricing page shows correct tiers
- [ ] Admin can gift Pro trials
- [ ] Upgrade banner shows on dashboard

## 💡 Next Steps
- Set up email/WhatsApp to personally reach out to most active free users
- Create TikTok content showing Free vs Pro side-by-side
- Monitor conversion rate in admin dashboard
- Consider time-limited promo code system in Yoco
