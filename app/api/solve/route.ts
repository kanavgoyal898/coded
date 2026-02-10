import { judge } from "@/lib/judge";
import { detectLanguage } from "@/lib/constants/languages";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const data = await req.formData();
        const file = data.get("file") as File | null;
        const problemIdStr = data.get("problem_id") as string | null;
        const userIdStr = data.get("user_id") as string | null;

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

        const userId = userIdStr ? parseInt(userIdStr) : null;

        if (!userId) {
            return NextResponse.json(
                { error: "user_id is required" },
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
        const result = await judge(lang, code, problemId, userId);

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