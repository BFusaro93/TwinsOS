// Pure job-costing calculator. Lives outside the dashboard component so the
// rate math (and the LLR definition in particular) has exactly one home.

export interface Inputs {
  fieldEmpWage: number;
  fieldHrsReg: number;
  fieldHrsOT: number;
  numFieldEmp: number;
  ficaPct: number;
  workCompPct: number;
  suiPct: number;
  fuiPct: number;
  pfmlPct: number;
  /** Unemployment taxes only apply to each employee's first $X of wages
   *  (e.g. MA SUI $15,000, FUTA $7,000). These are the taxable wages per
   *  employee within the scenario's period; 0 = no cap, rate applies to all
   *  wages. For a part-year scenario enter the base still available in that
   *  period, or total taxable wages ÷ headcount when turnover means more
   *  distinct employees than the modeled headcount. */
  suiWageBase: number;
  fuiWageBase: number;
  ohPayroll: number;
  otherOH: number;
  liabilities: number;
  nonBillablePct: number;
  profitPct: number;
}

/** A blank form: every number zero. What a new org sees until it creates and
 *  defaults a scenario. compute() of this is all zeros (no divide-by-zero). */
export const BLANK_INPUTS: Inputs = {
  fieldEmpWage: 0,
  fieldHrsReg: 0,
  fieldHrsOT: 0,
  numFieldEmp: 0,
  ficaPct: 0,
  workCompPct: 0,
  suiPct: 0,
  fuiPct: 0,
  pfmlPct: 0,
  suiWageBase: 0,
  fuiWageBase: 0,
  ohPayroll: 0,
  otherOH: 0,
  liabilities: 0,
  nonBillablePct: 0,
  profitPct: 0,
};

const INPUT_KEYS = Object.keys(BLANK_INPUTS) as (keyof Inputs)[];

/** Reads a stored scenario's `inputs` JSON back into a complete Inputs.
 *  Missing or non-numeric keys fall back to 0 so a partial or hand-edited row
 *  can never put NaN into the rate math. */
export function parseInputs(raw: unknown): Inputs {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...BLANK_INPUTS };
  for (const k of INPUT_KEYS) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export function inputsEqual(a: Inputs, b: Inputs): boolean {
  return INPUT_KEYS.every((k) => a[k] === b[k]);
}

// ── Core calculation engine ───────────────────────────────────────────────────
// Formula:
//   1. Blended wage  = OT_wage × (OT_hrs/Reg_hrs) + Reg_wage × (1 − OT_hrs/Reg_hrs)
//   2. Labor/hr      = blended_wage × (1 + burden%)
//   3. OH total      = ohPayroll + otherOH + liabilities + ohPayroll × burden%
//   4. OH/hr         = OH total ÷ (reg_hrs + OT_hrs)
//   5. Break-even    = (OH/hr + Labor/hr) ÷ (1 − nonBillable%)  ← true cost coverage
//   6. Bid rate      = break-even ÷ (1 − profit%)               ← true profit margin

export interface Computed {
  totalRegHours: number;
  totalOTHours: number;
  totalHours: number;
  billableHours: number;
  totalDirectLabor: number;
  burdenPct: number;
  /** SUI / FUI as a share of ALL wages after applying the wage-base caps
   *  (equals the entered rate when no cap is set). */
  suiEffectivePct: number;
  fuiEffectivePct: number;
  burdenAmount: number;
  totalLaborCost: number;
  totalOverhead: number;
  laborPerHour: number;
  ohPayrollPerHour: number;
  otherOHPerHour: number;
  liabilitiesPerHour: number;
  ohPerHour: number;
  baseBreakEven: number;
  /** Loaded Labor Rate: burdened labor plus the non-billable uplift, with NO
   *  fixed-overhead recovery (laborPerHour / (1 - nonBillable%)). This is the
   *  org-level `burdenedLaborRateCents` shown on projects as LLR. */
  loadedLaborRate: number;
  nonBillablePerHour: number;
  breakEven: number;
  bidRate: number;
  profitPerHour: number;
}

