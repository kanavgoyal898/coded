import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import path from "path";
import { hashPassword, createToken, COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

interface UserRow {
    id: number;
    name: string;
    email: string;
    role: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 128;
const MAX_EMAIL_LENGTH = 256;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export async function POST(req: NextRequest) {
    try {
        const { name, email, password } = await req.json();

        if (!name || !email || !password) {
            return NextResponse.json(
                { error: "Name, email, and password are required" },
                { status: 400 }
            );
        }

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string"
        ) {
            return NextResponse.json(
                { error: "Name, email, and password must be strings" },
                { status: 400 }
            );
        }

        const trimmedName = name.trim();
        const trimmedEmail = email.trim().toLowerCase();

        if (!trimmedName) {
            return NextResponse.json(
                { error: "Name cannot be blank" },
                { status: 400 }
            );
        }

        if (trimmedName.length > MAX_NAME_LENGTH) {
            return NextResponse.json(
                { error: `Name must not exceed ${MAX_NAME_LENGTH} characters` },
                { status: 400 }
            );
        }

        if (trimmedEmail.length > MAX_EMAIL_LENGTH) {
            return NextResponse.json(
                { error: `Email must not exceed ${MAX_EMAIL_LENGTH} characters` },
                { status: 400 }
            );
        }

        if (!EMAIL_REGEX.test(trimmedEmail)) {
            return NextResponse.json(
                { error: "Invalid email address" },
                { status: 400 }
            );
        }

        if (password.length < MIN_PASSWORD_LENGTH) {
            return NextResponse.json(
                { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
                { status: 400 }
            );
        }

        if (password.length > MAX_PASSWORD_LENGTH) {
            return NextResponse.json(
                { error: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters` },
                { status: 400 }
            );
        }

        const passwordHash = hashPassword(password);
        const dbPath = path.join(process.cwd(), "database.db");

        return new Promise((resolve) => {
            const db = new sqlite3.Database(dbPath, (err) => {
                if (err) {
                    console.error("Signup DB connection error:", err);
                    resolve(
                        NextResponse.json(
                            { error: "Database connection failed" },
                            { status: 500 }
                        )
                    );
                    return;
                }

                db.get(
                    "SELECT id FROM user WHERE email = ?",
                    [trimmedEmail],
                    (err, row) => {
                        if (err) {
                            db.close();
                            console.error("Signup DB lookup error:", err);
                            resolve(
                                NextResponse.json(
                                    { error: "A database error occurred" },
                                    { status: 500 }
                                )
                            );
                            return;
                        }

                        if (row) {
                            db.close();
                            resolve(
                                NextResponse.json(
                                    { error: "An account with this email already exists" },
                                    { status: 409 }
                                )
                            );
                            return;
                        }

                        db.run(
                            `
                                INSERT INTO user (name, email, password, role)
                                VALUES (?, ?, ?, 'solver')
                            `,
                            [trimmedName, trimmedEmail, passwordHash],
                            function (err) {
                                if (err) {
                                    db.close();
                                    console.error("Signup DB insert error:", err);
                                    resolve(
                                        NextResponse.json(
                                            { error: "Failed to create account" },
                                            { status: 500 }
                                        )
                                    );
                                    return;
                                }

                                const userId = this.lastID;

                                db.get(
                                    "SELECT id, name, email, role FROM user WHERE id = ?",
                                    [userId],
                                    (err, user: UserRow) => {
                                        db.close();

                                        if (err || !user) {
                                            console.error("Signup post-insert fetch error:", err);
                                            resolve(
                                                NextResponse.json(
                                                    { error: "Account created but session could not be established" },
                                                    { status: 500 }
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
                            }
                        );
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
