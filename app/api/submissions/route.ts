import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";

interface SubmissionRow {
    id: number;
    problem_title: string;
    problem_slug: string;
    language: string;
    status: string;
    score: number;
    execution_time_ms: number | null;
    created_at: string;
}

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const userIdStr = searchParams.get("user_id");

    if (!userIdStr) {
        return NextResponse.json(
            { error: "user_id is required" },
            { status: 400 }
        );
    }

    const userId = parseInt(userIdStr);
    if (isNaN(userId)) {
        return NextResponse.json(
            { error: "Invalid user_id" },
            { status: 400 }
        );
    }

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
                (err, submissions: SubmissionRow[]) => {
                    db.close();

                    if (err) {
                        resolve(
                            NextResponse.json(
                                { error: "Failed to fetch submissions" },
                                { status: 500 }
                            )
                        );
                        return;
                    }

                    resolve(
                        NextResponse.json({ submissions: submissions || [] })
                    );
                }
            );
        });
    });
}