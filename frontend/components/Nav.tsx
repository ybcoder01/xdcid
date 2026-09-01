"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { addresses, ownableAbi, zeroAddress } from "../config/contracts";
import { WalletButton } from "./WalletButton";

type AdminSessionStatus = {
  authenticated?: boolean;
  address?: string;
};

const ADMIN_SESSION_CHANGED_EVENT = "xdcid:admin-session-changed";

export function Nav() {
  const { address } = useAccount();
  const [authorizedSessionAddress, setAuthorizedSessionAddress] =
    useState<string>();
  const registryOwner = useReadContract({
    address: addresses.registry,
    abi: ownableAbi,
    functionName: "owner"
  });
  const policyOwner = useReadContract({
    address: addresses.pricingPolicy,
    abi: ownableAbi,
    functionName: "owner",
    query: { enabled: addresses.pricingPolicy !== zeroAddress }
  });
  const checkAdminSession = useCallback(async () => {
    if (!address) {
      setAuthorizedSessionAddress(undefined);
      return;
    }

    try {
      const response = await fetch("/api/admin/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const session = (await response.json().catch(() => ({}))) as AdminSessionStatus;
      setAuthorizedSessionAddress(
        response.ok &&
          session.authenticated === true &&
          session.address?.toLowerCase() === address.toLowerCase()
          ? session.address
          : undefined,
      );
    } catch {
      setAuthorizedSessionAddress(undefined);
    }
  }, [address]);

  useEffect(() => {
    void checkAdminSession();

    const refreshSession = () => void checkAdminSession();
    window.addEventListener(ADMIN_SESSION_CHANGED_EVENT, refreshSession);
    window.addEventListener("focus", refreshSession);
    return () => {
      window.removeEventListener(ADMIN_SESSION_CHANGED_EVENT, refreshSession);
      window.removeEventListener("focus", refreshSession);
    };
  }, [checkAdminSession]);

  const canSeeAdmin = useMemo(
    () =>
      !!address &&
      (authorizedSessionAddress?.toLowerCase() === address.toLowerCase() ||
        [registryOwner.data, policyOwner.data]
          .filter((candidate): candidate is `0x${string}` => !!candidate)
          .some((candidate) => candidate.toLowerCase() === address.toLowerCase())),
    [address, authorizedSessionAddress, policyOwner.data, registryOwner.data],
  );

  return (
    <header className="sticky top-0 z-20 border-b border-black/10 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link aria-label="XDCID home" className="flex shrink-0 items-center" href="/">
          <span aria-hidden="true" className="relative block h-8 w-28 overflow-hidden">
            <Image
              alt=""
              className="absolute left-[-23px] top-[-26px] h-[84px] w-[158px] max-w-none"
              height={914}
              priority
              src="/XDCID.png"
              width={1714}
            />
          </span>
        </Link>
        <nav className="flex min-w-0 items-center gap-2 text-sm">
          <Link className="rounded-md px-3 py-2 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950" href="/send">
            Send
          </Link>
          <Link className="rounded-md px-3 py-2 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950" href="/pay">
            Pay Links
          </Link>
          <Link className="rounded-md px-3 py-2 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950" href="/dashboard">
            Dashboard
          </Link>
          <Link className="rounded-md px-3 py-2 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950" href="/history">
            History
          </Link>
          <Link className="rounded-md px-3 py-2 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950" href="/archive">
            Archive
          </Link>
          <Link className="rounded-md px-3 py-2 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950" href="/docs">
            Docs
          </Link>
          {canSeeAdmin ? (
            <Link className="rounded-md px-3 py-2 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950" href="/admin">
              Admin
            </Link>
          ) : null}
          <WalletButton />
        </nav>
      </div>
    </header>
  );
}
