import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Use edge-compatible config (no bcryptjs/Prisma) for middleware
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
