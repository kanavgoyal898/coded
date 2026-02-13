"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DataTable, ColumnDef } from "@/app/components/DataTable";

type Problem = {
  id: number;
  title: string;
  slug: string;
  setter_name: string;
  deadline_at: string | null;
  time_limit_ms: number;
  memory_limit_kb: number;
  visibility: string;
  created_at: string;
};

export default function ProblemsPage() {
  const router = useRouter();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProblems() {
      try {
        const res = await fetch("/api/problems");
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (!res.ok) {
          let data: { error?: string } = {};
          try {
            data = await res.json();
          } catch {
            throw new Error("Failed to load problems");
          }
          throw new Error(data.error || "Failed to load problems");
        }
        const data = await res.json();
        setProblems(data.problems);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load problems"
        );
      } finally {
        setLoading(false);
      }
    }
    fetchProblems();
  }, [router]);

  const formatDeadline = (deadline: string | null) => {
    if (!deadline) return "—";
    const date = new Date(deadline.replace(" ", "T") + "Z");
    const now = new Date();
    const isPast = date < now;
    const formatted = date.toLocaleString();
    return (
      <span className={isPast ? "text-red-600 font-medium" : ""}>
        {formatted}
      </span>
    );
  };

  const columns: ColumnDef<Problem>[] = [
    {
      key: "title",
      header: "Title",
      cellClassName: "font-medium",
    },
    {
      key: "setter_name",
      header: "Setter",
      cellClassName: "text-muted-foreground",
    },
    {
      key: "deadline_at",
      header: "Deadline (GMT)",
      render: (problem) => formatDeadline(problem.deadline_at),
    },
    {
      key: "time_limit_ms",
      header: "Time Limit",
      render: (problem) => (
        <span className="font-mono text-sm">{problem.time_limit_ms} ms</span>
      ),
    },
    {
      key: "memory_limit_kb",
      header: "Memory Limit",
      render: (problem) => (
        <span className="font-mono text-sm">
          {(problem.memory_limit_kb / 1024).toFixed(0)} MB
        </span>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      render: (problem) => (
        <span className="text-muted-foreground text-sm">
          {new Date(problem.created_at).toLocaleDateString()}
        </span>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">Loading problems...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-4 py-2">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
      <h1 className="text-2xl font-semibold">Problems</h1>

      <DataTable
        data={problems}
        columns={columns}
        keyExtractor={(problem) => problem.id}
        onRowClick={(problem) => router.push(`/problems/${problem.slug}`)}
        defaultSortKey="deadline_at"
        defaultSortDirection="desc"
        pagination={{ enabled: true, rowsPerPage: 8 }}
        emptyState={
          <div className="py-8 text-muted-foreground">
            No problems available yet.
          </div>
        }
      />
    </div>
  );
}
