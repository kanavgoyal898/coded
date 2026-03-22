import { judge } from "@/lib/judge";
import { detectLanguage, isValidLanguage } from "@/lib/constants/languages";
import { getSessionUserFromRequest } from "@/lib/auth";
import { judgeQueue } from "@/lib/queue";
import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 64 * 1024;
const MAX_PROBLEM_ID = 2 * 1024 * 1024 * 1024;
const MIN_PROBLEM_ID = 1;
const ALLOWED_EXTENSIONS = [".c", ".cpp", ".cc", ".cxx", ".py"];

interface ProblemAccessRow {
    deadline_at: string | null;
    visibility: string;
    setter_id: number;
}

function checkProblemAccess(
    problemId: number,
    userId: number,
    userEmail: string,
    userRole: string
): Promise<{ valid: boolean; error?: string }> {
    return new Promise((resolve) => {
        const dbPath = path.join(process.cwd(), "database.db");
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                resolve({ valid: false, error: "Database connection failed." });
                return;
            }

            db.get(
                `SELECT deadline_at, visibility, setter_id FROM problem WHERE id = ?`,
                [problemId],
                (err, row: ProblemAccessRow) => {
                    if (err) {
                        db.close();
                        resolve({ valid: false, error: "Failed to retrieve problem information." });
                        return;
                    }

                    if (!row) {
                        db.close();
                        resolve({ valid: false, error: "Problem not found." });
                        return;
                    }

                    if (row.deadline_at) {
                        const deadline = new Date(row.deadline_at);
                        const now = new Date();
                        if (now > deadline) {
                            db.close();
                            resolve({
                                valid: false,
                                error: "This problem's deadline has passed and is no longer accepting submissions.",
                            });
                            return;
                        }
                    }

                    if (row.visibility === "private") {
                        if (userRole === "admin" || row.setter_id === userId) {
                            db.close();
                            resolve({ valid: true });
                            return;
                        }

                        db.get(
                            "SELECT 1 FROM solver WHERE problem_id = ? AND email = ?",
                            [problemId, userEmail],
                            (err, solverRow) => {
                                db.close();
                                if (err) {
                                    resolve({ valid: false, error: "Failed to verify access permissions." });
                                    return;
                                }
                                if (!solverRow) {
                                    resolve({
                                        valid: false,
                                        error: "You do not have permission to submit solutions to this problem.",
                                    });
                                    return;
                                }
                                resolve({ valid: true });
                            }
                        );
                    } else {
                        db.close();
                        resolve({ valid: true });
                    }
                }
            );
        });
    });
}

