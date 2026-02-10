import sqlite3 from "sqlite3";
import path from "path";
import { randomUUID } from "crypto";
import { runContainer } from "./docker";
import { LANGUAGES, LanguageKey } from "./constants/languages";

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
    const config = LANGUAGES[lang as LanguageKey];
    if (!config) return { error: "Unsupported language" };

    const encodedCode = Buffer.from(code).toString("base64");
    const tempFile = `/tmp/judge_${randomUUID().replace(/-/g, "")}`;

    try {
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
        return {
            error: error instanceof Error ? error.message : "Compilation failed",
        };
    }
}

async function runCode(
    lang: string,
    code: string,
    input: string
): Promise<string> {
    const config = LANGUAGES[lang as LanguageKey];
    if (!config) throw new Error("Unsupported language");

    const encodedCode = Buffer.from(code).toString("base64");
    const tempFile = `/tmp/judge_${randomUUID().replace(/-/g, "")}`;

    return await runContainer(
        config.dockerImage,
        config.getRunCommand(encodedCode, tempFile),
        input,
        256,
        0.5,
        5000
    );
}

export async function judge(
    language: string,
    code: string,
    problemId: number,
    userId: number = 1
): Promise<JudgeResult> {
    const dbPath = path.join(process.cwd(), "database.db");

    return new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath, async (err) => {
            if (err) {
                resolve({
                    score: 0,
                    total: 0,
                    status: "rejected",
                    runtime_log: "Database connection failed",
                });
                return;
            }

            db.all(
                `SELECT id, input_data, output_data, weight, is_sample
                 FROM testcase
                 WHERE problem_id = ?
                 ORDER BY id`,
                [problemId],
                async (err, testcases: Testcase[]) => {
                    if (err || !testcases || testcases.length === 0) {
                        db.close();
                        resolve({
                            score: 0,
                            total: 0,
                            status: "rejected",
                            runtime_log: "No testcases found",
                        });
                        return;
                    }

                    const totalWeight = testcases
                        .filter((tc) => !tc.is_sample)
                        .reduce((sum, tc) => sum + (tc.weight || 1), 0);

                    let earnedWeight = 0;
                    let allPassed = true;
                    let compileLogs = "";
                    let runtimeLogs = "";
                    const startTime = Date.now();

                    const compileResult = await compileCode(language, code);
                    if (compileResult.error) {
                        const executionTime = Date.now() - startTime;

                        db.run(
                            `INSERT INTO submission (
                                user_id, problem_id, language, source_code,
                                status, score, compile_log, execution_time_ms,
                                finished_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
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
                                db.close();
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
                        try {
                            const output = await runCode(language, code, testcase.input_data);

                            const expected = testcase.output_data.trim();
                            const actual = output.trim();

                            if (actual === expected) {
                                if (!testcase.is_sample) {
                                    earnedWeight += testcase.weight || 1;
                                }
                            } else {
                                allPassed = false;
                                runtimeLogs += `Testcase ${testcase.id}${
                                    testcase.is_sample ? " (sample)" : ""
                                } failed\nExpected: "${expected}"\nGot: "${actual}"\n\n`;
                            }
                        } catch (error) {
                            allPassed = false;
                            const errorMsg =
                                error instanceof Error ? error.message : "Unknown error";

                            runtimeLogs += `Testcase ${testcase.id}${
                                testcase.is_sample ? " (sample)" : ""
                            } - ${
                                errorMsg.includes("timeout")
                                    ? "Time Limit Exceeded"
                                    : `Runtime Error: ${errorMsg}`
                            }\n\n`;
                        }
                    }

                    const executionTime = Date.now() - startTime;
                    const finalStatus = allPassed ? "accepted" : "rejected";

                    db.run(
                        `INSERT INTO submission (
                            user_id, problem_id, language, source_code,
                            status, score, compile_log, runtime_log,
                            execution_time_ms, finished_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
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
                            db.close();
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
    });
}
