import { expect } from "chai";
import {
  buildAdminChallenge,
  createAdminSession,
  hashAdminMessage,
  parseAdminSession,
} from "../frontend/lib/adminAuth";

describe("admin authentication", function () {
  const address = "0xe82a4267CC310FC6Db334601671A043DFc8Ce06A" as const;
  let previousSecret: string | undefined;

  beforeEach(function () {
    previousSecret = process.env.ADMIN_SESSION_SECRET;
    process.env.ADMIN_SESSION_SECRET = "test-only-secret-that-is-longer-than-thirty-two-bytes";
  });

  afterEach(function () {
    if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previousSecret;
  });

  it("creates and verifies a short-lived signed session", function () {
    const session = createAdminSession(address);
    const parsed = parseAdminSession(session.token);
    expect(parsed?.address).to.equal(address);
    expect(parsed?.expiresAt).to.be.greaterThan(parsed?.issuedAt || 0);
  });

  it("rejects a modified session", function () {
    const session = createAdminSession(address);
    const [payload, signature] = session.token.split(".");
    expect(parseAdminSession(`${payload}x.${signature}`)).to.equal(null);
  });

  it("binds a login challenge to origin, address, nonce and expiry", function () {
    const issuedAt = new Date("2026-08-10T10:00:00.000Z");
    const expiresAt = new Date("2026-08-10T10:05:00.000Z");
    const message = buildAdminChallenge(
      "https://xdcid.xyz",
      address,
      "nonce",
      issuedAt,
      expiresAt,
    );
    expect(message).to.contain("URI: https://xdcid.xyz/admin");
    expect(message).to.contain(`Address: ${address}`);
    expect(message).to.contain("Expiration Time: 2026-08-10T10:05:00.000Z");
    expect(hashAdminMessage(message)).to.match(/^[a-f0-9]{64}$/);
  });
});
