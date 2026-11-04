import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Grow Medico logo. The wordmark is white in logo.png, so light mode uses
 * logo-light.png (same artwork with a dark wordmark). Size it with a height
 * class; the width follows the artwork's aspect ratio.
 */
export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  const shared = cn("w-auto", className);

  return (
    <>
      <Image src="/logo-light.png" alt="Grow Medico" width={256} height={82} priority={priority} className={cn(shared, "dark:hidden")} />
      <Image src="/logo.png" alt="Grow Medico" width={256} height={82} priority={priority} className={cn(shared, "hidden dark:block")} />
    </>
  );
}
