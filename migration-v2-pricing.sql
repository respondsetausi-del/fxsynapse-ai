-- FXSynapse AI — Pricing Migration v2
-- Run this in Supabase SQL Editor to update existing plans
-- This changes free from 3 scans/day to 1, and updates feature lists

-- Update Free tier: 1 scan/day (was 3)
UPDATE plans 
SET daily_scans = 1, 
    features = '["1 scan per day", "Basic trend & S/R only", "Last 3 scans in history"]'
WHERE id = 'free';

-- Update Pro tier: 15 scans/day (was 50), R99/mo (unchanged)
UPDATE plans 
SET daily_scans = 15, 
    price_cents = 9900,
    features = '["15 scans per day", "Full annotations & trade setups", "Entry/TP/SL/R:R unlocked", "Confluence grading", "Full scan history", "Credit top-ups"]'
WHERE id = 'pro';

-- Update Premium tier: unlimited (unchanged), R249/mo (unchanged)
UPDATE plans 
SET price_cents = 24900,
    features = '["Unlimited scans", "Full annotations & trade setups", "Entry/TP/SL/R:R unlocked", "Confluence grading", "Full scan history", "Priority processing", "Chart download", "Priority support"]'
WHERE id = 'premium';

-- Verify
SELECT id, name, price_cents, daily_scans, features FROM plans ORDER BY price_cents;
