"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Trash2, ExternalLink, Edit, XCircle, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmissionsTable } from "@/app/components/SubmissionsTable";
import { formatLocalDateTime } from "@/lib/datetime";

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

const MAX_TITLE_LENGTH = 256;
const MAX_STATEMENT_LENGTH = 64 * 1024;
const MIN_TIME_LIMIT = 1;
const MAX_TIME_LIMIT = 16 * 1024;
const MIN_MEMORY_LIMIT = 1;
const MAX_MEMORY_LIMIT = 16 * 1024 * 1024;

const formatNumbers = (value: string | number) => {
    return Number(value).toLocaleString("en-US");
};

export default function ActivityPage() {
    const router = useRouter();
    const [problems, setProblems] = useState<ProblemWithSubmissions[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedProblem, setExpandedProblem] = useState<number | null>(null);
    const [submissions, setSubmissions] = useState<Record<number, SubmissionSummary[]>>({});
    const [loadingSubmissions, setLoadingSubmissions] = useState<Record<number, boolean>>({});

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

    const [clearSubmissionsDialogOpen, setClearSubmissionsDialogOpen] = useState(false);
    const [problemToClear, setProblemToClear] = useState<ProblemWithSubmissions | null>(null);
    const [clearing, setClearing] = useState(false);

    const [visibilityDialogOpen, setVisibilityDialogOpen] = useState(false);
    const [problemToUpdateVisibility, setProblemToUpdateVisibility] = useState<ProblemWithSubmissions | null>(null);
    const [newVisibility, setNewVisibility] = useState<"public" | "private">("public");
    const [solverEmails, setSolverEmails] = useState("");
    const [currentSolvers, setCurrentSolvers] = useState<string[]>([]);
    const [visibilityValidationError, setVisibilityValidationError] = useState<string | null>(null);
    const [updatingVisibility, setUpdatingVisibility] = useState(false);
    const [loadingVisibilityData, setLoadingVisibilityData] = useState(false);

    const fetchProblems = useCallback(async () => {
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
    }, [router]);

    useEffect(() => {
        fetchProblems();
    }, [fetchProblems]);

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
        setLoadingSubmissions((prev) => ({ ...prev, [problemId]: true }));

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
            setSubmissions((prev) => ({
                ...prev,
                [problemId]: data.submissions || [],
            }));
        } catch (err) {
            console.error(
                `Failed to fetch submissions for problem ${problemId}:`,
                err
            );
        } finally {
            setLoadingSubmissions((prev) => ({ ...prev, [problemId]: false }));
        }
    };

    const openSourceCode = (sourceCode: string) => {
        const blob = new Blob([sourceCode], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const handleDeleteClick = (
        problem: ProblemWithSubmissions,
        e: React.MouseEvent
    ) => {
        e.stopPropagation();
        setProblemToDelete(problem);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!problemToDelete) return;

        setDeleting(true);

        try {
            const res = await fetch(
                `/api/activity?problem_id=${problemToDelete.problem_id}`,
                {
                    method: "DELETE",
                }
            );

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

            setProblems((prev) =>
                prev.filter((p) => p.problem_id !== problemToDelete.problem_id)
            );
            setDeleteDialogOpen(false);
            setProblemToDelete(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete problem");
            setDeleteDialogOpen(false);
        } finally {
            setDeleting(false);
        }
    };

    const handleEditClick = async (
        problem: ProblemWithSubmissions,
        e: React.MouseEvent
    ) => {
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
            setEditDeadline(
                data.problem?.deadline_at
                    ? new Date(data.problem.deadline_at).toISOString().slice(0, 16)
                    : ""
            );
        } catch (err) {
            setEditValidationError(
                err instanceof Error ? err.message : "Failed to load problem"
            );
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
        if (
            isNaN(timeLimitNum) ||
            timeLimitNum < MIN_TIME_LIMIT ||
            timeLimitNum > MAX_TIME_LIMIT
        ) {
            return `Time limit must be between ${MIN_TIME_LIMIT} and ${MAX_TIME_LIMIT} ms.`;
        }

        const memoryLimitNum = parseInt(editMemoryLimit);
        if (
            isNaN(memoryLimitNum) ||
            memoryLimitNum < MIN_MEMORY_LIMIT ||
            memoryLimitNum > MAX_MEMORY_LIMIT
        ) {
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
                    deadline_at:
                        editDeadline && editDeadline.trim().length > 0
                            ? editDeadline.trim()
                            : null,
                }),
            });

            if (res.status === 401) {
                router.push("/login");
                return;
            }

            if (res.status === 403) {
                setEditValidationError(
                    "You don't have permission to edit this problem."
                );
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

            setProblems((prev) =>
                prev.map((p) =>
                    p.problem_id === problemToEdit.problem_id
                        ? {
                            ...p,
                            problem_title: editTitle.trim(),
                            problem_slug: data.slug,
                        }
                        : p
                )
            );

            setEditDialogOpen(false);
            setProblemToEdit(null);
            setLoadingEditData(false);
        } catch (err) {
            setEditValidationError(
                err instanceof Error ? err.message : "Failed to update problem"
            );
            setLoadingEditData(false);
        } finally {
            setEditing(false);
        }
    };

    const handleClearSubmissionsClick = (
        problem: ProblemWithSubmissions,
        e: React.MouseEvent
    ) => {
        e.stopPropagation();
        setProblemToClear(problem);
        setClearSubmissionsDialogOpen(true);
    };

    const confirmClearSubmissions = async () => {
        if (!problemToClear) return;

        setClearing(true);

        try {
            const res = await fetch("/api/activity", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({
                    action: "clear_submissions",
                    problem_id: problemToClear.problem_id,
                }),
            });

            if (res.status === 401) {
                router.push("/login");
                return;
            }

            if (res.status === 403) {
                setError("You don't have permission to clear submissions for this problem.");
                setClearSubmissionsDialogOpen(false);
                return;
            }

            if (!res.ok) {
                let data: { error?: string } = {};
                try {
                    data = await res.json();
                } catch {
                    throw new Error("Failed to clear submissions");
                }
                throw new Error(data.error || "Failed to clear submissions");
            }

            setProblems((prev) =>
                prev.map((p) =>
                    p.problem_id === problemToClear.problem_id
                        ? { ...p, total_submissions: 0, unique_solvers: 0 }
                        : p
                )
            );

            if (submissions[problemToClear.problem_id]) {
                setSubmissions((prev) => ({
                    ...prev,
                    [problemToClear.problem_id]: [],
                }));
            }

            await fetchProblems();

            setClearSubmissionsDialogOpen(false);
            setProblemToClear(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to clear submissions");
            setClearSubmissionsDialogOpen(false);
        } finally {
            setClearing(false);
        }
    };

    const handleVisibilityClick = async (
        problem: ProblemWithSubmissions,
        e: React.MouseEvent
    ) => {
        e.stopPropagation();
        setProblemToUpdateVisibility(problem);
        setLoadingVisibilityData(true);
        setVisibilityDialogOpen(true);

        try {
            const res = await fetch(`/api/activity?problem_id=${problem.problem_id}`);

            if (!res.ok) {
                throw new Error("Failed to load problem details");
            }

            const data = await res.json();

            setNewVisibility(data.problem?.visibility || "public");

            const res_ = await fetch(`/api/activity?action=solvers&problem_id=${problem.problem_id}`);
            if (res_.ok) {
                const solversData = await res_.json();
                const solversList = solversData.solvers || [];
                setCurrentSolvers(solversList);
                setSolverEmails(solversList.join("\n"));
            }
        } catch (err) {
            setVisibilityValidationError(
                err instanceof Error ? err.message : "Failed to load problem"
            );
        } finally {
            setLoadingVisibilityData(false);
        }
    };

    const parseEmailList = (input: string): string[] => {
        if (!input || input.trim().length === 0) {
            return [];
        }

        const emails = input
            .split(/[,;\|\n\t]|[\s]{2,}/)
            .map((email) => email.trim())
            .filter((email) => email.length > 0);

        return [...new Set(emails)];
    };

    const validateVisibilityForm = (): string | null => {
        if (newVisibility === "private") {
            const emails = parseEmailList(solverEmails);
            if (emails.length === 0) {
                return "Private problems must have at least one solver email specified.";
            }
        }

        return null;
    };

    const submitVisibilityUpdate = async () => {
        if (!problemToUpdateVisibility) return;

        const validation = validateVisibilityForm();
        if (validation) {
            setVisibilityValidationError(validation);
            return;
        }

        setUpdatingVisibility(true);
        setVisibilityValidationError(null);

        try {
            const solversList = newVisibility === "private" ? parseEmailList(solverEmails) : [];

            const res = await fetch("/api/activity", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({
                    action: "update_visibility",
                    problem_id: problemToUpdateVisibility.problem_id,
                    visibility: newVisibility,
                    solvers: solversList,
                }),
            });

            if (res.status === 401) {
                router.push("/login");
                return;
            }

            if (res.status === 403) {
                setVisibilityValidationError(
                    "You don't have permission to update this problem."
                );
                return;
            }

            if (!res.ok) {
                let data: { error?: string } = {};
                try {
                    data = await res.json();
                } catch {
                    throw new Error("Failed to update visibility");
                }
                throw new Error(data.error || "Failed to update visibility");
            }

            setVisibilityDialogOpen(false);
            setProblemToUpdateVisibility(null);
            setLoadingVisibilityData(false);
            await fetchProblems();
        } catch (err) {
            setVisibilityValidationError(
                err instanceof Error ? err.message : "Failed to update visibility"
            );
            setLoadingVisibilityData(false);
        } finally {
            setUpdatingVisibility(false);
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
                        <div
                            key={problem.problem_id}
                            className="border rounded-lg overflow-hidden"
                        >
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
                                    <div className="shrink-0">
                                        {expandedProblem === problem.problem_id ? (
                                            <ChevronDown className="h-4 w-4" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate">
                                            {problem.problem_title}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                            Created{" "}
                                            {formatLocalDateTime(problem.created_at)}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-6 text-sm shrink-0 mr-2">
                                        <div className="text-center">
                                            <div className="font-semibold">
                                                {problem.unique_solvers}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {problem.unique_solvers === 1 ? "Solver" : "Solvers"}
                                            </div>
                                        </div>
                                        <div className="text-center">
                                            <div className="font-semibold">
                                                {problem.total_submissions}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {problem.total_submissions === 1
                                                    ? "Submission"
                                                    : "Submissions"}
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
                                        onClick={(e) => handleVisibilityClick(problem, e)}
                                        className="p-2 hover:bg-muted rounded-md transition-colors"
                                        title="Update visibility"
                                    >
                                        <Eye className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={(e) => handleClearSubmissionsClick(problem, e)}
                                        className="p-2 hover:bg-muted rounded-md transition-colors"
                                        title="Clear all submissions"
                                    >
                                        <XCircle className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={(e) => handleDeleteClick(problem, e)}
                                        className="p-2 hover:bg-red-50 text-red-700 rounded-md transition-colors"
                                        title="Delete problem"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            {expandedProblem === problem.problem_id && (
                                <div className="border-t bg-muted/20">
                                    <SubmissionsTable
                                        submissions={submissions[problem.problem_id] || []}
                                        loading={loadingSubmissions[problem.problem_id] || false}
                                        onViewSource={openSourceCode}
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Delete Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Problem</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete {problemToDelete?.problem_title}?
                            This will permanently delete the problem and all associated
                            submissions. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <DialogClose asChild>
                            <Button variant="outline" disabled={deleting}>
                                Cancel
                            </Button>
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

            {/* Clear Submissions Dialog */}
            <Dialog open={clearSubmissionsDialogOpen} onOpenChange={setClearSubmissionsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Clear All Submissions</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to clear all submissions for {problemToClear?.problem_title}?
                            This will permanently delete all user submissions for this problem. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <DialogClose asChild>
                            <Button variant="outline" disabled={clearing}>
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button
                            variant="destructive"
                            onClick={confirmClearSubmissions}
                            disabled={clearing}
                        >
                            {clearing ? "Clearing..." : "Clear All Submissions"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
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
                                    {formatNumbers(editTitle.length)}/
                                    {formatNumbers(MAX_TITLE_LENGTH)} characters
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
                                    {formatNumbers(editStatement.length)}/
                                    {formatNumbers(MAX_STATEMENT_LENGTH)} characters
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
                                    <Label htmlFor="edit-memory-limit-input">
                                        Memory Limit (KB)
                                    </Label>
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
                                <Label htmlFor="edit-deadline-input">Deadline</Label>
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
                            <Button variant="outline" disabled={editing || loadingEditData}>
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button onClick={submitEdit} disabled={editing || loadingEditData}>
                            {editing ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Visibility Dialog */}
            <Dialog open={visibilityDialogOpen} onOpenChange={setVisibilityDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Update Problem Visibility</DialogTitle>
                    </DialogHeader>

                    {loadingVisibilityData ? (
                        <div className="py-8 text-center text-muted-foreground">
                            Loading visibility settings...
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {visibilityValidationError && (
                                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-4 py-2">
                                    {visibilityValidationError}
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="visibility-select">Visibility</Label>
                                <Select
                                    value={newVisibility}
                                    onValueChange={(value: "public" | "private") => {
                                        setNewVisibility(value);
                                        setVisibilityValidationError(null);
                                    }}
                                    disabled={updatingVisibility}
                                >
                                    <SelectTrigger id="visibility-select">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="public">Public - Visible to all users</SelectItem>
                                        <SelectItem value="private">Private - Visible only to specified users</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {newVisibility === "private" && (
                                <div className="space-y-2">
                                    <Label htmlFor="solvers-input">Solver Emails</Label>
                                    <Textarea
                                        id="solvers-input"
                                        className="min-h-32"
                                        value={solverEmails}
                                        onChange={(e) => {
                                            setSolverEmails(e.target.value);
                                            setVisibilityValidationError(null);
                                        }}
                                        disabled={updatingVisibility}
                                        placeholder="user@example.com (one per line)"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        {parseEmailList(solverEmails).length} email(s) specified
                                    </p>
                                    {currentSolvers.length > 0 && (
                                        <p className="text-xs text-muted-foreground">
                                            Currently: {currentSolvers.length} solver(s)
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter className="gap-2">
                        <DialogClose asChild>
                            <Button variant="outline" disabled={updatingVisibility || loadingVisibilityData}>
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button onClick={submitVisibilityUpdate} disabled={updatingVisibility || loadingVisibilityData}>
                            {updatingVisibility ? "Updating..." : "Update Visibility"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
