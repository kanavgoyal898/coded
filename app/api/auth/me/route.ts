import { NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

interface UserRow {
    id: number;
    name: string;
    email: string;
    role: string;
}

export async function GET(): Promise<Response> {
    const session = await getSessionUser();

    if (!session) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const dbPath = path.join(process.cwd(), "database.db");

    return new Promise<Response>((resolve) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error("Me DB connection error:", err);
                resolve(
                    NextResponse.json(
                        { error: "Database connection failed" },
                        { status: 500 },
                    ),
                );
                return;
            }

            db.get(
                "SELECT id, name, email, role FROM user WHERE id = ?",
                [session.userId],
                (err, user: UserRow) => {
                    db.close();

                    if (err) {
                        console.error("Me DB query error:", err);
                        resolve(
                            NextResponse.json(
                                { error: "A database error occurred" },
                                { status: 500 },
                            ),
                        );
                        return;
                    }

                    if (!user) {
                        resolve(
                            NextResponse.json(
                                { error: "Account not found" },
                                { status: 401 },
                            ),
                        );
                        return;
                    }

                    resolve(NextResponse.json({ user }));
                },
            );
        });
    });
}
