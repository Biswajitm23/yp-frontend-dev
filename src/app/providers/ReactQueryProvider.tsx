"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ReactNode, useState } from "react";
import { isAccountInactiveError } from "@/lib/accountStatus";
import { handleAccountInactive } from "@/lib/sessionExpiry";

/**
 * Single choke point for the "backend account is gone" signal. Every query and
 * mutation in the app funnels through here, so one deleted account triggers one
 * teardown (the handler is latched) instead of each failing request driving its
 * own logout/redirect.
 */
function onCacheError(error: unknown) {
  if (isAccountInactiveError(error)) {
    void handleAccountInactive();
  }
}

export default function ReactQueryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: onCacheError }),
        mutationCache: new MutationCache({ onError: onCacheError }),
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 5 * 60 * 1000,
            refetchOnWindowFocus: false,
            // Was `retry: 1`. Same budget for ordinary failures, but a dead
            // account is terminal — retrying it just doubles the request storm.
            retry: (failureCount, error) =>
              !isAccountInactiveError(error) && failureCount < 1,
          },
          mutations: {
            retry: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
