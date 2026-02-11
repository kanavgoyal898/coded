import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";
import { getSessionUserFromRequest } from "@/lib/auth";

interface TestcaseInput {
    input: string;
    output: string;
    weight?: number;
    is_sample?: boolean;
}

interface ProblemBody {
    title: string;
    statement: string;
    testcases: TestcaseInput[];
    time_limit_ms?: number;
    memory_limit_kb?: number;
    visibility?: "public" | "private";
    deadline_at?: string | null;
}

function generateSlug(title: string): string {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

function openDb(): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(
            path.join(process.cwd(), "database.db"),
            (err) => (err ? reject(err) : resolve(db))
        );
    });
}

export async function POST(req: NextRequest) {
    const session = getSessionUserFromRequest(req);

    if (!session) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 }
        );
    }

    if (session.role !== "setter" && session.role !== "admin") {
        return NextResponse.json(
            { error: "Insufficient permissions to create problems" },
            { status: 403 }
        );
    }

    let body: ProblemBody;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json(
            { error: "Malformed JSON request body" },
            { status: 400 }
        );
    }

    const {
        title,
        statement,
        testcases,
        time_limit_ms,
        memory_limit_kb,
        visibility,
        deadline_at,
    } = body;

    if (
        typeof title !== "string" ||
        typeof statement !== "string" ||
        !Array.isArray(testcases)
    ) {
        return NextResponse.json(
            { error: "Invalid request payload" },
            { status: 422 }
        );
    }

    if (!title.trim()) {
        return NextResponse.json(
            { error: "Problem title cannot be empty" },
            { status: 422 }
        );
    }

    if (!statement.trim()) {
        return NextResponse.json(
            { error: "Problem statement cannot be empty" },
            { status: 422 }
        );
    }

    if (testcases.length === 0) {
        return NextResponse.json(
            { error: "At least one testcase is required" },
            { status: 422 }
        );
    }

    for (const t of testcases) {
        if (
            typeof t.input !== "string" ||
            typeof t.output !== "string" ||
            !t.input.trim() ||
            !t.output.trim()
        ) {
            return NextResponse.json(
                { error: "Each testcase must include non-empty input and output" },
                { status: 422 }
            );
        }

        if (t.weight !== undefined && (!Number.isInteger(t.weight) || t.weight < 0)) {
            return NextResponse.json(
                { error: "Testcase weight must be a non-negative integer" },
                { status: 422 }
            );
        }
    }

    const totalWeight = testcases.reduce(
        (sum, t) => sum + (t.weight ?? 1),
        0
    );

    if (totalWeight <= 0) {
        return NextResponse.json(
            { error: "Total testcase weight must be greater than zero" },
            { status: 422 }
        );
    }

    if (
        time_limit_ms !== undefined &&
        (!Number.isInteger(time_limit_ms) || time_limit_ms <= 0)
    ) {
        return NextResponse.json(
            { error: "Time limit must be a positive integer" },
            { status: 422 }
        );
    }

    if (
        memory_limit_kb !== undefined &&
        (!Number.isInteger(memory_limit_kb) || memory_limit_kb <= 0)
    ) {
        return NextResponse.json(
            { error: "Memory limit must be a positive integer" },
            { status: 422 }
        );
    }

    if (visibility && visibility !== "public" && visibility !== "private") {
        return NextResponse.json(
            { error: "Invalid visibility value" },
            { status: 422 }
        );
    }

    if (deadline_at !== undefined && deadline_at !== null) {
        const d = new Date(deadline_at);
        if (isNaN(d.getTime())) {
            return NextResponse.json(
                { error: "Invalid deadline timestamp" },
                { status: 422 }
            );
        }
    }

    const slug = generateSlug(title);

    try {
        const db = await openDb();

        return new Promise((resolve) => {
            db.get(
                `
                SELECT id FROM problem WHERE slug = ?
                `,
                [slug],
                (err, row) => {
                    if (err) {
                        db.close();
                        resolve(
                            NextResponse.json(
                                { error: "Failed to validate problem uniqueness" },
                                { status: 500 }
                            )
                        );
                        return;
                    }

                    if (row) {
                        db.close();
                        resolve(
                            NextResponse.json(
                                { error: "A problem with this title already exists" },
                                { status: 409 }
                            )
                        );
                        return;
                    }

                    db.run(
                        `
                        INSERT INTO problem
                        (title, slug, statement, setter_id, deadline_at, time_limit_ms, memory_limit_kb, visibility)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `,
                        [
                            title,
                            slug,
                            statement,
                            session.userId,
                            deadline_at ?? null,
                            time_limit_ms ?? 1024,
                            memory_limit_kb ?? 262144,
                            visibility ?? "public",
                        ],
                        function (err) {
                            if (err) {
                                db.close();
                                resolve(
                                    NextResponse.json(
                                        { error: "Failed to create problem" },
                                        { status: 500 }
                                    )
                                );
                                return;
                            }

                            const problemId = this.lastID;
                            let completed = 0;
                            let failed = false;

                            testcases.forEach((t, i) => {
                                db.run(
                                    `
                                    INSERT INTO testcase
                                    (problem_id, input_data, output_data, weight, is_sample)
                                    VALUES (?, ?, ?, ?, ?)
                                    `,
                                    [
                                        problemId,
                                        t.input,
                                        t.output,
                                        t.weight ?? 1,
                                        t.is_sample === true || i === 0 ? 1 : 0,
                                    ],
                                    (err) => {
                                        if (failed) return;

                                        if (err) {
                                            failed = true;
                                            db.close();
                                            resolve(
                                                NextResponse.json(
                                                    { error: "Failed to insert testcases" },
                                                    { status: 500 }
                                                )
                                            );
                                            return;
                                        }

                                        completed++;
                                        if (completed === testcases.length) {
                                            db.close();
                                            resolve(
                                                NextResponse.json(
                                                    {
                                                        id: problemId,
                                                        slug,
                                                    },
                                                    { status: 201 }
                                                )
                                            );
                                        }
                                    }
                                );
                            });
                        }
                    );
                }
            );
        });
    } catch {
        return NextResponse.json(
            { error: "Database unavailable" },
            { status: 503 }
        );
    }
}
