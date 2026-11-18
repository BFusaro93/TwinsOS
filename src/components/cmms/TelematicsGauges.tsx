import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type GaugeTone = "ok" | "warn" | "bad" | "idle";

const TONE_STROKE: Record<GaugeTone, string> = {
  ok: "stroke-emerald-500",
  warn: "stroke-amber-500",
  bad: "stroke-red-500",
  idle: "stroke-slate-300 dark:stroke-neutral-600",
};

const TONE_TEXT: Record<GaugeTone, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
  idle: "text-slate-400 dark:text-neutral-500",
};

const SIZE = 120;
const STROKE = 9;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const SWEEP = 0.75; // 270° gauge, open at the bottom

interface RingGaugeProps {
  label: string;
  /** Text inside the ring, e.g. "54%" or "12.5". */
  value: string | null;
  unit?: string;
  /** 0–100 fill. Omit for a full ring (status gauges like ignition). */
  percent?: number | null;
  tone: GaugeTone;
  /** Tooltip, e.g. when Samsara measured this value. */
  title?: string;
  /** Small icon at the bottom of the ring (fuel pump, battery, ...). */
  icon?: LucideIcon;
  /** Labels at the arc's two ends, left then right: ["E", "F"], ["L", "H"], ["C", "H"]. */
  endLabels?: [string, string];
}

/** A circular gauge. `value === null` renders the "not reported" state. */
export function RingGauge({ label, value, unit, percent, tone, title, icon: Icon, endLabels }: RingGaugeProps) {
  const missing = value === null;
  const effectiveTone: GaugeTone = missing ? "idle" : tone;
  const full = percent === undefined;
  const fill = full ? 1 : Math.min(1, Math.max(0, (percent ?? 0) / 100));

  return (
    <div className="flex flex-col items-center gap-1" title={title}>
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          {full ? (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              strokeWidth={STROKE}
              className={TONE_STROKE[effectiveTone]}
            />
          ) : (
            <g transform={`rotate(135 ${SIZE / 2} ${SIZE / 2})`}>
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${C * SWEEP} ${C}`}
                className="stroke-slate-200 dark:stroke-neutral-700"
              />
              {!missing && fill > 0 && (
                <circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  fill="none"
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${C * SWEEP * fill} ${C}`}
                  className={TONE_STROKE[effectiveTone]}
                />
              )}
            </g>
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-2xl font-semibold leading-none tabular-nums", missing ? TONE_TEXT.idle : "text-slate-900 dark:text-neutral-100")}>
            {missing ? "—" : value}
          </span>
          {unit && !missing && (
            <span className="mt-1 text-xs text-slate-500 dark:text-neutral-400">{unit}</span>
          )}
        </div>
        {/* Bottom of the ring: the arc is open here, so the icon sits between its two ends. */}
        {Icon && (
          <Icon
            aria-hidden="true"
            className="absolute bottom-[8px] left-1/2 h-5 w-5 -translate-x-1/2 text-slate-500 dark:text-neutral-400"
          />
        )}
        {endLabels && (
          <>
            <span className="absolute bottom-[8px] left-[17px] text-[10px] font-medium leading-none text-slate-400 dark:text-neutral-500">
              {endLabels[0]}
            </span>
            <span className="absolute bottom-[8px] right-[17px] text-[10px] font-medium leading-none text-slate-400 dark:text-neutral-500">
              {endLabels[1]}
            </span>
          </>
        )}
      </div>
      <span className="text-sm font-medium text-slate-700 dark:text-neutral-300">{label}</span>
      {missing && <span className="text-xs text-slate-400 dark:text-neutral-500">Not reported</span>}
    </div>
  );
}

export interface TireReading {
  /** Display value, e.g. "63". null = not reported. */
  value: string | null;
  tone: GaugeTone;
}

interface TruckTiresProps {
  frontLeft: TireReading;
  frontRight: TireReading;
  backLeft: TireReading;
  backRight: TireReading;
}

/** Top-down truck with a pressure readout at each wheel (psi). */
export function TruckTires({ frontLeft, frontRight, backLeft, backRight }: TruckTiresProps) {
  const reading = (t: TireReading, x: number, y: number, anchor: "end" | "start") => (
    <g>
      <text
        x={x}
        y={y}
        textAnchor={anchor}
        className={cn(
          "text-[22px] font-semibold tabular-nums",
          t.value === null
            ? "fill-slate-300 dark:fill-neutral-600"
            : t.tone === "warn"
              ? "fill-amber-600 dark:fill-amber-400"
              : t.tone === "bad"
                ? "fill-red-600 dark:fill-red-400"
                : "fill-slate-900 dark:fill-neutral-100",
        )}
      >
        {t.value ?? "—"}
      </text>
      <text x={x} y={y + 15} textAnchor={anchor} className="fill-slate-400 text-[11px] dark:fill-neutral-500">
        PSI
      </text>
    </g>
  );

  return (
    <svg viewBox="0 0 300 330" className="mx-auto h-auto w-full max-w-[300px]" role="img" aria-label="Tire pressure by wheel">
      {/* Tires */}
      {[
        [96, 40],
        [192, 40],
        [96, 232],
        [192, 232],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={12} height={58} rx={4} className="fill-slate-700 dark:fill-neutral-500" />
      ))}
      {/* Body: hood + cab + bed */}
      <rect x={104} y={14} width={92} height={300} rx={22} className="fill-slate-200 stroke-slate-300 dark:fill-neutral-700 dark:stroke-neutral-600" strokeWidth={1.5} />
      <rect x={112} y={26} width={76} height={74} rx={12} className="fill-slate-100 dark:fill-neutral-600" />
      <rect x={114} y={108} width={72} height={34} rx={6} className="fill-slate-400/70 dark:fill-neutral-900" />
      <rect x={116} y={148} width={68} height={22} rx={5} className="fill-slate-300 dark:fill-neutral-800" />
      <rect x={114} y={186} width={72} height={116} rx={8} className="fill-slate-100 stroke-slate-300 dark:fill-neutral-600 dark:stroke-neutral-500" strokeWidth={1.5} />
      {reading(frontLeft, 84, 62, "end")}
      {reading(frontRight, 216, 62, "start")}
      {reading(backLeft, 84, 254, "end")}
      {reading(backRight, 216, 254, "start")}
    </svg>
  );
}
