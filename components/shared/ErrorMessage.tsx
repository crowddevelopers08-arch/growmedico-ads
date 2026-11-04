import { AlertCircle } from "lucide-react";

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">Something went wrong</p>
        <p className="mt-0.5 opacity-90">{message}</p>
      </div>
    </div>
  );
}
