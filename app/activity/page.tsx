"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Trash2, ExternalLink, Edit } from "lucide-react";
import { getLanguageLabel } from "@/lib/constants/languages";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

const ROWS_PER_PAGE = 8;

const MAX_TITLE_LENGTH = 256;
const MAX_STATEMENT_LENGTH = 64 * 1024;
const MIN_TIME_LIMIT = 1;
const MAX_TIME_LIMIT = 16 * 1024;
const MIN_MEMORY_LIMIT = 1;
const MAX_MEMORY_LIMIT = 16 * 1024 * 1024;

const formatNumbers = (value: string | number) => {
    return Number(value).toLocaleString('en-US');
};

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

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [problemToDelete, setProblemToDelete] = useState<ProblemWithSubmissions | null>(null);
    const [deleting, setDeleting] = useState(false);

    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [problemToEdit, setProblemToEdit] = useState<ProblemWithSubmissions | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editStatement, setEditStatement] = useState("");
    const [editTimeLimit, setEditTimeLimit] = useState("1024");
    const [editMemoryLimit, setEditMemoryLimit] = useState("262144");
    const [editDeadline, setEditDeadline] = useState("");
    const [editValidationError, setEditValidationError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [loadingEditData, setLoadingEditData] = useState(false);

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

    const handleDeleteClick = (problem: ProblemWithSubmissions, e: React.MouseEvent) => {
        e.stopPropagation();
        setProblemToDelete(problem);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!problemToDelete) return;

        setDeleting(true);

        try {
            const res = await fetch(`/api/activity?problem_id=${problemToDelete.problem_id}`, {
                method: "DELETE",
            });

            if (res.status === 401) {
                router.push("/login");
                return;
            }

            if (res.status === 403) {
                setError("You don't have permission to delete this problem.");
                setDeleteDialogOpen(false);
                return;
            }

            if (!res.ok) {
                let data: { error?: string } = {};
                try {
                    data = await res.json();
                } catch {
                    throw new Error("Failed to delete problem");
                }
                throw new Error(data.error || "Failed to delete problem");
            }

            setProblems(prev => prev.filter(p => p.problem_id !== problemToDelete.problem_id));
            setDeleteDialogOpen(false);
            setProblemToDelete(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete problem");
            setDeleteDialogOpen(false);
        } finally {
            setDeleting(false);
        }
    };

    const handleEditClick = async (problem: ProblemWithSubmissions, e: React.MouseEvent) => {
        e.stopPropagation();
        setProblemToEdit(problem);
        setLoadingEditData(true);
        setEditDialogOpen(true);

        try {
            const res = await fetch(`/api/activity?problem_id=${problem.problem_id}`);

            if (!res.ok) {
                throw new Error("Failed to load problem details");
            }

            const data = await res.json();

            setEditTitle(data.problem?.title || "");
            setEditStatement(data.problem?.statement || "");
            setEditTimeLimit(String(data.problem?.time_limit_ms || 1024));
            setEditMemoryLimit(String(data.problem?.memory_limit_kb || 262144));
            setEditDeadline(data.problem?.deadline_at ? new Date(data.problem.deadline_at).toISOString().slice(0, 16) : "");
        } catch (err) {
            setEditValidationError(err instanceof Error ? err.message : "Failed to load problem");
        } finally {
            setLoadingEditData(false);
        }
    };

    const validateEditForm = (): string | null => {
        if (!editTitle || editTitle.trim().length === 0) {
            return "Title is required.";
        }

        if (editTitle.trim().length > MAX_TITLE_LENGTH) {
            return `Title exceeds maximum length of ${MAX_TITLE_LENGTH} characters.`;
        }

        if (!editStatement || editStatement.trim().length === 0) {
            return "Problem statement is required.";
        }

        if (editStatement.trim().length > MAX_STATEMENT_LENGTH) {
            return `Statement exceeds maximum length of ${MAX_STATEMENT_LENGTH} characters.`;
        }

        const timeLimitNum = parseInt(editTimeLimit);
        if (isNaN(timeLimitNum) || timeLimitNum < MIN_TIME_LIMIT || timeLimitNum > MAX_TIME_LIMIT) {
            return `Time limit must be between ${MIN_TIME_LIMIT} and ${MAX_TIME_LIMIT} ms.`;
        }

        const memoryLimitNum = parseInt(editMemoryLimit);
        if (isNaN(memoryLimitNum) || memoryLimitNum < MIN_MEMORY_LIMIT || memoryLimitNum > MAX_MEMORY_LIMIT) {
            return `Memory limit must be between ${MIN_MEMORY_LIMIT} and ${MAX_MEMORY_LIMIT} KB.`;
        }

        if (editDeadline && editDeadline.trim().length > 0) {
            const deadlineDate = new Date(editDeadline);
            if (isNaN(deadlineDate.getTime())) {
                return "Invalid deadline format.";
            }
        }

        return null;
    };

    const submitEdit = async () => {
        if (!problemToEdit) return;

        const validation = validateEditForm();
        if (validation) {
            setEditValidationError(validation);
            return;
        }

        setEditing(true);
        setEditValidationError(null);

        try {
            const res = await fetch("/api/activity", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({
                    problem_id: problemToEdit.problem_id,
                    title: editTitle.trim(),
                    statement: editStatement.trim(),
                    time_limit_ms: parseInt(editTimeLimit),
                    memory_limit_kb: parseInt(editMemoryLimit),
                    deadline_at: editDeadline && editDeadline.trim().length > 0 ? editDeadline.trim() : null,
                }),
            });

            if (res.status === 401) {
                router.push("/login");
                return;
            }

            if (res.status === 403) {
                setEditValidationError("You don't have permission to edit this problem.");
                return;
            }

            if (!res.ok) {
                let data: { error?: string } = {};
                try {
                    data = await res.json();
                } catch {
                    throw new Error("Failed to update problem");
                }
                throw new Error(data.error || "Failed to update problem");
            }

            const data = await res.json();

            setProblems(prev => prev.map(p =>
                p.problem_id === problemToEdit.problem_id
                    ? { ...p, problem_title: editTitle.trim(), problem_slug: data.slug }
                    : p
            ));

            setEditDialogOpen(false);
            setProblemToEdit(null);
        } catch (err) {
            setEditValidationError(err instanceof Error ? err.message : "Failed to update problem");
        } finally {
            setEditing(false);
        }
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
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => toggleProblem(problem.problem_id)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                    toggleProblem(problem.problem_id);
                                    }
                                }}
                                className="w-full px-4 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left cursor-pointer"
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
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-6 text-sm flex-shrink-0 mr-2">
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
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            router.push(`/problems/${problem.problem_slug}`);
                                        }}
                                        className="p-2 hover:bg-muted rounded-md transition-colors"
                                        title="Solve problem"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={(e) => handleEditClick(problem, e)}
                                        className="p-2 hover:bg-muted rounded-md transition-colors"
                                        title="Edit problem"
                                    >
                                        <Edit className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={(e) => handleDeleteClick(problem, e)}
                                        className="p-2 hover:bg-red-50 text-red-600 rounded-md transition-colors"
                                        title="Delete problem"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

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
                                                                        className={`text-xs font-medium px-2 py-1 rounded-full ${submission.latest_status === "accepted"
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

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Problem</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete {problemToDelete?.problem_title}? This will permanently delete the problem and all associated submissions. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <DialogClose asChild>
                            <Button variant="outline" disabled={deleting}>Cancel</Button>
                        </DialogClose>
                        <Button
                            variant="destructive"
                            onClick={confirmDelete}
                            disabled={deleting}
                        >
                            {deleting ? "Deleting..." : "Delete Problem"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Problem</DialogTitle>
                    </DialogHeader>

                    {loadingEditData ? (
                        <div className="py-8 text-center text-muted-foreground">
                            Loading problem details...
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {editValidationError && (
                                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-4 py-2">
                                    {editValidationError}
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="edit-title-input">Title</Label>
                                <Input
                                    id="edit-title-input"
                                    value={editTitle}
                                    onChange={(e) => {
                                        setEditTitle(e.target.value);
                                        setEditValidationError(null);
                                    }}
                                    maxLength={MAX_TITLE_LENGTH}
                                    disabled={editing}
                                    placeholder="Enter problem title"
                                />
                                <p className="text-xs text-muted-foreground">
                                    {formatNumbers(editTitle.length)}/{formatNumbers(MAX_TITLE_LENGTH)} characters
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="edit-statement-input">Problem Statement</Label>
                                <Textarea
                                    id="edit-statement-input"
                                    className="min-h-32"
                                    value={editStatement}
                                    onChange={(e) => {
                                        setEditStatement(e.target.value);
                                        setEditValidationError(null);
                                    }}
                                    maxLength={MAX_STATEMENT_LENGTH}
                                    disabled={editing}
                                    placeholder="Describe the problem in detail"
                                />
                                <p className="text-xs text-muted-foreground">
                                    {formatNumbers(editStatement.length)}/{formatNumbers(MAX_STATEMENT_LENGTH)} characters
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="edit-time-limit-input">Time Limit (ms)</Label>
                                    <Input
                                        id="edit-time-limit-input"
                                        type="number"
                                        value={editTimeLimit}
                                        onChange={(e) => {
                                            setEditTimeLimit(e.target.value);
                                            setEditValidationError(null);
                                        }}
                                        min={MIN_TIME_LIMIT}
                                        max={MAX_TIME_LIMIT}
                                        disabled={editing}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="edit-memory-limit-input">Memory Limit (KB)</Label>
                                    <Input
                                        id="edit-memory-limit-input"
                                        type="number"
                                        value={editMemoryLimit}
                                        onChange={(e) => {
                                            setEditMemoryLimit(e.target.value);
                                            setEditValidationError(null);
                                        }}
                                        min={MIN_MEMORY_LIMIT}
                                        max={MAX_MEMORY_LIMIT}
                                        disabled={editing}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="edit-deadline-input">Deadline (GMT)</Label>
                                <Input
                                    id="edit-deadline-input"
                                    type="datetime-local"
                                    value={editDeadline}
                                    onChange={(e) => {
                                        setEditDeadline(e.target.value);
                                        setEditValidationError(null);
                                    }}
                                    disabled={editing}
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2">
                        <DialogClose asChild>
                            <Button variant="outline" disabled={editing || loadingEditData}>Cancel</Button>
                        </DialogClose>
                        <Button
                            onClick={submitEdit}
                            disabled={editing || loadingEditData}
                        >
                            {editing ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
