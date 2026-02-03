"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog"

export default function SubmitPage() {
  const [file, setFile] = useState<File | null>(null)
  const [score, setScore] = useState<{ score: number; total: number } | null>(null)
  const [open, setOpen] = useState(false)

  const submit = async () => {
    if (!file) {
      setScore({ score: 0, total: 0 })
      setOpen(true)
      return
    }

    const formData = new FormData()
    if (file) formData.append("file", file)

    try {
      const res = await fetch("/api/judge", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()
      setScore({ score: data.score, total: data.total })
      setOpen(true)
    } catch (error) {
      setScore({ score: 0, total: 0 })
      setOpen(true)
      console.error("Submission error:", error)
    }
  }

  return (
    <div className="mx-4 my-4">
      <div className="flex flex-row justify-center gap-4">
        <div>
          <Button variant="outline" onClick={() => document.getElementById("choose-file")?.click()}>
            {file ? file.name : "Upload File"}
          </Button>
          <input id="choose-file" type="file" accept=".c, .cpp, .py" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden"/>
        </div>

        <div>
          <Button onClick={submit}>Submit</Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submission Result</DialogTitle>
            <DialogDescription>
              {
                score ? score.total > 0
                  ? `Score: ${score.score} / ${score.total}`
                  : "No file selected or submission failed!"
                : "Processing..."}
            </DialogDescription>
          </DialogHeader>
          <div className="w-full flex justify-end">
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
