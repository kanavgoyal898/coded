import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth.edge";

const PUBLIC_PATHS = ["/login", "/signup"];
const AUTH_PATHS = ["/problems", "/submissions"];
const SETTER_PATHS = ["/set", "/activity"];

export function proxy(req: NextRequest) {
    const { pathname } = req.nextUrl;

    if (
        pathname.startsWith("/api/") ||
        pathname.startsWith("/_next/") ||
        pathname.startsWith("/favicon")
    ) {
        return NextResponse.next();
    }

    let session: ReturnType<typeof getSessionUserFromRequest> = null;
    try {
        session = getSessionUserFromRequest(req);
    } catch {
        session = null;
    }

    if (pathname === "/") {
        return NextResponse.redirect(
            new URL(session ? "/submissions" : "/login", req.url)
        );
    }

    if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
        if (session) {
            return NextResponse.redirect(new URL("/submissions", req.url));
        }
        return NextResponse.next();
    }

    if (AUTH_PATHS.some((p) => pathname.startsWith(p))) {
        if (!session) {
            const loginUrl = new URL("/login", req.url);
            loginUrl.searchParams.set("from", pathname);
            return NextResponse.redirect(loginUrl);
        }
        return NextResponse.next();
    }

    if (SETTER_PATHS.some((p) => pathname.startsWith(p))) {
        if (!session) {
            const loginUrl = new URL("/login", req.url);
            loginUrl.searchParams.set("from", pathname);
            return NextResponse.redirect(loginUrl);
        }
        if (session.role !== "setter" && session.role !== "admin") {
            return NextResponse.redirect(new URL("/submissions", req.url));
        }
        return NextResponse.next();
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
