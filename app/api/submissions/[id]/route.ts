import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";
import { getSessionUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

interface SubmissionRow {
    id: number;
    user_id: number;
    problem_id: number;
    language: string;
    status: string;
    score: number;
    compile_log: string | null;
    runtime_log: string | null;
    execution_time_ms: number | null;
    created_at: string;
    finished_at: string | null;
}

interface TotalRow {
    total_weight: number;
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = getSessionUserFromRequest(req);

    if (!session) {
        return NextResponse.json(
            { error: "Authentication required." },
            { status: 401 }
        );
    }

    const { id } = await params;
    const submissionId = parseInt(id, 10);

    if (isNaN(submissionId) || submissionId <= 0) {
        return NextResponse.json({ error: "Invalid submission ID." }, { status: 400 });
    }

    const dbPath = path.join(process.cwd(), "database.db");

    return new Promise<NextResponse>((resolve) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                resolve(NextResponse.json({ error: "Database connection failed." }, { status: 503 }));
                return;
            }

            db.get(
                `SELECT id, user_id, problem_id, language, status, score,
                        compile_log, runtime_log, execution_time_ms,
                        created_at, finished_at
                 FROM submission WHERE id = ?`,
                [submissionId],
                (err, row: SubmissionRow | undefined) => {
                    if (err) {
                        db.close();
                        resolve(NextResponse.json({ error: "Database error." }, { status: 500 }));
                        return;
                    }

                    if (!row) {
                        db.close();
                        resolve(NextResponse.json({ error: "Submission not found." }, { status: 404 }));
                        return;
                    }

                    if (row.user_id !== session.userId && session.role !== "admin") {
                        db.close();
                        resolve(NextResponse.json({ error: "Forbidden." }, { status: 403 }));
                        return;
                    }

                    if (row.status === "pending") {
                        db.close();
                        resolve(NextResponse.json({ pending: true, submission_id: row.id }));
                        return;
                    }

                    db.get(
                        `SELECT SUM(weight) AS total_weight
                         FROM testcase
                         WHERE problem_id = ? AND is_sample = 0`,
                        [row.problem_id],
                        (err, totalRow: TotalRow | undefined) => {
                            db.close();

                            if (err) {
                                resolve(NextResponse.json({ error: "Failed to fetch score data." }, { status: 500 }));
                                return;
                            }

                            resolve(NextResponse.json({
                                pending: false,
                                submission_id: row.id,
                                status: row.status,
                                score: row.score,
                                total: totalRow?.total_weight ?? 0,
                                compile_log: row.compile_log,
                                runtime_log: row.runtime_log,
                                execution_time_ms: row.execution_time_ms,
                                finished_at: row.finished_at,
                            }));
                        }
                    );
                }
            );
        });
    });
}