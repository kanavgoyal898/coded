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

        getCompileCommand: (encodedCode, tempFile) => `
      echo '${encodedCode}' | base64 -d > ${tempFile}.c
      gcc ${tempFile}.c -o ${tempFile} 2>&1
      EXIT_CODE=$?
      rm -f ${tempFile}.c ${tempFile}
      if [ $EXIT_CODE -ne 0 ]; then exit 1; fi
      echo "Compilation successful"
    `,

        getRunCommand: (encodedCode, tempFile) => `
      echo '${encodedCode}' | base64 -d > ${tempFile}.c && \
      gcc ${tempFile}.c -o ${tempFile} >/dev/null 2>&1 && \
      ${tempFile}; \
      rm -f ${tempFile}.c ${tempFile}
    `,
    },

    cpp: {
        label: "C++",
        extensions: [".cpp", ".cc", ".cxx"],
        dockerImage: "judge-cpp",
        compileSuccessMessage: "Compilation successful",

        getCompileCommand: (encodedCode, tempFile) => `
      echo '${encodedCode}' | base64 -d > ${tempFile}.cpp
      g++ ${tempFile}.cpp -o ${tempFile} 2>&1
      EXIT_CODE=$?
      rm -f ${tempFile}.cpp ${tempFile}
      if [ $EXIT_CODE -ne 0 ]; then exit 1; fi
      echo "Compilation successful"
    `,

        getRunCommand: (encodedCode, tempFile) => `
      echo '${encodedCode}' | base64 -d > ${tempFile}.cpp && \
      g++ ${tempFile}.cpp -o ${tempFile} >/dev/null 2>&1 && \
      ${tempFile}; \
      rm -f ${tempFile}.cpp ${tempFile}
    `,
    },

    python: {
        label: "Python",
        extensions: [".py"],
        dockerImage: "judge-python",
        compileSuccessMessage: "Syntax check successful",

        getCompileCommand: (encodedCode, tempFile) => `
      echo '${encodedCode}' | base64 -d > ${tempFile}.py
      python3 -m py_compile ${tempFile}.py 2>&1
      EXIT_CODE=$?
      rm -f ${tempFile}.py
      if [ $EXIT_CODE -ne 0 ]; then exit 1; fi
      echo "Syntax check successful"
    `,

        getRunCommand: (encodedCode, tempFile) => `
      echo '${encodedCode}' | base64 -d > ${tempFile}.py && \
      python3 ${tempFile}.py; \
      rm -f ${tempFile}.py
    `,
    },
};

export const LANGUAGE_KEYS = Object.keys(LANGUAGES) as LanguageKey[];

export function getLanguageLabel(key: string): string {
    return LANGUAGES[key as LanguageKey]?.label ?? key;
}

export function detectLanguage(file?: File): LanguageKey {
    if (file) {
        const name = file.name.toLowerCase();
        for (const [key, config] of Object.entries(LANGUAGES) as [
            LanguageKey,
            LanguageConfig,
        ][]) {
            if (config.extensions.some((ext) => name.endsWith(ext))) {
                return key;
            }
        }
    }
    return "c";
}
