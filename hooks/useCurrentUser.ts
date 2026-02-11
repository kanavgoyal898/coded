"use client";

import { useState, useEffect, useCallback } from "react";

export type CurrentUser = {
    id: number;
    name: string;
    email: string;
    role: string;
};

export function useCurrentUser() {
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/auth/me");

            if (res.ok) {
                const data = await res.json();
                setUser(data.user ?? null);
                return;
            }

            setUser(null);

            if (res.status === 401) {
                return;
            }

            if (res.status >= 500) {
                setError("Unable to reach the server. Please try again.");
                return;
            }

            setError("Failed to load session.");
        } catch {
            setUser(null);
            setError("A network error occurred. Check your connection.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const logout = useCallback(async () => {
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } finally {
            setUser(null);
            window.location.href = "/login";
        }
    }, []);

    return { user, loading, error, logout, refresh };
}
