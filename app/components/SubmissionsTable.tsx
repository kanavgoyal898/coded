import { DataTable, ColumnDef } from "@/app/components/DataTable";
import { getLanguageLabel } from "@/lib/constants/languages";
import { formatLocalDateTime } from "@/lib/datetime";

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

const statusLabels: Record<string, string> = {
    accepted: "Accepted",
    rejected: "Rejected",
};

type SubmissionsTableProps = {
    submissions: SubmissionSummary[];
    loading: boolean;
    onViewSource: (sourceCode: string) => void;
};

export function SubmissionsTable({
    submissions,
    loading,
    onViewSource,
}: SubmissionsTableProps) {
    const columns: ColumnDef<SubmissionSummary>[] = [
        {
            key: "user_name",
            header: "Name",
            cellClassName: "font-medium",
        },
        {
            key: "user_email",
            header: "Email",
            cellClassName: "text-sm font-mono",
        },
        {
            key: "latest_language",
            header: "Language",
            render: (submission) => getLanguageLabel(submission.latest_language),
        },
        {
            key: "latest_status",
            header: "Status",
            render: (submission) => (
                <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${submission.latest_status === "accepted"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                        }`}
                >
                    {statusLabels[submission.latest_status] ||
                        submission.latest_status}
                </span>
            ),
        },
        {
            key: "latest_score",
            header: "Score",
            render: (submission) =>
                `${submission.latest_score} / ${submission.total_score}`,
        },
        {
            key: "submission_count",
            header: "Attempts",
            render: (submission) => (
                <span className="font-semibold">{submission.submission_count}</span>
            ),
        },
        {
            key: "latest_created_at",
            header: "Latest Submission",
            cellClassName: "text-sm",
            render: (submission) =>
                formatLocalDateTime(submission.latest_created_at),
        },
        {
            key: "source_code",
            header: "Source Code",
            sortable: false,
            render: (submission) => (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onViewSource(submission.source_code);
                    }}
                    className="text-blue-600 hover:text-blue-800 underline text-sm"
                >
                    View
                </button>
            ),
        },
    ];

    if (loading) {
        return (
            <div className="p-8 text-center text-muted-foreground">
                Loading submissions...
            </div>
        );
    }

    if (submissions.length === 0) {
        return (
            <div className="p-8 text-center text-muted-foreground">
                No submissions yet for this problem.
            </div>
        );
    }

    return (
        <div className="p-4">
            <DataTable
                data={submissions}
                columns={columns}
                keyExtractor={(submission) => submission.latest_submission_id}
                defaultSortKey="user_name"
                defaultSortDirection="asc"
                pagination={{ enabled: true, rowsPerPage: 8 }}
            />
        </div>
    );
}
