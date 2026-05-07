import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { verifySessionToken } from "@/lib/auth/jwt";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

const PUBLIC_PATHS = new Set(["/login"]);

const PUBLIC_API = new Set(["/api/auth/login", "/api/auth/logout"]);

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API.has(pathname);
}

/** Ochrona tras — JWT w httpOnly cookie; weryfikacja bez DB (Edge). */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  const session = token ? await verifySessionToken(token.trim()) : null;

  if (pathname === "/login") {
    if (session) {
      const nextParam = request.nextUrl.searchParams.get("next");
      if (nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")) {
        return NextResponse.redirect(new URL(nextParam, request.nextUrl.origin));
      }
      return NextResponse.redirect(new URL("/", request.nextUrl.origin));
    }
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    if (isPublicApi(pathname)) {
      return NextResponse.next();
    }
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (!session) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const returnTo = `${pathname}${request.nextUrl.search}`;
    loginUrl.searchParams.set(
      "next",
      returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/",
    );
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
