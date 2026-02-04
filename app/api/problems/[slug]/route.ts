import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";

interface ProblemRow {
    id: number;
    title: string;
    slug: string;
    statement: string;
    time_limit_ms: number;
    memory_limit_kb: number;
    created_at: string;
    setter_name: string | null;
}

interface SampleRow {
    id: number;
    input_data: string;
    output_data: string;
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;

    if (!slug) {
        return NextResponse.json(
            { error: "Slug is required" },
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

            db.get(
                `
                SELECT 
                    p.id,
                    p.title,
                    p.slug,
                    p.statement,
                    p.time_limit_ms,
                    p.memory_limit_kb,
                    p.created_at,
                    u.name as setter_name
                FROM problem p
                LEFT JOIN user u ON p.setter_id = u.id
                WHERE p.slug = ? AND p.visibility = 'public'
                `,
                [slug],
                (err, problem: ProblemRow) => {
                    if (err) {
                        db.close();
                        resolve(
                            NextResponse.json(
                                { error: "Database error" },
                                { status: 500 }
                            )
                        );
                        return;
                    }

                    if (!problem) {
                        db.close();
                        resolve(
                            NextResponse.json(
                                { error: "Problem not found" },
                                { status: 404 }
                            )
                        );
                        return;
                    }

                    db.all(
                        `
                        SELECT id, input_data, output_data
                        FROM testcase
                        WHERE problem_id = ? AND is_sample = 1
                        ORDER BY id
                        `,
                        [problem.id],
                        (err, samples: SampleRow[]) => {
                            db.close();

                            if (err) {
                                resolve(
                                    NextResponse.json(
                                        { error: "Failed to fetch test cases" },
                                        { status: 500 }
                                    )
                                );
                                return;
                            }

                            resolve(
                                NextResponse.json({
                                    problem,
                                    samples: samples || [],
                                })
                            );
                        }
                    );
                }
            );
        });
    });
}