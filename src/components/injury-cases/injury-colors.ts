export const INJURY_STATUS_COLORS: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-slate-100 text-slate-600",
};

export const INJURY_SEVERITY_COLORS: Record<string, string> = {
  first_aid: "bg-slate-100 text-slate-700",
  medical_treatment: "bg-orange-100 text-orange-800",
  lost_time: "bg-red-100 text-red-800",
  fatality: "bg-slate-800 text-white",
};
