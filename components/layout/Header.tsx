"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ChevronRight, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SyncButton } from "@/components/shared/SyncButton";
import { ThemeToggle } from "./ThemeToggle";
import { AlertBell } from "./AlertBell";
import { MobileSidebar } from "./Sidebar";

interface HeaderProps {
  title?: string;
  /** Parent section shown as a breadcrumb link before the title */
  parent?: { label: string; href: string };
}

export function Header({ title = "Overview", parent }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 md:px-8">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 md:hidden"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="!size-5" />
        </Button>

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
          {parent && (
            <>
              <Link href={parent.href} className="hidden text-muted-foreground transition-colors hover:text-foreground sm:inline">
                {parent.label}
              </Link>
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground/60 sm:block" />
            </>
          )}
          <span className="truncate font-medium">{title}</span>
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <SyncButton size="sm" label="Sync all" className="hidden sm:inline-flex" />
          <ThemeToggle />
          <AlertBell />
        </div>
      </header>

      <MobileSidebar open={menuOpen} onClose={closeMenu} />
    </>
  );
}
