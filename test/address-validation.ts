import { expect } from "chai";
import { getAddress, zeroAddress } from "viem";
import {
  isNonZeroAddress,
  requireNonZeroAddress,
} from "../frontend/lib/addressValidation";

describe("address validation", function () {
  it("accepts and checksums a non-zero EVM address", function () {
    const input = "0x9c67d6cfE6A73497e7348b6b852495CA6236C29a";
    expect(isNonZeroAddress(input)).to.equal(true);
    expect(requireNonZeroAddress(input, "Recipient")).to.equal(getAddress(input));
  });

  it("rejects malformed and zero addresses", function () {
    expect(isNonZeroAddress(undefined)).to.equal(false);
    expect(isNonZeroAddress("not-an-address")).to.equal(false);
    expect(isNonZeroAddress(zeroAddress)).to.equal(false);
    expect(() => requireNonZeroAddress(zeroAddress, "Recipient")).to.throw(
      "Recipient must be a non-zero EVM address",
    );
  });
});
