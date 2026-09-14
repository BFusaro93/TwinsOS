// Twilio Trust Hub's fixed business_industry enum for the
// customer_profile_business_information EndUser type — confirmed against
// Twilio's own A2P 10DLC "Gather the Required Business Information" docs,
// 2026-09-11. Free text (e.g. "Landscaping") is rejected outright since
// there's no such category; orgs pick the closest fit from this list.
export const TWILIO_BUSINESS_INDUSTRIES = [
  "AGRICULTURE",
  "AUTOMOTIVE",
  "BANKING",
  "CONSTRUCTION",
  "CONSUMER",
  "EDUCATION",
  "ELECTRONICS",
  "ENGINEERING",
  "ENERGY",
  "FAST_MOVING_CONSUMER_GOODS",
  "FINANCIAL",
  "FINTECH",
  "FOOD_AND_BEVERAGE",
  "GOVERNMENT",
  "HEALTHCARE",
  "HOSPITALITY",
  "INSURANCE",
  "JEWELRY",
  "LEGAL",
  "MANUFACTURING",
  "MEDIA",
  "NOT_FOR_PROFIT",
  "OIL_AND_GAS",
  "ONLINE",
  "PROFESSIONAL_SERVICES",
  "RAW_MATERIALS",
  "REAL_ESTATE",
  "RELIGION",
  "RETAIL",
  "TECHNOLOGY",
  "TELECOMMUNICATIONS",
  "TRANSPORTATION",
  "TRAVEL",
] as const;

export type TwilioBusinessIndustry = (typeof TWILIO_BUSINESS_INDUSTRIES)[number];

/** "FAST_MOVING_CONSUMER_GOODS" -> "Fast Moving Consumer Goods", for the Select's display label. */
export function industryLabel(value: string): string {
  return value
    .split("_")
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(" ");
}
