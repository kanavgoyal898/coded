export type LanguageKey = "c" | "cpp" | "python";

interface LanguageConfig {
    label: string;
    extensions: string[];
    dockerImage: string;
    compileSuccessMessage: string;
    getCompileCommand: (encodedCode: string, tempFile: string) => string;
    getRunCommand: (encodedCode: string, tempFile: string) => string;
}

export const LANGUAGES: Record<LanguageKey, LanguageConfig> = {
    c: {
        label: "C",
        extensions: [".c"],
        dockerImage: "judge-c",
        compileSuccessMessage: "Compilation successful",

        getCompileCommand: (encodedCode, tempFile) =>
            `echo '${encodedCode}' | base64 -d > ${tempFile}.c && gcc ${tempFile}.c -o ${tempFile} 2>&1 && echo "Compilation successful" ; EXIT_CODE=$? ; rm -f ${tempFile}.c ${tempFile} ; exit $EXIT_CODE`,

        getRunCommand: (encodedCode, tempFile) =>
            `echo '${encodedCode}' | base64 -d > ${tempFile}.c && gcc ${tempFile}.c -o ${tempFile} 2>&1 && ${tempFile} ; EXIT_CODE=$? ; rm -f ${tempFile}.c ${tempFile} ; exit $EXIT_CODE`,
    },

    cpp: {
        label: "C++",
        extensions: [".cpp", ".cc", ".cxx"],
        dockerImage: "judge-cpp",
        compileSuccessMessage: "Compilation successful",

        getCompileCommand: (encodedCode, tempFile) =>
            `echo '${encodedCode}' | base64 -d > ${tempFile}.cpp && g++ ${tempFile}.cpp -o ${tempFile} 2>&1 && echo "Compilation successful" ; EXIT_CODE=$? ; rm -f ${tempFile}.cpp ${tempFile} ; exit $EXIT_CODE`,

        getRunCommand: (encodedCode, tempFile) =>
            `echo '${encodedCode}' | base64 -d > ${tempFile}.cpp && g++ ${tempFile}.cpp -o ${tempFile} 2>&1 && ${tempFile} ; EXIT_CODE=$? ; rm -f ${tempFile}.cpp ${tempFile} ; exit $EXIT_CODE`,
    },

    python: {
        label: "Python",
        extensions: [".py"],
        dockerImage: "judge-python",
        compileSuccessMessage: "Syntax check successful",

        getCompileCommand: (encodedCode, tempFile) =>
            `echo '${encodedCode}' | base64 -d > ${tempFile}.py && python3 -m py_compile ${tempFile}.py 2>&1 && echo "Syntax check successful" ; EXIT_CODE=$? ; rm -f ${tempFile}.py ; exit $EXIT_CODE`,

        getRunCommand: (encodedCode, tempFile) =>
            `echo '${encodedCode}' | base64 -d > ${tempFile}.py && python3 ${tempFile}.py ; EXIT_CODE=$? ; rm -f ${tempFile}.py ; exit $EXIT_CODE`,
    },
};

export const LANGUAGE_KEYS = Object.keys(LANGUAGES) as LanguageKey[];

export function getLanguageLabel(key: string): string {
    if (!key || typeof key !== "string") {
        return key;
    }

    const config = LANGUAGES[key as LanguageKey];
    return config?.label ?? key;
}

export function detectLanguage(file?: File): LanguageKey {
    if (!file || !file.name || typeof file.name !== "string") {
        return "c";
    }

    const name = file.name.toLowerCase();

    if (!name || name.length === 0) {
        return "c";
    }

    for (const [key, config] of Object.entries(LANGUAGES) as [
        LanguageKey,
        LanguageConfig,
    ][]) {
        if (config.extensions.some((ext) => name.endsWith(ext))) {
            return key;
        }
    }

    return "c";
}

export function isValidLanguage(lang: string): boolean {
    if (!lang || typeof lang !== "string") {
        return false;
    }
    return LANGUAGE_KEYS.includes(lang as LanguageKey);
}

export function getLanguageExtensions(lang: string): string[] {
    if (!lang || typeof lang !== "string") {
        return [];
    }

    const config = LANGUAGES[lang as LanguageKey];
    return config?.extensions ?? [];
}

export function getLanguageConfig(lang: string): LanguageConfig | null {
    if (!lang || typeof lang !== "string") {
        return null;
    }

    return LANGUAGES[lang as LanguageKey] ?? null;
}
