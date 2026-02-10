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

    const refresh = useCallback(async () => {
        try {
            const res = await fetch("/api/auth/me");
            if (res.ok) {
                const data = await res.json();
                setUser(data.user ?? null);
            } else {
                setUser(null);
            }
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const logout = useCallback(async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        setUser(null);
        window.location.href = "/login";
    }, []);

    return { user, loading, logout, refresh };
}
