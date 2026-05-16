import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    label?: string;
  };
  variant?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}

const variantStyles = {
  default: {
    icon: "bg-primary/10 text-primary",
    trend: "text-primary",
  },
  success: {
    icon: "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400",
    trend: "text-green-600 dark:text-green-400",
  },
  warning: {
    icon: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400",
    trend: "text-yellow-600 dark:text-yellow-400",
  },
  danger: {
    icon: "bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400",
    trend: "text-red-600 dark:text-red-400",
  },
  info: {
    icon: "bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
    trend: "text-blue-600 dark:text-blue-400",
  },
};

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = "default",
  className,
}: StatsCardProps) {
  const styles = variantStyles[variant];
  const isPositiveTrend = trend && trend.value >= 0;

  return (
    <Card className={cn("relative overflow-hidden transition-all hover:shadow-md", className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
            <p className="text-2xl font-bold tracking-tight truncate">{value}</p>
            {(subtitle || trend) && (
              <div className="flex items-center gap-1 flex-wrap">
                {trend && (
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isPositiveTrend ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                    )}
                  >
                    {isPositiveTrend ? "+" : ""}{trend.value}%
                  </span>
                )}
                {subtitle && (
                  <span className="text-xs text-muted-foreground">{subtitle}</span>
                )}
              </div>
            )}
          </div>
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ml-4", styles.icon)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
      {/* Decorative gradient */}
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
    </Card>
  );
}
