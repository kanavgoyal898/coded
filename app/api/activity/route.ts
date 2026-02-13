import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";
import { getSessionUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_TITLE_LENGTH = 256;
const MAX_STATEMENT_LENGTH = 64 * 1024;
const MAX_TESTCASE_INPUT_LENGTH = 16 * 1024;
const MAX_TESTCASE_OUTPUT_LENGTH = 16 * 1024;
const MAX_TESTCASES = 64;
const MIN_TIME_LIMIT = 1;
const MAX_TIME_LIMIT = 16 * 1024;
const MIN_MEMORY_LIMIT = 1;
const MAX_MEMORY_LIMIT = 16 * 1024 * 1024;
const MIN_WEIGHT = 0;
const MAX_WEIGHT = 100;

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

interface ProblemDetails {
    id: number;
    title: string;
    slug: string;
    statement: string;
    time_limit_ms: number;
    memory_limit_kb: number;
    visibility: string;
    deadline_at: string | null;
    created_at: string;
}

interface Testcase {
    id: number;
    input_data: string;
    output_data: string;
    weight: number;
    is_sample: number;
}

interface TestcaseInput {
    input: string;
    output: string;
    weight?: number;
    is_sample?: boolean;
}

interface UpdateProblemBody {
    problem_id: number;
    title: string;
    statement: string;
    testcases: TestcaseInput[];
    time_limit_ms?: number;
    memory_limit_kb?: number;
    visibility?: "public" | "private";
    deadline_at?: string | null;
}

function generateSlug(title: string): string {
    if (!title || typeof title !== "string") {
        return "";
    }

    return title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function openDb(readOnly: boolean = true): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
        const dbPath = path.join(process.cwd(), "database.db");
        const flags = readOnly ? sqlite3.OPEN_READONLY : sqlite3.OPEN_READWRITE;
        const db = new sqlite3.Database(dbPath, flags, (err) => {
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

                        db!.get(
                            `
                            SELECT 
                                id, title, slug, statement, 
                                time_limit_ms, memory_limit_kb, 
                                visibility, deadline_at, created_at
                            FROM problem 
                            WHERE id = ?
                            `,
                            [parsedProblemId],
                            (err, problemDetails: ProblemDetails) => {
                                if (err) {
                                    closeDb(db!).catch(() => { });
                                    resolve(
                                        NextResponse.json(
                                            { error: "Failed to fetch problem details." },
                                            { status: 500 }
                                        )
                                    );
                                    return;
                                }

                                db!.all(
                                    `
                                    SELECT 
                                        id, input_data, output_data, 
                                        weight, is_sample
                                    FROM testcase 
                                    WHERE problem_id = ?
                                    ORDER BY id ASC
                                    `,
                                    [parsedProblemId],
                                    (err, testcases: Testcase[]) => {
                                        if (err) {
                                            closeDb(db!).catch(() => { });
                                            resolve(
                                                NextResponse.json(
                                                    { error: "Failed to fetch testcases." },
                                                    { status: 500 }
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

                                                resolve(NextResponse.json({ 
                                                    problem: problemDetails,
                                                    testcases: testcases || [],
                                                    submissions: submissions || [] 
                                                }));
                                            }
                                        );
                                    }
                                );
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

export async function PUT(req: NextRequest) {
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
            { error: "Invalid request format. Expected an object." },
            { status: 400 }
        );
    }

    const problemData = body as Partial<UpdateProblemBody>;

    if (!("problem_id" in problemData) || typeof problemData.problem_id !== "number") {
        return NextResponse.json(
            { error: "Problem ID is required and must be a number." },
            { status: 422 }
        );
    }

    if (!("title" in problemData) || typeof problemData.title !== "string") {
        return NextResponse.json(
            { error: "Title is required and must be a string." },
            { status: 422 }
        );
    }

    if (!("statement" in problemData) || typeof problemData.statement !== "string") {
        return NextResponse.json(
            { error: "Statement is required and must be a string." },
            { status: 422 }
        );
    }

    if (!("testcases" in problemData) || !Array.isArray(problemData.testcases)) {
        return NextResponse.json(
            { error: "Testcases are required and must be an array." },
            { status: 422 }
        );
    }

    const problem_id = problemData.problem_id;
    const title = problemData.title.trim();
    const statement = problemData.statement.trim();
    const testcases = problemData.testcases;
    const time_limit_ms = problemData.time_limit_ms;
    const memory_limit_kb = problemData.memory_limit_kb;
    const visibility = problemData.visibility;
    const deadline_at = problemData.deadline_at;

    if (title.length === 0) {
        return NextResponse.json(
            { error: "Title cannot be empty." },
            { status: 422 }
        );
    }

    if (title.length > MAX_TITLE_LENGTH) {
        return NextResponse.json(
            { error: `Title exceeds maximum length of ${MAX_TITLE_LENGTH} characters.` },
            { status: 422 }
        );
    }

    if (statement.length === 0) {
        return NextResponse.json(
            { error: "Statement cannot be empty." },
            { status: 422 }
        );
    }

    if (statement.length > MAX_STATEMENT_LENGTH) {
        return NextResponse.json(
            { error: `Statement exceeds maximum length of ${MAX_STATEMENT_LENGTH} characters.` },
            { status: 422 }
        );
    }

    if (testcases.length === 0) {
        return NextResponse.json(
            { error: "At least one testcase is required." },
            { status: 422 }
        );
    }

    if (testcases.length > MAX_TESTCASES) {
        return NextResponse.json(
            { error: `Maximum of ${MAX_TESTCASES} testcases allowed.` },
            { status: 422 }
        );
    }

    let hiddenTestcaseCount = 0;
    let totalWeight = 0;

    for (let i = 0; i < testcases.length; i++) {
        const t = testcases[i];

        if (!t || typeof t !== "object") {
            return NextResponse.json(
                { error: `Testcase ${i + 1}: Invalid testcase format.` },
                { status: 422 }
            );
        }

        if (typeof t.input !== "string") {
            return NextResponse.json(
                { error: `Testcase ${i + 1}: Input must be a string.` },
                { status: 422 }
            );
        }

        if (typeof t.output !== "string") {
            return NextResponse.json(
                { error: `Testcase ${i + 1}: Output must be a string.` },
                { status: 422 }
            );
        }

        if (t.input.length > MAX_TESTCASE_INPUT_LENGTH) {
            return NextResponse.json(
                { error: `Testcase ${i + 1}: Input exceeds maximum length of ${MAX_TESTCASE_INPUT_LENGTH} characters.` },
                { status: 422 }
            );
        }

        if (t.output.length > MAX_TESTCASE_OUTPUT_LENGTH) {
            return NextResponse.json(
                { error: `Testcase ${i + 1}: Output exceeds maximum length of ${MAX_TESTCASE_OUTPUT_LENGTH} characters.` },
                { status: 422 }
            );
        }

        const weight = t.weight ?? 1;

        if (typeof weight !== "number" || isNaN(weight) || !Number.isFinite(weight)) {
            return NextResponse.json(
                { error: `Testcase ${i + 1}: Weight must be a valid number.` },
                { status: 422 }
            );
        }

        if (!Number.isInteger(weight)) {
            return NextResponse.json(
                { error: `Testcase ${i + 1}: Weight must be an integer.` },
                { status: 422 }
            );
        }

        if (weight < MIN_WEIGHT || weight > MAX_WEIGHT) {
            return NextResponse.json(
                { error: `Testcase ${i + 1}: Weight must be between ${MIN_WEIGHT} and ${MAX_WEIGHT}.` },
                { status: 422 }
            );
        }

        const isSample = t.is_sample === true;

        if (!isSample) {
            hiddenTestcaseCount++;
            totalWeight += weight;
        }
    }

    if (hiddenTestcaseCount === 0) {
        return NextResponse.json(
            { error: "At least one non-sample testcase is required." },
            { status: 422 }
        );
    }

    if (totalWeight <= 0) {
        return NextResponse.json(
            { error: "Total weight of hidden testcases must be greater than zero." },
            { status: 422 }
        );
    }

    if (time_limit_ms !== undefined) {
        if (typeof time_limit_ms !== "number" || isNaN(time_limit_ms) || !Number.isFinite(time_limit_ms)) {
            return NextResponse.json(
                { error: "Time limit must be a valid number." },
                { status: 422 }
            );
        }

        if (!Number.isInteger(time_limit_ms)) {
            return NextResponse.json(
                { error: "Time limit must be an integer." },
                { status: 422 }
            );
        }

        if (time_limit_ms < MIN_TIME_LIMIT || time_limit_ms > MAX_TIME_LIMIT) {
            return NextResponse.json(
                { error: `Time limit must be between ${MIN_TIME_LIMIT} and ${MAX_TIME_LIMIT} ms.` },
                { status: 422 }
            );
        }
    }

    if (memory_limit_kb !== undefined) {
        if (typeof memory_limit_kb !== "number" || isNaN(memory_limit_kb) || !Number.isFinite(memory_limit_kb)) {
            return NextResponse.json(
                { error: "Memory limit must be a valid number." },
                { status: 422 }
            );
        }

        if (!Number.isInteger(memory_limit_kb)) {
            return NextResponse.json(
                { error: "Memory limit must be an integer." },
                { status: 422 }
            );
        }

        if (memory_limit_kb < MIN_MEMORY_LIMIT || memory_limit_kb > MAX_MEMORY_LIMIT) {
            return NextResponse.json(
                { error: `Memory limit must be between ${MIN_MEMORY_LIMIT} and ${MAX_MEMORY_LIMIT} KB.` },
                { status: 422 }
            );
        }
    }

    if (visibility !== undefined) {
        if (typeof visibility !== "string") {
            return NextResponse.json(
                { error: "Visibility must be a string." },
                { status: 422 }
            );
        }

        if (visibility !== "public" && visibility !== "private") {
            return NextResponse.json(
                { error: "Visibility must be either 'public' or 'private'." },
                { status: 422 }
            );
        }
    }

    if (deadline_at !== undefined && deadline_at !== null) {
        if (typeof deadline_at !== "string") {
            return NextResponse.json(
                { error: "Deadline must be a string or null." },
                { status: 422 }
            );
        }

        const deadlineDate = new Date(deadline_at);
        if (isNaN(deadlineDate.getTime())) {
            return NextResponse.json(
                { error: "Invalid deadline format. Expected ISO 8601 date string." },
                { status: 422 }
            );
        }
    }

    const slug = generateSlug(title);

    if (!slug || slug.length === 0) {
        return NextResponse.json(
            { error: "Unable to generate valid slug from title. Please use alphanumeric characters." },
            { status: 422 }
        );
    }

    if (slug.length > MAX_TITLE_LENGTH) {
        return NextResponse.json(
            { error: "Generated slug is too long. Please use a shorter title." },
            { status: 422 }
        );
    }

    let db: sqlite3.Database | null = null;

    try {
        db = await openDb(false);

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
                "SELECT setter_id, slug FROM problem WHERE id = ?",
                [problem_id],
                (err, problem: { setter_id: number; slug: string } | undefined) => {
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
                                { error: "You can only edit your own problems." },
                                { status: 403 }
                            )
                        );
                        return;
                    }

                    if (slug !== problem.slug) {
                        db!.get(
                            "SELECT id FROM problem WHERE slug = ? AND id != ?",
                            [slug, problem_id],
                            (err, row) => {
                                if (err) {
                                    closeDb(db!).catch(() => { });
                                    resolve(
                                        NextResponse.json(
                                            { error: "Failed to validate problem uniqueness. Please try again." },
                                            { status: 500 }
                                        )
                                    );
                                    return;
                                }

                                if (row) {
                                    closeDb(db!).catch(() => { });
                                    resolve(
                                        NextResponse.json(
                                            { error: "A problem with this title already exists. Please use a different title." },
                                            { status: 409 }
                                        )
                                    );
                                    return;
                                }

                                proceedWithUpdate();
                            }
                        );
                    } else {
                        proceedWithUpdate();
                    }

                    function proceedWithUpdate() {
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
                            `
                            UPDATE problem
                            SET title = ?, slug = ?, statement = ?, deadline_at = ?, 
                                time_limit_ms = ?, memory_limit_kb = ?, visibility = ?
                            WHERE id = ?
                            `,
                            [
                                title,
                                slug,
                                statement,
                                deadline_at ?? null,
                                time_limit_ms ?? 1024,
                                memory_limit_kb ?? 262144,
                                visibility ?? "public",
                                problem_id,
                            ],
                            function (err) {
                                if (err) {
                                    closeDb(db!).catch(() => { });
                                    resolve(
                                        NextResponse.json(
                                            { error: "Failed to update problem. Please try again." },
                                            { status: 500 }
                                        )
                                    );
                                    return;
                                }

                                db!.run(
                                    "DELETE FROM testcase WHERE problem_id = ?",
                                    [problem_id],
                                    (err) => {
                                        if (err) {
                                            closeDb(db!).catch(() => { });
                                            resolve(
                                                NextResponse.json(
                                                    { error: "Failed to update testcases. Please try again." },
                                                    { status: 500 }
                                                )
                                            );
                                            return;
                                        }

                                        let completed = 0;
                                        let failed = false;

                                        if (!db) {
                                            resolve(
                                                NextResponse.json(
                                                    { error: "Database connection lost. Problem updated but testcases not added." },
                                                    { status: 500 }
                                                )
                                            );
                                            return;
                                        }

                                        for (let i = 0; i < testcases.length; i++) {
                                            const t = testcases[i];

                                            if (!db) {
                                                if (!failed) {
                                                    failed = true;
                                                    resolve(
                                                        NextResponse.json(
                                                            { error: "Database connection lost during testcase insertion." },
                                                            { status: 500 }
                                                        )
                                                    );
                                                }
                                                return;
                                            }

                                            db.run(
                                                `
                                                INSERT INTO testcase
                                                (problem_id, input_data, output_data, weight, is_sample)
                                                VALUES (?, ?, ?, ?, ?)
                                                `,
                                                [
                                                    problem_id,
                                                    t.input,
                                                    t.output,
                                                    t.weight ?? 1,
                                                    t.is_sample === true ? 1 : 0,
                                                ],
                                                (err) => {
                                                    if (failed) return;

                                                    if (err) {
                                                        failed = true;
                                                        closeDb(db!).catch(() => { });
                                                        resolve(
                                                            NextResponse.json(
                                                                { error: "Failed to insert testcases. Problem may be incomplete." },
                                                                { status: 500 }
                                                            )
                                                        );
                                                        return;
                                                    }

                                                    completed++;

                                                    if (completed === testcases.length) {
                                                        closeDb(db!).catch(() => { });
                                                        resolve(
                                                            NextResponse.json(
                                                                {
                                                                    id: problem_id,
                                                                    slug,
                                                                },
                                                                { status: 200 }
                                                            )
                                                        );
                                                    }
                                                }
                                            );
                                        }
                                    }
                                );
                            }
                        );
                    }
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

    if (!problemId) {
        return NextResponse.json(
            { error: "Problem ID is required." },
            { status: 400 }
        );
    }

    const parsedProblemId = parseInt(problemId);
    if (isNaN(parsedProblemId)) {
        return NextResponse.json(
            { error: "Invalid problem ID." },
            { status: 400 }
        );
    }

    let db: sqlite3.Database | null = null;

    try {
        db = await openDb(false);

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
                (err, problem: { setter_id: number } | undefined) => {
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
                                { error: "You can only delete your own problems." },
                                { status: 403 }
                            )
                        );
                        return;
                    }

                    db!.run(
                        "DELETE FROM problem WHERE id = ?",
                        [parsedProblemId],
                        async (err) => {
                            if (db) await closeDb(db);

                            if (err) {
                                resolve(
                                    NextResponse.json(
                                        { error: "Failed to delete problem." },
                                        { status: 500 }
                                    )
                                );
                                return;
                            }

                            resolve(
                                NextResponse.json(
                                    { message: "Problem deleted successfully." },
                                    { status: 200 }
                                )
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
