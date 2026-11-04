import { cn, getCampaignStatusColor, getCampaignStatusLabel } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        getCampaignStatusColor(status),
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {getCampaignStatusLabel(status)}
    </span>
  );
}