export async function POST(req: NextRequest) {
    if (!req) {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

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

    let formData: FormData;
    try {
        formData = await req.formData();
    } catch {
        return NextResponse.json(
            { error: "Invalid request body. Expected multipart form data." },
            { status: 400 }
        );
    }

    if (!formData) {
        return NextResponse.json({ error: "Empty request body." }, { status: 400 });
    }

    const problemIdValue = formData.get("problem_id");
    if (!problemIdValue) {
        return NextResponse.json({ error: "Missing required field: problem_id." }, { status: 422 });
    }
    if (typeof problemIdValue !== "string") {
        return NextResponse.json({ error: "Problem ID must be a string value." }, { status: 422 });
    }
    const problemIdStr = problemIdValue.trim();
    if (problemIdStr.length === 0) {
        return NextResponse.json({ error: "Problem ID cannot be empty." }, { status: 422 });
    }
    const problemId = parseInt(problemIdStr, 10);
    if (isNaN(problemId) || !Number.isInteger(problemId)) {
        return NextResponse.json({ error: "Problem ID must be a valid integer." }, { status: 422 });
    }
    if (problemId < MIN_PROBLEM_ID || problemId > MAX_PROBLEM_ID) {
        return NextResponse.json(
            { error: `Problem ID must be between ${MIN_PROBLEM_ID} and ${MAX_PROBLEM_ID}.` },
            { status: 422 }
        );
    }

    const dbPath = path.join(process.cwd(), "database.db");
    const userEmail = await new Promise<string>((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) { reject(new Error("Database connection failed")); return; }
            db.get(
                "SELECT email FROM user WHERE id = ?",
                [session.userId],
                (err, row: { email: string } | undefined) => {
                    db.close();
                    if (err || !row) { reject(new Error("Failed to retrieve user information")); return; }
                    resolve(row.email);
                }
            );
        });
    }).catch(() => "");

    if (!userEmail) {
        return NextResponse.json({ error: "Failed to verify user information." }, { status: 500 });
    }

    const accessCheck = await checkProblemAccess(
        problemId,
        session.userId,
        userEmail,
        session.role || "solver"
    );
    if (!accessCheck.valid) {
        return NextResponse.json({ error: accessCheck.error }, { status: 403 });
    }

    const fileValue = formData.get("file");
    if (!fileValue) {
        return NextResponse.json({ error: "Missing required field: file." }, { status: 422 });
    }
    if (!(fileValue instanceof File)) {
        return NextResponse.json({ error: "File must be a valid file upload." }, { status: 422 });
    }
    const file = fileValue;
    if (!file.name || file.name.trim().length === 0) {
        return NextResponse.json({ error: "File must have a valid name." }, { status: 422 });
    }
    if (file.size === 0) {
        return NextResponse.json({ error: "File cannot be empty." }, { status: 422 });
    }
    if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
            { error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024}KB.` },
            { status: 422 }
        );
    }
    const fileName = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext))) {
        return NextResponse.json(
            { error: `Invalid file type. Allowed extensions: ${ALLOWED_EXTENSIONS.join(", ")}.` },
            { status: 422 }
        );
    }

    let code: string;
    try {
        code = await file.text();
    } catch {
        return NextResponse.json(
            { error: "Failed to read file contents. Please ensure the file is a valid text file." },
            { status: 400 }
        );
    }
    if (!code || code.trim().length === 0) {
        return NextResponse.json(
            { error: "File cannot be empty or contain only whitespace." },
            { status: 422 }
        );
    }
    if (Buffer.byteLength(code, "utf8") > MAX_FILE_SIZE) {
        return NextResponse.json(
            { error: `Code size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024}KB.` },
            { status: 422 }
        );
    }

    let lang: string;
    try {
        lang = detectLanguage(file);
    } catch {
        return NextResponse.json(
            { error: "Failed to detect programming language from file extension." },
            { status: 400 }
        );
    }
    if (!lang || !isValidLanguage(lang)) {
        return NextResponse.json(
            { error: `Unsupported programming language. Allowed languages: C, C++, Python.` },
            { status: 422 }
        );
    }

    const userId = session.userId;

    let submissionId: number;
    try {
        submissionId = await new Promise<number>((resolve, reject) => {
            const db = new sqlite3.Database(
                path.join(process.cwd(), "database.db"),
                sqlite3.OPEN_READWRITE,
                (err) => {
                    if (err) { reject(err); return; }
                    db.run(
                        `INSERT INTO submission (user_id, problem_id, language, source_code, status, score)
                         VALUES (?, ?, ?, ?, 'pending', 0)`,
                        [userId, problemId, lang, code],
                        function (err) {
                            db.close();
                            if (err) reject(err);
                            else resolve(this.lastID);
                        }
                    );
                }
            );
        });
    } catch {
        return NextResponse.json(
            { error: "Failed to record submission. Please try again." },
            { status: 500 }
        );
    }

    judgeQueue.enqueue(async () => {
        try {
            await judge(lang, code, problemId, userId, submissionId);
        } catch {
            const db = new sqlite3.Database(
                path.join(process.cwd(), "database.db"),
                sqlite3.OPEN_READWRITE,
                (err) => {
                    if (err) return;
                    db.run(
                        `UPDATE submission SET status = 'rejected', finished_at = datetime('now') WHERE id = ?`,
                        [submissionId],
                        () => db.close()
                    );
                }
            );
        }
    });

    return NextResponse.json({ queued: true }, { status: 202 });
}