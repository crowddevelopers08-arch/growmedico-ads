import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Noun for the count line, e.g. "campaigns" */
  itemLabel?: string;
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  itemLabel = "results",
}: PaginationProps) {
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground tabular-nums">{first}–{last}</span> of{" "}
        <span className="font-medium text-foreground tabular-nums">{total}</span> {itemLabel}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            <ChevronLeft /> Previous
          </Button>
          <span className="px-2 text-sm text-muted-foreground tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
          >
            Next <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}
