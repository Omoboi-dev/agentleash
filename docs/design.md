# Agent Leash: design

Agent Leash gives an AI agent a budget it cannot break. A person funds a policy for an agent key. The agent can only pay recipients the owner approved, never more than a set amount per payment, and never more than a set budget per period. The owner can pause the agent, change its limits, withdraw funds, or revoke it and get the whole balance back in one transaction.

The limits live in a Clarity contract on Stacks, so they hold even if the agent's code is buggy, prompt injected, or its key is stolen. The worst case is capped by the contract, not by trust in the agent.

Built with Scaffold Stacks (`stacksdapp`), Clarity 6, deployed to Stacks testnet.

## Roles

| Role | Who | What they can do |
| --- | --- | --- |
| Owner | A person with a Leather or Xverse wallet | Create and fund a policy, set limits, approve recipients, pause, withdraw, revoke |
| Agent | A key held by a bot (our demo script) | Call `pay` and nothing else |
| Recipient | Any Stacks address the owner approved | Receives payments |

## Contract: `contracts/contracts/leash.clar`

One contract holds every policy. STX sits in the contract, and each policy tracks its own balance, so one policy can never spend another policy's funds.

### Storage

`policies`: agent principal to policy

| Field | Meaning |
| --- | --- |
| `owner` | Who created the policy. Only this principal can change it |
| `balance` | STX (in micro STX) held for this agent |
| `tx-cap` | Largest single payment |
| `period-cap` | Most the agent can spend in one period |
| `period-length` | Period length in seconds |
| `period-start` | Unix time the current period started |
| `period-spent` | Spent so far in the current period |
| `active` | False when paused or revoked |
| `payments` | Count of successful payments |

`allowed`: `{ agent, recipient }` to bool. The recipient allowlist.

`owner-agents`: owner to a list of up to 20 agents, so the dashboard can find an owner's policies.

An agent key has exactly one policy. Use a new key for a new policy.

### Public functions

| Function | Caller | Does |
| --- | --- | --- |
| `create-policy (agent tx-cap period-cap period-length initial-deposit)` | Owner | Moves the deposit into the contract and creates an active policy |
| `deposit (agent amount)` | Owner | Adds funds |
| `withdraw (agent amount)` | Owner | Takes funds back, policy stays |
| `set-limits (agent tx-cap period-cap period-length)` | Owner | Changes the limits |
| `set-recipient (agent recipient is-allowed)` | Owner | Adds or removes a recipient |
| `set-active (agent active)` | Owner | Pause or resume |
| `revoke (agent)` | Owner | Kill switch: pauses and refunds the full balance to the owner, returns the refunded amount |
| `pay (recipient amount memo)` | Agent | Pays a recipient if every rule passes, returns spent this period |

### Read functions

| Function | Returns |
| --- | --- |
| `get-policy (agent)` | The policy, or none |
| `get-agents (owner)` | The owner's agents |
| `is-recipient-allowed (agent recipient)` | bool |
| `get-available (agent)` | What the agent could spend right now: the lower of the period budget left and the balance, or 0 when paused |

### Rules `pay` enforces, in order

1. The caller has a policy (`u102`)
2. The policy is active (`u103`)
3. The amount is above zero (`u108`)
4. The recipient is on the allowlist (`u104`)
5. The amount is at most `tx-cap` (`u105`)
6. Spent this period plus the amount is at most `period-cap` (`u106`)
7. The amount is at most the balance (`u107`)

The period rolls over when `stacks-block-time` passes `period-start + period-length`. At that point spending resets to zero and the new period starts at the current time.

### Error codes

| Code | Name | Shown to the user as |
| --- | --- | --- |
| u100 | ERR_NOT_OWNER | Only the owner can do that |
| u101 | ERR_POLICY_EXISTS | This agent already has a policy |
| u102 | ERR_NO_POLICY | No policy for this agent |
| u103 | ERR_PAUSED | Agent is paused or revoked |
| u104 | ERR_RECIPIENT_NOT_ALLOWED | Recipient not approved |
| u105 | ERR_OVER_TX_CAP | Over the per payment limit |
| u106 | ERR_OVER_PERIOD_CAP | Over the period budget |
| u107 | ERR_INSUFFICIENT_BALANCE | Not enough funds in the policy |
| u108 | ERR_INVALID_AMOUNT | Amount must be above zero |
| u109 | ERR_INVALID_LIMITS | Caps must be above zero, period cap at least the per payment cap, period above zero |
| u110 | ERR_TOO_MANY_AGENTS | Owner already has 20 agents |

### Events

Every write prints an event with an `event` field: `policy-created`, `deposit`, `withdraw`, `limits-updated`, `recipient-updated`, `active-updated`, `revoked`, `payment`. The `payment` event carries the agent, recipient, amount, memo, period spend and new balance.

### Security choices

