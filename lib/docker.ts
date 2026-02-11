import { spawn, ChildProcess } from "child_process";

let cleanupRegistered = false;

const MAX_MEMORY_MB = 1024;
const MIN_MEMORY_MB = 64;
const MAX_CPU_CORES = 2;
const MIN_CPU_CORES = 0.1;
const MAX_TIMEOUT_MS = 30000;
const MIN_TIMEOUT_MS = 1000;
const MAX_INPUT_SIZE = 10 * 1024 * 1024;

function dockerCleanup() {
    const cmds = [
        ["container", "prune", "-f"],
        ["image", "prune", "-af"],
        ["volume", "prune", "-f"],
        ["network", "prune", "-f"],
    ];

    for (const args of cmds) {
        try {
            spawn("docker", args, { stdio: "ignore" });
        } catch {
            continue;
        }
    }
}

function registerCleanup() {
    if (cleanupRegistered) return;
    cleanupRegistered = true;

    const handler = () => {
        dockerCleanup();
        process.exit();
    };

    process.on("SIGINT", handler);
    process.on("SIGTERM", handler);
    process.on("exit", dockerCleanup);
}

registerCleanup();

export async function runContainer(
    image: string,
    command: string,
    input: string,
    memoryMB = 256,
    cpuCores = 0.5,
    timeout = 5000
): Promise<string> {
    if (!image || typeof image !== "string" || image.trim().length === 0) {
        throw new Error("Docker image name must be a non-empty string");
    }

    if (!command || typeof command !== "string" || command.trim().length === 0) {
        throw new Error("Command must be a non-empty string");
    }

    if (typeof input !== "string") {
        throw new Error("Input must be a string");
    }

    if (Buffer.byteLength(input, "utf8") > MAX_INPUT_SIZE) {
        throw new Error(`Input size exceeds maximum allowed size of ${MAX_INPUT_SIZE} bytes`);
    }

    if (typeof memoryMB !== "number" || isNaN(memoryMB) || !isFinite(memoryMB)) {
        throw new Error("Memory limit must be a valid number");
    }

    if (memoryMB < MIN_MEMORY_MB || memoryMB > MAX_MEMORY_MB) {
        throw new Error(`Memory limit must be between ${MIN_MEMORY_MB}MB and ${MAX_MEMORY_MB}MB`);
    }

    if (typeof cpuCores !== "number" || isNaN(cpuCores) || !isFinite(cpuCores)) {
        throw new Error("CPU cores must be a valid number");
    }

    if (cpuCores < MIN_CPU_CORES || cpuCores > MAX_CPU_CORES) {
        throw new Error(`CPU cores must be between ${MIN_CPU_CORES} and ${MAX_CPU_CORES}`);
    }

    if (typeof timeout !== "number" || isNaN(timeout) || !isFinite(timeout) || timeout <= 0) {
        throw new Error("Timeout must be a positive number");
    }

    if (timeout < MIN_TIMEOUT_MS || timeout > MAX_TIMEOUT_MS) {
        throw new Error(`Timeout must be between ${MIN_TIMEOUT_MS}ms and ${MAX_TIMEOUT_MS}ms`);
    }

    return new Promise((resolve, reject) => {
        let docker: ChildProcess | null = null;
        let killed = false;
        let timer: NodeJS.Timeout | null = null;

        try {
            docker = spawn("docker", [
                "run",
                "--rm",
                "--memory", `${memoryMB}m`,
                "--cpus", `${cpuCores}`,
                "--network", "none",
                "--pids-limit", "100",
                "--ulimit", "nofile=64:64",
                "-i",
                image,
                "bash",
                "-c",
                command
            ], {
                timeout: timeout
            });
        } catch (error) {
            reject(new Error("Failed to spawn Docker container"));
            return;
        }

        if (!docker || !docker.stdin || !docker.stdout || !docker.stderr) {
            reject(new Error("Failed to initialize Docker container streams"));
            return;
        }

        let stdout = "";
        let stderr = "";
        let outputSize = 0;
        const MAX_OUTPUT_SIZE = 1024 * 1024;

        docker.stdout.on("data", (data) => {
            outputSize += data.length;
            if (outputSize > MAX_OUTPUT_SIZE) {
                if (!killed && docker) {
                    killed = true;
                    docker.kill("SIGKILL");
                    if (timer) clearTimeout(timer);
                    reject(new Error("Output size limit exceeded"));
                }
            } else {
                stdout += data;
            }
        });

        docker.stderr.on("data", (data) => {
            outputSize += data.length;
            if (outputSize > MAX_OUTPUT_SIZE) {
                if (!killed && docker) {
                    killed = true;
                    docker.kill("SIGKILL");
                    if (timer) clearTimeout(timer);
                    reject(new Error("Output size limit exceeded"));
                }
            } else {
                stderr += data;
            }
        });

        docker.on("error", (error) => {
            if (!killed) {
                killed = true;
                if (timer) clearTimeout(timer);
                reject(new Error(`Docker execution failed: ${error.message}`));
            }
        });

        try {
            docker.stdin.write(input);
            docker.stdin.end();
        } catch (error) {
            if (!killed && docker) {
                killed = true;
                docker.kill("SIGKILL");
                if (timer) clearTimeout(timer);
                reject(new Error("Failed to write input to container"));
            }
            return;
        }

        timer = setTimeout(() => {
            if (!killed && docker) {
                killed = true;
                docker.kill("SIGKILL");
                reject(new Error("Container execution timed out"));
            }
        }, timeout);

        docker.on("close", (code) => {
            if (timer) clearTimeout(timer);

            if (killed) {
                return;
            }

            if (code === null) {
                reject(new Error("Container process terminated abnormally"));
                return;
            }

            if (code !== 0 && stderr) {
                resolve(stderr);
                return;
            }

            resolve(stdout || stderr);
        });
    });
}
