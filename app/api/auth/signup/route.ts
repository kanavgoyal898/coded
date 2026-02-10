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

export async function POST(req: NextRequest) {
    try {
        const { name, email, password } = await req.json();

        if (!name || !email || !password) {
            return NextResponse.json(
                { error: "Name, email, and password are required" },
                { status: 400 },
            );
        }

        if (password.length < 6) {
            return NextResponse.json(
                { error: "Password must be at least 6 characters" },
                { status: 400 },
            );
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json(
                { error: "Invalid email address" },
                { status: 400 },
            );
        }

        const passwordHash = hashPassword(password);
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

                db.get(
                    "SELECT id FROM user WHERE email = ?",
                    [email.toLowerCase()],
                    (err, row) => {
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
                                    { error: "An account with this email already exists" },
                                    { status: 409 },
                                ),
                            );
                            return;
                        }

                        db.run(
                            `
                                INSERT INTO user (name, email, password, role)
                                VALUES (?, ?, ?, 'solver')`,
                            [name.trim(), email.toLowerCase(), passwordHash],
                            function (err) {
                                if (err) {
                                    db.close();
                                    resolve(
                                        NextResponse.json(
                                            { error: "Failed to create account" },
                                            { status: 500 },
                                        ),
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
                                            resolve(
                                                NextResponse.json(
                                                    { error: "Account created but login failed" },
                                                    { status: 500 },
                                                ),
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
                                    },
                                );
                            },
                        );
                    },
                );
            });
        });
    } catch (error) {
        console.error("Signup error:", error);
        return NextResponse.json(
            { error: "Failed to create account" },
            { status: 500 },
        );
    }
}
