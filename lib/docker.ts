import { spawn } from "child_process"

export async function runContainer(
    image: string,
    command: string,
    input: string,
    memoryMB = 256,
    cpuCores = 0.5,
    timeout = 5000
): Promise<string> {
    return new Promise((resolve, reject) => {
        const docker = spawn("docker", ["run", "--rm", "--memory", `${memoryMB}m`, "--cpus", `${cpuCores}`, "-i", image, "bash", "-c", command])

        let stdout = ""
        let stderr = ""

        docker.stdout.on("data", d => (stdout += d))
        docker.stderr.on("data", d => (stderr += d))

        docker.stdin.write(input)
        docker.stdin.end()

        const timer = setTimeout(() => {
            docker.kill("SIGKILL")
            reject(new Error("Container execution timed out"))
        }, timeout)

        docker.on("close", () => {
            clearTimeout(timer)
            resolve(stdout || stderr)
        })
    })
}
