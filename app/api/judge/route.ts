import { judge } from "@/lib/judge"
import { NextRequest, NextResponse } from "next/server"

function detectLanguage(file?: File): string {
    if (file) {
        const name = file.name.toLowerCase()
        if (name.endsWith(".c")) return "c"
        if (name.endsWith(".cpp") || name.endsWith(".cc") || name.endsWith(".cxx")) return "cpp"
        if (name.endsWith(".py")) return "python"
    }

    return "c"
}

export async function POST(req: NextRequest) {
    const data = await req.formData()
    const file = data.get("file") as File | null

    let code = ""
    if (file) code = await file.text()

    const lang = detectLanguage(file || undefined)

    const result = await judge(lang, code || "")
    return NextResponse.json(result)
}
