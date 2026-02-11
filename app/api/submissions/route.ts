import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";
import { getSessionUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

interface SubmissionRow {
    id: number;
    problem_id: number;
    problem_title: string;
    problem_slug: string;
    language: string;
    status: string;
    score: number;
    execution_time_ms: number | null;
    created_at: string;
}

interface TestcaseTotalRow {
    problem_id: number;
    total_weight: number;
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
                    s.id,
                    s.problem_id,
                    p.title AS problem_title,
                    p.slug AS problem_slug,
                    s.language,
                    s.status,
                    s.score,
                    s.execution_time_ms,
                    s.created_at
                FROM submission s
                JOIN problem p ON s.problem_id = p.id
                WHERE s.user_id = ?
                ORDER BY s.created_at DESC
                `,
                [userId],
                (err, submissions: SubmissionRow[]) => {
                    if (err) {
                        closeDb(db!).catch(() => { });
                        resolve(
                            NextResponse.json(
                                { error: "Failed to fetch submissions. Please try again." },
                                { status: 500 }
                            )
                        );
                        return;
                    }

                    if (!submissions || submissions.length === 0) {
                        closeDb(db!).catch(() => { });
                        resolve(NextResponse.json({ submissions: [] }));
                        return;
                    }

                    const problemIds = [...new Set(submissions.map((s) => s.problem_id))];
                    const placeholders = problemIds.map(() => "?").join(",");

                    db!.all(
                        `
                        SELECT problem_id, SUM(weight) AS total_weight
                        FROM testcase
                        WHERE problem_id IN (${placeholders}) AND is_sample = 0
                        GROUP BY problem_id
                        `,
                        problemIds,
                        (err, totals: TestcaseTotalRow[]) => {
                            closeDb(db!).catch(() => { });

                            if (err) {
                                resolve(
                                    NextResponse.json(
                                        { error: "Failed to fetch scoring data. Please try again." },
                                        { status: 500 }
                                    )
                                );
                                return;
                            }

                            const totalMap = new Map<number, number>();
                            (totals ?? []).forEach((t) => {
                                totalMap.set(t.problem_id, t.total_weight ?? 0);
                            });

                            const submissionsWithTotal = submissions.map((s) => ({
                                ...s,
                                total_score: totalMap.get(s.problem_id) ?? 0,
                            }));

                            resolve(
                                NextResponse.json({ submissions: submissionsWithTotal })
                            );
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
