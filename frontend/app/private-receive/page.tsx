"use client";

import { useEffect, useState } from "react";
import {
  announcementBelongsToSession,
  createPrivateReceiveAddress,
  createPrivateReceiveSession,
  destroyPrivateReceiveSession,
  type PrivateReceiveAnnouncement,
  type PrivateReceiveSession
} from "../../lib/stealth";

export default function PrivateReceivePage() {
  const [session, setSession] = useState<PrivateReceiveSession | null>(null);
  const [announcements, setAnnouncements] = useState<
    PrivateReceiveAnnouncement[]
  >([]);

  useEffect(() => {
    return () => {
      if (session) destroyPrivateReceiveSession(session);
    };
  }, [session]);

  function startDemo() {
    if (session) destroyPrivateReceiveSession(session);
    setAnnouncements([]);
    setSession(createPrivateReceiveSession());
  }

  function generateAddress() {
    if (!session) return;
    const announcement = createPrivateReceiveAddress(
      session.stealthMetaAddress
    );
    setAnnouncements((current) => [...current, announcement]);
  }

  function resetDemo() {
    if (session) destroyPrivateReceiveSession(session);
    setAnnouncements([]);
    setSession(null);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <section className="rounded-md border border-black/10 bg-white p-6 shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
          Experimental privacy lab
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">
          Private Receive MVP
        </h1>
        <p className="mt-3 max-w-3xl text-neutral-600">
          Test how one public receive identity can produce a different
          destination for every payment without revealing a normal wallet
          address.
        </p>

        <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Demonstration only — do not send funds.</p>
          <p className="mt-1">
            This page does not connect a wallet, sign or broadcast
            transactions, store balances, export keys, or recover funds. Test
            secrets exist only in this browser tab and are destroyed on reset
            or reload.
          </p>
        </div>

        {!session ? (
          <button
            className="mt-6 rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800"
            onClick={startDemo}
          >
            Start local demo
          </button>
        ) : (
          <div className="mt-6 grid gap-5">
            <div className="rounded-md border border-black/10 bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-slate-950">
                Public private-receive identifier
              </p>
              <p className="mt-2 break-all font-mono text-xs text-neutral-700">
                {session.stealthMetaAddress}
              </p>
              <p className="mt-2 text-xs text-neutral-500">
                A future audited version could be published as an XDCID
                resolver record. This MVP does not write anything on-chain.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800"
                onClick={generateAddress}
              >
                Generate one-time address
              </button>
              <button
                className="rounded-md border border-black/10 px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-neutral-50"
                onClick={resetDemo}
              >
                Reset and destroy test secrets
              </button>
            </div>

            {announcements.length > 0 && (
              <div className="grid gap-3">
                <h2 className="text-xl font-semibold text-slate-950">
                  Derived destinations
                </h2>
                {announcements.map((announcement, index) => {
                  const verified = announcementBelongsToSession(
                    session,
                    announcement
                  );
                  return (
                    <article
                      className="rounded-md border border-black/10 bg-white p-4"
                      key={announcement.ephemeralPublicKey}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-950">
                          Payment #{index + 1}
                        </p>
                        <span
                          className={
                            "rounded-full px-3 py-1 text-xs font-semibold " +
                            (verified
                              ? "bg-teal-100 text-teal-900"
                              : "bg-red-100 text-red-900")
                          }
                        >
                          {verified
                            ? "Recipient verified locally"
                            : "Verification failed"}
                        </span>
                      </div>
                      <p className="mt-3 break-all font-mono text-sm text-slate-900">
                        {announcement.stealthAddress}
                      </p>
                      <dl className="mt-3 grid gap-2 text-xs text-neutral-600">
                        <div>
                          <dt className="font-semibold">Ephemeral public key</dt>
                          <dd className="break-all font-mono">
                            {announcement.ephemeralPublicKey}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-semibold">View tag</dt>
                          <dd className="font-mono">{announcement.viewTag}</dd>
                        </div>
                      </dl>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-md border border-black/10 bg-white p-5">
          <h2 className="font-semibold text-slate-950">Not a wallet</h2>
          <p className="mt-2 text-sm text-neutral-600">
            No accounts, balances, signing, transaction submission, seed
            phrases, custody, or key export.
          </p>
        </div>
        <div className="rounded-md border border-black/10 bg-white p-5">
          <h2 className="font-semibold text-slate-950">Local only</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Cryptographic operations run in the browser. The MVP has no API
            request and no database.
          </p>
        </div>
        <div className="rounded-md border border-black/10 bg-white p-5">
          <h2 className="font-semibold text-slate-950">Limited privacy</h2>
          <p className="mt-2 text-sm text-neutral-600">
            One-time destinations reduce recipient linkability. They do not
            hide senders, amounts, timing, or later fund consolidation.
          </p>
        </div>
      </section>
    </main>
  );
}
