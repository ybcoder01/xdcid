"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FeatureFlagValues } from "../flags";

const FeatureFlagsContext = createContext<FeatureFlagValues>({
  domainRegistration: false,
  subdomainRegistration: false,
});

export function FeatureFlagsProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: FeatureFlagValues;
}) {
  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}
