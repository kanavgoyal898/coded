import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";
import { getSessionUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

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
    solvers?: string[];
}

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
const MAX_EMAIL_LENGTH = 256;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SOLVERS = 1000;

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

function openDb(): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
        const dbPath = path.join(process.cwd(), "database.db");
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
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

function validateEmail(email: string): boolean {
    if (!email || typeof email !== "string") {
        return false;
    }

    if (email.length > MAX_EMAIL_LENGTH) {
        return false;
    }

    return EMAIL_REGEX.test(email);
}

export async function POST(req: NextRequest) {
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
            { error: "Insufficient permissions. Setter or admin role required to create problems." },
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

    const problemData = body as Partial<ProblemBody>;

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

    const title = problemData.title.trim();
    const statement = problemData.statement.trim();
    const testcases = problemData.testcases;
    const time_limit_ms = problemData.time_limit_ms;
    const memory_limit_kb = problemData.memory_limit_kb;
    const visibility = problemData.visibility;
    const deadline_at = problemData.deadline_at;
    const solvers = problemData.solvers;

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

    const validatedSolvers: string[] = [];
    if (visibility === "private" && solvers) {
        if (!Array.isArray(solvers)) {
            return NextResponse.json(
                { error: "Solvers must be an array of email addresses." },
                { status: 422 }
            );
        }

        if (solvers.length > MAX_SOLVERS) {
            return NextResponse.json(
                { error: `Maximum of ${MAX_SOLVERS} solvers allowed.` },
                { status: 422 }
            );
        }

        for (const email of solvers) {
            if (typeof email !== "string") {
                return NextResponse.json(
                    { error: "All solver emails must be strings." },
                    { status: 422 }
                );
            }

            const trimmedEmail = email.trim().toLowerCase();

            if (!validateEmail(trimmedEmail)) {
                return NextResponse.json(
                    { error: `Invalid email address: ${email}` },
                    { status: 422 }
                );
            }

            if (!validatedSolvers.includes(trimmedEmail)) {
                validatedSolvers.push(trimmedEmail);
            }
        }

        if (visibility === "private" && validatedSolvers.length === 0) {
            return NextResponse.json(
                { error: "Private problems must have at least one solver specified." },
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
                "SELECT id FROM problem WHERE slug = ?",
                [slug],
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
                                closeDb(db!).catch(() => { });

                                const errorMsg = (err as Error).message || "";

                                if (errorMsg.includes("UNIQUE") || errorMsg.includes("constraint")) {
                                    resolve(
                                        NextResponse.json(
                                            { error: "A problem with this title already exists. Please use a different title." },
                                            { status: 409 }
                                        )
                                    );
                                    return;
                                }

                                if (errorMsg.includes("FOREIGN KEY")) {
                                    resolve(
                                        NextResponse.json(
                                            { error: "Invalid user reference. Please log in again." },
                                            { status: 400 }
                                        )
                                    );
                                    return;
                                }

                                resolve(
                                    NextResponse.json(
                                        { error: "Failed to create problem. Please try again." },
                                        { status: 500 }
                                    )
                                );
                                return;
                            }

                            if (!this || typeof this.lastID !== "number") {
                                closeDb(db!).catch(() => { });
                                resolve(
                                    NextResponse.json(
                                        { error: "Failed to retrieve problem ID. Please try again." },
                                        { status: 500 }
                                    )
                                );
                                return;
                            }

                            const problemId = this.lastID;
                            let testcaseCompleted = 0;
                            let testcaseFailed = false;

                            if (!db) {
                                resolve(
                                    NextResponse.json(
                                        { error: "Database connection lost. Problem created but testcases not added." },
                                        { status: 500 }
                                    )
                                );
                                return;
                            }

                            for (let i = 0; i < testcases.length; i++) {
                                const t = testcases[i];

                                if (!db) {
                                    if (!testcaseFailed) {
                                        testcaseFailed = true;
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
                                        problemId,
                                        t.input,
                                        t.output,
                                        t.weight ?? 1,
                                        t.is_sample === true ? 1 : 0,
                                    ],
                                    (err) => {
                                        if (testcaseFailed) return;

                                        if (err) {
                                            testcaseFailed = true;
                                            closeDb(db!).catch(() => { });
                                            resolve(
                                                NextResponse.json(
                                                    { error: "Failed to insert testcases. Problem may be incomplete." },
                                                    { status: 500 }
                                                )
                                            );
                                            return;
                                        }

                                        testcaseCompleted++;

                                        if (testcaseCompleted === testcases.length) {
                                            if (visibility === "private" && validatedSolvers.length > 0) {
                                                insertSolvers();
                                            } else {
                                                closeDb(db!).catch(() => { });
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
                                    }
                                );
                            }

                            function insertSolvers() {
                                let solverCompleted = 0;
                                let solverFailed = false;

                                for (const email of validatedSolvers) {
                                    if (!db) {
                                        if (!solverFailed) {
                                            solverFailed = true;
                                            resolve(
                                                NextResponse.json(
                                                    { error: "Database connection lost during solver insertion." },
                                                    { status: 500 }
                                                )
                                            );
                                        }
                                        return;
                                    }

                                    db.run(
                                        `INSERT INTO solver (problem_id, email) VALUES (?, ?)`,
                                        [problemId, email],
                                        (err) => {
                                            if (solverFailed) return;

                                            if (err) {
                                                solverFailed = true;
                                                closeDb(db!).catch(() => { });
                                                resolve(
                                                    NextResponse.json(
                                                        { error: "Failed to add solvers. Problem may be incomplete." },
                                                        { status: 500 }
                                                    )
                                                );
                                                return;
                                            }

                                            solverCompleted++;

                                            if (solverCompleted === validatedSolvers.length) {
                                                closeDb(db!).catch(() => { });
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
                                }
                            }
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
