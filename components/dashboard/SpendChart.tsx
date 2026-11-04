"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import type { ChartDataPoint } from "@/types";

interface SpendChartProps {
  data: ChartDataPoint[];
  title?: string;
  description?: string;
  showConversions?: boolean;
}

const SPEND_COLOR = "#3b82f6";
const CONVERSIONS_COLOR = "#10b981";

// Grid lines and tick labels follow the theme tokens instead of recharts' fixed greys
const chartThemeClasses =
  "[&_.recharts-cartesian-grid_line]:stroke-border [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground";

interface TooltipPayload {
  color: string;
  name: string;
  value: number;
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="min-w-[170px] rounded-lg border bg-popover p-3 text-sm shadow-lg">
      <p className="mb-2 font-medium text-foreground">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="capitalize text-muted-foreground">{entry.name}</span>
            </div>
            <span className="font-medium tabular-nums text-foreground">
              {entry.name === "spend" ? formatCurrency(entry.value) : entry.value.toLocaleString("en-IN")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

function LegendItem({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </div>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function SpendChart({
  data,
  title = "Spend Over Time",
  description = "Daily spend performance",
  showConversions = true,
}: SpendChartProps) {
  const formattedData = data.map((d) => ({
    ...d,
    date: formatDate(d.date, "MMM d"),
  }));

  const periodSpend = data.reduce((s, d) => s + d.spend, 0);
  const periodConversions = data.reduce((s, d) => s + d.conversions, 0);

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {data.length > 0 && (
          <div className="flex gap-6">
            <LegendItem color={SPEND_COLOR} label="Spend" value={formatCurrency(periodSpend, "INR", true)} />
            {showConversions && (
              <LegendItem color={CONVERSIONS_COLOR} label="Conversions" value={formatNumber(periodConversions)} />
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[280px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground">
            <LineChartIcon className="h-8 w-8 opacity-40" />
            <p className="text-sm font-medium">No spend data yet</p>
            <p className="text-xs">Run a sync to see daily trends</p>
          </div>
        ) : (
          <div className={chartThemeClasses}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={formattedData} margin={{ top: 8, right: 0, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SPEND_COLOR} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={SPEND_COLOR} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorConversions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CONVERSIONS_COLOR} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={CONVERSIONS_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                  tickMargin={8}
                />
                {/* Spend (₹) on the left; conversions get their own scale so they don't flatten */}
                <YAxis
                  yAxisId="spend"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(v: number) => formatCurrency(v, "INR", true)}
                />
                {showConversions && (
                  <YAxis
                    yAxisId="conversions"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    allowDecimals={false}
                  />
                )}
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: "currentColor", strokeOpacity: 0.15 }} />
                <Area
                  yAxisId="spend"
                  type="monotone"
                  dataKey="spend"
                  stroke={SPEND_COLOR}
                  strokeWidth={2}
                  fill="url(#colorSpend)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                {showConversions && (
                  <Area
                    yAxisId="conversions"
                    type="monotone"
                    dataKey="conversions"
                    stroke={CONVERSIONS_COLOR}
                    strokeWidth={2}
                    fill="url(#colorConversions)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
