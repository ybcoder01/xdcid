import { expect } from "chai";
import {
  announcementBelongsToSession,
  createPrivateReceiveAddress,
  createPrivateReceiveSession,
  destroyPrivateReceiveSession,
  isPrivateReceiveMetaAddress
} from "../frontend/lib/stealth";

describe("private receive MVP", () => {
  it("derives unique one-time addresses for one receiver", () => {
    const receiver = createPrivateReceiveSession();
    const first = createPrivateReceiveAddress(receiver.stealthMetaAddress);
    const second = createPrivateReceiveAddress(receiver.stealthMetaAddress);

    expect(first.stealthAddress).not.to.equal(second.stealthAddress);
    expect(first.ephemeralPublicKey).not.to.equal(second.ephemeralPublicKey);
    expect(announcementBelongsToSession(receiver, first)).to.equal(true);
    expect(announcementBelongsToSession(receiver, second)).to.equal(true);

    destroyPrivateReceiveSession(receiver);
  });

  it("rejects announcements for another receiver", () => {
    const alice = createPrivateReceiveSession();
    const bob = createPrivateReceiveSession();
    const paymentForAlice = createPrivateReceiveAddress(
      alice.stealthMetaAddress
    );

    expect(announcementBelongsToSession(bob, paymentForAlice)).to.equal(false);

    destroyPrivateReceiveSession(alice);
    destroyPrivateReceiveSession(bob);
  });

  it("zeroizes and invalidates destroyed receiver sessions", () => {
    const receiver = createPrivateReceiveSession();
    const payment = createPrivateReceiveAddress(receiver.stealthMetaAddress);

    destroyPrivateReceiveSession(receiver);

    expect(announcementBelongsToSession(receiver, payment)).to.equal(false);
  });

  it("validates XDC stealth meta-addresses", () => {
    const receiver = createPrivateReceiveSession();

    expect(isPrivateReceiveMetaAddress(receiver.stealthMetaAddress)).to.equal(
      true
    );
    expect(isPrivateReceiveMetaAddress("st:xdc:0x1234")).to.equal(false);
    expect(isPrivateReceiveMetaAddress("st:eth:0x1234")).to.equal(false);

    destroyPrivateReceiveSession(receiver);
  });
});
