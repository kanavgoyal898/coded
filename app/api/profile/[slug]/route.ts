import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import sqlite3 from "sqlite3";
import { promisify } from "util";
import path from "path";

export const runtime = "nodejs";

const dbPath = path.join(process.cwd(), "database.db");
const db = new sqlite3.Database(dbPath);
const dbGet = (query: string, params: any[] = []): Promise<any> => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const dbAll = (query: string, params: any[] = []): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
};

const dbRun = (query: string, params: any[] = []): Promise<any> => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

// avatar column is deprecated for setter/admin; stop creating or using it

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ slug: string }> } | { params: { slug: string } }
) {
    const session = await getSessionUser();

    let slug = "";
    if (context.params instanceof Promise) {
        const resolvedParams = await context.params;
        slug = resolvedParams.slug;
    } else {
        slug = context.params.slug;
    }

    try {
        const setter: any = await dbGet(`
            SELECT s.id, s.email, s.added_by, s.added_at, s.slug, s.name, s.contact, s.profile, s.socials, s.description, u.name as user_name
            FROM setter s
            LEFT JOIN user u ON s.email = u.email
            WHERE s.slug = ?
        `, [slug]);

        if (!setter) {
            return NextResponse.json({ error: "Setter not found." }, { status: 404 });
        }

        let is_owner = false;
        if (session) {
            const user: any = await dbGet(`SELECT email, role FROM user WHERE id = ?`, [session.userId]);
            if (user && (user.email === setter.email || user.role === 'admin')) {
                is_owner = true;
            }
        }

        return NextResponse.json({ setter, is_owner });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Internal server error." }, { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ slug: string }> } | { params: { slug: string } }
) {
    const session = await getSessionUser();

    let slug = "";
    if (context.params instanceof Promise) {
        const resolvedParams = await context.params;
        slug = resolvedParams.slug;
    } else {
        slug = context.params.slug;
    }

    if (!session) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    try {
        
        const user: any = await dbGet(`SELECT email, role FROM user WHERE id = ?`, [session.userId]);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
        }

        const setter: any = await dbGet(`SELECT email FROM setter WHERE slug = ?`, [slug]);
        if (!setter) {
            return NextResponse.json({ error: "Setter not found." }, { status: 404 });
        }

        if (setter.email !== user.email && user.role !== 'admin') {
            return NextResponse.json({ error: "Forbidden." }, { status: 403 });
        }

        const body = await req.json();
        const { contact, profile, socials, description, name } = body;

        await dbRun(`
            UPDATE setter
            SET contact = ?, profile = ?, socials = ?, description = ?, name = ?
            WHERE slug = ?
        `, [contact, profile, socials, description, name, slug]);

        await dbRun(`
            UPDATE user
            SET name = ?
            WHERE email = ?
        `, [name, setter.email]);

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Internal server error." }, { status: 500 });
    }
}
