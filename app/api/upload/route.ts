import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    const session = await getSessionUser();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided." }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const extensionFromName = path.extname(file.name).toLowerCase();
        const extensionFromType = file.type.startsWith("image/") ? `.${file.type.split("/")[1]}` : "";
        const extension = extensionFromName || extensionFromType;
        const filename = `${randomUUID()}${extension}`;
        const uploadDir = path.join(process.cwd(), "public", "uploads");

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filePath = path.join(uploadDir, filename);
        await writeFile(filePath, buffer);

        return NextResponse.json({ filename, url: `/uploads/${filename}` });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Internal server error." }, { status: 500 });
    }
}
