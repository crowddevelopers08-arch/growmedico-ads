import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string;
  subtitle?: React.ReactNode;
  icon: LucideIcon;
  trend?: {
    value: number;
    label?: string;
  };
  variant?: "default" | "success" | "warning" | "danger" | "info";
  /** Makes the whole card a link to a detail page */
  href?: string;
  className?: string;
}

export const statIconStyles = {
  default: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "bg-red-500/10 text-red-600 dark:text-red-400",
  info: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = "default",
  href,
  className,
}: StatsCardProps) {
  const isPositiveTrend = trend && trend.value >= 0;

  const body = (
    <Card
      className={cn(
        "group h-full p-5 transition-all",
        href && "hover:border-primary/40 hover:shadow-md",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", statIconStyles[variant])}>
            <Icon className="h-4 w-4" />
          </div>
          <p className="truncate text-sm font-medium text-muted-foreground">{title}</p>
        </div>
        {href && (
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
        )}
      </div>

      <p className="mt-4 truncate text-[28px] font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </p>

      {(subtitle || trend) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {trend && (
            <span
              className={cn(
                "font-medium",
                isPositiveTrend ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              )}
            >
              {isPositiveTrend ? "+" : ""}{trend.value}%
            </span>
          )}
          {subtitle && <span className="text-muted-foreground">{subtitle}</span>}
        </div>
      )}
    </Card>
  );

  return href ? (
    <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : body;
}
