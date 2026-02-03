import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";

function generateSlug(title: string): string {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            title,
            statement,
            setter_id,
            testcases,
            time_limit_ms,
            memory_limit_kb,
            visibility,
        } = body;

        if (
            !title ||
            !statement ||
            !setter_id ||
            !testcases ||
            testcases.length === 0
        ) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 },
            );
        }

        const totalWeight = testcases.reduce(
            (sum, testcase) => sum + (testcase.weight || 1),
            0,
        );

        if (totalWeight <= 0) {
            return NextResponse.json(
                { error: "Total weight (credits) must be greater than zero" },
                { status: 400 },
            );
        }

        const slug = generateSlug(title);
        const dbPath = path.join(process.cwd(), "database.db");

        return new Promise((resolve) => {
            const db = new sqlite3.Database(dbPath, (err) => {
                if (err) {
                    resolve(
                        NextResponse.json(
                            { error: "Database connection failed" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                db.get("SELECT id FROM problem WHERE slug = ?", [slug], (err, row) => {
                    if (err) {
                        db.close();
                        resolve(
                            NextResponse.json({ error: "Database error" }, { status: 500 }),
                        );
                        return;
                    }

                    if (row) {
                        db.close();
                        resolve(
                            NextResponse.json(
                                { error: "A problem with this title already exists" },
                                { status: 409 },
                            ),
                        );
                        return;
                    }

                    db.run(
                        `
                            INSERT INTO problem (title, slug, statement, setter_id, time_limit_ms, memory_limit_kb, visibility)
                            VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            title,
                            slug,
                            statement,
                            setter_id,
                            time_limit_ms || 1024,
                            memory_limit_kb || 262144,
                            visibility || "public",
                        ],
                        function (err) {
                            if (err) {
                                db.close();
                                resolve(
                                    NextResponse.json(
                                        { error: "Failed to insert problem" },
                                        { status: 500 },
                                    ),
                                );
                                return;
                            }

                            const problemId = this.lastID;
                            let completed = 0;

                            for (let i = 0; i < testcases.length; i++) {
                                const testcase = testcases[i];
                                db.run(
                                    `
                                        INSERT INTO testcase (problem_id, input_data, output_data, weight, is_sample)
                                        VALUES (?, ?, ?, ?, ?)`,
                                    [
                                        problemId,
                                        testcase.input,
                                        testcase.output,
                                        testcase.weight || 1,
                                        (testcase.is_sample || i === 0) ? 1 : 0,
                                    ],
                                    (err) => {
                                        if (err) {
                                            console.error("Error inserting testcase:", err);
                                        }

                                        completed++;
                                        if (completed === testcases.length) {
                                            db.close();
                                            resolve(
                                                NextResponse.json({
                                                    id: problemId,
                                                    slug: slug,
                                                    message: "Problem added successfully",
                                                }),
                                            );
                                        }
                                    },
                                );
                            }
                        },
                    );
                });
            });
        });
    } catch (error) {
        console.error("Error adding problem:", error);
        return NextResponse.json(
            { error: "Failed to add problem" },
            { status: 500 },
        );
    }
}
