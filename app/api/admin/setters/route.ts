import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";
import { getSessionUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

interface AllowlistRow {
    email: string;
    added_at: string;
    user_id: number | null;
    user_name: string | null;
    registered: number;
}

interface SessionUser {
    userId: number;
}

const MAX_EMAIL_LENGTH = 256;
const MAX_LOCAL_PART_LENGTH = 64;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function requireAdmin(req: NextRequest): { userId: number } | NextResponse {
    if (!req) {
        return NextResponse.json(
            { error: "Invalid request." },
            { status: 400 }
        );
    }

    const session = getSessionUserFromRequest(req);

    if (!session) {
        return NextResponse.json(
            { error: "Authentication required. Please log in to continue." },
            { status: 401 }
        );
    }

    if (!session.role || session.role !== "admin") {
        return NextResponse.json(
            { error: "Access denied. Administrator privileges required." },
            { status: 403 }
        );
    }

    if (!session.userId || typeof session.userId !== "number" || session.userId <= 0) {
        return NextResponse.json(
            { error: "Invalid session data. Please log in again." },
            { status: 401 }
        );
    }

    return { userId: session.userId };
}

function validateEmail(email: string): { valid: boolean; error?: string } {
    if (!email || typeof email !== "string") {
        return { valid: false, error: "Email address is required." };
    }

    const trimmedEmail = email.trim();

    if (trimmedEmail.length === 0) {
        return { valid: false, error: "Email address cannot be empty." };
    }

    if (trimmedEmail.length > MAX_EMAIL_LENGTH) {
        return { valid: false, error: `Email address exceeds maximum length of ${MAX_EMAIL_LENGTH} characters.` };
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
        return { valid: false, error: "Invalid email address format." };
    }

    const parts = trimmedEmail.split("@");
    if (parts.length !== 2) {
        return { valid: false, error: "Invalid email address format." };
    }

    const [localPart, domain] = parts;

    if (!localPart || localPart.length === 0) {
        return { valid: false, error: "Email address local part cannot be empty." };
    }

    if (localPart.length > MAX_LOCAL_PART_LENGTH) {
        return { valid: false, error: `Email address local part exceeds ${MAX_LOCAL_PART_LENGTH} characters.` };
    }

    if (!domain || domain.length === 0) {
        return { valid: false, error: "Email address domain cannot be empty." };
    }

    if (domain.length > 253) {
        return { valid: false, error: "Email address domain exceeds maximum length of 253 characters." };
    }

    return { valid: true };
}

export async function GET(req: NextRequest) {
    const auth = requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

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

            db.all(
                `
                SELECT
                    s.email,
                    s.added_at,
                    u.id AS user_id,
                    u.name AS user_name,
                    CASE WHEN u.id IS NOT NULL THEN 1 ELSE 0 END AS registered
                FROM setter s
                LEFT JOIN user u ON s.email = u.email COLLATE NOCASE
                ORDER BY s.added_at DESC
                `,
                [],
                async (err, rows: AllowlistRow[]) => {
                    if (err) {
                        if (db) await closeDb(db).catch(() => { });
                        resolve(
                            NextResponse.json(
                                { error: "Failed to retrieve setter list. Please try again." },
                                { status: 500 }
                            )
                        );
                        return;
                    }

                    if (!rows) {
                        if (db) await closeDb(db).catch(() => { });
                        resolve(NextResponse.json({ setters: [] }));
                        return;
                    }

                    if (!Array.isArray(rows)) {
                        if (db) await closeDb(db).catch(() => { });
                        resolve(
                            NextResponse.json(
                                { error: "Invalid data format received from database." },
                                { status: 500 }
                            )
                        );
                        return;
                    }

                    if (db) await closeDb(db).catch(() => { });
                    resolve(NextResponse.json({ setters: rows }));
                }
            );
        });
    } catch (error) {
        if (db) await closeDb(db).catch(() => { });

        const errorMessage = error instanceof Error && error.message === "Database connection failed"
            ? "Database service unavailable"
            : "Database error occurred";

        return NextResponse.json(
            { error: errorMessage + ". Please try again later." },
            { status: 503 }
        );
    }
}