export function compute(i: Inputs): Computed {
  const totalRegHours = i.numFieldEmp * i.fieldHrsReg;
  const totalOTHours = i.numFieldEmp * i.fieldHrsOT;
  const totalHours = totalRegHours + totalOTHours;
  const billableHours = totalHours * (1 - i.nonBillablePct / 100); // for display only

  // Blended wage: weight OT and regular rates by OT_hrs/Reg_hrs (Excel B11/B12 formula)
  const otPct  = totalRegHours > 0 ? totalOTHours / totalRegHours : 0;
  const regPct = 1 - otPct;
  const blendedWage = i.fieldEmpWage * 1.5 * otPct + i.fieldEmpWage * regPct;

  // Unemployment taxes stop at a per-employee wage base, so as a share of all
  // wages they are rate × min(1, base ÷ wages per employee). Wages per
  // employee come from the field crew; the same effective rates are applied
  // to OH payroll (a close approximation — it has few, high-paid people).
  const wagesPerEmployee = i.numFieldEmp > 0 ? blendedWage * (i.fieldHrsReg + i.fieldHrsOT) : 0;
  const capShare = (base: number) =>
    base > 0 && wagesPerEmployee > 0 ? Math.min(1, base / wagesPerEmployee) : 1;
  const suiEffectivePct = i.suiPct * capShare(i.suiWageBase);
  const fuiEffectivePct = i.fuiPct * capShare(i.fuiWageBase);

  const burdenPct = i.ficaPct + i.workCompPct + suiEffectivePct + fuiEffectivePct + i.pfmlPct;
  const laborPerHour = blendedWage * (1 + burdenPct / 100);

  // Total direct labor (for display summary rows)
  const totalDirectLabor = totalHours * blendedWage;
  const burdenAmount = totalDirectLabor * (burdenPct / 100);
  const totalLaborCost = totalDirectLabor + burdenAmount;

  // Overhead: includes burden on admin payroll (Excel H8 = H5 × burden%)
  const ohPayrollBurden = i.ohPayroll * (burdenPct / 100);
  const totalOverhead = i.ohPayroll + i.otherOH + i.liabilities + ohPayrollBurden;

  // OH/hr spreads over regular hours only — overhead is fixed and doesn't scale
  // with OT. Dividing by all hours would dilute OH as OT increases, which would
  // incorrectly lower the bid rate when workers do more overtime.
  const ohPerHour         = totalRegHours > 0 ? totalOverhead / totalRegHours : 0;
  const ohPayrollPerHour  = totalRegHours > 0 ? (i.ohPayroll + ohPayrollBurden) / totalRegHours : 0;
  const otherOHPerHour    = totalRegHours > 0 ? i.otherOH / totalRegHours : 0;
  const liabilitiesPerHour = totalRegHours > 0 ? i.liabilities / totalRegHours : 0;

  // Break-even: divide by (1 − nonBillable%) so billable hours fully cover all costs
  const baseBreakEven = laborPerHour + ohPerHour;
  const breakEven = i.nonBillablePct < 100 ? baseBreakEven / (1 - i.nonBillablePct / 100) : 0;
  const nonBillablePerHour = breakEven - baseBreakEven;
  const loadedLaborRate = i.nonBillablePct < 100 ? laborPerHour / (1 - i.nonBillablePct / 100) : 0;

  // Bid rate: divide by (1 − profit%) so profit% is true margin (profit ÷ revenue)
  const bidRate = i.profitPct < 100 ? breakEven / (1 - i.profitPct / 100) : 0;
  const profitPerHour = bidRate - breakEven;

  return {
    totalRegHours, totalOTHours, totalHours, billableHours,
    totalDirectLabor, burdenPct, suiEffectivePct, fuiEffectivePct, burdenAmount, totalLaborCost,
    totalOverhead, laborPerHour,
    ohPayrollPerHour, otherOHPerHour, liabilitiesPerHour,
    ohPerHour, baseBreakEven, loadedLaborRate, nonBillablePerHour, breakEven, bidRate, profitPerHour,
  };
}