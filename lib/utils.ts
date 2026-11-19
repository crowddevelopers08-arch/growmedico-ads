import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";

// ── Tailwind class merging ──────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Currency formatting ─────────────────────────────────────
export function formatCurrency(
  amount: number,
  currency = "INR",
  compact = false
): string {
  if (compact && Math.abs(amount) >= 1000) {
    const formatter = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    });
    return formatter.format(amount);
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ── Number formatting ───────────────────────────────────────
export function formatNumber(num: number, compact = false): string {
  if (compact && Math.abs(num) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(num);
  }
  return new Intl.NumberFormat("en-US").format(num);
}

// ── Percentage formatting ───────────────────────────────────
export function formatPercent(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

// ── Date formatting ─────────────────────────────────────────
export function formatDate(date: Date | string, pattern = "MMM d, yyyy"): string {
  return format(new Date(date), pattern);
}

export function formatRelativeTime(date: Date | string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

// ── Budget usage calculation ────────────────────────────────
export function calcBudgetUsage(spend: number, budget: number): number {
  if (budget <= 0) return 0;
  return Math.min(Math.round((spend / budget) * 100 * 10) / 10, 100);
}

// ── Budget alert threshold ──────────────────────────────────
export function getBudgetAlertThreshold(): number {
  return Number(process.env.BUDGET_ALERT_THRESHOLD ?? 80);
}

// ── Platform labels ─────────────────────────────────────────
export function getPlatformLabel(platform: string): string {
  const labels: Record<string, string> = {
    GOOGLE: "Google Ads",
    META: "Meta Ads",
  };
  return labels[platform] ?? platform;
}

export function getPlatformColor(platform: string): string {
  const colors: Record<string, string> = {
    GOOGLE: "#4285F4",
    // Violet rather than Meta's brand blue so the two platforms stay distinguishable in charts
    META: "#8b5cf6",
  };
  return colors[platform] ?? "#6B7280";
}

// ── Client secrets ──────────────────────────────────────────
/** Blank out the TeleCRM token before a client leaves the server; `hasTelecrmToken` says whether one is set. */
export function withoutSecrets<T extends { telecrmToken?: string | null }>(client: T) {
  return { ...client, telecrmToken: null, hasTelecrmToken: !!client.telecrmToken };
}

// ── Lead source labels ──────────────────────────────────────
export function getLeadSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    WHATSAPP: "WhatsApp",
    META_FORM: "Meta Lead Form",
    WEBSITE: "Website",
    MANUAL: "Manual / Call",
  };
  return labels[source] ?? source;
}

export function getLeadSourceColor(source: string): string {
  const colors: Record<string, string> = {
    WHATSAPP: "#25D366",
    META_FORM: "#1877F2",
    WEBSITE: "#F97316",
    MANUAL: "#8B5CF6",
  };
  return colors[source] ?? "#6B7280";
}

// ── Status helpers ──────────────────────────────────────────
export function getCampaignStatusColor(status: string): string {
  const colors: Record<string, string> = {
    ACTIVE: "text-emerald-700 bg-emerald-50 ring-emerald-600/20 dark:text-emerald-400 dark:bg-emerald-500/10 dark:ring-emerald-400/20",
    PAUSED: "text-amber-700 bg-amber-50 ring-amber-600/20 dark:text-amber-400 dark:bg-amber-500/10 dark:ring-amber-400/20",
    ENDED: "text-slate-600 bg-slate-100 ring-slate-500/20 dark:text-slate-400 dark:bg-slate-500/10 dark:ring-slate-400/20",
    DELETED: "text-red-700 bg-red-50 ring-red-600/20 dark:text-red-400 dark:bg-red-500/10 dark:ring-red-400/20",
  };
  return colors[status] ?? colors.ENDED;
}

export function getCampaignStatusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    INFO: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-500/10 dark:border-blue-500/20",
    WARNING: "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20",
    CRITICAL: "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/20",
  };
  return colors[severity] ?? "text-gray-600 bg-gray-50";
}

// ── Micros conversion (Google Ads uses micros) ──────────────
export function microsToAmount(micros: string | number): number {
  return Number(micros) / 1_000_000;
}

// ── Truncate text ───────────────────────────────────────────
export function truncate(text: string, maxLength = 40): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

// ── Safe JSON parse ─────────────────────────────────────────
export function safeJsonParse<T>(json: unknown, fallback: T): T {
  try {
    if (typeof json === "string") return JSON.parse(json) as T;
    if (json !== null && typeof json === "object") return json as T;
    return fallback;
  } catch {
    return fallback;
  }
}

// ── API error handler ───────────────────────────────────────
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "An unexpected error occurred";
}
