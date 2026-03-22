"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { formatLocalDateTime } from "@/lib/datetime";

type Problem = {
  id: number;
  title: string;
  statement: string;
  setter_name: string;
  time_limit_ms: number;
  memory_limit_kb: number;
  deadline_at: string | null;
};

type SampleTestcase = {
  id: number;
  input_data: string;
  output_data: string;
};

type ApiResponse = {
  error?: string;
  problem?: Problem;
  samples?: SampleTestcase[];
};

type SubmitResponse = {
  error?: string;
  queued?: boolean;
};

const MAX_FILE_SIZE = 64 * 1024;
const ALLOWED_EXTENSIONS = [".c", ".cpp", ".cc", ".cxx", ".py"];

export default function SubmitProblemPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [problem, setProblem] = useState<Problem | null>(null);
  const [samples, setSamples] = useState<SampleTestcase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug || typeof slug !== "string" || slug.trim().length === 0) {
      setError("Invalid problem identifier.");
      setLoading(false);
      return;
    }

    async function fetchProblem() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/problems/${encodeURIComponent(slug)}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
        });

        let data: ApiResponse;
        try {
          data = await res.json();
        } catch {
          throw new Error("Invalid response from server. Please try again.");
        }

        if (res.status === 404) {
          throw new Error(data.error || "Problem not found. It may have been removed or made private.");
        }
        if (!res.ok) {
          throw new Error(data.error || "Failed to load problem. Please try again.");
        }
        if (!data.problem) {
          throw new Error("Invalid problem data received from server.");
        }

        const problemData = data.problem;
        if (!problemData.id || !problemData.title || !problemData.statement) {
          throw new Error("Incomplete problem data received from server.");
        }

        setProblem(problemData);
        setSamples(Array.isArray(data.samples) ? data.samples : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load problem. Please check your connection.");
      } finally {
        setLoading(false);
      }
    }

    fetchProblem();
  }, [slug]);

  const validateFile = (selectedFile: File | null): string | null => {
    if (!selectedFile) return "Please select a file.";
    if (!selectedFile.name || selectedFile.name.trim().length === 0) return "Selected file has an invalid name.";
    if (selectedFile.size === 0) return "Selected file is empty.";
    if (selectedFile.size > MAX_FILE_SIZE) return `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024}KB.`;

    const fileName = selectedFile.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext))) {
      return `Invalid file type. Allowed extensions: ${ALLOWED_EXTENSIONS.join(", ")}`;
    }
    return null;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFileError(null);

    if (!selectedFile) { setFile(null); return; }

    const validation = validateFile(selectedFile);
    if (validation) {
      setFileError(validation);
      setFile(null);
      e.target.value = "";
      return;
    }

    setFile(selectedFile);
  };

  const submit = async () => {
    if (!file || !problem) return;

    const validation = validateFile(file);
    if (validation) { setFileError(validation); return; }

    setSubmitting(true);
    setSubmissionError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("problem_id", problem.id.toString());

      const res = await fetch("/api/solve", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });

      if (res.status === 401) { router.push("/login"); return; }

      let data: SubmitResponse;
      try {
        data = await res.json();
      } catch {
        throw new Error("Invalid response from server. Please try again.");
      }

      if (!res.ok) {
        throw new Error(data.error || "Submission failed. Please try again.");
      }

      router.push("/submissions");
    } catch (err) {
      setSubmissionError(err instanceof Error ? err.message : "Unable to submit solution. Please check your connection.");
      setOpen(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-4 w-64 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-4 py-2">
          {error}
        </div>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-sm text-muted-foreground py-8 text-center">
          Problem data is unavailable.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      <h2 className="text-2xl font-semibold">Solve Problem</h2>

      <div className="space-y-2">
        <Label className="text-lg">{problem.title}</Label>
        <p className="text-xs text-muted-foreground">
          {problem.setter_name ? (<>Set by <b>{problem.setter_name}</b> • </>) : null}
          {problem.time_limit_ms} ms • {Math.floor(problem.memory_limit_kb / 1024)} MB
          {problem.deadline_at ? (
            <> • Deadline: {formatLocalDateTime(problem.deadline_at)}</>
          ) : null}
        </p>
      </div>

      <div className="min-h-lg py-2 text-sm whitespace-pre-wrap">
        {problem.statement}
      </div>

      {samples.length > 0 && (
        <div className="space-y-2">
          <Label>Sample Testcases</Label>

          {samples.map((s, i) => (
            <div key={s.id} className="py-2 space-y-2">
              <div className="text-sm font-medium">Sample {i + 1}</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Input</Label>
                  <pre className="bg-muted px-2 py-1 rounded text-sm font-mono whitespace-pre-wrap break-all">
                    {s.input_data}
                  </pre>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Output</Label>
                  <pre className="bg-muted px-2 py-1 rounded text-sm font-mono whitespace-pre-wrap break-all">
                    {s.output_data}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Label>Solution File</Label>

        {fileError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-4 py-2">
            {fileError}
          </div>
        )}

        <Button
          variant="outline"
          className="w-full"
          onClick={() => document.getElementById("file")?.click()}
          disabled={submitting}
        >
          {file ? file.name : "Choose File"}
        </Button>

        <input
          id="file"
          type="file"
          className="hidden"
          accept={ALLOWED_EXTENSIONS.join(",")}
          onChange={handleFileChange}
          disabled={submitting}
        />

        <Button
          className="w-full"
          disabled={!file || submitting}
          onClick={submit}
        >
          {submitting ? "Submitting..." : "Submit Solution"}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Submission Error</DialogTitle>
          </DialogHeader>
          <div className="text-sm mt-2">
            <div className="text-red-700 bg-red-50 border border-red-200 rounded px-4 py-2">
              {submissionError}
            </div>
          </div>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </div>
  );
}
