import sqlite3 from "sqlite3";
import path from "path";
import { runContainer } from "./docker";

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
                `
                SELECT id, input_data, output_data, weight, is_sample
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
                            `
                            INSERT INTO submission (
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
                            const output = await runCode(
                                language,
                                code,
                                testcase.input_data
                            );

                            const expected = testcase.output_data.trim();
                            const actual = output.trim();

                            console.log(`Testcase ${testcase.id}:`);
                            console.log(`Expected: "${expected}"`);
                            console.log(`Got: "${actual}"`);
                            console.log(`Match: ${actual === expected}`);

                            if (actual === expected) {
                                if (!testcase.is_sample) {
                                    earnedWeight += testcase.weight || 1;
                                }
                            } else {
                                allPassed = false;
                                runtimeLogs += `Testcase ${testcase.id}${testcase.is_sample ? " (sample)" : ""
                                    } failed\nExpected: "${expected}"\nGot: "${actual}"\n\n`;
                            }
                        } catch (error) {
                            allPassed = false;
                            const errorMsg =
                                error instanceof Error ? error.message : "Unknown error";
                            
                            if (errorMsg.includes("timeout")) {
                                runtimeLogs += `Testcase ${testcase.id}${testcase.is_sample ? " (sample)" : ""
                                    } - Time Limit Exceeded\n\n`;
                            } else {
                                runtimeLogs += `Testcase ${testcase.id}${testcase.is_sample ? " (sample)" : ""
                                    } - Runtime Error: ${errorMsg}\n\n`;
                            }
                        }
                    }

                    const executionTime = Date.now() - startTime;

                    const finalStatus = allPassed ? "accepted" : "rejected";

                    db.run(
                        `
                        INSERT INTO submission (
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

interface CompileResult {
    error?: string;
    log?: string;
}

async function compileCode(
    lang: string,
    code: string
): Promise<CompileResult> {
    const encodedCode = Buffer.from(code).toString('base64');
    const tempFile = `/tmp/main`;

    try {
        switch (lang) {
            case "c": {
                const command = `
                    echo '${encodedCode}' | base64 -d > ${tempFile}.c
                    gcc ${tempFile}.c -o ${tempFile} 2>&1
                    EXIT_CODE=$?
                    if [ $EXIT_CODE -ne 0 ]; then
                        exit 1
                    fi
                    echo "Compilation successful"
                `;
                
                try {
                    const result = await runContainer(
                        "judge-c",
                        command,
                        "",
                        256,
                        0.5,
                        10000
                    );
                    return { log: result };
                } catch (error) {
                    return { 
                        error: error instanceof Error ? error.message : "Compilation failed" 
                    };
                }
            }
            case "cpp": {
                const command = `
                    echo '${encodedCode}' | base64 -d > ${tempFile}.cpp
                    g++ ${tempFile}.cpp -o ${tempFile} 2>&1
                    EXIT_CODE=$?
                    if [ $EXIT_CODE -ne 0 ]; then
                        exit 1
                    fi
                    echo "Compilation successful"
                `;
                
                try {
                    const result = await runContainer(
                        "judge-cpp",
                        command,
                        "",
                        256,
                        0.5,
                        10000
                    );
                    return { log: result };
                } catch (error) {
                    return { 
                        error: error instanceof Error ? error.message : "Compilation failed" 
                    };
                }
            }
            case "python": {
                const command = `
                    echo '${encodedCode}' | base64 -d > ${tempFile}.py
                    python3 -m py_compile ${tempFile}.py 2>&1
                    EXIT_CODE=$?
                    if [ $EXIT_CODE -ne 0 ]; then
                        exit 1
                    fi
                    echo "Syntax check successful"
                `;
                
                try {
                    const result = await runContainer(
                        "judge-python",
                        command,
                        "",
                        256,
                        0.5,
                        10000
                    );
                    return { log: result };
                } catch (error) {
                    return { 
                        error: error instanceof Error ? error.message : "Syntax check failed" 
                    };
                }
            }
            default:
                return { error: "Unsupported language" };
        }
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
    const encodedCode = Buffer.from(code).toString('base64');
    const tempFile = `/tmp/main`;

    try {
        switch (lang) {
            case "c": {
                const command = `
                    echo '${encodedCode}' | base64 -d > ${tempFile}.c && \
                    gcc ${tempFile}.c -o ${tempFile} >/dev/null 2>&1 && \
                    ${tempFile}
                `;
                
                return await runContainer(
                    "judge-c",
                    command,
                    input,
                    256,
                    0.5,
                    5000
                );
            }
            case "cpp": {
                const command = `
                    echo '${encodedCode}' | base64 -d > ${tempFile}.cpp && \
                    g++ ${tempFile}.cpp -o ${tempFile} >/dev/null 2>&1 && \
                    ${tempFile}
                `;
                
                return await runContainer(
                    "judge-cpp",
                    command,
                    input,
                    256,
                    0.5,
                    5000
                );
            }
            case "python": {
                const command = `
                    echo '${encodedCode}' | base64 -d > ${tempFile}.py && \
                    python3 ${tempFile}.py
                `;
                
                return await runContainer(
                    "judge-python",
                    command,
                    input,
                    256,
                    0.5,
                    5000
                );
            }
            default:
                throw new Error("Unsupported language");
        }
    } catch (error) {
        throw new Error(
            error instanceof Error ? error.message : "Execution failed"
        );
    }
}
