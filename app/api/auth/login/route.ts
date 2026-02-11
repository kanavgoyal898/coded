import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";
import { verifyPassword, createToken, COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

interface UserRow {
    id: number;
    name: string;
    email: string;
    role: string;
    password: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
    try {
        const { email, password } = await req.json();

        if (!email || !password) {
            return NextResponse.json(
                { error: "Email and password are required" },
                { status: 400 }
            );
        }

        if (typeof email !== "string" || typeof password !== "string") {
            return NextResponse.json(
                { error: "Email and password must be strings" },
                { status: 400 }
            );
        }

        const trimmedEmail = email.trim().toLowerCase();

        if (!EMAIL_REGEX.test(trimmedEmail)) {
            return NextResponse.json(
                { error: "Invalid email address" },
                { status: 400 }
            );
        }

        const dbPath = path.join(process.cwd(), "database.db");

        return new Promise((resolve) => {
            const db = new sqlite3.Database(dbPath, (err) => {
                if (err) {
                    console.error("Login DB connection error:", err);
                    resolve(
                        NextResponse.json(
                            { error: "Database connection failed" },
                            { status: 500 }
                        )
                    );
                    return;
                }

                db.get(
                    "SELECT id, name, email, role, password FROM user WHERE email = ?",
                    [trimmedEmail],
                    (err, user: UserRow) => {
                        db.close();

                        if (err) {
                            console.error("Login DB query error:", err);
                            resolve(
                                NextResponse.json(
                                    { error: "A database error occurred" },
                                    { status: 500 }
                                )
                            );
                            return;
                        }

                        if (!user) {
                            resolve(
                                NextResponse.json(
                                    { error: "Invalid email or password" },
                                    { status: 401 }
                                )
                            );
                            return;
                        }

                        const valid = verifyPassword(password, user.password);
                        if (!valid) {
                            resolve(
                                NextResponse.json(
                                    { error: "Invalid email or password" },
                                    { status: 401 }
                                )
                            );
                            return;
                        }

                        const token = createToken(user.id, user.role);
                        const response = NextResponse.json({
                            user: {
                                id: user.id,
                                name: user.name,
                                email: user.email,
                                role: user.role,
                            },
                        });

                        response.cookies.set(COOKIE_NAME, token, {
                            httpOnly: true,
                            secure: process.env.NODE_ENV === "production",
                            sameSite: "lax",
                            maxAge: 60 * 60 * 24 * 7,
                            path: "/",
                        });

                        resolve(response);
                    }
                );
            });
        });
    } catch {
        return NextResponse.json(
            { error: "Request body is missing or malformed JSON" },
            { status: 400 }
        );
    }
}
