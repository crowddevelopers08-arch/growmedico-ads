"use client";

import { useState, useCallback } from "react";

interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
  duration?: number;
}

interface UseToastReturn {
  toasts: Toast[];
  toast: (toast: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

export function useToast(): UseToastReturn {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (newToast: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).slice(2);
      const duration = newToast.duration ?? 4000;

      setToasts((prev) => [...prev, { ...newToast, id }]);

      setTimeout(() => {
        dismiss(id);
      }, duration);
    },
    [dismiss]
  );

  return { toasts, toast, dismiss };
}
