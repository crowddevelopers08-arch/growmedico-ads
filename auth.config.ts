/**
 * Edge-compatible NextAuth config (no Node.js-only packages).
 * Used by middleware.ts which runs in the Edge Runtime.
 * The full config (with bcryptjs + Prisma) lives in lib/auth.ts.
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  providers: [],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLoginPage = nextUrl.pathname.startsWith("/login");
      const isApiRoute = nextUrl.pathname.startsWith("/api");

      // Always allow API routes
      if (isApiRoute) return true;

      if (!isLoggedIn && !isOnLoginPage) return false; // redirect to /login
      if (isLoggedIn && isOnLoginPage) {
        return Response.redirect(new URL("/dashboard", nextUrl.origin));
      }
      return true;
    },
  },
};
