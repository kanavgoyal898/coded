import fs from "fs"
import path from "path"
import { runContainer } from "./docker"

export async function judge(language: string, code: string) {
    const testsDir = path.join(process.cwd(), "testcases")
    const files = fs.readdirSync(testsDir).filter(f => f.endsWith(".in"))

    let score = 0

    for (const file of files) {
        const input = fs.readFileSync(path.join(testsDir, file), "utf-8")
        const expected = fs.readFileSync(path.join(testsDir, file.replace(".in", ".out")), "utf-8").trim()

        const output = await runCode(language, code, input)
        if (output?.trim() === expected) score++
    }

    return { score, total: files.length }
}

async function runCode(lang: string, code: string, input: string) {
    const tempFile = "/tmp/Main"

    switch (lang) {
        case "c":
            return runContainer("judge-c", `echo '${code}' > ${tempFile}.c && gcc ${tempFile}.c -o main && ./main`, input)
        case "cpp":
            return runContainer("judge-cpp", `echo '${code}' > ${tempFile}.cpp && g++ ${tempFile}.cpp -o main && ./main`, input)
        case "python":
            return runContainer("judge-python", `echo '${code}' > ${tempFile}.py && python3 ${tempFile}.py`, input)
    }
}
