"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DataTable, ColumnDef } from "@/app/components/DataTable";
import { formatLocalDateTime } from "@/lib/datetime";
import { getLanguageLabel } from "@/lib/constants/languages";

type Submission = {
    id: number;
    problem_id: number;
    problem_title: string;
    problem_slug: string;
    language: string;
    status: string;
    score: number;
    total_score: number;
    execution_time_ms: number | null;
    created_at: string;
};

const statusDisplay = (status: string) => {
    if (status === "accepted") return { label: "Accepted", className: "bg-green-100 text-green-700" };
    if (status === "rejected") return { label: "Rejected", className: "bg-red-100 text-red-700" };
    return { label: "Pending", className: "bg-yellow-100 text-yellow-700" };
};

export default function SubmissionsPage() {
    const router = useRouter();
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchSubmissions = async () => {
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

                }
                throw new Error(data.error || "Failed to load submissions");
            }
            const data = await res.json();
            setSubmissions(data.submissions || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load submissions");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSubmissions();
    }, []);

    useEffect(() => {
        const hasPending = submissions.some((s) => s.status === "pending");
        if (!hasPending) return;
        const timer = setTimeout(fetchSubmissions, 3000);
        return () => clearTimeout(timer);
    }, [submissions]);

    const columns: ColumnDef<Submission>[] = [
        {
            key: "problem_title",
            header: "Problem",
            cellClassName: "font-medium",
            render: (s) => (
                <button
                    className="text-left hover:underline"
                    onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/problems/${s.problem_slug}`);
                    }}
                >
                    {s.problem_title}
                </button>
            ),
        },
        {
            key: "language",
            header: "Language",
            render: (s) => getLanguageLabel(s.language),
        },
        {
            key: "status",
            header: "Status",
            render: (s) => {
                const { label, className } = statusDisplay(s.status);
                return (
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${className}`}>
                        {label}
                    </span>
                );
            },
        },
        {
            key: "score",
            header: "Score",
            render: (s) =>
                s.status === "pending" ? (
                    <span className="text-muted-foreground">—</span>
                ) : (
                    `${s.score} / ${s.total_score}`
                ),
        },
        {
            key: "execution_time_ms",
            header: "Time",
            render: (s) =>
                s.execution_time_ms != null ? (
                    <span className="font-mono text-sm">{s.execution_time_ms} ms</span>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            key: "created_at",
            header: "Submitted",
            render: (s) => (
                <span className="text-muted-foreground text-sm">
                    {formatLocalDateTime(s.created_at)}
                </span>
            ),
        },
    ];

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="flex items-center justify-center py-12">
                    <div className="text-muted-foreground">Loading submissions...</div>
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
            <h1 className="text-2xl font-semibold">Submissions</h1>

            <DataTable
                data={submissions}
                columns={columns}
                keyExtractor={(s) => s.id}
                defaultSortKey="created_at"
                defaultSortDirection="desc"
                pagination={{ enabled: true, rowsPerPage: 10 }}
                emptyState={
                    <div className="py-8 text-muted-foreground text-center">
                        No submissions yet.
                    </div>
                }
            />
        </div>
    );
}
