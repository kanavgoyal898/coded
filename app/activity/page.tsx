"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { getLanguageLabel } from "@/lib/constants/languages";

type ProblemWithSubmissions = {
    problem_id: number;
    problem_title: string;
    problem_slug: string;
    created_at: string;
    total_submissions: number;
    unique_solvers: number;
};

type SubmissionSummary = {
    user_id: number;
    user_name: string;
    user_email: string;
    latest_submission_id: number;
    latest_language: string;
    latest_status: string;
    latest_score: number;
    total_score: number;
    latest_execution_time_ms: number | null;
    latest_created_at: string;
    submission_count: number;
    source_code: string;
};

type SortKey = keyof SubmissionSummary;

const statusLabels: Record<string, string> = {
    accepted: "Accepted",
    rejected: "Rejected",
};

const ROWS_PER_PAGE = 2;

export default function ActivityPage() {
    const router = useRouter();
    const [problems, setProblems] = useState<ProblemWithSubmissions[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedProblem, setExpandedProblem] = useState<number | null>(null);
    const [submissions, setSubmissions] = useState<Record<number, SubmissionSummary[]>>({});
    const [loadingSubmissions, setLoadingSubmissions] = useState<Record<number, boolean>>({});
    const [sortConfigs, setSortConfigs] = useState<Record<number, { key: SortKey; direction: "asc" | "desc" }>>({});
    const [currentPages, setCurrentPages] = useState<Record<number, number>>({});

    useEffect(() => {
        async function fetchProblems() {
            setLoading(true);
            setError(null);

            try {
                const res = await fetch("/api/activity");
                
                if (res.status === 401) {
                    router.push("/login");
                    return;
                }

                if (res.status === 403) {
                    router.push("/submissions");
                    return;
                }

                if (!res.ok) {
                    let data: { error?: string } = {};
                    try {
                        data = await res.json();
                    } catch {
                        throw new Error("Failed to load activity data");
                    }
                    throw new Error(data.error || "Failed to load activity data");
                }

                const data = await res.json();
                setProblems(data.problems || []);
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Failed to load activity data"
                );
            } finally {
                setLoading(false);
            }
        }

        fetchProblems();
    }, [router]);

    const toggleProblem = async (problemId: number) => {
        if (expandedProblem === problemId) {
            setExpandedProblem(null);
            return;
        }

        setExpandedProblem(problemId);

        if (!submissions[problemId]) {
            await fetchSubmissions(problemId);
        }
    };

    const fetchSubmissions = async (problemId: number) => {
        setLoadingSubmissions(prev => ({ ...prev, [problemId]: true }));

        try {
            const res = await fetch(`/api/activity?problem_id=${problemId}`);
            
            if (res.status === 401) {
                router.push("/login");
                return;
            }

            if (res.status === 403) {
                router.push("/submissions");
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
            setSubmissions(prev => ({ ...prev, [problemId]: data.submissions || [] }));
            
            if (!sortConfigs[problemId]) {
                setSortConfigs(prev => ({
                    ...prev,
                    [problemId]: { key: "user_name", direction: "asc" }
                }));
            }

            if (!currentPages[problemId]) {
                setCurrentPages(prev => ({ ...prev, [problemId]: 1 }));
            }
        } catch (err) {
            console.error(`Failed to fetch submissions for problem ${problemId}:`, err);
        } finally {
            setLoadingSubmissions(prev => ({ ...prev, [problemId]: false }));
        }
    };

    const requestSort = (problemId: number, key: SortKey) => {
        setSortConfigs(prev => {
            const current = prev[problemId] || { key: "user_name", direction: "asc" as const };
            return {
                ...prev,
                [problemId]: {
                    key,
                    direction: current.key === key 
                        ? (current.direction === "asc" ? "desc" : "asc")
                        : "asc"
                }
            };
        });
        setCurrentPages(prev => ({ ...prev, [problemId]: 1 }));
    };

    const getSortedSubmissions = (problemId: number): SubmissionSummary[] => {
        const problemSubmissions = submissions[problemId] || [];
        const sortConfig = sortConfigs[problemId];

        if (!sortConfig) return problemSubmissions;

        return [...problemSubmissions].sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];

            if (sortConfig.key === "latest_created_at") {
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
    };

    const getPaginatedSubmissions = (problemId: number): SubmissionSummary[] => {
        const sorted = getSortedSubmissions(problemId);
        const page = currentPages[problemId] || 1;
        const start = (page - 1) * ROWS_PER_PAGE;
        return sorted.slice(start, start + ROWS_PER_PAGE);
    };

    const getTotalPages = (problemId: number): number => {
        const sorted = getSortedSubmissions(problemId);
        return Math.ceil(sorted.length / ROWS_PER_PAGE);
    };

    const arrow = (problemId: number, key: SortKey) => {
        const sortConfig = sortConfigs[problemId];
        if (!sortConfig || sortConfig.key !== key) return "";
        return sortConfig.direction === "asc" ? " ↑" : " ↓";
    };

    const openSourceCode = (sourceCode: string, submissionId: number) => {
        const blob = new Blob([sourceCode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
                <h1 className="text-2xl font-semibold">Activity</h1>
                <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-16 bg-muted animate-pulse rounded" />
                    ))}
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
            <h1 className="text-2xl font-semibold">Activity</h1>

            {problems.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                    No problems found. Create a problem to see activity here.
                </div>
            ) : (
                <div className="space-y-2">
                    {problems.map((problem) => (
                        <div key={problem.problem_id} className="border rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleProblem(problem.problem_id)}
                                className="w-full px-4 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
                            >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <div className="flex-shrink-0">
                                        {expandedProblem === problem.problem_id ? (
                                            <ChevronDown className="h-5 w-5" />
                                        ) : (
                                            <ChevronRight className="h-5 w-5" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate">{problem.problem_title}</div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                            Created {new Date(problem.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6 text-sm flex-shrink-0">
                                    <div className="text-center">
                                        <div className="font-semibold">{problem.unique_solvers}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {problem.unique_solvers === 1 ? "Solver" : "Solvers"}
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="font-semibold">{problem.total_submissions}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {problem.total_submissions === 1 ? "Submission" : "Submissions"}
                                        </div>
                                    </div>
                                </div>
                            </button>

                            {expandedProblem === problem.problem_id && (
                                <div className="border-t bg-muted/20">
                                    {loadingSubmissions[problem.problem_id] ? (
                                        <div className="p-8 text-center text-muted-foreground">
                                            Loading submissions...
                                        </div>
                                    ) : !submissions[problem.problem_id] || submissions[problem.problem_id].length === 0 ? (
                                        <div className="p-8 text-center text-muted-foreground">
                                            No submissions yet for this problem.
                                        </div>
                                    ) : (
                                        <div className="p-4">
                                            <div className="overflow-x-auto">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow className="bg-muted hover:bg-muted">
                                                            <TableHead
                                                                className="cursor-pointer"
                                                                onClick={() => requestSort(problem.problem_id, "user_name")}
                                                            >
                                                                Name{arrow(problem.problem_id, "user_name")}
                                                            </TableHead>
                                                            <TableHead
                                                                className="cursor-pointer"
                                                                onClick={() => requestSort(problem.problem_id, "user_email")}
                                                            >
                                                                Email{arrow(problem.problem_id, "user_email")}
                                                            </TableHead>
                                                            <TableHead
                                                                className="cursor-pointer"
                                                                onClick={() => requestSort(problem.problem_id, "latest_language")}
                                                            >
                                                                Language{arrow(problem.problem_id, "latest_language")}
                                                            </TableHead>
                                                            <TableHead
                                                                className="cursor-pointer"
                                                                onClick={() => requestSort(problem.problem_id, "latest_status")}
                                                            >
                                                                Status{arrow(problem.problem_id, "latest_status")}
                                                            </TableHead>
                                                            <TableHead
                                                                className="cursor-pointer"
                                                                onClick={() => requestSort(problem.problem_id, "latest_score")}
                                                            >
                                                                Score{arrow(problem.problem_id, "latest_score")}
                                                            </TableHead>
                                                            <TableHead
                                                                className="cursor-pointer"
                                                                onClick={() => requestSort(problem.problem_id, "submission_count")}
                                                            >
                                                                Attempts{arrow(problem.problem_id, "submission_count")}
                                                            </TableHead>
                                                            <TableHead
                                                                className="cursor-pointer"
                                                                onClick={() => requestSort(problem.problem_id, "latest_created_at")}
                                                            >
                                                                Latest Submission{arrow(problem.problem_id, "latest_created_at")}
                                                            </TableHead>
                                                            <TableHead>
                                                                Source Code
                                                            </TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {getPaginatedSubmissions(problem.problem_id).map((submission) => (
                                                            <TableRow key={submission.user_id}>
                                                                <TableCell className="font-medium">
                                                                    {submission.user_name}
                                                                </TableCell>
                                                                <TableCell className="text-sm font-mono">
                                                                    {submission.user_email}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {getLanguageLabel(submission.latest_language)}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <span
                                                                        className={`text-xs font-medium px-2 py-1 rounded-full ${
                                                                            submission.latest_status === "accepted"
                                                                                ? "bg-green-100 text-green-700"
                                                                                : "bg-red-100 text-red-700"
                                                                        }`}
                                                                    >
                                                                        {statusLabels[submission.latest_status] || submission.latest_status}
                                                                    </span>
                                                                </TableCell>
                                                                <TableCell>
                                                                    {submission.latest_score} / {submission.total_score}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <span className="font-semibold">
                                                                        {submission.submission_count}
                                                                    </span>
                                                                </TableCell>
                                                                <TableCell className="text-sm">
                                                                    {new Date(submission.latest_created_at).toLocaleString()}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <button
                                                                        onClick={() => openSourceCode(submission.source_code, submission.latest_submission_id)}
                                                                        className="text-blue-600 hover:text-blue-800 underline text-sm"
                                                                    >
                                                                        View
                                                                    </button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>

                                            {getTotalPages(problem.problem_id) > 1 && (
                                                <div className="flex justify-between items-center mt-4 text-sm">
                                                    <div>
                                                        Page <b>{currentPages[problem.problem_id] || 1}</b> of{" "}
                                                        <b>{getTotalPages(problem.problem_id)}</b>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            disabled={(currentPages[problem.problem_id] || 1) === 1}
                                                            className="px-2 py-1 border rounded disabled:opacity-50 hover:bg-muted"
                                                            onClick={() =>
                                                                setCurrentPages(prev => ({
                                                                    ...prev,
                                                                    [problem.problem_id]: Math.max(1, (prev[problem.problem_id] || 1) - 1)
                                                                }))
                                                            }
                                                        >
                                                            ‹
                                                        </button>
                                                        <button
                                                            disabled={
                                                                (currentPages[problem.problem_id] || 1) >= getTotalPages(problem.problem_id)
                                                            }
                                                            className="px-2 py-1 border rounded disabled:opacity-50 hover:bg-muted"
                                                            onClick={() =>
                                                                setCurrentPages(prev => ({
                                                                    ...prev,
                                                                    [problem.problem_id]: Math.min(
                                                                        getTotalPages(problem.problem_id),
                                                                        (prev[problem.problem_id] || 1) + 1
                                                                    )
                                                                }))
                                                            }
                                                        >
                                                            ›
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="text-xs text-muted-foreground mt-4 text-right">
                                                {getSortedSubmissions(problem.problem_id).length}{" "}
                                                {getSortedSubmissions(problem.problem_id).length === 1 ? "solver" : "solvers"}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
