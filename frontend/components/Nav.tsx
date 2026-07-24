"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";
import { addresses, registrarAbi } from "../config/contracts";
import { WalletButton } from "./WalletButton";

export function Nav() {
  const { address } = useAccount();
  const owner = useReadContract({
    address: addresses.registrar,
    abi: registrarAbi,
    functionName: "owner"
  });
  const canSeeAdmin = useMemo(
    () => !!address && !!owner.data && owner.data.toLowerCase() === address.toLowerCase(),
    [address, owner.data]
  );

  return (
    <header className="sticky top-0 z-20 border-b border-black/10 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link className="flex items-center gap-2 font-semibold" href="/">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-slate-950 text-xs font-bold text-white">ID</span>
          <span>XDCID</span>
        </Link>
        <nav className="flex min-w-0 items-center gap-2 text-sm">
          <Link className="rounded-md px-3 py-2 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950" href="/send">
            Send
          </Link>
          <Link className="rounded-md px-3 py-2 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950" href="/private-receive">
            Privacy lab
          </Link>
          <Link className="rounded-md px-3 py-2 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950" href="/dashboard">
            Dashboard
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
