"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DataTable, ColumnDef } from "@/app/components/DataTable";
import { getLanguageLabel } from "@/lib/constants/languages";
import { formatLocalDateTime } from "@/lib/datetime";

type Submission = {
    id: number;
    problem_title: string;
    problem_slug: string;
    language: string;
    status: string;
    score: number;
    total_score: number;
    execution_time_ms: number | null;
    created_at: string;
};

const statusLabels: Record<string, string> = {
    accepted: "Accepted",
    rejected: "Rejected",
};

export default function SubmissionsPage() {
    const router = useRouter();
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchSubmissions() {
            try {
                const res = await fetch("/api/submissions");
                if (res.status === 401) {
                    router.push("/login");
                    return;
                }
                if (!res.ok) {
                    let data: { error?: string } = {};
                    try {
                        data = await res.json();
                    } catch {
                        throw new Error("Failed to load submissions");
                    }
                    throw new Error(data.error || "Failed to load submissions");
                }
                const data = await res.json();
                setSubmissions(data.submissions);
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Failed to load submissions"
                );
            }
        }
        fetchSubmissions();
    }, [router]);

    const columns: ColumnDef<Submission>[] = [
        {
            key: "problem_title",
            header: "Problem",
        },
        {
            key: "language",
            header: "Language",
            render: (submission) => getLanguageLabel(submission.language),
        },
        {
            key: "status",
            header: "Status",
            render: (submission) => (
                <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${submission.status === "accepted"
                        ? "bg-green-100 text-green-700"
                        : submission.status === "rejected"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                >
                    {statusLabels[submission.status] || submission.status}
                </span>
            ),
        },
        {
            key: "score",
            header: "Score",
            render: (submission) => `${submission.score} / ${submission.total_score}`,
        },
        {
            key: "created_at",
            header: "Submitted",
            render: (submission) => formatLocalDateTime(submission.created_at),
        },
    ];

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
            <h1 className="text-2xl font-semibold">Submissions</h1>

            <DataTable
                data={submissions}
                columns={columns}
                keyExtractor={(submission) => submission.id}
                onRowClick={(submission) =>
                    router.push(`/problems/${submission.problem_slug}`)
                }
                rowClassName="cursor-pointer"
                defaultSortKey="created_at"
                defaultSortDirection="desc"
                pagination={{ enabled: true, rowsPerPage: 8 }}
                emptyState={
                    <div className="py-8 text-muted-foreground">No submissions yet.</div>
                }
            />
        </div>
    );
}
