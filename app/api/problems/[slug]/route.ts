import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";

export const runtime = "nodejs";

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

const MAX_SLUG_LENGTH = 256;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

function validateSlug(slug: string): { valid: boolean; error?: string } {
    if (!slug || typeof slug !== "string") {
        return { valid: false, error: "Problem identifier is required." };
    }

    const trimmed = slug.trim();

    if (trimmed.length === 0) {
        return { valid: false, error: "Problem identifier cannot be empty." };
    }

    if (trimmed.length > MAX_SLUG_LENGTH) {
        return { valid: false, error: `Problem identifier exceeds maximum length of ${MAX_SLUG_LENGTH} characters.` };
    }

    if (!SLUG_REGEX.test(trimmed)) {
        return { valid: false, error: "Invalid problem identifier format." };
    }

    return { valid: true };
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    if (!req) {
        return NextResponse.json(
            { error: "Invalid request." },
            { status: 400 }
        );
    }

    let resolvedParams: { slug: string };

    try {
        resolvedParams = await params;
    } catch {
        return NextResponse.json(
            { error: "Failed to process request parameters." },
            { status: 400 }
        );
    }

    if (!resolvedParams || typeof resolvedParams !== "object") {
        return NextResponse.json(
            { error: "Invalid request parameters." },
            { status: 400 }
        );
    }

    const slug = resolvedParams.slug;

    const validation = validateSlug(slug);
    if (!validation.valid) {
        return NextResponse.json(
            { error: validation.error },
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
                        closeDb(db!).catch(() => { });
                        resolve(
                            NextResponse.json(
                                { error: "Failed to retrieve problem. Please try again." },
                                { status: 500 }
                            )
                        );
                        return;
                    }

                    if (!problem) {
                        closeDb(db!).catch(() => { });
                        resolve(
                            NextResponse.json(
                                { error: "Problem not found or not publicly available." },
                                { status: 404 }
                            )
                        );
                        return;
                    }

                    if (!problem.id || !problem.title || !problem.statement) {
                        closeDb(db!).catch(() => { });
                        resolve(
                            NextResponse.json(
                                { error: "Invalid problem data in database." },
                                { status: 500 }
                            )
                        );
                        return;
                    }

                    if (typeof problem.time_limit_ms !== "number" || problem.time_limit_ms <= 0) {
                        closeDb(db!).catch(() => { });
                        resolve(
                            NextResponse.json(
                                { error: "Invalid time limit configuration for this problem." },
                                { status: 500 }
                            )
                        );
                        return;
                    }

                    if (typeof problem.memory_limit_kb !== "number" || problem.memory_limit_kb <= 0) {
                        closeDb(db!).catch(() => { });
                        resolve(
                            NextResponse.json(
                                { error: "Invalid memory limit configuration for this problem." },
                                { status: 500 }
                            )
                        );
                        return;
                    }

                    if (!db) {
                        resolve(
                            NextResponse.json(
                                { error: "Database connection lost." },
                                { status: 500 }
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
                        async (err, samples: SampleRow[]) => {
                            if (db) await closeDb(db).catch(() => { });

                            if (err) {
                                resolve(
                                    NextResponse.json(
                                        { error: "Failed to retrieve sample testcases. Please try again." },
                                        { status: 500 }
                                    )
                                );
                                return;
                            }

                            if (!samples) {
                                resolve(
                                    NextResponse.json({
                                        problem,
                                        samples: [],
                                    })
                                );
                                return;
                            }

                            if (!Array.isArray(samples)) {
                                resolve(
                                    NextResponse.json(
                                        { error: "Invalid testcase data format." },
                                        { status: 500 }
                                    )
                                );
                                return;
                            }

                            for (const sample of samples) {
                                if (!sample.id || typeof sample.input_data !== "string" || typeof sample.output_data !== "string") {
                                    resolve(
                                        NextResponse.json(
                                            { error: "Invalid sample testcase data." },
                                            { status: 500 }
                                        )
                                    );
                                    return;
                                }
                            }

                            resolve(
                                NextResponse.json({
                                    problem,
                                    samples,
                                })
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
