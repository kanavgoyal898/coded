"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { CodeIcon } from "lucide-react";

export function NavigationBar() {
    const pathname = usePathname();
    const { user, loading, logout } = useCurrentUser();

    if (pathname === "/login" || pathname === "/signup") return null;

    return (
        <header className="sticky top-0 z-50 bg-background border-b">
            <div className="max-w-4xl mx-auto px-2 h-12 flex flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-6">
                    <Link href="/" className="font-bold text-sm">
                        <CodeIcon className="size-4" />
                    </Link>

                    {!loading && user && (
                        <nav className="flex items-center gap-4">
                            <Link className="text-sm" href="/submissions">Submissions</Link>

                            {(user.role === "setter" || user.role === "admin") && (
                                <Link className="text-sm" href="/set">Set Problem</Link>
                            )}

                            {user.role === "admin" && (
                                <Link className="text-sm" href="/admin/setters">Permissions</Link>
                            )}
                        </nav>
                    )}
                </div>

                <div className="flex flex-row items-center gap-2">
                    {loading ? (
                        <div className="h-4 w-8 bg-muted animate-pulse rounded" />
                    ) : user ? (
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-muted-foreground hidden sm:block">
                                {user.name}
                            </span>
                            <Button variant="default" size="sm" onClick={logout}>
                                Sign out
                            </Button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" asChild>
                                <Link href="/login">Sign in</Link>
                            </Button>
                            <Button variant="default" size="sm" asChild>
                                <Link href="/signup">Sign up</Link>
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
