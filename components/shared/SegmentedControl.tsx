import { cn } from "@/lib/utils";

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: React.ReactNode }[];
  ariaLabel: string;
  className?: string;
}

/** Pill-style tab group for switching between a few mutually exclusive filters. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("inline-flex rounded-lg border bg-card p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === o.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
