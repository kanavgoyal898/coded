import { NextRequest } from "next/server";

export const COOKIE_NAME = "coded_session";

export function getSessionUserFromRequest(
    req: NextRequest
): { userId: number; role: string } | null {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return null;

    try {
        const payload = token.split(".")[0];
        const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
        return JSON.parse(json);
    } catch {
        return null;
    }
}
