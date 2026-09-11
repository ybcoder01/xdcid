import assert from "node:assert/strict";
import test from "node:test";
import { getAddress } from "viem";
import { createXdcidApiClient, XdcidApiError } from "../dist/api.js";

const wallet = getAddress("0x1111111111111111111111111111111111111111");

test("calls read APIs with encoded inputs and returns envelope data", async () => {
  const requests = [];
  const api = createXdcidApiClient({
    baseUrl: "https://example.test/root",
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      return Response.json({
        version: "v1",
        data: { address: wallet, name: "alice.xdc", verified: true }
      });
    }
  });

  const result = await api.reverseResolve(wallet.toLowerCase());
  assert.equal(result.name, "alice.xdc");
  assert.equal(
    requests[0].url,
    `https://example.test/api/v1/reverse/${wallet}`
  );
});

test("creates registrar quotes with normalized wallet addresses", async () => {
  let received;
  const api = createXdcidApiClient({
    fetch: async (_url, init) => {
      received = JSON.parse(String(init.body));
      return Response.json({ version: "v1", data: { authorizedForPayment: true } });
    }
  });

  await api.createRegistrarQuote({
    name: "alice.xdc",
    product: "registration",
    termYears: 1,
    paymentCurrency: "USDC",
    payer: wallet.toLowerCase(),
    nameOwner: wallet.toLowerCase()
  });
  assert.equal(received.payer, wallet);
  assert.equal(received.nameOwner, wallet);
});

test("surfaces versioned API errors with status and code", async () => {
  const api = createXdcidApiClient({
    fetch: async () => Response.json(
      { version: "v1", error: { code: "NAME_UNAVAILABLE", message: "Already registered" } },
      { status: 409 }
    )
  });

  await assert.rejects(
    () => api.getName("alice"),
    (error) =>
      error instanceof XdcidApiError &&
      error.status === 409 &&
      error.code === "NAME_UNAVAILABLE" &&
      error.message === "Already registered"
  );
});

test("supports raw Pay Link creation and status APIs", async () => {
  const calls = [];
  const api = createXdcidApiClient({
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/api/pay-links")) {
        return Response.json({
          id: "rq_example",
          path: "/pay/alice.xdc?id=rq_example",
          expiresAt: "2030-01-01T00:00:00.000Z",
          revocationToken: "secret"
        }, { status: 201 });
      }
      return Response.json({
        requestId: "0x" + "1".repeat(64),
        cancelled: false,
        paid: false,
        status: "active"
      });
    }
  });

  const created = await api.createPayLink({ request: "0x12", signature: "0x34" });
  assert.equal(created.id, "rq_example");
  const status = await api.getPayLinkStatus(`0x${"1".repeat(64)}`);
  assert.equal(status.status, "active");
  assert.equal(calls.length, 2);
});
