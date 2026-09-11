"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FeatureFlagValues } from "../lib/featureFlagTypes";

const FeatureFlagsContext = createContext<FeatureFlagValues>({
  registrationMode: "closed",
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
