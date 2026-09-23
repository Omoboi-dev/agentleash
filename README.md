# Agent Leash

Give your AI agent a budget it cannot break. An owner funds a spending policy for an agent key, and a Clarity contract on Stacks enforces who the agent can pay, how much per payment, and how much per period, with a one click revoke that returns the funds.

- Contract (testnet): [`ST3DJQ6BC8EDG1NPRA05PZWKE78P33FXH6TXEWVXD.leash`](https://explorer.hiro.so/txid/ST3DJQ6BC8EDG1NPRA05PZWKE78P33FXH6TXEWVXD.leash?chain=testnet)
- App: (https://agentleash-kappa.vercel.app/)
- Design: [docs/design.md](docs/design.md)

Built with [Scaffold Stacks](https://scaffoldstacks.mintlify.app/) (`stacksdapp`), Clarity 6 and Next.js.

## Run locally

Needs Rust, Node 20+, Clarinet 3.23+ and `cargo install stacksdapp`.

```bash
stacksdapp check && stacksdapp test   # type check and run the contract tests
stacksdapp dev --network testnet      # app on http://localhost:3000
```

Connect Leather or Xverse on testnet, create a policy for your agent's address, and approve a recipient.

## Run the agent

The agent is a small Node script in `agent/` that signs with the agent key and pays only through the contract.

```bash
cd agent
npm install
cp .env.example .env                  # set MERCHANT to the recipient you approved
npm run status                        # policy and what the agent can spend now
npm run demo                          # six payments: three pass, three get blocked
npm run pay -- 1 "one call"           # a single payment
```

The key is read from `~/.stacks-keys/agentleash-agent.json` (the output of `npx @stacks/cli make_keychain -t`), so it never lives in the repo. Give the agent address a little testnet STX for fees.
