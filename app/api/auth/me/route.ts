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

export async function GET() {
    const session = await getSessionUser();

    if (!session) {
        return NextResponse.json({ user: null }, { status: 401 });
    }

    const dbPath = path.join(process.cwd(), "database.db");

    return new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                resolve(NextResponse.json({ user: null }, { status: 500 }));
                return;
            }

            db.get(
                "SELECT id, name, email, role FROM user WHERE id = ?",
                [session.userId],
                (err, user: UserRow) => {
                    db.close();

                    if (err || !user) {
                        resolve(NextResponse.json({ user: null }, { status: 401 }));
                        return;
                    }

                    resolve(NextResponse.json({ user }));
                }
            );
        });
    });
}