export async function POST(req: NextRequest) {
    const auth = requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const authUser = auth as SessionUser;

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid request body. Expected valid JSON." },
            { status: 400 }
        );
    }

    if (!body || typeof body !== "object") {
        return NextResponse.json(
            { error: "Invalid request format. Expected an object with email field." },
            { status: 400 }
        );
    }

    if (!("email" in body)) {
        return NextResponse.json(
            { error: "Missing required field: email." },
            { status: 422 }
        );
    }

    const emailValue = (body as { email: unknown }).email;

    if (typeof emailValue !== "string") {
        return NextResponse.json(
            { error: "Email must be a string value." },
            { status: 422 }
        );
    }

    const email = emailValue.trim();
    const validation = validateEmail(email);

    if (!validation.valid) {
        return NextResponse.json(
            { error: validation.error },
            { status: 422 }
        );
    }

    const normalizedEmail = email.toLowerCase();

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
                "SELECT email FROM setter WHERE email = ? COLLATE NOCASE",
                [normalizedEmail],
                async (err, existingRow) => {
                    if (err) {
                        if (db) await closeDb(db).catch(() => { });
                        resolve(
                            NextResponse.json(
                                { error: "Failed to verify setter status. Please try again." },
                                { status: 500 }
                            )
                        );
                        return;
                    }

                    if (existingRow) {
                        if (db) await closeDb(db).catch(() => { });
                        resolve(
                            NextResponse.json(
                                { error: `Email '${normalizedEmail}' is already registered as a setter.` },
                                { status: 409 }
                            )
                        );
                        return;
                    }

                    if (!db) {
                        resolve(
                            NextResponse.json(
                                { error: "Database connection lost. Please try again." },
                                { status: 500 }
                            )
                        );
                        return;
                    }

                    db.run(
                        "INSERT INTO setter (email, added_by) VALUES (?, ?)",
                        [normalizedEmail, authUser.userId],
                        function (insertErr) {
                            if (insertErr) {
                                closeDb(db!).catch(() => { });

                                const errorMsg = (insertErr as Error).message || "";

                                if (errorMsg.includes("UNIQUE") || errorMsg.includes("constraint")) {
                                    resolve(
                                        NextResponse.json(
                                            { error: `Email '${normalizedEmail}' is already registered as a setter.` },
                                            { status: 409 }
                                        )
                                    );
                                    return;
                                }

                                if (errorMsg.includes("FOREIGN KEY")) {
                                    resolve(
                                        NextResponse.json(
                                            { error: "Invalid administrator reference. Please log in again." },
                                            { status: 400 }
                                        )
                                    );
                                    return;
                                }

                                resolve(
                                    NextResponse.json(
                                        { error: "Failed to add setter. Please try again." },
                                        { status: 500 }
                                    )
                                );
                                return;
                            }

                            if (!this || typeof this.changes !== "number") {
                                closeDb(db!).catch(() => { });
                                resolve(
                                    NextResponse.json(
                                        { error: "Failed to verify setter addition. Please try again." },
                                        { status: 500 }
                                    )
                                );
                                return;
                            }

                            if (this.changes === 0) {
                                closeDb(db!).catch(() => { });
                                resolve(
                                    NextResponse.json(
                                        { error: "Failed to add setter. No changes made." },
                                        { status: 500 }
                                    )
                                );
                                return;
                            }

                            if (!db) {
                                resolve(
                                    NextResponse.json(
                                        {
                                            error: "Setter email added but database connection lost. User will be promoted on next login.",
                                            warning: true
                                        },
                                        { status: 201 }
                                    )
                                );
                                return;
                            }

                            db.run(
                                "UPDATE user SET role = 'setter' WHERE email = ? COLLATE NOCASE AND role != 'admin'",
                                [normalizedEmail],
                                async (updateErr) => {
                                    if (db) await closeDb(db).catch(() => { });

                                    if (updateErr) {
                                        resolve(
                                            NextResponse.json(
                                                {
                                                    error: "Setter email added but failed to update existing user role. User will be promoted on next login.",
                                                    warning: true
                                                },
                                                { status: 201 }
                                            )
                                        );
                                        return;
                                    }

                                    resolve(
                                        NextResponse.json(
                                            {
                                                email: normalizedEmail,
                                                status: "added",
                                                message: `Successfully added '${normalizedEmail}' as a setter.`
                                            },
                                            { status: 201 }
                                        )
                                    );
                                }
                            );
                        }
                    );
                }
            );
        });
    } catch (error) {
        if (db) await closeDb(db).catch(() => { });

        const errorMessage = error instanceof Error && error.message === "Database connection failed"
            ? "Database service unavailable"
            : "Database error occurred";

        return NextResponse.json(
            { error: errorMessage + ". Please try again later." },
            { status: 503 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    const auth = requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid request body. Expected valid JSON." },
            { status: 400 }
        );
    }

    if (!body || typeof body !== "object") {
        return NextResponse.json(
            { error: "Invalid request format. Expected an object with email field." },
            { status: 400 }
        );
    }

    if (!("email" in body)) {
        return NextResponse.json(
            { error: "Missing required field: email." },
            { status: 422 }
        );
    }

    const emailValue = (body as { email: unknown }).email;

    if (typeof emailValue !== "string") {
        return NextResponse.json(
            { error: "Email must be a string value." },
            { status: 422 }
        );
    }

    const email = emailValue.trim();

    if (email.length === 0) {
        return NextResponse.json(
            { error: "Email address cannot be empty." },
            { status: 422 }
        );
    }

    if (email.length > MAX_EMAIL_LENGTH) {
        return NextResponse.json(
            { error: `Email address exceeds maximum length of ${MAX_EMAIL_LENGTH} characters.` },
            { status: 422 }
        );
    }

    const normalizedEmail = email.toLowerCase();

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
                "SELECT email FROM setter WHERE email = ? COLLATE NOCASE",
                [normalizedEmail],
                async (err, row) => {
                    if (err) {
                        if (db) await closeDb(db).catch(() => { });
                        resolve(
                            NextResponse.json(
                                { error: "Failed to verify setter status. Please try again." },
                                { status: 500 }
                            )
                        );
                        return;
                    }

                    if (!row) {
                        if (db) await closeDb(db).catch(() => { });
                        resolve(
                            NextResponse.json(
                                { error: `Email '${normalizedEmail}' not found in setter list.` },
                                { status: 404 }
                            )
                        );
                        return;
                    }

                    if (!db) {
                        resolve(
                            NextResponse.json(
                                { error: "Database connection lost. Please try again." },
                                { status: 500 }
                            )
                        );
                        return;
                    }

                    db.run(
                        "DELETE FROM setter WHERE email = ? COLLATE NOCASE",
                        [normalizedEmail],
                        function (deleteErr) {
                            if (deleteErr) {
                                closeDb(db!).catch(() => { });
                                resolve(
                                    NextResponse.json(
                                        { error: "Failed to remove setter. Please try again." },
                                        { status: 500 }
                                    )
                                );
                                return;
                            }

                            if (!this || typeof this.changes !== "number") {
                                closeDb(db!).catch(() => { });
                                resolve(
                                    NextResponse.json(
                                        { error: "Failed to verify setter removal. Please try again." },
                                        { status: 500 }
                                    )
                                );
                                return;
                            }

                            if (this.changes === 0) {
                                closeDb(db!).catch(() => { });
                                resolve(
                                    NextResponse.json(
                                        { error: `Email '${normalizedEmail}' not found in setter list.` },
                                        { status: 404 }
                                    )
                                );
                                return;
                            }

                            if (!db) {
                                resolve(
                                    NextResponse.json(
                                        {
                                            error: "Setter removed but database connection lost. User privileges may need manual reset.",
                                            warning: true
                                        },
                                        { status: 200 }
                                    )
                                );
                                return;
                            }

                            db.run(
                                "UPDATE user SET role = 'solver' WHERE email = ? COLLATE NOCASE AND role = 'setter'",
                                [normalizedEmail],
                                async (updateErr) => {
                                    if (db) await closeDb(db).catch(() => { });

                                    if (updateErr) {
                                        resolve(
                                            NextResponse.json(
                                                {
                                                    error: "Setter removed but failed to downgrade user role. User privileges may need manual reset.",
                                                    warning: true
                                                },
                                                { status: 200 }
                                            )
                                        );
                                        return;
                                    }

                                    resolve(
                                        NextResponse.json({
                                            email: normalizedEmail,
                                            status: "removed",
                                            message: `Successfully removed '${normalizedEmail}' from setter list.`
                                        })
                                    );
                                }
                            );
                        }
                    );
                }
            );
        });
    } catch (error) {
        if (db) await closeDb(db).catch(() => { });

        const errorMessage = error instanceof Error && error.message === "Database connection failed"
            ? "Database service unavailable"
            : "Database error occurred";

        return NextResponse.json(
            { error: errorMessage + ". Please try again later." },
            { status: 503 }
        );
    }
}
