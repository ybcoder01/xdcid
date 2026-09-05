import { expect } from "chai";
import { domainRevenueEventId } from "../frontend/lib/domainRevenueIdentity";

describe("domain revenue indexing", function () {
  const contract = "0xdEaf1742614908a8d170f4c9520c3cd1e967ef36";
  const transaction =
    "0x1111111111111111111111111111111111111111111111111111111111111111";

  it("uses the complete on-chain event identity", function () {
    expect(domainRevenueEventId({
      chainId: 50,
      contractAddress: contract,
      transactionHash: transaction,
      logIndex: 3,
    })).to.equal(`50:${contract.toLowerCase()}:${transaction}:3`);
  });

  it("does not collide for different logs in the same transaction", function () {
    const first = domainRevenueEventId({
      chainId: 50,
      contractAddress: contract,
      transactionHash: transaction,
      logIndex: 0,
    });
    const second = domainRevenueEventId({
      chainId: 50,
      contractAddress: contract,
      transactionHash: transaction,
      logIndex: 1,
    });
    expect(first).not.to.equal(second);
  });
});
