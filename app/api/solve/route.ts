import { judge } from "@/lib/judge";
import { detectLanguage } from "@/lib/constants/languages";
import { getSessionUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    const session = getSessionUserFromRequest(req);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const data = await req.formData();
        const file = data.get("file") as File | null;
        const problemIdStr = data.get("problem_id") as string | null;

        if (!problemIdStr) {
            return NextResponse.json(
                { error: "problem_id is required" },
                { status: 400 }
            );
        }

        const problemId = parseInt(problemIdStr);
        if (isNaN(problemId)) {
            return NextResponse.json(
                { error: "Invalid problem_id" },
                { status: 400 }
            );
        }

        let code = "";
        if (file) {
            code = await file.text();
        }

        if (!code.trim()) {
            return NextResponse.json(
                { error: "No code provided" },
                { status: 400 }
            );
        }

        const lang = detectLanguage(file ?? undefined);
        const result = await judge(lang, code, problemId, session.userId);

        return NextResponse.json(result);
    } catch (error) {
        console.error("Judge error:", error);
        return NextResponse.json(
            {
                error: "Judging failed",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}