"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** Whether another page of comments is available. */
  hasMore: boolean;
  /** Whether a page is currently being fetched (shows the spinner). */
  isLoading: boolean;
  /** Loads the next page — called automatically when the sentinel scrolls in. */
  onLoadMore: () => void;
};

/**
 * Infinite-scroll sentinel for the comment list.
 *
 * Mirrors the JobListing / CompaniesList pattern (an IntersectionObserver on a
 * 1px sentinel + a small spinner) so the comment section loads the next page
 * automatically as the user scrolls, instead of a "Load more comments…" button.
 * The underlying fetch is unchanged (page + limit) — this only swaps the manual
 * click for a scroll trigger.
 */
export default function CommentScrollSentinel({
  hasMore,
  isLoading,
  onLoadMore,
}: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Keep the latest callback without re-attaching the observer every render.
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          onLoadMoreRef.current();
        }
      },
      { threshold: 0, rootMargin: "0px 0px 200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoading]);

  if (!hasMore) return null;

  return (
    <div ref={sentinelRef} className="flex justify-center h-px">
      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
        </div>
      )}
    </div>
  );
}
