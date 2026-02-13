"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

const ROWS_PER_PAGE = 8;

export default function ProblemsPage() {
    const router = useRouter();
    const [problems, setProblems] = useState<Problem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [sortConfig, setSortConfig] = useState<{
        key: keyof Problem | null;
        direction: "asc" | "desc";
    }>({
        key: null,
        direction: "desc",
    });
    const [currentPage, setCurrentPage] = useState(1);

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

    const requestSort = (key: keyof Problem) => {
        setCurrentPage(1);
        setSortConfig((prev) => ({
            key,
            direction:
                prev.key === key ? (prev.direction === "asc" ? "desc" : "asc") : "desc",
        }));
    };

    const sortedProblems = useMemo(() => {
        let sorted = [...problems];

        if (!sortConfig.key) {
            sorted.sort((a, b) => {
                const aDeadline = a.deadline_at ? new Date(a.deadline_at).getTime() : 0;
                const bDeadline = b.deadline_at ? new Date(b.deadline_at).getTime() : 0;

                if (aDeadline !== bDeadline) {
                    return bDeadline - aDeadline;
                }

                const aCreated = new Date(a.created_at).getTime();
                const bCreated = new Date(b.created_at).getTime();
                return bCreated - aCreated;
            });
            return sorted;
        }

        return sorted.sort((a, b) => {
            const key = sortConfig.key!;
            const aVal = a[key];
            const bVal = b[key];

            if (key === "created_at" || key === "deadline_at") {
                const aTime = aVal ? new Date(aVal as string).getTime() : 0;
                const bTime = bVal ? new Date(bVal as string).getTime() : 0;
                return sortConfig.direction === "asc" ? aTime - bTime : bTime - aTime;
            }

            if (typeof aVal === "number" && typeof bVal === "number") {
                return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
            }

            const aStr = String(aVal || "");
            const bStr = String(bVal || "");
            return sortConfig.direction === "asc"
                ? aStr.localeCompare(bStr)
                : bStr.localeCompare(aStr);
        });
    }, [problems, sortConfig]);

    const totalPages = Math.ceil(sortedProblems.length / ROWS_PER_PAGE);

    const paginatedProblems = useMemo(() => {
        const start = (currentPage - 1) * ROWS_PER_PAGE;
        return sortedProblems.slice(start, start + ROWS_PER_PAGE);
    }, [sortedProblems, currentPage]);

    const arrow = (key: keyof Problem) =>
        sortConfig.key === key ? (sortConfig.direction === "asc" ? " ↑" : " ↓") : "";

    const formatDeadline = (deadline: string | null) => {
        if (!deadline) return "—";
        const date = new Date(deadline.replace(" ", "T") + "Z");
        const now = new Date();
        const isPast = date < now;
        const formatted = date.toLocaleString();
        return (
            <span className={isPast ? "text-red-600 font-medium" : ""}>
                {formatted}
                {isPast}
            </span>
        );
    };

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
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Problems</h1>
                <div className="text-sm text-muted-foreground">
                    {sortedProblems.length} problem{sortedProblems.length !== 1 ? "s" : ""} available
                </div>
            </div>

            {problems.length === 0 ? (
                <div className="py-8 text-muted-foreground">
                    No problems available yet.
                </div>
            ) : (
                <>
                    <Table className="w-full">
                        <TableHeader>
                            <TableRow className="bg-muted hover:bg-muted">
                                <TableHead>S.No.</TableHead>
                                <TableHead
                                    className="cursor-pointer transition-colors"
                                    onClick={() => requestSort("title")}
                                >
                                    Title{arrow("title")}
                                </TableHead>
                                <TableHead
                                    className="cursor-pointer transition-colors"
                                    onClick={() => requestSort("setter_name")}
                                >
                                    Setter{arrow("setter_name")}
                                </TableHead>
                                <TableHead
                                    className="cursor-pointer transition-colors"
                                    onClick={() => requestSort("deadline_at")}
                                >
                                    Deadline (GMT){arrow("deadline_at")}
                                </TableHead>
                                <TableHead
                                    className="cursor-pointer transition-colors"
                                    onClick={() => requestSort("time_limit_ms")}
                                >
                                    Time Limit{arrow("time_limit_ms")}
                                </TableHead>
                                <TableHead
                                    className="cursor-pointer transition-colors"
                                    onClick={() => requestSort("memory_limit_kb")}
                                >
                                    Memory Limit{arrow("memory_limit_kb")}
                                </TableHead>
                                <TableHead
                                    className="cursor-pointer transition-colors"
                                    onClick={() => requestSort("created_at")}
                                >
                                    Created{arrow("created_at")}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedProblems.map((problem, i) => (
                                <TableRow
                                    key={problem.id}
                                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                                    onClick={() => router.push(`/problems/${problem.slug}`)}
                                >
                                    <TableCell className="font-mono text-muted-foreground">
                                        {(currentPage - 1) * ROWS_PER_PAGE + i + 1}
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {problem.title}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {problem.setter_name}
                                    </TableCell>
                                    <TableCell>
                                        {formatDeadline(problem.deadline_at)}
                                    </TableCell>
                                    <TableCell className="font-mono text-sm">
                                        {problem.time_limit_ms} ms
                                    </TableCell>
                                    <TableCell className="font-mono text-sm">
                                        {(problem.memory_limit_kb / 1024).toFixed(0)} MB
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                        {new Date(problem.created_at).toLocaleDateString()}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    {totalPages > 1 && (
                        <div className="flex justify-between items-center mt-4 text-sm">
                            <div>
                                Page <span className="font-semibold">{currentPage}</span> of{" "}
                                <span className="font-semibold">{totalPages}</span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    disabled={currentPage === 1}
                                    className="px-2 py-1 text-sm border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                >
                                    ‹
                                </button>
                                <button
                                    disabled={currentPage === totalPages}
                                    className="px-2 py-1 text-sm border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    onClick={() =>
                                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                                    }
                                >
                                    ›
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="flex flex-row items-end justify-end w-full text-xs mt-4">
                        <b>{problems.length}</b>&nbsp;problem(s) found
                    </div>
                </>
            )}
        </div>
    );
}