- **Authorization uses `contract-caller`.** A malicious contract the owner or agent is tricked into calling cannot act as them here.
- **Outgoing STX uses Clarity 6 `as-contract?` with a `with-stx` allowance.** Each payout can move at most the exact amount being paid. If the code inside ever tried to move more, the transaction would abort.
- **Funding calls transfer from `contract-caller`.** They only succeed when the owner signs directly.
- **Rejections are real onchain results.** A blocked payment is a confirmed transaction with an error code on the explorer, not a check in our UI.
- **Known limit:** the agent pays its own transaction fees in STX, so its key needs a small fee balance outside the policy. The policy caps what it can send, not what it can burn on fees.

### Tests: `contracts/tests/leash.test.ts`

Ten tests cover: a successful payment and balance movement, unapproved recipient, per payment cap, period cap with rollover after time passes, insufficient balance, owner only changes, revoke with refund, pause and resume, invalid limits and duplicate policy, and listing agents. Breaking the period cap check or the owner check on purpose makes the matching test fail, so the suite does catch those regressions.

## Frontend: `frontend/`

Next.js 15 from the Scaffold Stacks template. All contract calls go through the generated hooks in `frontend/src/generated/hooks.ts` (for example `useLeash_CreatePolicy`, `useLeash_Pay`, `useLeash_GetPolicy`). Nothing in `frontend/src/generated/` is edited by hand.

### Screens

One page for the owner, plus the template's debug panel moved to `/debug`.

1. **Header:** name, network badge, wallet connect (from the template).
2. **Create policy:** agent address, per payment cap (STX), period budget (STX), period (10 minutes, 1 hour, 1 day), first deposit (STX).
3. **Your agents:** from `get-agents`. Select one to manage it.
4. **Policy card:** status (active, paused, revoked), balance, a bar for spent this period against the period budget, available now, when the period resets, payment count.
5. **Recipients:** add or remove an address with `set-recipient`.
6. **Controls:** deposit, withdraw, edit limits, pause or resume, and a red Revoke button with a confirm step.
7. **Activity:** every `pay` call this agent made, both successful and rejected, newest first. Rejections show the reason from the error table. Each row links to the Hiro explorer.

### Data

- Contract reads use the generated read hooks. Their `data` comes back in `cvToValue` shapes, so one helper in `frontend/src/lib/leash.ts` turns a policy into plain numbers.
- Activity comes from the Hiro API, `GET /extended/v1/address/{contractId}/transactions`, filtered to `contract_call.function_name == "pay"` and `sender_address == agent`. This returns failed calls too (`tx_status: abort_by_response`), which is the point of the demo. Poll every 10 seconds.
- Amounts are entered in STX and sent as micro STX (`x 1,000,000`).
- `create-policy` and `deposit` send a post condition that the owner sends exactly the deposit amount.

## Agent script: `agent/`

A small Node script that plays the agent. It signs with the agent's private key, not a wallet.

- `node --env-file=.env run.mjs status` prints the policy and what is available now.
- `node --env-file=.env run.mjs pay <stx> "<memo>"` makes one payment to `MERCHANT`.
- `node --env-file=.env run.mjs demo` runs the scripted story below.

It uses `@stacks/transactions` `makeContractCall` with post condition mode deny and a post condition that the leash contract sends at most the payment amount. It waits for each transaction to confirm and prints the result, turning error codes into the names in the table above.

Environment (`agent/.env`, never committed): `AGENT_PRIVATE_KEY`, `LEASH_CONTRACT` (`ST....leash`), `MERCHANT`, `STRANGER` (an address that is not approved).

## Flows

### 1. Setup (once)

1. Owner opens the app on Vercel and connects Leather or Xverse on testnet.
2. Owner creates a policy for the agent's address: per payment cap 1 STX, budget 3 STX per 10 minutes, deposit 10 STX. The wallet asks to send 10 STX. The contract now holds it.
3. Owner approves the merchant address as a recipient.
4. The agent key gets about 1 STX from the faucet for fees.

### 2. The agent pays (happy path)

1. Agent script checks `get-available`.
2. It calls `pay(merchant, 1 STX, "weather api")`, signed with the agent key.
3. The contract checks the rules, moves 1 STX from the policy to the merchant, updates the period spend, prints a `payment` event.
4. The dashboard's activity feed shows the payment and the budget bar moves.

### 3. The agent misbehaves and is blocked

1. The script tries to pay 2 STX. The contract returns `u105`, over the per payment limit.
2. It tries to pay the stranger address. The contract returns `u104`, recipient not approved.
3. It pays 1 STX twice more, then tries again. The contract returns `u106`, over the period budget.
4. Every rejection is a confirmed failed transaction. The dashboard shows each one in red with the reason.

### 4. The owner pulls the leash

1. Owner clicks Revoke and confirms.
2. `revoke` pauses the policy and returns the remaining balance to the owner in the same transaction.
3. The agent's next `pay` returns `u103`. Available now shows 0.

### 5. Period reset

After the period passes, spent this period goes back to zero on the next payment and the budget bar resets.

## Demo script for the X post

Screen record the dashboard next to a terminal running `run.mjs demo`: three approved payments land, the over limit, stranger and over budget attempts fail in red, the owner hits Revoke, the final attempt fails as paused. Under a minute.
