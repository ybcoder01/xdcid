import { expect } from "chai";
import {
  adminClientBinding,
  isSameOrigin
} from "../frontend/lib/adminSecurity";

describe("admin request security", () => {
  const endpoint = "https://xdcid.xyz/api/admin/auth/challenge";
  const previousSecret = process.env.ADMIN_SESSION_SECRET;

  before(() => {
    process.env.ADMIN_SESSION_SECRET = "test-admin-security-secret-that-is-at-least-32-bytes";
  });

  after(() => {
    if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previousSecret;
  });

  it("accepts an explicitly same-origin browser mutation", () => {
    const request = new Request(endpoint, {
      method: "POST",
      headers: {
        origin: "https://xdcid.xyz",
        "sec-fetch-site": "same-origin"
      }
    });
    expect(isSameOrigin(request)).to.equal(true);
  });

  it("rejects a mutation with no Origin header", () => {
    expect(isSameOrigin(new Request(endpoint, { method: "POST" }))).to.equal(false);
  });

  it("rejects a cross-origin mutation", () => {
    const request = new Request(endpoint, {
      method: "POST",
      headers: {
        origin: "https://phishing.example",
        "sec-fetch-site": "cross-site"
      }
    });
    expect(isSameOrigin(request)).to.equal(false);
  });

  it("rejects a contradictory fetch-metadata header", () => {
    const request = new Request(endpoint, {
      method: "POST",
      headers: {
        origin: "https://xdcid.xyz",
        "sec-fetch-site": "cross-site"
      }
    });
    expect(isSameOrigin(request)).to.equal(false);
  });

  it("binds an administrator session to the client network and user agent", () => {
    const request = new Request(endpoint, {
      headers: {
        "x-forwarded-for": "203.0.113.10",
        "user-agent": "XDCID security test"
      }
    });
    const sameClient = new Request(endpoint, {
      headers: {
        "x-forwarded-for": "203.0.113.10",
        "user-agent": "XDCID security test"
      }
    });
    const differentClient = new Request(endpoint, {
      headers: {
        "x-forwarded-for": "203.0.113.11",
        "user-agent": "XDCID security test"
      }
    });

    expect(adminClientBinding(request)).to.equal(adminClientBinding(sameClient));
    expect(adminClientBinding(request)).not.to.equal(adminClientBinding(differentClient));
  });
});
