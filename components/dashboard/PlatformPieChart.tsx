"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency, getPlatformLabel } from "@/lib/utils";

interface PlatformPieChartProps {
  data: { platform: string; spend: number }[];
  title?: string;
  description?: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  GOOGLE: "#4285F4",
  META: "#1877F2",
};

const DEFAULT_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa"];

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
    <div className="rounded-lg border bg-background p-2.5 shadow-lg text-sm">
      <p className="font-medium">{getPlatformLabel(payload[0].name)}</p>
      <p className="text-muted-foreground">{formatCurrency(payload[0].value)}</p>
    </div>
  );
};

export function PlatformPieChart({
  data,
  title = "Spend by Platform",
  description = "Total spend breakdown",
}: PlatformPieChartProps) {
  const totalSpend = data.reduce((sum, d) => sum + d.spend, 0);

  const chartData = data.map((d) => ({
    name: d.platform,
    value: d.spend,
    label: getPlatformLabel(d.platform),
    color: PLATFORM_COLORS[d.platform] ?? DEFAULT_COLORS[0],
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description} — Total: {formatCurrency(totalSpend)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
            No spend data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    strokeWidth={0}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value) => getPlatformLabel(value)}
                wrapperStyle={{ fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
