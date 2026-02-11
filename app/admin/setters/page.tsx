"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SetterEntry = {
    email: string;
    added_at: string;
    user_id: number | null;
    user_name: string | null;
    registered: number;
};

type ApiResponse = {
    error?: string;
    warning?: boolean;
    message?: string;
    email?: string;
    status?: string;
    setters?: SetterEntry[];
};

const MAX_EMAIL_LENGTH = 256;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AdminSettersPage() {
    const router = useRouter();

    const [setters, setSetters] = useState<SetterEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [newEmail, setNewEmail] = useState("");
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [addWarning, setAddWarning] = useState<string | null>(null);
    const [addSuccess, setAddSuccess] = useState<string | null>(null);

    const [removing, setRemoving] = useState<string | null>(null);
    const [removeError, setRemoveError] = useState<string | null>(null);
    const [removeWarning, setRemoveWarning] = useState<string | null>(null);

    const fetchSetters = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/admin/setters", {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "same-origin",
            });

            if (res.status === 401) {
                router.push("/login");
                return;
            }

            if (res.status === 403) {
                router.push("/submissions");
                return;
            }

            let data: ApiResponse;

            try {
                data = await res.json();
            } catch {
                throw new Error("Invalid response from server. Please try again.");
            }

            if (!res.ok) {
                const errorMessage = data.error || "Failed to load setters. Please try again.";
                throw new Error(errorMessage);
            }

            if (!data.setters || !Array.isArray(data.setters)) {
                throw new Error("Invalid data format received from server.");
            }

            setSetters(data.setters);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "Unable to load setters. Please check your connection.";
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        fetchSetters();
    }, [fetchSetters]);

    const validateEmailInput = (email: string): string | null => {
        const trimmed = email.trim();

        if (!trimmed) {
            return "Please enter an email address.";
        }

        if (trimmed.length > MAX_EMAIL_LENGTH) {
            return `Email address exceeds maximum length of ${MAX_EMAIL_LENGTH} characters.`;
        }

        if (!EMAIL_REGEX.test(trimmed)) {
            return "Please enter a valid email address.";
        }

        const localPart = trimmed.split("@")[0];
        if (localPart && localPart.length > 64) {
            return "Email address local part exceeds 64 characters.";
        }

        return null;
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();

        const validationError = validateEmailInput(newEmail);
        if (validationError) {
            setAddError(validationError);
            return;
        }

        const trimmedEmail = newEmail.trim();

        setAddError(null);
        setAddWarning(null);
        setAddSuccess(null);
        setAdding(true);

        try {
            const res = await fetch("/api/admin/setters", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ email: trimmedEmail }),
            });

            let data: ApiResponse;

            try {
                data = await res.json();
            } catch {
                throw new Error("Invalid response from server. Please try again.");
            }

            if (res.status === 401) {
                router.push("/login");
                return;
            }

            if (res.status === 403) {
                router.push("/submissions");
                return;
            }

            if (!res.ok) {
                const errorMessage = data.error || "Failed to add setter. Please try again.";
                throw new Error(errorMessage);
            }

            if (data.warning && data.error) {
                setAddWarning(data.error);
            } else if (data.message) {
                setAddSuccess(data.message);
            } else {
                setAddSuccess(`Successfully added ${trimmedEmail} as a setter.`);
            }

            setNewEmail("");
            await fetchSetters();
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "Unable to add setter. Please check your connection.";
            setAddError(errorMessage);
        } finally {
            setAdding(false);
        }
    };

    const handleRemove = async (email: string) => {
        if (!email || typeof email !== "string") {
            setRemoveError("Invalid email address.");
            return;
        }

        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
            setRemoveError("Email address cannot be empty.");
            return;
        }

        setRemoveError(null);
        setRemoveWarning(null);
        setAddSuccess(null);
        setRemoving(trimmedEmail);

        try {
            const res = await fetch("/api/admin/setters", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ email: trimmedEmail }),
            });

            let data: ApiResponse;

            try {
                data = await res.json();
            } catch {
                throw new Error("Invalid response from server. Please try again.");
            }

            if (res.status === 401) {
                router.push("/login");
                return;
            }

            if (res.status === 403) {
                router.push("/submissions");
                return;
            }

            if (!res.ok) {
                const errorMessage = data.error || "Failed to remove setter. Please try again.";
                throw new Error(errorMessage);
            }

            if (data.warning && data.error) {
                setRemoveWarning(data.error);
            }

            await fetchSetters();
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "Unable to remove setter. Please check your connection.";
            setRemoveError(errorMessage);
        } finally {
            setRemoving(null);
        }
    };

    const clearMessages = () => {
        setAddError(null);
        setAddWarning(null);
        setAddSuccess(null);
        setRemoveError(null);
        setRemoveWarning(null);
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
            <div>
                <h1 className="text-2xl font-semibold">Problem Setters</h1>
                <p className="text-sm text-muted-foreground mt-2">
                    Emails added here are granted the{" "}
                    <code className="bg-muted px-1 rounded text-xs">setter</code>{" "}
                    role when they sign up. Existing users are upgraded immediately.
                    Removing an email downgrades them back to{" "}
                    <code className="bg-muted px-1 rounded text-xs">solver</code>.
                </p>
            </div>

            <form onSubmit={handleAdd} className="space-y-3">
                <Label htmlFor="email-input">Add email address</Label>
                <div className="flex gap-2">
                    <Input
                        id="email-input"
                        type="email"
                        placeholder="user@example.com"
                        value={newEmail}
                        onChange={(e) => {
                            setNewEmail(e.target.value);
                            if (addError || addWarning || addSuccess) {
                                clearMessages();
                            }
                        }}
                        disabled={adding}
                        required
                        className="flex-1"
                        maxLength={MAX_EMAIL_LENGTH}
                        autoComplete="email"
                    />
                    <Button type="submit" disabled={adding || !newEmail.trim()}>
                        {adding ? "Adding…" : "Add"}
                    </Button>
                </div>

                {addError && (
                    <div className="text-sm text-red-700 bg-red-100 border border-red-200 rounded px-4 py-2">
                        {addError}
                    </div>
                )}

                {addWarning && (
                    <div className="text-sm text-amber-700 bg-amber-100 border border-amber-200 rounded px-4 py-2">
                        {addWarning}
                    </div>
                )}

                {removeError && (
                    <div className="text-sm text-red-700 bg-red-100 border border-red-200 rounded px-4 py-2">
                        {removeError}
                    </div>
                )}

                {removeWarning && (
                    <div className="text-sm text-amber-700 bg-amber-100 border border-amber-200 rounded px-4 py-2">
                        {removeWarning}
                    </div>
                )}

                {addSuccess && (
                    <div className="text-sm text-green-700 bg-green-100 border border-green-200 rounded px-4 py-2">
                        {addSuccess}
                    </div>
                )}
            </form>

            {loading ? (
                <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                    ))}
                </div>
            ) : error ? (
                <div className="text-sm text-red-700 bg-red-100 border border-red-700 rounded px-4 py-2">
                    {error}
                </div>
            ) : setters.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded">
                    No setter emails added yet. Add an email above to get started.
                </div>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted">
                            <TableHead>Email</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Added</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {setters.map((s) => (
                            <TableRow key={s.email}>
                                <TableCell className="text-sm font-mono">
                                    {s.email}
                                </TableCell>
                                <TableCell>
                                    <span
                                        className={`text-xs font-medium px-2 py-1 rounded-full ${s.registered
                                                ? "bg-green-100 text-green-700"
                                                : "bg-gray-100 text-gray-700"
                                            }`}
                                    >
                                        {s.registered ? "Registered" : "Pending"}
                                    </span>
                                </TableCell>
                                <TableCell className="text-sm">
                                    {s.user_name ?? <span className="text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                    {new Date(s.added_at).toLocaleDateString(undefined, {
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric",
                                    })}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        disabled={removing === s.email}
                                        onClick={() => {
                                            clearMessages();
                                            handleRemove(s.email);
                                        }}
                                    >
                                        {removing === s.email ? "Removing…" : "Remove"}
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    );
}
