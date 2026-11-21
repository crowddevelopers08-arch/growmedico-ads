import { differenceInCalendarDays, format, parseISO, startOfWeek, subDays, subWeeks } from "date-fns";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Daily ad stats are kept for 90 days (DAILY_STATS_DAYS in lib/metaAds). */
export const MAX_RANGE_DAYS = 91;

export interface AuditParams {
  from: string;
  to: string;
  weekly: boolean;
  clientIds?: string[];
}

/** Default window: the last N complete Monday–Sunday weeks. */
export function defaultRange(weeks = 1, now = new Date()) {
  const lastMonday = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), 1);
  return {
    from: format(subWeeks(lastMonday, weeks - 1), "yyyy-MM-dd"),
    to: format(subDays(startOfWeek(now, { weekStartsOn: 1 }), 1), "yyyy-MM-dd"),
  };
}

export function parseAuditParams(input: {
  from?: string | null;
  to?: string | null;
  weekly?: string | boolean | null;
  clientIds?: string | string[] | null;
}): AuditParams | { error: string } {
  const def = defaultRange();
  const from = input.from || def.from;
  const to = input.to || def.to;
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return { error: "from/to must be YYYY-MM-DD" };
  const days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
  if (days < 1) return { error: "'from' must be on or before 'to'" };
  if (days > MAX_RANGE_DAYS) return { error: `Pick at most ${MAX_RANGE_DAYS} days — daily ad stats are only kept for 90 days` };

  const ids = Array.isArray(input.clientIds)
    ? input.clientIds
    : (input.clientIds ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  return {
    from,
    to,
    weekly: input.weekly === undefined || input.weekly === null ? true : input.weekly === true || input.weekly === "true",
    clientIds: ids.length ? ids : undefined,
  };
}
