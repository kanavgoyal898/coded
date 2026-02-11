import { NextRequest } from "next/server";

export const COOKIE_NAME = "coded_session";

export function getSessionUserFromRequest(
    req: NextRequest
): { userId: number; role: string } | null {
    if (!req || !req.cookies) {
        return null;
    }

    const token = req.cookies.get(COOKIE_NAME)?.value;

    if (!token || typeof token !== "string" || token.trim().length === 0) {
        return null;
    }

    try {
        const parts = token.split(".");

        if (parts.length !== 2) {
            return null;
        }

        const payload = parts[0];

        if (!payload || payload.length === 0) {
            return null;
        }

        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const json = atob(normalized);

        if (!json || json.trim().length === 0) {
            return null;
        }

        const parsed = JSON.parse(json);

        if (!parsed || typeof parsed !== "object") {
            return null;
        }

        if (!parsed.userId || !parsed.role) {
            return null;
        }

        if (typeof parsed.userId !== "number" || parsed.userId <= 0) {
            return null;
        }

        if (typeof parsed.role !== "string" || parsed.role.trim().length === 0) {
            return null;
        }

        const validRoles = ["admin", "setter", "solver"];
        if (!validRoles.includes(parsed.role)) {
            return null;
        }

        return {
            userId: parsed.userId,
            role: parsed.role
        };
    } catch {
        return null;
    }
}
