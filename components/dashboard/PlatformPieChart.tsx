"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency, getPlatformColor, getPlatformLabel } from "@/lib/utils";

interface PlatformPieChartProps {
  data: { platform: string; spend: number }[];
  title?: string;
  description?: string;
}

interface TooltipPayload {
  name: string;
  value: number;
}

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border bg-popover p-2.5 text-sm shadow-lg">
      <p className="font-medium">{getPlatformLabel(payload[0].name)}</p>
      <p className="tabular-nums text-muted-foreground">{formatCurrency(payload[0].value)}</p>
    </div>
  );
};

export function PlatformPieChart({
  data,
  title = "Spend by Platform",
  description = "Total spend breakdown",
}: PlatformPieChartProps) {
  const totalSpend = data.reduce((sum, d) => sum + d.spend, 0);

  const chartData = data
    .filter((d) => d.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .map((d) => ({
      name: d.platform,
      value: d.spend,
      color: getPlatformColor(d.platform),
      share: totalSpend > 0 ? (d.spend / totalSpend) * 100 : 0,
    }));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex h-[280px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground">
            <PieChartIcon className="h-8 w-8 opacity-40" />
            <p className="text-sm font-medium">No spend data yet</p>
          </div>
        ) : (
          <>
            <div className="relative">
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={86}
                    paddingAngle={chartData.length > 1 ? 3 : 0}
                    dataKey="value"
                    stroke="none"
                  >
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Total in the donut hole */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted-foreground">Total</span>
                <span className="text-xl font-semibold tabular-nums">
                  {formatCurrency(totalSpend, "INR", true)}
                </span>
              </div>
            </div>

            <ul className="mt-4 space-y-3">
              {chartData.map((entry) => (
                <li key={entry.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
                      {getPlatformLabel(entry.name)}
                    </span>
                    <span className="tabular-nums">
                      <span className="font-medium">{formatCurrency(entry.value, "INR", true)}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{entry.share.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${entry.share}%`, backgroundColor: entry.color }} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
