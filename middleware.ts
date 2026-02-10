import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth.edge";

const PUBLIC_PATHS = ["/login", "/signup"];
const AUTH_PATHS = ["/problems", "/submissions", "/set"];

export function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    if (
        pathname.startsWith("/api/") ||
        pathname.startsWith("/_next/") ||
        pathname.startsWith("/favicon")
    ) {
        return NextResponse.next();
    }

    const session = getSessionUserFromRequest(req);

    if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
        if (session) {
            return NextResponse.redirect(new URL("/submissions", req.url));
        }
        return NextResponse.next();
    }

    if (pathname === "/") {
        return NextResponse.redirect(
            new URL(session ? "/submissions" : "/login", req.url)
        );
    }

    if (AUTH_PATHS.some((p) => pathname.startsWith(p))) {
        if (!session) {
            const loginUrl = new URL("/login", req.url);
            loginUrl.searchParams.set("from", pathname);
            return NextResponse.redirect(loginUrl);
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
