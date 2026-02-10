"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";

type Testcase = {
  input: string;
  output: string;
  weight?: number;
  is_sample?: boolean;
};

export default function AddProblemPage() {
  const [title, setTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [timeLimit, setTimeLimit] = useState("1024");
  const [memoryLimit, setMemoryLimit] = useState("262144");
  const [testcases, setTestcases] = useState<Testcase[]>([
    { input: "", output: "", weight: 1, is_sample: true },
  ]);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{
    id?: number;
    slug?: string;
    error?: string;
  } | null>(null);

  const addTestcase = () => {
    setTestcases([
      ...testcases,
      { input: "", output: "", weight: 1, is_sample: false },
    ]);
  };

  const removeTestcase = (index: number) => {
    if (testcases.length > 1) {
      setTestcases(testcases.filter((_, i) => i !== index));
    }
  };

  const updateTestcase = (
    index: number,
    field: "input" | "output" | "weight",
    value: string
  ) => {
    const updated = [...testcases];
    if (field === "weight") {
      updated[index][field] = parseInt(value) || 0;
    } else {
      updated[index][field] = value;
    }
    setTestcases(updated);
  };

  const toggleSample = (index: number) => {
    const updated = [...testcases];
    updated[index].is_sample = !updated[index].is_sample;
    setTestcases(updated);
  };

  const submitProblem = async () => {
    if (!title || !statement) {
      setResult({ error: "Title and statement are required" });
      setOpen(true);
      return;
    }

    if (
      testcases.length === 0 ||
      testcases.some((t) => !t.input || !t.output)
    ) {
      setResult({ error: "At least one valid testcase required" });
      setOpen(true);
      return;
    }

    const totalWeight = testcases.reduce(
      (sum, t) => sum + (Number(t.weight) || 0),
      0
    );

    if (totalWeight <= 0) {
      setResult({ error: "Total testcase weight must be greater than 0" });
      setOpen(true);
      return;
    }

    try {
      const res = await fetch("/api/problems/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          statement,
          time_limit_ms: parseInt(timeLimit),
          memory_limit_kb: parseInt(memoryLimit),
          testcases,
        }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setResult({ error: data.error || "Failed to add problem" });
      } else {
        setResult(data);
        setTitle("");
        setStatement("");
        setTimeLimit("1024");
        setMemoryLimit("262144");
        setTestcases([{ input: "", output: "", weight: 1, is_sample: true }]);
      }
      setOpen(true);
    } catch {
      setResult({ error: "Failed to add problem" });
      setOpen(true);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      <h2 className="text-2xl font-semibold">Set Problem</h2>

      <div className="space-y-2">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Problem Statement</Label>
        <Textarea
          className="min-h-lg"
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Time Limit (ms)</Label>
          <Input
            type="number"
            value={timeLimit}
            onChange={(e) => setTimeLimit(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Memory Limit (KB)</Label>
          <Input
            type="number"
            value={memoryLimit}
            onChange={(e) => setMemoryLimit(e.target.value)}
          />
        </div>
      </div>

      <div className="font-semibold space-y-4">
        <Label>Testcases</Label>

        {testcases.map((testcase, i) => (
          <div key={i} className="space-y-2">
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
                >
                  {testcase.is_sample ? "Unmark Sample" : "Mark as Sample"}
                </Button>
                {testcases.length > 1 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeTestcase(i)}
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
                  className="min-h-lg"
                  value={testcase.input}
                  onChange={(e) => updateTestcase(i, "input", e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Output</Label>
                <Textarea
                  className="min-h-lg"
                  value={testcase.output}
                  onChange={(e) => updateTestcase(i, "output", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Weight (points)</Label>
              <Input
                type="number"
                min="0"
                value={testcase.weight}
                onChange={(e) => updateTestcase(i, "weight", e.target.value)}
              />
            </div>
          </div>
        ))}

        <Button variant="outline" onClick={addTestcase} className="w-full">
          + Add Testcase
        </Button>
      </div>

      <Button className="w-full" onClick={submitProblem}>
        Add Problem
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{result?.id ? "Success" : "Error"}</DialogTitle>
            <DialogDescription asChild>
              {result?.id ? (
                <div className="space-y-2">
                  <div>Problem added successfully!</div>
                  <div className="text-sm">
                    <strong>ID:</strong> {result.id}
                  </div>
                  <div className="text-sm">
                    <strong>Slug:</strong> {result.slug}
                  </div>
                </div>
              ) : (
                <div>{result?.error}</div>
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