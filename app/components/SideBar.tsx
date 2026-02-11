import { CodeIcon } from "lucide-react";

export function SideBar() {
    return (
        <aside className="hidden lg:flex lg:w-1/2 bg-foreground text-background flex-col justify-between px-12 py-8">
            <div className="flex items-center gap-2">
                <CodeIcon className="size-8" />
            </div>
            <div className="space-y-4">
                <p className="text-4xl font-light leading-snug tracking-tight">
                    Start competing.<br />
                    Track your scores.<br />
                    <span className="opacity-60">Improve every day.</span>
                </p>
                <p className="text-sm opacity-40 font-mono">
                    Set problems. Submit solutions.
                </p>
            </div>
            <p className="text-xs opacity-20">
                All Rights Reserved &copy; {new Date().getFullYear()}
            </p>
        </aside>
    );
}