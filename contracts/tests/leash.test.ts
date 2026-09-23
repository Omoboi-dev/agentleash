import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const owner = accounts.get("wallet_1")!;
const agent = accounts.get("wallet_2")!;
const merchant = accounts.get("wallet_3")!;
const stranger = accounts.get("deployer")!;

const STX = 1_000_000;
const DAY = 86_400;

function setup(deposit = 20 * STX) {
  const created = simnet.callPublicFn(
    "leash",
    "create-policy",
    [Cl.principal(agent), Cl.uint(2 * STX), Cl.uint(5 * STX), Cl.uint(DAY), Cl.uint(deposit)],
    owner,
  );
  expect(created.result).toBeOk(Cl.bool(true));
  const allowed = simnet.callPublicFn(
    "leash",
    "set-recipient",
    [Cl.principal(agent), Cl.principal(merchant), Cl.bool(true)],
    owner,
  );
  expect(allowed.result).toBeOk(Cl.bool(true));
}

const pay = (amount: number, to = merchant, from = agent) =>
  simnet.callPublicFn("leash", "pay", [Cl.principal(to), Cl.uint(amount), Cl.stringAscii("api call")], from);

const available = () => simnet.callReadOnlyFn("leash", "get-available", [Cl.principal(agent)], owner).result;

describe("leash", () => {
  it("escrows the deposit and lets the agent pay an allowed recipient", () => {
    const before = simnet.getAssetsMap().get("STX")!.get(merchant)!;
    setup();
    expect(pay(2 * STX).result).toBeOk(Cl.uint(2 * STX));
    expect(simnet.getAssetsMap().get("STX")!.get(merchant)!).toBe(before + BigInt(2 * STX));
    expect(available()).toBeUint(3 * STX);
  });

  it("rejects a recipient that is not allowlisted", () => {
    setup();
    expect(pay(STX, stranger).result).toBeErr(Cl.uint(104));
  });

  it("rejects a payment above the per payment cap", () => {
    setup();
    expect(pay(3 * STX).result).toBeErr(Cl.uint(105));
  });

  it("rejects spending past the period cap, then resets after the period", () => {
    setup();
    expect(pay(2 * STX).result).toBeOk(Cl.uint(2 * STX));
    expect(pay(2 * STX).result).toBeOk(Cl.uint(4 * STX));
    expect(pay(2 * STX).result).toBeErr(Cl.uint(106));
    simnet.mineEmptyBlocks(Math.ceil(DAY / 600) + 10);
    expect(pay(2 * STX).result).toBeOk(Cl.uint(2 * STX));
  });

  it("rejects a payment above the remaining balance", () => {
    setup(3 * STX);
    expect(pay(2 * STX).result).toBeOk(Cl.uint(2 * STX));
    expect(pay(2 * STX).result).toBeErr(Cl.uint(107));
  });

  it("only the owner can change the policy", () => {
    setup();
    const r = simnet.callPublicFn("leash", "set-limits", [Cl.principal(agent), Cl.uint(100 * STX), Cl.uint(100 * STX), Cl.uint(DAY)], agent);
    expect(r.result).toBeErr(Cl.uint(100));
    const w = simnet.callPublicFn("leash", "withdraw", [Cl.principal(agent), Cl.uint(STX)], stranger);
    expect(w.result).toBeErr(Cl.uint(100));
  });

  it("revoke stops the agent and refunds the owner", () => {
    setup();
    pay(2 * STX);
    const before = simnet.getAssetsMap().get("STX")!.get(owner)!;
    const r = simnet.callPublicFn("leash", "revoke", [Cl.principal(agent)], owner);
    expect(r.result).toBeOk(Cl.uint(18 * STX));
    expect(simnet.getAssetsMap().get("STX")!.get(owner)!).toBe(before + BigInt(18 * STX));
    expect(pay(STX).result).toBeErr(Cl.uint(103));
    expect(available()).toBeUint(0);
  });

  it("pause and resume", () => {
    setup();
    simnet.callPublicFn("leash", "set-active", [Cl.principal(agent), Cl.bool(false)], owner);
    expect(pay(STX).result).toBeErr(Cl.uint(103));
    simnet.callPublicFn("leash", "set-active", [Cl.principal(agent), Cl.bool(true)], owner);
    expect(pay(STX).result).toBeOk(Cl.uint(STX));
  });

  it("rejects bad limits and a second policy for the same agent", () => {
    const bad = simnet.callPublicFn("leash", "create-policy", [Cl.principal(agent), Cl.uint(5 * STX), Cl.uint(STX), Cl.uint(DAY), Cl.uint(STX)], owner);
    expect(bad.result).toBeErr(Cl.uint(109));
    setup();
    const again = simnet.callPublicFn("leash", "create-policy", [Cl.principal(agent), Cl.uint(STX), Cl.uint(STX), Cl.uint(DAY), Cl.uint(STX)], owner);
    expect(again.result).toBeErr(Cl.uint(101));
  });

  it("lists the owner's agents", () => {
    setup();
    const r = simnet.callReadOnlyFn("leash", "get-agents", [Cl.principal(owner)], owner);
    expect(r.result).toBeList([Cl.principal(agent)]);
  });
});
