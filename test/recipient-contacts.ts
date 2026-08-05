import { expect } from "chai";
import {
  normalizeRecipientName,
  parseRecipientContacts,
  renameRecipientContact,
  setRecipientContactFavorite,
  upsertRecipientContact
} from "../frontend/lib/recipientContacts";

const addressOne = "0x1111111111111111111111111111111111111111";
const addressTwo = "0x2222222222222222222222222222222222222222";
const hashOne =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const hashTwo =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("recipient contacts", () => {
  it("normalizes valid XNS names and rejects unsafe labels", () => {
    expect(normalizeRecipientName("Alice")).to.equal("alice.xdc");
    expect(normalizeRecipientName("alice.xdc")).to.equal("alice.xdc");
    expect(normalizeRecipientName("-alice")).to.equal("");
    expect(normalizeRecipientName("ab")).to.equal("");
  });

  it("records a confirmed recipient without storing the payment amount", () => {
    const contacts = upsertRecipientContact(
      [],
      {
        name: "alice",
        resolvedAddress: addressOne,
        sourceChainId: 8453,
        destinationChainId: 50,
        asset: "USDC",
        transactionHash: hashOne
      },
      "2026-08-05T10:00:00.000Z"
    );

    expect(contacts).to.have.length(1);
    expect(contacts[0]).to.include({
      name: "alice.xdc",
      lastResolvedAddress: addressOne,
      transactionCount: 1,
      lastSourceChainId: 8453,
      lastDestinationChainId: 50,
      lastAsset: "USDC"
    });
    expect(contacts[0]).not.to.have.property("amount");
  });

  it("does not count the same transaction twice", () => {
    const first = upsertRecipientContact([], {
      name: "alice.xdc",
      resolvedAddress: addressOne,
      sourceChainId: 50,
      destinationChainId: 50,
      asset: "NATIVE",
      transactionHash: hashOne
    });
    const repeated = upsertRecipientContact(first, {
      name: "alice.xdc",
      resolvedAddress: addressOne,
      sourceChainId: 50,
      destinationChainId: 50,
      asset: "NATIVE",
      transactionHash: hashOne
    });

    expect(repeated[0].transactionCount).to.equal(1);
  });

  it("preserves labels and favorites when a recipient is used again", () => {
    const first = upsertRecipientContact([], {
      name: "alice.xdc",
      resolvedAddress: addressOne,
      sourceChainId: 50,
      destinationChainId: 50,
      asset: "NATIVE",
      transactionHash: hashOne
    });
    const renamed = renameRecipientContact(first, "alice.xdc", "Payroll");
    const favorite = setRecipientContactFavorite(
      renamed,
      "alice.xdc",
      true
    );
    const updated = upsertRecipientContact(favorite, {
      name: "alice.xdc",
      resolvedAddress: addressTwo,
      sourceChainId: 42161,
      destinationChainId: 8453,
      asset: "USDC",
      transactionHash: hashTwo
    });

    expect(updated[0]).to.include({
      label: "Payroll",
      favorite: true,
      lastResolvedAddress: addressTwo,
      transactionCount: 2,
      lastSourceChainId: 42161,
      lastDestinationChainId: 8453
    });
  });

  it("ignores malformed browser storage", () => {
    expect(parseRecipientContacts("not-json")).to.deep.equal([]);
    expect(parseRecipientContacts(JSON.stringify([{ name: "alice.xdc" }]))).to.deep.equal([]);
  });
});
