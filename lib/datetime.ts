function parseUTC(dateString: string | null | undefined): Date | null {
    if (!dateString || typeof dateString !== "string") return null;

    const normalized = dateString.trim();

    if (normalized.endsWith("Z") || normalized.includes("+")) {
        const d = new Date(normalized);
        return isNaN(d.getTime()) ? null : d;
    }

    const iso = normalized.replace(" ", "T") + "Z";
    const date = new Date(iso);

    return isNaN(date.getTime()) ? null : date;
}


export function formatLocalDateTime(dateString: string | null | undefined): string {
    const date = parseUTC(dateString);
    if (!date) return "Invalid Date";
    return date.toLocaleString();
}

export function formatLocalDate(dateString: string | null | undefined): string {
    const date = parseUTC(dateString);
    if (!date) return "Invalid Date";

    return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export function formatLocalTime(dateString: string | null | undefined): string {
    const date = parseUTC(dateString);
    if (!date) return "Invalid Date";

    return date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

export function formatRelativeTime(dateString: string | null | undefined): string {
    const date = parseUTC(dateString);
    if (!date) return "Invalid Date";

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return "just now";
    if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
    if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? "s" : ""} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;

    return formatLocalDate(dateString);
}

export function toUTC(localDate: Date): string {
    return localDate.toISOString();
}

export function convertUTCToLocalDatetimeInput(utcDateString: string): string {
    const date = new Date(utcDateString);
    if (isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function convertLocalDatetimeInputToUTC(localDatetimeString: string): string {
    const localDate = new Date(localDatetimeString);

    if (isNaN(localDate.getTime())) {
        throw new Error("Invalid date format");
    }

    return localDate.toISOString();
}

export function normalizeToUTCISO(dateString: string | null | undefined): string | null {
    if (!dateString) return null;

    const date = parseUTC(dateString);
    return date ? date.toISOString() : null;
}
