"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

const languageLabels: Record<string, string> = {
    c: "C",
    cpp: "C++",
    python: "Python",
};

export default function SubmissionsPage() {
    const router = useRouter();
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{
        key: keyof Submission | null;
        direction: "asc" | "desc";
    }>({
        key: "created_at",
        direction: "desc",
    });
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 16;

    useEffect(() => {
        async function fetchSubmissions() {
            try {
                const res = await fetch("/api/submissions?user_id=1");
                if (!res.ok) throw new Error("Failed to fetch submissions");
                const data = await res.json();
                setSubmissions(data.submissions);
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Failed to load submissions"
                );
            }
        }
        fetchSubmissions();
    }, []);

    const requestSort = (key: keyof Submission) => {
        setSortConfig((prev) => ({
            key,
            direction:
                prev.key === key ? (prev.direction === "asc" ? "desc" : "asc") : "asc",
        }));
    };

    const sortedSubmissions = useMemo(() => {
        if (!sortConfig.key) return submissions;

        return [...submissions].sort((a, b) => {
            const key = sortConfig.key!;
            const aVal = a[key];
            const bVal = b[key];

            if (key === "created_at") {
                const aTime = new Date(aVal as string).getTime();
                const bTime = new Date(bVal as string).getTime();
                return sortConfig.direction === "asc" ? aTime - bTime : bTime - aTime;
            }

            if (typeof aVal === "number" && typeof bVal === "number") {
                return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
            }

            return sortConfig.direction === "asc"
                ? String(aVal).localeCompare(String(bVal))
                : String(bVal).localeCompare(String(aVal));
        });
    }, [submissions, sortConfig]);

    const totalPages = Math.ceil(sortedSubmissions.length / rowsPerPage);

    const paginatedSubmissions = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return sortedSubmissions.slice(start, start + rowsPerPage);
    }, [sortedSubmissions, currentPage]);

    const arrow = (key: keyof Submission) =>
        sortConfig.key === key ? (sortConfig.direction === "asc" ? " ↑" : " ↓") : "";


    if (error) {
        return (
            <div className="container mx-auto py-8">
                <div className="text-center text-destructive">{error}</div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-2 py-8 space-y-4">
            <h1 className="text-2xl font-semibold">Submissions</h1>

            {submissions.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                    No submissions yet.
                </div>
            ) : (
                <>
                    <Table className="w-full">
                        <TableHeader>
                            <TableRow className="bg-muted">
                                <TableHead>S.No</TableHead>
                                <TableHead
                                    className="cursor-pointer"
                                    onClick={() => requestSort("problem_title")}
                                >
                                    Problem{arrow("problem_title")}
                                </TableHead>
                                <TableHead
                                    className="cursor-pointer"
                                    onClick={() => requestSort("language")}
                                >
                                    Language{arrow("language")}
                                </TableHead>
                                <TableHead
                                    className="cursor-pointer"
                                    onClick={() => requestSort("status")}
                                >
                                    Status{arrow("status")}
                                </TableHead>
                                <TableHead
                                    className="cursor-pointer"
                                    onClick={() => requestSort("score")}
                                >
                                    Score{arrow("score")}
                                </TableHead>
                                <TableHead
                                    className="cursor-pointer"
                                    onClick={() => requestSort("created_at")}
                                >
                                    Submitted{arrow("created_at")}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedSubmissions.length ? (
                                paginatedSubmissions.map((submission, i) => (
                                    <TableRow
                                        key={submission.id}
                                        className="cursor-pointer"
                                        onClick={() =>
                                            router.push(`/problems/${submission.problem_slug}`)
                                        }
                                    >
                                        <TableCell>
                                            {(currentPage - 1) * rowsPerPage + i + 1}
                                        </TableCell>
                                        <TableCell>{submission.problem_title}</TableCell>
                                        <TableCell>{languageLabels[submission.language] || submission.language}</TableCell>
                                        <TableCell>
                                            <span>
                                                { statusLabels[submission.status] || submission.status }
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                           {submission.score} / {submission.total_score}
                                        </TableCell>
                                        <TableCell>
                                            {new Date(submission.created_at).toLocaleString()}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell
                                        colSpan={8}
                                        className="text-center py-4 text-muted-foreground"
                                    >
                                        No submissions yet.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>

                    <div className="flex justify-between items-center mt-4 text-sm">
                        <div>
                            Page <b>{currentPage}</b> of <b>{totalPages}</b>
                        </div>
                        <div className="flex gap-2">
                            <button
                                disabled={currentPage === 1}
                                className="px-2 py-1 border rounded disabled:opacity-50"
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            >
                                ‹
                            </button>
                            <button
                                disabled={currentPage === totalPages || totalPages === 0}
                                className="px-2 py-1 border rounded disabled:opacity-50"
                                onClick={() =>
                                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                                }
                            >
                                ›
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-row items-end justify-end w-full text-xs mt-4">
                        <b>{sortedSubmissions.length}</b>&nbsp;submission(s) found
                    </div>
                </>
            )}
        </div>
    );
}