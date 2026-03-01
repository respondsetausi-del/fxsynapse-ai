/**
 * Currency & Localization Config
 *
 * Fixed rates updated periodically. Actual payment always in ZAR via Yoco.
 * Showing local equivalents reduces cognitive load for international users.
 */

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  rateFromZAR: number; // 1 ZAR = X local currency
  flag: string;
  paymentMethods: string[];
}

// Approximate rates — update monthly. Actual charge is always in ZAR.
export const CURRENCIES: Record<string, CurrencyInfo> = {
  ZA: {
    code: "ZAR",
    symbol: "R",
    name: "South African Rand",
    rateFromZAR: 1,
    flag: "🇿🇦",
    paymentMethods: ["VISA", "Mastercard", "Yoco"],
  },
  NG: {
    code: "NGN",
    symbol: "₦",
    name: "Nigerian Naira",
    rateFromZAR: 82, // ~1 ZAR = 82 NGN
    flag: "🇳🇬",
    paymentMethods: ["VISA", "Mastercard"],
  },
  KE: {
    code: "KES",
    symbol: "KSh",
    name: "Kenyan Shilling",
    rateFromZAR: 7.1, // ~1 ZAR = 7.1 KES
    flag: "🇰🇪",
    paymentMethods: ["VISA", "Mastercard"],
  },
  GH: {
    code: "GHS",
    symbol: "GH₵",
    name: "Ghanaian Cedi",
    rateFromZAR: 0.85, // ~1 ZAR = 0.85 GHS
    flag: "🇬🇭",
    paymentMethods: ["VISA", "Mastercard"],
  },
  GB: {
    code: "GBP",
    symbol: "£",
    name: "British Pound",
    rateFromZAR: 0.044, // ~1 ZAR = 0.044 GBP
    flag: "🇬🇧",
    paymentMethods: ["VISA", "Mastercard"],
  },
  US: {
    code: "USD",
    symbol: "$",
    name: "US Dollar",
    rateFromZAR: 0.055, // ~1 ZAR = 0.055 USD
    flag: "🇺🇸",
    paymentMethods: ["VISA", "Mastercard"],
  },
  BW: {
    code: "BWP",
    symbol: "P",
    name: "Botswana Pula",
    rateFromZAR: 0.74,
    flag: "🇧🇼",
    paymentMethods: ["VISA", "Mastercard"],
  },
  TZ: {
    code: "TZS",
    symbol: "TSh",
    name: "Tanzanian Shilling",
    rateFromZAR: 142,
    flag: "🇹🇿",
    paymentMethods: ["VISA", "Mastercard"],
  },
  UG: {
    code: "UGX",
    symbol: "USh",
    name: "Ugandan Shilling",
    rateFromZAR: 204,
    flag: "🇺🇬",
    paymentMethods: ["VISA", "Mastercard"],
  },
  ZW: {
    code: "ZiG",
    symbol: "ZiG",
    name: "Zimbabwe Gold",
    rateFromZAR: 1.5,
    flag: "🇿🇼",
    paymentMethods: ["VISA", "Mastercard"],
  },
};

// Default for unknown countries
export const DEFAULT_CURRENCY = CURRENCIES.ZA;

export function getCurrencyForCountry(countryCode: string): CurrencyInfo {
  return CURRENCIES[countryCode?.toUpperCase()] || DEFAULT_CURRENCY;
}

/**
 * Convert ZAR amount to local currency display string.
 * Returns null if country is ZA (no conversion needed).
 */
export function convertPrice(zarAmount: number, currency: CurrencyInfo): string | null {
  if (currency.code === "ZAR") return null;
  const converted = zarAmount * currency.rateFromZAR;
  // Smart rounding: big numbers → no decimals, small → 2 decimals
  if (converted >= 100) {
    return `${currency.symbol}${Math.round(converted).toLocaleString()}`;
  } else if (converted >= 1) {
    return `${currency.symbol}${converted.toFixed(0)}`;
  } else {
    return `${currency.symbol}${converted.toFixed(2)}`;
  }
}
