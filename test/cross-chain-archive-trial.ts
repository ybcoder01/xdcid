import { expect } from "chai";
import { evaluateCrossChainArchiveAccess } from "../frontend/lib/crossChainArchiveTrial";

describe("cross-chain archive trial access", function () {
  const trial = {
    startedAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: new Date("2026-04-01T00:00:00.000Z")
  };

  it("allows cross-chain history while enforcement is disabled", function () {
    expect(evaluateCrossChainArchiveAccess({
      paywallEnabled: false,
      hasEntitlement: false,
      trial,
      now: new Date("2027-01-01T00:00:00.000Z")
    }).mode).to.equal("enforcement_disabled");
  });

  it("does not start the one-time trial before the first cross-chain payment", function () {
    const access = evaluateCrossChainArchiveAccess({
      paywallEnabled: true,
      hasEntitlement: false,
      trial: null
    });
    expect(access.mode).to.equal("trial_not_started");
    expect(access.crossChainHistoryAllowed).to.equal(true);
  });

  it("allows cross-chain history during the one-time trial", function () {
    const access = evaluateCrossChainArchiveAccess({
      paywallEnabled: true,
      hasEntitlement: false,
      trial,
      now: new Date("2026-03-31T23:59:59.000Z")
    });
    expect(access.mode).to.equal("trial");
    expect(access.crossChainHistoryAllowed).to.equal(true);
  });

  it("requires a subscription after the trial ends", function () {
    const access = evaluateCrossChainArchiveAccess({
      paywallEnabled: true,
      hasEntitlement: false,
      trial,
      now: new Date("2026-04-01T00:00:01.000Z")
    });
    expect(access.mode).to.equal("subscription_required");
    expect(access.crossChainHistoryAllowed).to.equal(false);
  });

  it("allows an active entitlement after the trial ends", function () {
    const access = evaluateCrossChainArchiveAccess({
      paywallEnabled: true,
      hasEntitlement: true,
      trial,
      now: new Date("2027-01-01T00:00:00.000Z")
    });
    expect(access.mode).to.equal("subscription");
    expect(access.crossChainHistoryAllowed).to.equal(true);
  });
});
