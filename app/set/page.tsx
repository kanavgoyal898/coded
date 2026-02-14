"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";

type Testcase = {
  input: string;
  output: string;
  weight?: number;
  is_sample?: boolean;
};

type ApiResponse = {
  id?: number;
  slug?: string;
  error?: string;
};

const MAX_TITLE_LENGTH = 256;
const MAX_STATEMENT_LENGTH = 64 * 1024;
const MAX_TESTCASE_INPUT_LENGTH = 16 * 1024;
const MAX_TESTCASE_OUTPUT_LENGTH = 16 * 1024;
const MAX_TESTCASES = 64;
const MIN_TIME_LIMIT = 1;
const MAX_TIME_LIMIT = 16 * 1024;
const MIN_MEMORY_LIMIT = 1;
const MAX_MEMORY_LIMIT = 16 * 1024 * 1024;
const MIN_WEIGHT = 0;
const MAX_WEIGHT = 100;

const formatNumbers = (value: string | number) => {
  return Number(value).toLocaleString('en-US');
};

export default function AddProblemPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [timeLimit, setTimeLimit] = useState("1024");
  const [memoryLimit, setMemoryLimit] = useState("262144");
  const [deadline, setDeadline] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [solvers, setSolvers] = useState("");
  const [testcases, setTestcases] = useState<Testcase[]>([
    { input: "", output: "", weight: 1, is_sample: true },
  ]);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const parseEmailList = (input: string): string[] => {
    if (!input || input.trim().length === 0) {
      return [];
    }

    const emails = input
      .split(/[,;\|\n\t]|[\s]{2,}/)
      .map((email) => email.trim())
      .filter((email) => email.length > 0);

    return [...new Set(emails)];
  };

  const validateForm = (): string | null => {
    if (!title || title.trim().length === 0) {
      return "Title is required.";
    }

    if (title.trim().length > MAX_TITLE_LENGTH) {
      return `Title exceeds maximum length of ${MAX_TITLE_LENGTH} characters.`;
    }

    if (!statement || statement.trim().length === 0) {
      return "Problem statement is required.";
    }

    if (statement.trim().length > MAX_STATEMENT_LENGTH) {
      return `Statement exceeds maximum length of ${MAX_STATEMENT_LENGTH} characters.`;
    }

    const timeLimitNum = parseInt(timeLimit);
    if (isNaN(timeLimitNum) || timeLimitNum < MIN_TIME_LIMIT || timeLimitNum > MAX_TIME_LIMIT) {
      return `Time limit must be between ${MIN_TIME_LIMIT} and ${MAX_TIME_LIMIT} ms.`;
    }

    const memoryLimitNum = parseInt(memoryLimit);
    if (isNaN(memoryLimitNum) || memoryLimitNum < MIN_MEMORY_LIMIT || memoryLimitNum > MAX_MEMORY_LIMIT) {
      return `Memory limit must be between ${MIN_MEMORY_LIMIT} and ${MAX_MEMORY_LIMIT} KB.`;
    }

    if (deadline && deadline.trim().length > 0) {
      const deadlineDate = new Date(deadline);
      if (isNaN(deadlineDate.getTime())) {
        return "Invalid deadline format.";
      }
    }

    if (testcases.length === 0) {
      return "At least one testcase is required.";
    }

    if (testcases.length > MAX_TESTCASES) {
      return `Maximum of ${MAX_TESTCASES} testcases allowed.`;
    }

    for (let i = 0; i < testcases.length; i++) {
      const tc = testcases[i];

      if (!tc.input && tc.input !== "") {
        return `Testcase ${i + 1}: Input is required.`;
      }

      if (!tc.output && tc.output !== "") {
        return `Testcase ${i + 1}: Output is required.`;
      }

      if (tc.input.length > MAX_TESTCASE_INPUT_LENGTH) {
        return `Testcase ${i + 1}: Input exceeds maximum length of ${MAX_TESTCASE_INPUT_LENGTH} characters.`;
      }

      if (tc.output.length > MAX_TESTCASE_OUTPUT_LENGTH) {
        return `Testcase ${i + 1}: Output exceeds maximum length of ${MAX_TESTCASE_OUTPUT_LENGTH} characters.`;
      }

      const weight = tc.weight ?? 1;
      if (typeof weight !== "number" || isNaN(weight) || weight < MIN_WEIGHT || weight > MAX_WEIGHT) {
        return `Testcase ${i + 1}: Weight must be between ${MIN_WEIGHT} and ${MAX_WEIGHT}.`;
      }
    }

    const hiddenTestcases = testcases.filter(tc => !tc.is_sample);
    if (hiddenTestcases.length === 0) {
      return "At least one non-sample testcase is required.";
    }

    const totalWeight = testcases.reduce((sum, tc) => {
      const weight = tc.weight ?? 1;
      return sum + (tc.is_sample ? 0 : weight);
    }, 0);

    if (totalWeight <= 0) {
      return "Total weight of hidden testcases must be greater than 0.";
    }

    if (visibility === "private") {
      const solverEmails = parseEmailList(solvers);
      if (solverEmails.length === 0) {
        return "Private problems must have at least one solver email specified.";
      }
    }

    return null;
  };

  const addTestcase = () => {
    if (testcases.length >= MAX_TESTCASES) {
      setValidationError(`Maximum of ${MAX_TESTCASES} testcases allowed.`);
      return;
    }

    setValidationError(null);
    setTestcases([
      ...testcases,
      { input: "", output: "", weight: 1, is_sample: false },
    ]);
  };

  const removeTestcase = (index: number) => {
    if (testcases.length <= 1) {
      setValidationError("At least one testcase is required.");
      return;
    }

    setValidationError(null);
    setTestcases(testcases.filter((_, i) => i !== index));
  };

  const updateTestcase = (
    index: number,
    field: "input" | "output" | "weight",
    value: string
  ) => {
    setValidationError(null);
    const updated = [...testcases];

    if (field === "weight") {
      const numValue = parseInt(value);
      updated[index][field] = isNaN(numValue) ? 0 : numValue;
    } else {
      updated[index][field] = value;
    }

    setTestcases(updated);
  };

  const toggleSample = (index: number) => {
    setValidationError(null);
    const updated = [...testcases];
    updated[index].is_sample = !updated[index].is_sample;
    setTestcases(updated);
  };

  const submitProblem = async () => {
    const validation = validateForm();
    if (validation) {
      setValidationError(validation);
      return;
    }

    setSubmitting(true);
    setValidationError(null);

    try {
      const solverEmails = visibility === "private" ? parseEmailList(solvers) : [];

      const res = await fetch("/api/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          title: title.trim(),
          statement: statement.trim(),
          time_limit_ms: parseInt(timeLimit),
          memory_limit_kb: parseInt(memoryLimit),
          deadline_at: deadline && deadline.trim().length > 0 ? deadline.trim() : null,
          visibility: visibility,
          solvers: solverEmails.length > 0 ? solverEmails : undefined,
          testcases: testcases.map(tc => ({
            input: tc.input,
            output: tc.output,
            weight: tc.weight ?? 1,
            is_sample: tc.is_sample === true,
          })),
        }),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (res.status === 403) {
        router.push("/submissions");
        return;
      }

      let data: ApiResponse;

      try {
        data = await res.json();
      } catch {
        throw new Error("Invalid response from server. Please try again.");
      }

      if (!res.ok) {
        setResult({ error: data.error || "Failed to create problem. Please try again." });
        setOpen(true);
        return;
      }

      if (!data.id || !data.slug) {
        setResult({ error: "Problem created but invalid response received." });
        setOpen(true);
        return;
      }

      setResult(data);
      setOpen(true);

      setTitle("");
      setStatement("");
      setTimeLimit("1024");
      setMemoryLimit("262144");
      setDeadline("");
      setVisibility("public");
      setSolvers("");
      setTestcases([{ input: "", output: "", weight: 1, is_sample: true }]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unable to create problem. Please check your connection.";
      setResult({ error: errorMessage });
      setOpen(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
      <h2 className="text-2xl font-semibold">Set Problem</h2>

      {validationError && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-4 py-2">
          {validationError}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="title-input">Title</Label>
        <Input
          id="title-input"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setValidationError(null);
          }}
          maxLength={MAX_TITLE_LENGTH}
          disabled={submitting}
          placeholder="Enter problem title"
        />
        <p className="text-xs text-muted-foreground">
          {formatNumbers(title.length)}/{formatNumbers(MAX_TITLE_LENGTH)} characters
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="statement-input">Problem Statement</Label>
        <Textarea
          id="statement-input"
          className="min-h-lg"
          value={statement}
          onChange={(e) => {
            setStatement(e.target.value);
            setValidationError(null);
          }}
          maxLength={MAX_STATEMENT_LENGTH}
          disabled={submitting}
          placeholder="Describe the problem in detail, including input/output format."
        />
        <p className="text-xs text-muted-foreground">
          {formatNumbers(statement.length)}/{formatNumbers(MAX_STATEMENT_LENGTH)} characters
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="time-limit-input">Time Limit (ms)</Label>
          <Input
            id="time-limit-input"
            type="number"
            value={timeLimit}
            onChange={(e) => {
              setTimeLimit(e.target.value);
              setValidationError(null);
            }}
            min={MIN_TIME_LIMIT}
            max={MAX_TIME_LIMIT}
            disabled={submitting}
          />
          <p className="text-xs text-muted-foreground">
            {formatNumbers(MIN_TIME_LIMIT)}-{formatNumbers(MAX_TIME_LIMIT)} ms
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="memory-limit-input">Memory Limit (KB)</Label>
          <Input
            id="memory-limit-input"
            type="number"
            value={memoryLimit}
            onChange={(e) => {
              setMemoryLimit(e.target.value);
              setValidationError(null);
            }}
            min={MIN_MEMORY_LIMIT}
            max={MAX_MEMORY_LIMIT}
            disabled={submitting}
          />
          <p className="text-xs text-muted-foreground">
            {formatNumbers(MIN_MEMORY_LIMIT)}-{formatNumbers(MAX_MEMORY_LIMIT)} KB
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="deadline-input">Deadline (GMT)</Label>
        <Input
          id="deadline-input"
          type="datetime-local"
          value={deadline}
          onChange={(e) => {
            setDeadline(e.target.value);
            setValidationError(null);
          }}
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="visibility-select">Visibility</Label>
        <Select
          value={visibility}
          onValueChange={(value: "public" | "private") => {
            setVisibility(value);
            setValidationError(null);
          }}
          disabled={submitting}
        >
          <SelectTrigger id="visibility-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Public - Visible to all users</SelectItem>
            <SelectItem value="private">Private - Visible only to specified users</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {visibility === "private" && (
        <div className="space-y-2">
          <Label htmlFor="solvers-input">Add email address(es)</Label>
          <Textarea
            id="solvers-input"
            className="min-h-24"
            value={solvers}
            onChange={(e) => {
              setSolvers(e.target.value);
              setValidationError(null);
            }}
            disabled={submitting}
            placeholder="user@example.com"
          />
          <p className="text-xs text-muted-foreground">
            {parseEmailList(solvers).length} email(s) specified
          </p>
        </div>
      )}

      <div className="font-semibold space-y-4">
        <Label>Testcases ({formatNumbers(testcases.length)}/{formatNumbers(MAX_TESTCASES)})</Label>

        {testcases.map((testcase, i) => (
          <div key={i} className="space-y-2 p-4 border rounded">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">
                Testcase {i + 1}
                {testcase.is_sample && (
                  <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                    Sample
                  </span>
                )}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleSample(i)}
                  disabled={submitting}
                >
                  {testcase.is_sample ? "Unmark Sample" : "Mark as Sample"}
                </Button>
                {testcases.length > 1 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeTestcase(i)}
                    disabled={submitting}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Input</Label>
                <Textarea
                  className="min-h-lg font-mono text-sm"
                  value={testcase.input}
                  onChange={(e) => updateTestcase(i, "input", e.target.value)}
                  maxLength={MAX_TESTCASE_INPUT_LENGTH}
                  disabled={submitting}
                  placeholder="Test input"
                />
                <p className="text-xs text-muted-foreground">
                  {formatNumbers(testcase.input.length)}/{formatNumbers(MAX_TESTCASE_INPUT_LENGTH)}
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Output</Label>
                <Textarea
                  className="min-h-lg font-mono text-sm"
                  value={testcase.output}
                  onChange={(e) => updateTestcase(i, "output", e.target.value)}
                  maxLength={MAX_TESTCASE_OUTPUT_LENGTH}
                  disabled={submitting}
                  placeholder="Expected output"
                />
                <p className="text-xs text-muted-foreground">
                  {formatNumbers(testcase.output.length)}/{formatNumbers(MAX_TESTCASE_OUTPUT_LENGTH)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Weight (points)</Label>
              <Input
                type="number"
                min={MIN_WEIGHT}
                max={MAX_WEIGHT}
                value={testcase.weight ?? 1}
                onChange={(e) => updateTestcase(i, "weight", e.target.value)}
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">
                {testcase.is_sample ? "Sample testcases don't contribute to score" : `${formatNumbers(MIN_WEIGHT)}-${formatNumbers(MAX_WEIGHT)} points`}
              </p>
            </div>
          </div>
        ))}

        <Button
          variant="outline"
          onClick={addTestcase}
          className="w-full"
          disabled={submitting || testcases.length >= MAX_TESTCASES}
        >
          + Add Testcase
        </Button>
      </div>

      <Button
        className="w-full"
        onClick={submitProblem}
        disabled={submitting}
      >
        {submitting ? "Creating Problem..." : "Add Problem"}
      </Button>

      <Dialog open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen && result?.id) {
          router.push("/activity");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{result?.id ? "Success" : "Error"}</DialogTitle>
            <DialogDescription asChild>
              {result?.id ? (
                <div className="space-y-2">
                  <div className="text-green-700">Problem created successfully!</div>
                  <div className="text-sm">
                    <strong>ID:</strong> {result.id}
                  </div>
                  <div className="text-sm">
                    <strong>Slug:</strong> {result.slug}
                  </div>
                  <div className="text-sm text-muted-foreground mt-2">
                    The problem is now available at /problems/{result.slug}
                  </div>
                </div>
              ) : (
                <div className="text-red-700">{result?.error}</div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </div>
  );
}
