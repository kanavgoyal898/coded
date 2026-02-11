import sqlite3 from "sqlite3";
import path from "path";
import { randomUUID } from "crypto";
import { runContainer } from "./docker";
import { LANGUAGES, LanguageKey } from "./constants/languages";

const MAX_CODE_SIZE = 64 * 1024;
const MIN_USER_ID = 1;
const MIN_PROBLEM_ID = 1;
const MAX_TESTCASE_INPUT_SIZE = 1024 * 1024;
const MAX_TESTCASE_OUTPUT_SIZE = 1024 * 1024;

interface JudgeResult {
    score: number;
    total: number;
    status: string;
    compile_log?: string;
    runtime_log?: string;
    execution_time_ms?: number;
    submission_id?: number;
}

interface Testcase {
    id: number;
    input_data: string;
    output_data: string;
    weight: number | null;
    is_sample: number;
}

interface CompileResult {
    error?: string;
    log?: string;
}

async function compileCode(lang: string, code: string): Promise<CompileResult> {
    if (!lang || typeof lang !== "string" || lang.trim().length === 0) {
        return { error: "Language must be specified" };
    }

    const config = LANGUAGES[lang as LanguageKey];
    if (!config) {
        return { error: `Unsupported language: ${lang}` };
    }

    if (!code || typeof code !== "string" || code.trim().length === 0) {
        return { error: "Source code cannot be empty" };
    }

    if (Buffer.byteLength(code, "utf8") > MAX_CODE_SIZE) {
        return { error: `Source code exceeds maximum size of ${MAX_CODE_SIZE} bytes` };
    }

    try {
        const encodedCode = Buffer.from(code).toString("base64");
        const uuid = randomUUID().replace(/-/g, "");
        const tempFile = `/tmp/judge_${uuid}`;

        const result = await runContainer(
            config.dockerImage,
            config.getCompileCommand(encodedCode, tempFile),
            "",
            256,
            0.5,
            10000
        );

        return { log: result };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown compilation error";
        return { error: errorMsg };
    }
}

async function runCode(
    lang: string,
    code: string,
    input: string
): Promise<string> {
    if (!lang || typeof lang !== "string" || lang.trim().length === 0) {
        throw new Error("Language must be specified");
    }

    const config = LANGUAGES[lang as LanguageKey];
    if (!config) {
        throw new Error(`Unsupported language: ${lang}`);
    }

    if (!code || typeof code !== "string" || code.trim().length === 0) {
        throw new Error("Source code cannot be empty");
    }

    if (typeof input !== "string") {
        throw new Error("Input must be a string");
    }

    if (Buffer.byteLength(input, "utf8") > MAX_TESTCASE_INPUT_SIZE) {
        throw new Error(`Testcase input exceeds maximum size of ${MAX_TESTCASE_INPUT_SIZE} bytes`);
    }

    try {
        const encodedCode = Buffer.from(code).toString("base64");
        const uuid = randomUUID().replace(/-/g, "");
        const tempFile = `/tmp/judge_${uuid}`;

        return await runContainer(
            config.dockerImage,
            config.getRunCommand(encodedCode, tempFile),
            input,
            256,
            0.5,
            5000
        );
    } catch (error) {
        throw error;
    }
}

