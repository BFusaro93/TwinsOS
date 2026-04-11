/**
 * parse-financial-pdf.ts
 *
 * Client-side utility that extracts financial figures from a QuickBooks-style
 * P&L PDF using pdfjs-dist. Returns a partial FinancialPeriodData object
 * (in cents) that can be used to pre-fill the data entry form.
 */

import type { FinancialPeriodData, OperatingExpenses } from "@/lib/hooks/use-financial-periods";

// ── Dollar string → cents ────────────────────────────────────────────────────

function parseDollars(s: string): number {
  // Handle negative values in parentheses: (1,234.56)
  const neg = s.trim().startsWith("(") || s.trim().startsWith("-");
  const cleaned = s.replace(/[(),$\s]/g, "").replace(/-/g, "");
  const dollars = parseFloat(cleaned);
  if (isNaN(dollars)) return 0;
  return Math.round((neg ? -dollars : dollars) * 100);
}

// ── Regex helpers ─────────────────────────────────────────────────────────────

/**
 * Looks for a line like "Net Income   206,529.23" and extracts the dollar amount.
 * Searches case-insensitively; takes the LAST matching dollar figure on the line.
 */
function extractLine(text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  if (!match) return 0;
  // grab the last dollar-amount-looking token in the match
  const nums = match[0].match(/[-$()\d,]+\.?\d*/g);
  if (!nums) return 0;
  // Filter to ones that look like dollar amounts (contain a digit)
  const dollarLike = nums.filter((n) => /\d/.test(n));
  if (!dollarLike.length) return 0;
  return parseDollars(dollarLike[dollarLike.length - 1]);
}

// ── Extract text from PDF ─────────────────────────────────────────────────────

async function extractPdfText(file: File): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");

  // Use CDN worker to avoid bundling complexity in Next.js
  if (!GlobalWorkerOptions.workerSrc) {
    const { version } = await import("pdfjs-dist");
    GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => ("str" in item ? (item.str as string) : ""))
      .join(" ");
    pages.push(pageText);
  }

  return pages.join("\n");
}

// ── Main parser ───────────────────────────────────────────────────────────────

export interface ParseResult {
  data: Partial<FinancialPeriodData>;
  periodMonth?: string; // "YYYY-MM-DD" if detected from report header
  warnings: string[];
}

