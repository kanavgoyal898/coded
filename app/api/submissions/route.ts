import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";
import { getSessionUserFromRequest } from "@/lib/auth";

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

export async function GET(req: NextRequest) {
    const session = getSessionUserFromRequest(req);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;
    const dbPath = path.join(process.cwd(), "database.db");

    return new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                resolve(
                    NextResponse.json(
                        { error: "Database connection failed" },
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
            p.title as problem_title,
            p.slug as problem_slug,
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
                async (err, submissions: SubmissionRow[]) => {
                    if (err) {
                        db.close();
                        resolve(
                            NextResponse.json(
                                { error: "Failed to fetch submissions" },
                                { status: 500 }
                            )
                        );
                        return;
                    }

                    if (!submissions || submissions.length === 0) {
                        db.close();
                        resolve(NextResponse.json({ submissions: [] }));
                        return;
                    }

                    const problemIds = [
                        ...new Set(submissions.map((s) => s.problem_id)),
                    ];
                    const placeholders = problemIds.map(() => "?").join(",");

                    db.all(
                        `
                        SELECT  problem_id, SUM(weight) as total_weight
                        FROM testcase
                        WHERE problem_id IN (${placeholders}) AND is_sample = 0
                        GROUP BY problem_id`,
                        problemIds,
                        (
                            err,
                            totals: ({ problem_id: number; total_weight: number })[]
                        ) => {
                            db.close();

                            if (err) {
                                resolve(
                                    NextResponse.json(
                                        { error: "Failed to fetch testcase totals" },
                                        { status: 500 }
                                    )
                                );
                                return;
                            }

                            const totalMap = new Map<number, number>();
                            totals?.forEach((t) => {
                                totalMap.set(t.problem_id, t.total_weight || 0);
                            });

                            const submissionsWithTotal = submissions.map((s) => ({
                                ...s,
                                total_score: totalMap.get(s.problem_id) || 0,
                            }));

                            resolve(
                                NextResponse.json({ submissions: submissionsWithTotal })
                            );
                        }
                    );
                }
            );
        });
    });
}