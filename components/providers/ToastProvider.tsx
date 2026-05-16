"use client";

import { ToastProvider, ToastViewport } from "@/components/ui/toast";
import { useToast } from "@/hooks/useToast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, ...props }) {
        return (
          <div key={id} {...(props as object)}>
            <div>
              {title && <div>{title}</div>}
              {description && <div>{description}</div>}
            </div>
          </div>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
