import { NextResponse } from "next/server";

// Major and popular forex pairs with metadata
const FOREX_PAIRS = [
  // Majors
  { symbol: "OANDA:EUR_USD", display: "EUR/USD", base: "EUR", quote: "USD", category: "Major", popular: true },
  { symbol: "OANDA:GBP_USD", display: "GBP/USD", base: "GBP", quote: "USD", category: "Major", popular: true },
  { symbol: "OANDA:USD_JPY", display: "USD/JPY", base: "USD", quote: "JPY", category: "Major", popular: true },
  { symbol: "OANDA:USD_CHF", display: "USD/CHF", base: "USD", quote: "CHF", category: "Major", popular: true },
  { symbol: "OANDA:AUD_USD", display: "AUD/USD", base: "AUD", quote: "USD", category: "Major", popular: true },
  { symbol: "OANDA:USD_CAD", display: "USD/CAD", base: "USD", quote: "CAD", category: "Major", popular: true },
  { symbol: "OANDA:NZD_USD", display: "NZD/USD", base: "NZD", quote: "USD", category: "Major", popular: true },
  // Crosses
  { symbol: "OANDA:EUR_GBP", display: "EUR/GBP", base: "EUR", quote: "GBP", category: "Cross", popular: true },
  { symbol: "OANDA:EUR_JPY", display: "EUR/JPY", base: "EUR", quote: "JPY", category: "Cross", popular: true },
  { symbol: "OANDA:GBP_JPY", display: "GBP/JPY", base: "GBP", quote: "JPY", category: "Cross", popular: true },
  { symbol: "OANDA:EUR_AUD", display: "EUR/AUD", base: "EUR", quote: "AUD", category: "Cross", popular: false },
  { symbol: "OANDA:EUR_CAD", display: "EUR/CAD", base: "EUR", quote: "CAD", category: "Cross", popular: false },
  { symbol: "OANDA:EUR_CHF", display: "EUR/CHF", base: "EUR", quote: "CHF", category: "Cross", popular: false },
  { symbol: "OANDA:GBP_AUD", display: "GBP/AUD", base: "GBP", quote: "AUD", category: "Cross", popular: false },
  { symbol: "OANDA:GBP_CAD", display: "GBP/CAD", base: "GBP", quote: "CAD", category: "Cross", popular: false },
  { symbol: "OANDA:GBP_CHF", display: "GBP/CHF", base: "GBP", quote: "CHF", category: "Cross", popular: false },
  { symbol: "OANDA:AUD_JPY", display: "AUD/JPY", base: "AUD", quote: "JPY", category: "Cross", popular: false },
  { symbol: "OANDA:CAD_JPY", display: "CAD/JPY", base: "CAD", quote: "JPY", category: "Cross", popular: false },
  { symbol: "OANDA:NZD_JPY", display: "NZD/JPY", base: "NZD", quote: "JPY", category: "Cross", popular: false },
  { symbol: "OANDA:AUD_CAD", display: "AUD/CAD", base: "AUD", quote: "CAD", category: "Cross", popular: false },
  { symbol: "OANDA:AUD_NZD", display: "AUD/NZD", base: "AUD", quote: "NZD", category: "Cross", popular: false },
  { symbol: "OANDA:NZD_CAD", display: "NZD/CAD", base: "NZD", quote: "CAD", category: "Cross", popular: false },
  // Exotics
  { symbol: "OANDA:USD_ZAR", display: "USD/ZAR", base: "USD", quote: "ZAR", category: "Exotic", popular: false },
  { symbol: "OANDA:USD_TRY", display: "USD/TRY", base: "USD", quote: "TRY", category: "Exotic", popular: false },
  { symbol: "OANDA:USD_MXN", display: "USD/MXN", base: "USD", quote: "MXN", category: "Exotic", popular: false },
];

export async function GET() {
  return NextResponse.json({ symbols: FOREX_PAIRS });
}
