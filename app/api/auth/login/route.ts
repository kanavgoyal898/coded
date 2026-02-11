import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";
import { verifyPassword, createToken, COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

interface UserRow {
    id: number;
    name: string;
    email: string;
    role: string;
    password: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function openDb(): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
        const dbPath = path.join(process.cwd(), "database.db");
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                reject(new Error("Database connection failed"));
            } else {
                resolve(db);
            }
        });
    });
}

function closeDb(db: sqlite3.Database): Promise<void> {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) {
                reject(new Error("Failed to close database connection"));
            } else {
                resolve();
            }
        });
    });
}

export async function POST(req: NextRequest) {
    let body: unknown;

    try {
        body = await req.json();
    } catch {
        return NextResponse.json(
            { error: "Request body is missing or malformed JSON." },
            { status: 400 }
        );
    }

    if (!body || typeof body !== "object") {
        return NextResponse.json(
            { error: "Invalid request format. Expected an object." },
            { status: 400 }
        );
    }

    const { email, password } = body as Record<string, unknown>;

    if (typeof email !== "string" || typeof password !== "string") {
        return NextResponse.json(
            { error: "Email and password must be strings." },
            { status: 400 }
        );
    }

    if (!email || !password) {
        return NextResponse.json(
            { error: "Email and password are required." },
            { status: 400 }
        );
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(trimmedEmail)) {
        return NextResponse.json(
            { error: "Invalid email address." },
            { status: 400 }
        );
    }

    let db: sqlite3.Database | null = null;

    try {
        db = await openDb();

        return await new Promise<NextResponse>((resolve) => {
            if (!db) {
                resolve(
                    NextResponse.json(
                        { error: "Database initialization failed. Please try again." },
                        { status: 500 }
                    )
                );
                return;
            }

            db.get(
                "SELECT id, name, email, role, password FROM user WHERE email = ?",
                [trimmedEmail],
                (err, user: UserRow) => {
                    closeDb(db!).catch(() => { });

                    if (err) {
                        resolve(
                            NextResponse.json(
                                { error: "Failed to look up account. Please try again." },
                                { status: 500 }
                            )
                        );
                        return;
                    }

                    if (!user || !verifyPassword(password, user.password)) {
                        resolve(
                            NextResponse.json(
                                { error: "Invalid email or password." },
                                { status: 401 }
                            )
                        );
                        return;
                    }

                    const token = createToken(user.id, user.role);
                    const response = NextResponse.json({
                        user: {
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            role: user.role,
                        },
                    });

                    response.cookies.set(COOKIE_NAME, token, {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === "production",
                        sameSite: "lax",
                        maxAge: 60 * 60 * 24 * 7,
                        path: "/",
                    });

                    resolve(response);
                }
            );
        });
    } catch (error) {
        if (db) await closeDb(db).catch(() => { });

        const errorMessage =
            error instanceof Error && error.message === "Database connection failed"
                ? "Database service unavailable"
                : "Database error occurred";

        return NextResponse.json(
            { error: errorMessage + ". Please try again later." },
            { status: 503 }
        );
    }
}
