import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";
import { getSessionUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

interface ProblemWithSubmissions {
    problem_id: number;
    problem_title: string;
    problem_slug: string;
    created_at: string;
    total_submissions: number;
    unique_solvers: number;
}

interface SubmissionSummary {
    user_id: number;
    user_name: string;
    user_email: string;
    latest_submission_id: number;
    latest_language: string;
    latest_status: string;
    latest_score: number;
    total_score: number;
    latest_execution_time_ms: number | null;
    latest_created_at: string;
    submission_count: number;
    source_code: string;
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

    if (!session.role || (session.role !== "setter" && session.role !== "admin")) {
        return NextResponse.json(
            { error: "Insufficient permissions. Setter or admin role required." },
            { status: 403 }
        );
    }

    if (!session.userId || typeof session.userId !== "number" || session.userId <= 0) {
        return NextResponse.json(
            { error: "Invalid session data. Please log in again." },
            { status: 401 }
        );
    }

    const { searchParams } = new URL(req.url);
    const problemId = searchParams.get("problem_id");

    let db: sqlite3.Database | null = null;

    try {
        db = await openDb();

        if (problemId) {
            const parsedProblemId = parseInt(problemId);
            if (isNaN(parsedProblemId)) {
                if (db) await closeDb(db);
                return NextResponse.json(
                    { error: "Invalid problem ID." },
                    { status: 400 }
                );
            }

            return await new Promise<NextResponse>((resolve) => {
                if (!db) {
                    resolve(
                        NextResponse.json(
                            { error: "Database initialization failed." },
                            { status: 500 }
                        )
                    );
                    return;
                }

                db.get(
                    "SELECT setter_id FROM problem WHERE id = ?",
                    [parsedProblemId],
                    (err, problem: { setter_id: number }) => {
                        if (err || !problem) {
                            closeDb(db!).catch(() => { });
                            resolve(
                                NextResponse.json(
                                    { error: "Problem not found." },
                                    { status: 404 }
                                )
                            );
                            return;
                        }

                        if (problem.setter_id !== session.userId && session.role !== "admin") {
                            closeDb(db!).catch(() => { });
                            resolve(
                                NextResponse.json(
                                    { error: "You can only view activity for your own problems." },
                                    { status: 403 }
                                )
                            );
                            return;
                        }

                        db!.all(
                            `
                            WITH latest_submissions AS (
                                SELECT 
                                    s.user_id,
                                    MAX(s.id) as latest_submission_id
                                FROM submission s
                                WHERE s.problem_id = ?
                                GROUP BY s.user_id
                            ),
                            submission_counts AS (
                                SELECT 
                                    user_id,
                                    COUNT(*) as submission_count
                                FROM submission
                                WHERE problem_id = ?
                                GROUP BY user_id
                            ),
                            testcase_total AS (
                                SELECT SUM(weight) as total_weight
                                FROM testcase
                                WHERE problem_id = ? AND is_sample = 0
                            )
                            SELECT 
                                u.id as user_id,
                                u.name as user_name,
                                u.email as user_email,
                                s.id as latest_submission_id,
                                s.language as latest_language,
                                s.status as latest_status,
                                s.score as latest_score,
                                (SELECT total_weight FROM testcase_total) as total_score,
                                s.execution_time_ms as latest_execution_time_ms,
                                s.created_at as latest_created_at,
                                sc.submission_count,
                                s.source_code
                            FROM latest_submissions ls
                            JOIN submission s ON s.id = ls.latest_submission_id
                            JOIN user u ON u.id = s.user_id
                            JOIN submission_counts sc ON sc.user_id = u.id
                            ORDER BY u.name ASC
                            `,
                            [parsedProblemId, parsedProblemId, parsedProblemId],
                            async (err, submissions: SubmissionSummary[]) => {
                                if (db) await closeDb(db);

                                if (err) {
                                    resolve(
                                        NextResponse.json(
                                            { error: "Failed to fetch submissions." },
                                            { status: 500 }
                                        )
                                    );
                                    return;
                                }

                                resolve(NextResponse.json({ submissions: submissions || [] }));
                            }
                        );
                    }
                );
            });
        } else {
            return await new Promise<NextResponse>((resolve) => {
                if (!db) {
                    resolve(
                        NextResponse.json(
                            { error: "Database initialization failed." },
                            { status: 500 }
                        )
                    );
                    return;
                }

                const query = session.role === "admin"
                    ? `
                        SELECT 
                            p.id as problem_id,
                            p.title as problem_title,
                            p.slug as problem_slug,
                            p.created_at,
                            COUNT(DISTINCT s.id) as total_submissions,
                            COUNT(DISTINCT s.user_id) as unique_solvers
                        FROM problem p
                        LEFT JOIN submission s ON s.problem_id = p.id
                        GROUP BY p.id
                        ORDER BY p.created_at DESC
                    `
                    : `
                        SELECT 
                            p.id as problem_id,
                            p.title as problem_title,
                            p.slug as problem_slug,
                            p.created_at,
                            COUNT(DISTINCT s.id) as total_submissions,
                            COUNT(DISTINCT s.user_id) as unique_solvers
                        FROM problem p
                        LEFT JOIN submission s ON s.problem_id = p.id
                        WHERE p.setter_id = ?
                        GROUP BY p.id
                        ORDER BY p.created_at DESC
                    `;

                const params = session.role === "admin" ? [] : [session.userId];

                db.all(
                    query,
                    params,
                    async (err, problems: ProblemWithSubmissions[]) => {
                        if (db) await closeDb(db);

                        if (err) {
                            resolve(
                                NextResponse.json(
                                    { error: "Failed to fetch problems." },
                                    { status: 500 }
                                )
                            );
                            return;
                        }

                        resolve(NextResponse.json({ problems: problems || [] }));
                    }
                );
            });
        }
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
