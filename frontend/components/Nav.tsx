"use client";

import Image from "next/image";
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
