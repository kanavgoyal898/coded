"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog"

type Problem = {
  id: number
  title: string
  statement: string
  setter_name: string
  time_limit_ms: number
  memory_limit_kb: number
}

type SampleTestcase = {
  id: number
  input_data: string
  output_data: string
}

export default function SubmitProblemPage() {
  const params = useParams()
  const slug = params.slug as string

  const [problem, setProblem] = useState<Problem | null>(null)
  const [samples, setSamples] = useState<SampleTestcase[]>([])
  const [error, setError] = useState<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [score, setScore] = useState<{ score: number; total: number } | null>(null)
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function fetchProblem() {
      try {
        const res = await fetch(`/api/problems/${slug}`)
        if (!res.ok) throw new Error("Problem not found")
        const data = await res.json()
        setProblem(data.problem)
        setSamples(data.samples)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load problem")
      }
    }
    fetchProblem()
  }, [slug])

  const submit = async () => {
    if (!file || !problem) return
    setSubmitting(true)

    const formData = new FormData()
    formData.append("file", file)
    formData.append("problem_id", problem.id.toString())
    formData.append("user_id", "1")

    try {
      const res = await fetch("/api/solve", { method: "POST", body: formData })
      const data = await res.json()
      setScore({ score: data.score, total: data.total })
    } catch {
      setScore({ score: 0, total: 0 })
    } finally {
      setSubmitting(false)
      setOpen(true)
    }
  }

  if (error || !problem) {
    return <div className="text-center py-8 text-destructive text-sm">{error}</div>
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      <h2 className="text-2xl font-semibold">Solve Problem</h2>

      <div className="space-y-2">
        <Label className="text-lg">{problem.title}</Label>
        <p className="text-xs text-muted-foreground">
          Set by <b>{problem.setter_name}</b> • {problem.time_limit_ms} ms • {Math.floor(problem.memory_limit_kb / 1024)} MB
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
                  <pre className="bg-muted px-2 py-1 rounded text-sm font-mono whitespace-pre-wrap">
                    {s.input_data}
                  </pre>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Output</Label>
                  <pre className="bg-muted px-2 py-1 rounded text-sm font-mono whitespace-pre-wrap">
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

        <Button
          variant="outline"
          className="w-full"
          onClick={() => document.getElementById("file")?.click()}
        >
          {file ? file.name : "Choose File"}
        </Button>

        <input
          id="file"
          type="file"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />

        <Button className="w-full" disabled={!file || submitting} onClick={submit}>
          {submitting ? "Submitting..." : "Submit Solution"}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submission Result</DialogTitle>
            <DialogDescription className="text-sm">
              {score && score.total > 0 ? (
                <span className="text-base">
                  Score: <span className="font-semibold">{score.score}/{score.total}</span>
                </span>
              ) : (
                "Submission failed"
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </div>
  )
}