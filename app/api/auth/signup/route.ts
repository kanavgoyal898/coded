import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";
import { hashPassword, createToken, COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

interface UserRow {
    id: number;
    name: string;
    email: string;
    role: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 128;
const MAX_EMAIL_LENGTH = 256;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

function openDb(): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
        const dbPath = path.join(process.cwd(), "database.db");
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
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

    const { name, email, password } = body as Record<string, unknown>;

    if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string") {
        return NextResponse.json(
            { error: "Name, email, and password must be strings." },
            { status: 400 }
        );
    }

    if (!name || !email || !password) {
        return NextResponse.json(
            { error: "Name, email, and password are required." },
            { status: 400 }
        );
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
        return NextResponse.json(
            { error: "Name cannot be blank." },
            { status: 400 }
        );
    }

    if (trimmedName.length > MAX_NAME_LENGTH) {
        return NextResponse.json(
            { error: `Name must not exceed ${MAX_NAME_LENGTH} characters.` },
            { status: 400 }
        );
    }

    if (trimmedEmail.length > MAX_EMAIL_LENGTH) {
        return NextResponse.json(
            { error: `Email must not exceed ${MAX_EMAIL_LENGTH} characters.` },
            { status: 400 }
        );
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
        return NextResponse.json(
            { error: "Invalid email address." },
            { status: 400 }
        );
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
        return NextResponse.json(
            { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
            { status: 400 }
        );
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
        return NextResponse.json(
            { error: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters.` },
            { status: 400 }
        );
    }

    const passwordHash = hashPassword(password);
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
                "SELECT id FROM user WHERE email = ?",
                [trimmedEmail],
                (err, row) => {
                    if (err) {
                        closeDb(db!).catch(() => { });
                        resolve(
                            NextResponse.json(
                                { error: "Failed to validate email availability. Please try again." },
                                { status: 500 }
                            )
                        );
                        return;
                    }

                    if (row) {
                        closeDb(db!).catch(() => { });
                        resolve(
                            NextResponse.json(
                                { error: "An account with this email already exists." },
                                { status: 409 }
                            )
                        );
                        return;
                    }

                    db!.get("SELECT email FROM setter WHERE email = ? COLLATE NOCASE",
                        [trimmedEmail],
                        (setterErr, setterRow) => {
                            if (setterErr) {
                                closeDb(db!).catch(() => { });
                                resolve(
                                    NextResponse.json(
                                        { error: "Failed to verify account role. Please try again." },
                                        { status: 500 }
                                    )
                                );
                                return;
                            }

                            const role = setterRow ? "setter" : "solver";

                            db!.run(
                                `INSERT INTO user (name, email, password, role) VALUES (?, ?, ?, ?)`,
                                [trimmedName, trimmedEmail, passwordHash, role],
                                function (err) {
                                    if (err) {
                                        closeDb(db!).catch(() => { });

                                        const errorMsg = (err as Error).message || "";

                                        if (errorMsg.includes("UNIQUE") || errorMsg.includes("constraint")) {
                                            resolve(
                                                NextResponse.json(
                                                    { error: "An account with this email already exists." },
                                                    { status: 409 }
                                                )
                                            );
                                            return;
                                        }

                                        resolve(
                                            NextResponse.json(
                                                { error: "Failed to create account. Please try again." },
                                                { status: 500 }
                                            )
                                        );
                                        return;
                                    }

                                    if (!this || typeof this.lastID !== "number") {
                                        closeDb(db!).catch(() => { });
                                        resolve(
                                            NextResponse.json(
                                                { error: "Failed to retrieve account ID. Please try again." },
                                                { status: 500 }
                                            )
                                        );
                                        return;
                                    }

                                    const userId = this.lastID;

                                    db!.get(
                                        "SELECT id, name, email, role FROM user WHERE id = ?",
                                        [userId],
                                        (err, user: UserRow) => {
                                            closeDb(db!).catch(() => { });

                                            if (err || !user) {
                                                resolve(
                                                    NextResponse.json(
                                                        { error: "Account created but session could not be established." },
                                                        { status: 500 }
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
                                        });
                                }
                            );
                        }
                    );
                }
            );
        }
        );
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