export async function parseFinancialPdf(file: File): Promise<ParseResult> {
  const text = await extractPdfText(file);
  const warnings: string[] = [];

  // ── Detect report period ─────────────────────────────────────────────────
  let periodMonth: string | undefined;
  // Matches "January 2026", "Feb 2026", "01/01/2026 - 01/31/2026", etc.
  const monthYearMatch = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i
  );
  if (monthYearMatch) {
    const monthNames: Record<string, string> = {
      january: "01", february: "02", march: "03", april: "04",
      may: "05", june: "06", july: "07", august: "08",
      september: "09", october: "10", november: "11", december: "12",
    };
    const mm = monthNames[monthYearMatch[1].toLowerCase()];
    const yyyy = monthYearMatch[2];
    if (mm && yyyy) periodMonth = `${yyyy}-${mm}-01`;
  }

  // ── Revenue ──────────────────────────────────────────────────────────────
  const revenue = extractLine(text, /Total\s+(?:Income|Revenue|Sales)[^\n\r]{0,80}/i)
    || extractLine(text, /(?:^|\n)\s*(?:Income|Revenue|Sales)\s+[\d,]+\.?\d*/im);

  // ── COGS ─────────────────────────────────────────────────────────────────
  const cogs = extractLine(text, /Total\s+Cost\s+of\s+(?:Goods\s+Sold|Revenue|Sales)[^\n\r]{0,80}/i)
    || extractLine(text, /Total\s+COGS[^\n\r]{0,80}/i);

  // ── Gross Profit ─────────────────────────────────────────────────────────
  const grossFromPdf = extractLine(text, /Gross\s+Profit[^\n\r]{0,80}/i);
  const gross_profit = grossFromPdf || (revenue - cogs);

  // ── Operating Expenses ───────────────────────────────────────────────────
  const payroll = extractLine(text, /Total\s+Payroll[^\n\r]{0,80}/i)
    || extractLine(text, /Payroll\s+Expenses?[^\n\r]{0,80}/i);

  const equipment = extractLine(text, /Total\s+Equipment[^\n\r]{0,80}/i)
    || extractLine(text, /Equipment\s+(?:Expenses?|Costs?)[^\n\r]{0,80}/i);

  const fuel = extractLine(text, /(?:Total\s+)?(?:Gas\s*(?:&|and)\s*Fuel|Fuel\s*Expenses?)[^\n\r]{0,80}/i);

  const insurance = extractLine(text, /Total\s+Insurance[^\n\r]{0,80}/i)
    || extractLine(text, /Insurance\s+Expenses?[^\n\r]{0,80}/i);

  const marketing = extractLine(text, /Total\s+(?:Marketing|Advertising)[^\n\r]{0,80}/i)
    || extractLine(text, /(?:Marketing|Advertising)\s+(?:Expenses?)?[^\n\r]{0,80}/i);

  const rent = extractLine(text, /Total\s+Rent[^\n\r]{0,80}/i)
    || extractLine(text, /Rent\s*(?:Expenses?|&\s*Lease)?[^\n\r]{0,80}/i);

  const utilities = extractLine(text, /Total\s+Utilities[^\n\r]{0,80}/i)
    || extractLine(text, /Utilities?\s+Expenses?[^\n\r]{0,80}/i);

  const operating_expenses: Partial<OperatingExpenses> = {
    payroll, equipment, fuel, insurance, marketing, rent, utilities,
    other: 0,
  };

  // ── NOI ──────────────────────────────────────────────────────────────────
  const net_operating_income =
    extractLine(text, /Net\s+Operating\s+Income[^\n\r]{0,80}/i)
    || extractLine(text, /(?:Total\s+)?Operating\s+(?:Income|Profit)[^\n\r]{0,80}/i);

  // ── Below-the-line items ─────────────────────────────────────────────────
  const depreciation = extractLine(text, /Depreciation[^\n\r]{0,80}/i);
  const interest = extractLine(text, /Interest\s+(?:Expense|Paid)[^\n\r]{0,80}/i);
  const taxes = extractLine(text, /(?:Income\s+)?Tax(?:es)?[^\n\r]{0,80}/i);
  const guaranteed_payments = extractLine(text, /Guaranteed\s+Payments?[^\n\r]{0,80}/i);

  // ── Net Income ───────────────────────────────────────────────────────────
  const net_income = extractLine(text, /Net\s+Income[^\n\r]{0,80}/i);

  // ── Validation warnings ───────────────────────────────────────────────────
  if (!revenue) warnings.push("Could not detect total revenue — please enter manually.");
  if (!net_income) warnings.push("Could not detect net income — please enter manually.");
  if (!net_operating_income) warnings.push("Could not detect Net Operating Income — please enter manually.");

  // Compute derived ebitda
  const ebitda = net_income + interest + depreciation + taxes + guaranteed_payments;

  // ── Infer "other" opex ────────────────────────────────────────────────────
  // If we have NOI and gross_profit, back-calculate total opex then "other"
  const knownOpex = payroll + equipment + fuel + insurance + marketing + rent + utilities;
  const totalOpexFromNOI = gross_profit - net_operating_income;
  const inferredOther = totalOpexFromNOI > 0 && knownOpex < totalOpexFromNOI
    ? totalOpexFromNOI - knownOpex
    : 0;
  operating_expenses.other = inferredOther;

  const data: Partial<FinancialPeriodData> = {
    revenue,
    cogs,
    gross_profit,
    operating_expenses: operating_expenses as OperatingExpenses,
    net_operating_income,
    interest,
    taxes,
    guaranteed_payments,
    depreciation,
    ebitda,
    net_income,
    cash_operating: 0,
    cash_investing: 0,
    cash_financing: 0,
    notes: `Imported from PDF: ${file.name}`,
  };

  return { data, periodMonth, warnings };
}
