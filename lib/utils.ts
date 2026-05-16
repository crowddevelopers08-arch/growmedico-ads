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
    META: "#1877F2",
  };
  return colors[platform] ?? "#6B7280";
}

// ── Status helpers ──────────────────────────────────────────
export function getCampaignStatusColor(status: string): string {
  const colors: Record<string, string> = {
    ACTIVE: "text-green-600 bg-green-50 dark:bg-green-900/20",
    PAUSED: "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20",
    ENDED: "text-gray-600 bg-gray-50 dark:bg-gray-900/20",
    DELETED: "text-red-600 bg-red-50 dark:bg-red-900/20",
  };
  return colors[status] ?? "text-gray-600 bg-gray-50";
}

export function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    INFO: "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/20",
    WARNING: "text-yellow-600 bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20",
    CRITICAL: "text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20",
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