export async function judge(
    language: string,
    code: string,
    problemId: number,
    userId: number = 1
): Promise<JudgeResult> {
    if (!language || typeof language !== "string" || language.trim().length === 0) {
        return {
            score: 0,
            total: 0,
            status: "rejected",
            runtime_log: "Language must be specified",
        };
    }

    if (!LANGUAGES[language as LanguageKey]) {
        return {
            score: 0,
            total: 0,
            status: "rejected",
            runtime_log: `Unsupported language: ${language}`,
        };
    }

    if (!code || typeof code !== "string" || code.trim().length === 0) {
        return {
            score: 0,
            total: 0,
            status: "rejected",
            runtime_log: "Source code cannot be empty",
        };
    }

    if (Buffer.byteLength(code, "utf8") > MAX_CODE_SIZE) {
        return {
            score: 0,
            total: 0,
            status: "rejected",
            runtime_log: `Source code exceeds maximum size of ${MAX_CODE_SIZE} bytes`,
        };
    }

    if (!problemId || typeof problemId !== "number" || problemId < MIN_PROBLEM_ID || !Number.isInteger(problemId)) {
        return {
            score: 0,
            total: 0,
            status: "rejected",
            runtime_log: "Invalid problem ID",
        };
    }

    if (!userId || typeof userId !== "number" || userId < MIN_USER_ID || !Number.isInteger(userId)) {
        return {
            score: 0,
            total: 0,
            status: "rejected",
            runtime_log: "Invalid user ID",
        };
    }

    const dbPath = path.join(process.cwd(), "database.db");

    return new Promise((resolve) => {
        let db: sqlite3.Database | null = null;

        try {
            db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, async (err) => {
                if (err) {
                    resolve({
                        score: 0,
                        total: 0,
                        status: "rejected",
                        runtime_log: "Database connection failed",
                    });
                    return;
                }

                if (!db) {
                    resolve({
                        score: 0,
                        total: 0,
                        status: "rejected",
                        runtime_log: "Database initialization failed",
                    });
                    return;
                }

                db.all(
                    `
                        SELECT id, input_data, output_data, weight, is_sample
                        FROM testcase
                        WHERE problem_id = ?
                        ORDER BY id
                    `,
                    [problemId],
                    async (err, testcases: Testcase[]) => {
                        if (err) {
                            if (db) db.close();
                            resolve({
                                score: 0,
                                total: 0,
                                status: "rejected",
                                runtime_log: "Failed to retrieve testcases",
                            });
                            return;
                        }

                        if (!testcases || testcases.length === 0) {
                            if (db) db.close();
                            resolve({
                                score: 0,
                                total: 0,
                                status: "rejected",
                                runtime_log: "No testcases found for this problem",
                            });
                            return;
                        }

                        for (const tc of testcases) {
                            if (Buffer.byteLength(tc.input_data, "utf8") > MAX_TESTCASE_INPUT_SIZE) {
                                if (db) db.close();
                                resolve({
                                    score: 0,
                                    total: 0,
                                    status: "rejected",
                                    runtime_log: `Testcase ${tc.id} input exceeds maximum size`,
                                });
                                return;
                            }

                            if (Buffer.byteLength(tc.output_data, "utf8") > MAX_TESTCASE_OUTPUT_SIZE) {
                                if (db) db.close();
                                resolve({
                                    score: 0,
                                    total: 0,
                                    status: "rejected",
                                    runtime_log: `Testcase ${tc.id} output exceeds maximum size`,
                                });
                                return;
                            }
                        }

                        const hiddenTestcases = testcases.filter((tc) => !tc.is_sample);

                        if (hiddenTestcases.length === 0) {
                            if (db) db.close();
                            resolve({
                                score: 0,
                                total: 0,
                                status: "rejected",
                                runtime_log: "Problem must have at least one non-sample testcase",
                            });
                            return;
                        }

                        const totalWeight = hiddenTestcases.reduce((sum, tc) => {
                            const weight = tc.weight ?? 1;
                            if (typeof weight !== "number" || weight < 0) {
                                return sum;
                            }
                            return sum + weight;
                        }, 0);

                        if (totalWeight === 0) {
                            if (db) db.close();
                            resolve({
                                score: 0,
                                total: 0,
                                status: "rejected",
                                runtime_log: "Total weight of hidden testcases must be greater than zero",
                            });
                            return;
                        }

                        let earnedWeight = 0;
                        let allPassed = true;
                        let compileLogs = "";
                        let runtimeLogs = "";
                        const startTime = Date.now();

                        const compileResult = await compileCode(language, code);

                        if (compileResult.error) {
                            const executionTime = Date.now() - startTime;

                            if (!db) {
                                resolve({
                                    score: 0,
                                    total: totalWeight,
                                    status: "rejected",
                                    compile_log: compileResult.error,
                                    execution_time_ms: executionTime,
                                });
                                return;
                            }

                            db.run(
                                `
                                    INSERT INTO submission (
                                        user_id, problem_id, language, source_code,
                                        status, score, compile_log, execution_time_ms,
                                        finished_at
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                                `,
                                [
                                    userId,
                                    problemId,
                                    language,
                                    code,
                                    "rejected",
                                    0,
                                    "Compilation Error: " + compileResult.error,
                                    executionTime,
                                ],
                                function (err) {
                                    if (db) db.close();
                                    resolve({
                                        score: 0,
                                        total: totalWeight,
                                        status: "rejected",
                                        compile_log: compileResult.error,
                                        execution_time_ms: executionTime,
                                        submission_id: err ? undefined : this.lastID,
                                    });
                                }
                            );
                            return;
                        }

                        compileLogs = compileResult.log || "";

                        for (const testcase of testcases) {
                            if (!testcase.input_data && testcase.input_data !== "") {
                                allPassed = false;
                                runtimeLogs += `Testcase ${testcase.id}${testcase.is_sample ? " (sample)" : ""
                                    } has invalid input data\n\n`;
                                continue;
                            }

                            if (!testcase.output_data && testcase.output_data !== "") {
                                allPassed = false;
                                runtimeLogs += `Testcase ${testcase.id}${testcase.is_sample ? " (sample)" : ""
                                    } has invalid output data\n\n`;
                                continue;
                            }

                            try {
                                const output = await runCode(language, code, testcase.input_data);

                                const expected = testcase.output_data.trim();
                                const actual = output.trim();

                                if (actual === expected) {
                                    if (!testcase.is_sample) {
                                        const weight = testcase.weight ?? 1;
                                        if (typeof weight === "number" && weight > 0) {
                                            earnedWeight += weight;
                                        }
                                    }
                                } else {
                                    allPassed = false;
                                    runtimeLogs += `Testcase ${testcase.id}${testcase.is_sample ? " (sample)" : ""
                                        } failed\nExpected: "${expected}"\nGot: "${actual}"\n\n`;
                                }
                            } catch (error) {
                                allPassed = false;
                                const errorMsg = error instanceof Error ? error.message : "Unknown error";

                                runtimeLogs += `Testcase ${testcase.id}${testcase.is_sample ? " (sample)" : ""
                                    } - ${errorMsg.includes("timeout") || errorMsg.includes("timed out")
                                        ? "Time Limit Exceeded"
                                        : `Runtime Error: ${errorMsg}`
                                    }\n\n`;
                            }
                        }

                        const executionTime = Date.now() - startTime;
                        const finalStatus = allPassed ? "accepted" : "rejected";

                        if (!db) {
                            resolve({
                                score: earnedWeight,
                                total: totalWeight,
                                status: finalStatus,
                                compile_log: compileLogs,
                                runtime_log: runtimeLogs || undefined,
                                execution_time_ms: executionTime,
                            });
                            return;
                        }

                        db.run(
                            `
                                INSERT INTO submission (
                                    user_id, problem_id, language, source_code,
                                    status, score, compile_log, runtime_log,
                                    execution_time_ms, finished_at
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                            `,
                            [
                                userId,
                                problemId,
                                language,
                                code,
                                finalStatus,
                                earnedWeight,
                                compileLogs,
                                runtimeLogs || null,
                                executionTime,
                            ],
                            function (err) {
                                if (db) db.close();
                                resolve({
                                    score: earnedWeight,
                                    total: totalWeight,
                                    status: finalStatus,
                                    compile_log: compileLogs,
                                    runtime_log: runtimeLogs || undefined,
                                    execution_time_ms: executionTime,
                                    submission_id: err ? undefined : this.lastID,
                                });
                            }
                        );
                    }
                );
            });
        } catch (error) {
            if (db) {
                try {
                    db.close();
                } catch {
                }
            }
            resolve({
                score: 0,
                total: 0,
                status: "rejected",
                runtime_log: "Failed to initialize judging system",
            });
        }
    });
}
