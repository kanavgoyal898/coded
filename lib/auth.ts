import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const SECRET = process.env.AUTH_SECRET || "coded-production";
const COOKIE_NAME = "coded_session";

const MIN_PASSWORD_LENGTH = 1;
const MAX_PASSWORD_LENGTH = 1024;
const SALT_LENGTH = 16;
const HASH_LENGTH = 64;
const VALID_ROLES = ["admin", "setter", "solver"];

export function hashPassword(password: string): string {
    if (!password || typeof password !== "string") {
        throw new Error("Password must be a non-empty string");
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} character long`);
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
        throw new Error(`Password must not exceed ${MAX_PASSWORD_LENGTH} characters`);
    }

    try {
        const salt = randomBytes(SALT_LENGTH).toString("hex");
        const hash = scryptSync(password, salt, HASH_LENGTH).toString("hex");
        return `${salt}:${hash}`;
    } catch (error) {
        throw new Error("Failed to hash password");
    }
}

export function verifyPassword(password: string, stored: string): boolean {
    if (!password || typeof password !== "string") {
        return false;
    }

    if (!stored || typeof stored !== "string") {
        return false;
    }

    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
        return false;
    }

    try {
        const parts = stored.split(":");

        if (parts.length !== 2) {
            return false;
        }

        const [salt, hash] = parts;

        if (!salt || !hash) {
            return false;
        }

        if (salt.length !== SALT_LENGTH * 2) {
            return false;
        }

        if (hash.length !== HASH_LENGTH * 2) {
            return false;
        }

        const hashBuffer = Buffer.from(hash, "hex");
        const derivedBuffer = scryptSync(password, salt, HASH_LENGTH);

        return timingSafeEqual(hashBuffer, derivedBuffer);
    } catch {
        return false;
    }
}

export function createToken(userId: number, role: string): string {
    if (!userId || typeof userId !== "number" || userId <= 0 || !Number.isInteger(userId)) {
        throw new Error("User ID must be a positive integer");
    }

    if (!role || typeof role !== "string" || role.trim().length === 0) {
        throw new Error("Role must be a non-empty string");
    }

    if (!VALID_ROLES.includes(role)) {
        throw new Error(`Role must be one of: ${VALID_ROLES.join(", ")}`);
    }

    try {
        const payload = Buffer.from(
            JSON.stringify({ userId, role, iat: Date.now() })
        ).toString("base64url");

        const sig = createHmac("sha256", SECRET)
            .update(payload)
            .digest("base64url");

        return `${payload}.${sig}`;
    } catch (error) {
        throw new Error("Failed to create authentication token");
    }
}

export function verifyToken(
    token: string
): { userId: number; role: string } | null {
    if (!token || typeof token !== "string" || token.trim().length === 0) {
        return null;
    }

    try {
        const parts = token.split(".");

        if (parts.length !== 2) {
            return null;
        }

        const [payload, sig] = parts;

        if (!payload || !sig) {
            return null;
        }

        const expected = createHmac("sha256", SECRET)
            .update(payload)
            .digest("base64url");

        if (sig !== expected) {
            return null;
        }

        const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());

        if (!decoded || typeof decoded !== "object") {
            return null;
        }

        if (!decoded.userId || !decoded.role) {
            return null;
        }

        if (typeof decoded.userId !== "number" || decoded.userId <= 0) {
            return null;
        }

        if (typeof decoded.role !== "string" || decoded.role.trim().length === 0) {
            return null;
        }

        if (!VALID_ROLES.includes(decoded.role)) {
            return null;
        }

        return {
            userId: decoded.userId,
            role: decoded.role
        };
    } catch {
        return null;
    }
}

export async function getSessionUser(): Promise<{
    userId: number;
    role: string;
} | null> {
    try {
        const cookieStore = await cookies();

        if (!cookieStore) {
            return null;
        }

        const token = cookieStore.get(COOKIE_NAME)?.value;

        if (!token) {
            return null;
        }

        return verifyToken(token);
    } catch {
        return null;
    }
}

export function getSessionUserFromRequest(
    req: NextRequest
): { userId: number; role: string } | null {
    if (!req || !req.cookies) {
        return null;
    }

    const token = req.cookies.get(COOKIE_NAME)?.value;

    if (!token) {
        return null;
    }

    return verifyToken(token);
}

export { COOKIE_NAME };
