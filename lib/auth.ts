import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const SECRET =
    process.env.AUTH_SECRET || "coded-judge-secret-key-change-in-production";
const COOKIE_NAME = "coded_session";

export function hashPassword(password: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
    try {
        const [salt, hash] = stored.split(":");
        const hashBuffer = Buffer.from(hash, "hex");
        const derivedBuffer = scryptSync(password, salt, 64);
        return timingSafeEqual(hashBuffer, derivedBuffer);
    } catch {
        return false;
    }
}

export function createToken(userId: number, role: string): string {
    const payload = Buffer.from(
        JSON.stringify({ userId, role, iat: Date.now() })
    ).toString("base64url");
    const sig = createHmac("sha256", SECRET)
        .update(payload)
        .digest("base64url");
    return `${payload}.${sig}`;
}

export function verifyToken(
    token: string
): { userId: number; role: string } | null {
    try {
        const [payload, sig] = token.split(".");
        const expected = createHmac("sha256", SECRET)
            .update(payload)
            .digest("base64url");
        if (sig !== expected) return null;
        return JSON.parse(Buffer.from(payload, "base64url").toString());
    } catch {
        return null;
    }
}

export async function getSessionUser(): Promise<{
    userId: number;
    role: string;
} | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyToken(token);
}

export function getSessionUserFromRequest(
    req: NextRequest
): { userId: number; role: string } | null {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyToken(token);
}

export { COOKIE_NAME };
