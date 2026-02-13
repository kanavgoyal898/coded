import { useMemo, useState, ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type SortDirection = "asc" | "desc";

export type ColumnDef<T> = {
    key: string;
    header: string;
    sortable?: boolean;
    render?: (item: T, index: number) => ReactNode;
    cellClassName?: string;
    headerClassName?: string;
};

export type DataTableProps<T> = {
    data: T[];
    columns: ColumnDef<T>[];
    keyExtractor: (item: T) => string | number;
    onRowClick?: (item: T) => void;
    rowClassName?: string | ((item: T) => string);
    defaultSortKey?: string;
    defaultSortDirection?: SortDirection;
    pagination?: {
        enabled: boolean;
        rowsPerPage?: number;
        currentPage?: number;
        onPageChange?: (page: number) => void;
    };
    emptyState?: ReactNode;
    loading?: boolean;
    loadingRows?: number;
};

export function DataTable<T extends Record<string, any>>({
    data,
    columns,
    keyExtractor,
    onRowClick,
    rowClassName,
    defaultSortKey,
    defaultSortDirection = "desc",
    pagination = { enabled: false },
    emptyState,
    loading = false,
    loadingRows = 3,
}: DataTableProps<T>) {
    const [sortConfig, setSortConfig] = useState<{
        key: string | null;
        direction: SortDirection;
    }>({
        key: defaultSortKey || null,
        direction: defaultSortDirection,
    });

    const [internalPage, setInternalPage] = useState(1);

    const currentPage = pagination.currentPage ?? internalPage;
    const rowsPerPage = pagination.rowsPerPage ?? 8;

    const handlePageChange = (page: number) => {
        if (pagination.onPageChange) {
            pagination.onPageChange(page);
        } else {
            setInternalPage(page);
        }
    };

    const requestSort = (key: string) => {
        setSortConfig((prev) => ({
            key,
            direction:
                prev.key === key ? (prev.direction === "asc" ? "desc" : "asc") : "asc",
        }));
        handlePageChange(1);
    };

    const sortedData = useMemo(() => {
        if (!sortConfig.key) return data;

        const key = sortConfig.key;

        return [...data].sort((a, b) => {
            const aVal = a[key];
            const bVal = b[key];

            if (key.includes("_at") || key.includes("date")) {
                const aTime = aVal ? new Date(aVal).getTime() : 0;
                const bTime = bVal ? new Date(bVal).getTime() : 0;
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
    }, [data, sortConfig]);

    const paginatedData = useMemo(() => {
        if (!pagination.enabled) return sortedData;
        const start = (currentPage - 1) * rowsPerPage;
        return sortedData.slice(start, start + rowsPerPage);
    }, [sortedData, currentPage, rowsPerPage, pagination.enabled]);

    const totalPages = pagination.enabled
        ? Math.ceil(sortedData.length / rowsPerPage)
        : 1;

    const arrow = (key: string) =>
        sortConfig.key === key ? (sortConfig.direction === "asc" ? " ↑" : " ↓") : "";

    const getRowClassName = (item: T) => {
        if (typeof rowClassName === "function") {
            return rowClassName(item);
        }
        return rowClassName || "";
    };

    if (loading) {
        return (
            <div className="space-y-2">
                {[...Array(loadingRows)].map((_, i) => (
                    <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                ))}
            </div>
        );
    }

    if (data.length === 0 && emptyState) {
        return <>{emptyState}</>;
    }

    return (
        <div className="space-y-4">
            <Table className="w-full">
                <TableHeader>
                    <TableRow className="bg-muted hover:bg-muted">
                        {columns.map((column) => (
                            <TableHead
                                key={column.key}
                                className={`${column.sortable !== false ? "cursor-pointer transition-colors" : ""
                                    } ${column.headerClassName || ""}`}
                                onClick={() =>
                                    column.sortable !== false && requestSort(column.key)
                                }
                            >
                                {column.header}
                                {column.sortable !== false && arrow(column.key)}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {paginatedData.map((item, index) => (
                        <TableRow
                            key={keyExtractor(item)}
                            className={`${onRowClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""} ${getRowClassName(item)}`}
                            onClick={() => onRowClick?.(item)}
                        >
                            {columns.map((column) => (
                                <TableCell
                                    key={column.key}
                                    className={column.cellClassName || ""}
                                >
                                    {column.render
                                        ? column.render(item, pagination.enabled ? (currentPage - 1) * rowsPerPage + index : index)
                                        : item[column.key]}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {pagination.enabled && totalPages > 1 && (
                <div className="flex justify-between items-center text-sm">
                    <div>
                        Page <span className="font-semibold">{currentPage}</span> of{" "}
                        <span className="font-semibold">{totalPages}</span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            disabled={currentPage === 1}
                            className="px-2 py-1 text-sm border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                        >
                            ‹
                        </button>
                        <button
                            disabled={currentPage === totalPages}
                            className="px-2 py-1 text-sm border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            onClick={() =>
                                handlePageChange(Math.min(totalPages, currentPage + 1))
                            }
                        >
                            ›
                        </button>
                    </div>
                </div>
            )}

            <div className="flex flex-row items-end justify-end w-full text-xs">
                <b>{sortedData.length}</b>&nbsp;
                {sortedData.length === 1 ? "item" : "items"} found
            </div>
        </div>
    );
}
