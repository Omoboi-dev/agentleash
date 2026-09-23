# Scaffold Stacks feedback log

Running notes for the bounty feedback. Times are 2026-09-23.

## Setup

- `stacksdapp` 0.1.8 `doctor` passed with Clarinet 3.20.0, even though the docs say Clarinet 3.23+ is required for Clarity 6.
- After upgrading to 0.2.2, `doctor` warns "Clarinet 3.21+ required". The docs say 3.23+. The two should agree.
- Upgrading the CLI with `cargo install stacksdapp --force` took about 4.5 minutes to compile. A prebuilt binary would help.
- `stacksdapp new` scaffolded, installed and made the first git commit in one command. Worked first time.

## Contract work

- Clarity 6 `as-contract?` with `with-stx`, `stacks-block-time` and `current-contract` all worked with Clarinet 3.24.
- Naming a parameter `deposit` in a contract that also has a `deposit` function fails with "defining 'deposit' conflicts with previous value", which points at the enclosing function, not the parameter. Easy to fix once understood.
- The linter flags `ERR-NAME` constants and wants `ERR_NAME`. The Clarity docs and most examples use hyphens, so this surprised us.
- The check pass prints 14 "use of potentially unchecked data" warnings for normal owner supplied arguments. Noisy for a new user; a short note in the docs on what they mean would help.
- The template's devnet has only `deployer` and `wallet_1` to `wallet_3`. Our test used `wallet_4` and failed with a raw WASM error ("Cannot read properties of undefined (reading 'length')") instead of "unknown account".
- `stacksdapp check`, `generate` and `test` ran cleanly and fast.

## Generated code

- `generate` produced typed hooks for all 12 functions, including ones taking tuples and optional returns.
- Every generated write call hardcodes `postConditionMode: 'allow'`. For a template people copy, deny by default (with post conditions passed in) would be safer.
- The generated write hooks always call the contract function with an empty post condition list (`fn(functionArgs, [])`), so a hook cannot carry post conditions at all. We called the generated `leash_createPolicy` and `leash_deposit` functions directly for the two calls that move the owner's STX.
- Each generated hook repeats about 140 lines of the same transaction polling code. A shared helper would make `hooks.ts` much easier to read.
- Read hooks do not run on their own; you call `call()` in an effect. Fine once known, but the docs could show that pattern.

## Deploy and frontend

- `stacksdapp deploy --network testnet --yes` worked first time and wrote `deployments.json`.
- On a fresh checkout, `npm run typecheck` in `frontend` fails on the template's own `Header.tsx` (`Cannot find module '@/public/logo.png'`) until `next build` has created `next-env.d.ts`.
- Running the contract tests rewrites `contracts/deployments/default.simnet-plan.yaml` (drops `costs-5`), leaving a dirty git tree after every test run.

## Time

- Scaffold to tested contract deployed on testnet: about 30 minutes
- Scaffold to full app live on Vercel, with a real agent demo: about 4 hours
