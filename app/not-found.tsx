import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Zap, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center p-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary mb-6">
        <Zap className="h-7 w-7 text-primary-foreground" />
      </div>
      <h1 className="text-6xl font-bold mb-2">404</h1>
      <p className="text-xl font-semibold mb-2">Page Not Found</p>
      <p className="text-muted-foreground mb-8 max-w-sm">
        The page you are looking for doesn&apos;t exist or has been moved.
      </p>
      <Link href="/dashboard">
        <Button className="gap-2">
          <Home className="h-4 w-4" />
          Back to Dashboard
        </Button>
      </Link>
    </div>
  );
}
