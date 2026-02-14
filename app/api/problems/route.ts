import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";
import { getSessionUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

interface ProblemRow {
    id: number;
    title: string;
    slug: string;
    setter_id: number;
    setter_name: string;
    deadline_at: string | null;
    time_limit_ms: number;
    memory_limit_kb: number;
    visibility: string;
    created_at: string;
    solved: number;
    latest_status: string | null;
}

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

export async function GET(req: NextRequest) {
    const session = getSessionUserFromRequest(req);

    if (!session) {
        return NextResponse.json(
            { error: "Authentication required. Please log in to continue." },
            { status: 401 }
        );
    }

    if (!session.userId || typeof session.userId !== "number" || session.userId <= 0) {
        return NextResponse.json(
            { error: "Invalid session data. Please log in again." },
            { status: 401 }
        );
    }

    const userId = session.userId;
    const userRole = session.role || "solver";

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
                "SELECT email FROM user WHERE id = ?",
                [userId],
                (err, userRow: { email: string } | undefined) => {
                    if (err || !userRow) {
                        closeDb(db!).catch(() => { });
                        resolve(
                            NextResponse.json(
                                { error: "Failed to retrieve user information." },
                                { status: 500 }
                            )
                        );
                        return;
                    }

                    const userEmail = userRow.email;

                    let query: string;
                    let params: (string | number | null)[];

                    if (userRole === "admin") {
                        query = `
                            SELECT
                                p.id,
                                p.title,
                                p.slug,
                                p.setter_id,
                                u.name AS setter_name,
                                p.deadline_at,
                                p.time_limit_ms,
                                p.memory_limit_kb,
                                p.visibility,
                                p.created_at,
                                CASE WHEN latest_sub.status = 'accepted' THEN 1 ELSE 0 END AS solved,
                                latest_sub.status AS latest_status
                            FROM problem p
                            JOIN user u ON p.setter_id = u.id
                            LEFT JOIN (
                                SELECT 
                                    s1.problem_id,
                                    s1.status
                                FROM submission s1
                                INNER JOIN (
                                    SELECT 
                                        problem_id,
                                        MAX(created_at) as max_created_at,
                                        MAX(id) as max_id
                                    FROM submission
                                    WHERE user_id = ?
                                    GROUP BY problem_id
                                ) s2 ON s1.problem_id = s2.problem_id 
                                    AND s1.created_at = s2.max_created_at 
                                    AND s1.id = s2.max_id
                                WHERE s1.user_id = ?
                            ) latest_sub ON p.id = latest_sub.problem_id
                            ORDER BY 
                                CASE WHEN p.deadline_at IS NULL THEN 1 ELSE 0 END,
                                p.deadline_at DESC,
                                p.created_at DESC
                        `;
                        params = [userId, userId];
                    } else {
                        query = `
                            SELECT DISTINCT
                                p.id,
                                p.title,
                                p.slug,
                                p.setter_id,
                                u.name AS setter_name,
                                p.deadline_at,
                                p.time_limit_ms,
                                p.memory_limit_kb,
                                p.visibility,
                                p.created_at,
                                CASE WHEN latest_sub.status = 'accepted' THEN 1 ELSE 0 END AS solved,
                                latest_sub.status AS latest_status
                            FROM problem p
                            JOIN user u ON p.setter_id = u.id
                            LEFT JOIN solver s ON p.id = s.problem_id
                            LEFT JOIN (
                                SELECT 
                                    s1.problem_id,
                                    s1.status
                                FROM submission s1
                                INNER JOIN (
                                    SELECT 
                                        problem_id,
                                        MAX(created_at) as max_created_at,
                                        MAX(id) as max_id
                                    FROM submission
                                    WHERE user_id = ?
                                    GROUP BY problem_id
                                ) s2 ON s1.problem_id = s2.problem_id 
                                    AND s1.created_at = s2.max_created_at 
                                    AND s1.id = s2.max_id
                                WHERE s1.user_id = ?
                            ) latest_sub ON p.id = latest_sub.problem_id
                            WHERE p.visibility = 'public' 
                               OR (p.visibility = 'private' AND s.email = ?)
                            ORDER BY 
                                CASE WHEN p.deadline_at IS NULL THEN 1 ELSE 0 END,
                                p.deadline_at DESC,
                                p.created_at DESC
                        `;
                        params = [userId, userId, userEmail];
                    }

                    db!.all(
                        query,
                        params,
                        (err, problems: ProblemRow[]) => {
                            closeDb(db!).catch(() => { });

                            if (err) {
                                resolve(
                                    NextResponse.json(
                                        { error: "Failed to fetch problems. Please try again." },
                                        { status: 500 }
                                    )
                                );
                                return;
                            }

                            resolve(NextResponse.json({ problems: problems || [] }));
                        }
                    );
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
