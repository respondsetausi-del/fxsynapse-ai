import { NextRequest, NextResponse } from "next/server";
import { getCurrencyForCountry } from "@/lib/currency";

/**
 * Geo Detection — /api/geo
 *
 * Reads Vercel's automatic geo headers to detect user's country.
 * Returns country code + currency info for price localization.
 * Falls back to ZA if headers not available (local dev, non-Vercel).
 */
export async function GET(req: NextRequest) {
  // Vercel auto-injects these headers
  const country = req.headers.get("x-vercel-ip-country") || "ZA";
  const city = req.headers.get("x-vercel-ip-city") || null;
  const region = req.headers.get("x-vercel-ip-country-region") || null;

  const currency = getCurrencyForCountry(country);

  return NextResponse.json({
    country,
    city,
    region,
    currency: {
      code: currency.code,
      symbol: currency.symbol,
      name: currency.name,
      rate: currency.rateFromZAR,
      flag: currency.flag,
      paymentMethods: currency.paymentMethods,
    },
  }, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400", // Cache 1h client, 24h CDN
    },
  });
}
