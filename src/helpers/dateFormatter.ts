export function formateDOBDate(dateStr: string) {
  const [day, month, year] = dateStr.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${pad(day)}-${pad(month)}-${year}`;
}

export function formatChatDate(dateStr: string) {
  if (!dateStr) return "";

  const date = new Date(dateStr);

  if (isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTimeOnly(
  dateString: string,
  timeZone: string = "Asia/Kolkata"
): string {
  if (!dateString) return "";

  return new Date(dateString).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });
}

// Relative "time ago" string, matching the mobile app 1:1.
// Output: "now" | "Xm" | "Xh" | "Xd" | "Xw" (1–4) | "Xmo" (min 1)
//   < 1 min   → "now"
//   < 60 min  → "Xm"
//   < 24 hrs  → "Xh"
//   < 7 days  → "Xd"
//   < 30 days → "Xw"  (7–29 days, so 28–29 days reads "4w", never "0mo")
//   30+ days  → "Xmo"
// Expects the backend UTC ISO string (with trailing Z) — used as-is; new Date()
// handles the UTC→epoch conversion so the diff is timezone-correct everywhere.
export const timeAgo = (dateString: string | Date): string => {
  if (!dateString) return "";

  const date =
    typeof dateString === "string" ? new Date(dateString) : dateString;

  if (isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;

  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h`;

  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d`;

  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;
  return `${Math.max(1, Math.floor(diffDays / 30))}mo`;
};

// Abbreviated time-ago for job listings — matches mobile app format
// "5m ago", "3h ago", "2d ago", "1w ago", "2mo ago", "1y ago"
export const getTimeAgoJobListing = (
  dateString: string
): string => {
  if (!dateString) return "";

  const date = new Date(dateString);

  if (isNaN(date.getTime())) return "";

  const now = new Date();

  const seconds = Math.floor(
    (now.getTime() - date.getTime()) / 1000
  );

  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return days === 1 ? "1d ago" : `${days}d ago`;
  }

  const weeks = Math.floor(days / 7);

  if (weeks < 5) {
    return weeks === 1 ? "1w ago" : `${weeks}w ago`;
  }

  // Calendar-based month calculation
  let months =
    (now.getFullYear() - date.getFullYear()) * 12 +
    (now.getMonth() - date.getMonth());

  // Current month is not complete if today's date
  // hasn't reached the posting date.
  if (now.getDate() < date.getDate()) {
    months--;
  }

  if (months < 12) {
    return months === 1 ? "1mo ago" : `${months}mo ago`;
  }

  // Calendar-based year calculation
  let years = now.getFullYear() - date.getFullYear();

  if (
    now.getMonth() < date.getMonth() ||
    (now.getMonth() === date.getMonth() &&
      now.getDate() < date.getDate())
  ) {
    years--;
  }

  return years === 1 ? "1y ago" : `${years}y ago`;
};