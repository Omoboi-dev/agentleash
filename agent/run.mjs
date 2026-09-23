// Agent Leash demo agent. Signs with the agent key and spends only through the leash contract.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  Cl,
  Pc,
  PostConditionMode,
  broadcastTransaction,
  cvToValue,
  fetchCallReadOnlyFunction,
  fetchNonce,
  getAddressFromPrivateKey,
  makeContractCall,
} from '@stacks/transactions';

const NETWORK = 'testnet';
const API = 'https://api.testnet.hiro.so';

const ERRORS = {
  100: 'ERR_NOT_OWNER: only the owner can do that',
  101: 'ERR_POLICY_EXISTS: this agent already has a policy',
  102: 'ERR_NO_POLICY: no policy for this agent',
  103: 'ERR_PAUSED: agent is paused or revoked',
  104: 'ERR_RECIPIENT_NOT_ALLOWED: recipient not approved',
  105: 'ERR_OVER_TX_CAP: over the per payment limit',
  106: 'ERR_OVER_PERIOD_CAP: over the period budget',
  107: 'ERR_INSUFFICIENT_BALANCE: not enough funds in the policy',
  108: 'ERR_INVALID_AMOUNT: amount must be above zero',
};

function loadPrivateKey() {
  if (process.env.AGENT_PRIVATE_KEY) return process.env.AGENT_PRIVATE_KEY.trim();
  const file = (process.env.AGENT_KEY_FILE ?? '~/.stacks-keys/agentleash-agent.json').replace(/^~/, homedir());
  try {
    return JSON.parse(readFileSync(file, 'utf8')).keyInfo.privateKey;
  } catch {
    fail(`Could not read the agent key from ${file}. Set AGENT_KEY_FILE or AGENT_PRIVATE_KEY.`);
  }
}

function loadContractId() {
  if (process.env.LEASH_CONTRACT) return process.env.LEASH_CONTRACT.trim();
  const path = join(import.meta.dirname, '../frontend/src/generated/deployments.json');
  const id = JSON.parse(readFileSync(path, 'utf8'))?.contracts?.leash?.contract_id;
  if (!id) fail('No leash contract in deployments.json. Deploy first or set LEASH_CONTRACT.');
  return id;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const toMicro = stx => BigInt(Math.round(Number(stx) * 1_000_000));
const toStx = micro => (Number(micro) / 1_000_000).toString();
const plain = v => (v && typeof v === 'object' && 'value' in v ? plain(v.value) : v);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const privateKey = loadPrivateKey();
const agent = getAddressFromPrivateKey(privateKey, NETWORK);
const contractId = loadContractId();
const [contractAddress, contractName] = contractId.split('.');

async function readOnly(functionName, args) {
  const result = await fetchCallReadOnlyFunction({
    contractAddress,
    contractName,
    functionName,
    functionArgs: args,
    senderAddress: agent,
    network: NETWORK,
  });
  return cvToValue(result);
}

async function status() {
  const policy = await readOnly('get-policy', [Cl.principal(agent)]);
  if (!policy) {
    console.log(`Agent ${agent} has no policy on ${contractId}.`);
    return;
  }
  const p = Object.fromEntries(Object.entries(plain(policy)).map(([k, v]) => [k, plain(v)]));
  const available = await readOnly('get-available', [Cl.principal(agent)]);
  console.log(`Agent      ${agent}`);
  console.log(`Owner      ${p.owner}`);
  console.log(`Status     ${p.active ? 'active' : 'paused or revoked'}`);
  console.log(`Balance    ${toStx(p.balance)} STX`);
  console.log(`Available  ${toStx(available)} STX now`);
  console.log(`Limits     ${toStx(p['tx-cap'])} STX per payment, ${toStx(p['period-cap'])} STX per ${p['period-length']}s`);
}

async function waitForTx(txid) {
  for (let i = 0; i < 200; i++) {
    await sleep(i === 0 ? 2000 : 3000);
    const res = await fetch(`${API}/extended/v1/tx/${txid}`).catch(() => null);
    if (!res?.ok) continue;
    const tx = await res.json();
    if (tx.tx_status === 'pending') continue;
    return tx;
  }
  return { tx_status: 'timeout' };
}

function describe(tx) {
  if (tx.tx_status === 'success') {
    const spent = plain(tx.tx_result?.repr?.match(/\(ok u(\d+)\)/)?.[1]);
    return `PAID. spent this period: ${spent ? toStx(spent) : '?'} STX`;
  }
  const code = tx.tx_result?.repr?.match(/\(err u(\d+)\)/)?.[1];
  if (code) return `BLOCKED by the contract, ${ERRORS[code] ?? `error u${code}`}`;
  return `FAILED (${tx.tx_status}${tx.tx_result?.repr ? `: ${tx.tx_result.repr}` : ''})`;
}

async function pay(recipient, stx, memo, nonce) {
  const amount = toMicro(stx);
  const transaction = await makeContractCall({
    contractAddress,
    contractName,
    functionName: 'pay',
    functionArgs: [Cl.principal(recipient), Cl.uint(amount), Cl.stringAscii(memo.slice(0, 64))],
    senderKey: privateKey,
    network: NETWORK,
    nonce,
    postConditionMode: PostConditionMode.Deny,
    // The contract may send at most the amount asked for, and nothing else can move.
    postConditions: [Pc.principal(contractId).willSendLte(amount).ustx()],
  });
  const sent = await broadcastTransaction({ transaction, network: NETWORK });
  if (sent.error) return { line: `REJECTED by the node: ${sent.reason ?? sent.error}` };
  const tx = await waitForTx(sent.txid);
  return { line: describe(tx), txid: sent.txid };
}

async function runPay(recipient, stx, memo, nonce, label) {
  process.stdout.write(`${label}pay ${stx} STX to ${recipient.slice(0, 6)}…${recipient.slice(-4)} "${memo}" … `);
  const { line, txid } = await pay(recipient, stx, memo, nonce);
  console.log(line);
  if (txid) console.log(`    https://explorer.hiro.so/txid/${txid}?chain=testnet`);
}

function merchant() {
  const m = process.env.MERCHANT?.trim();
  if (!m) fail('Set MERCHANT in agent/.env to an approved recipient address.');
  return m;
}

async function demo() {
  const shop = merchant();
  // Anything not on the allowlist works as the stranger; default to the contract deployer.
  const stranger = process.env.STRANGER?.trim() || contractAddress;
  const steps = [
    [shop, '1', 'weather api'],
    [shop, '2', 'premium data feed'],
    [stranger, '1', 'unknown address'],
    [shop, '1', 'search api'],
    [shop, '1', 'maps api'],
    [shop, '1', 'one more call'],
  ];
  console.log(`Agent ${agent} running ${steps.length} payments through ${contractId}\n`);
  let nonce = await fetchNonce({ address: agent, network: NETWORK });
  for (const [i, [to, stx, memo]] of steps.entries()) {
    await runPay(to, stx, memo, nonce, `${i + 1}. `);
    nonce += BigInt(1);
  }
  console.log('\nNow hit Revoke in the dashboard, then run: npm run pay -- 1 "after revoke"');
}

const [command, ...args] = process.argv.slice(2);

if (command === 'status') {
  await status();
} else if (command === 'pay' && args[0]) {
  const nonce = await fetchNonce({ address: agent, network: NETWORK });
  await runPay(args[2] ?? merchant(), args[0], args[1] ?? 'manual payment', nonce, '');
} else if (command === 'demo') {
  await demo();
} else {
  console.log(`Usage (from agent/):
  npm run status                      show the policy and what the agent can spend
  npm run pay -- <stx> "<memo>" [to]  make one payment (to defaults to MERCHANT)
  npm run demo                        run the scripted demo

Reads the key from ~/.stacks-keys/agentleash-agent.json (override with AGENT_KEY_FILE or AGENT_PRIVATE_KEY)
and the contract from ../frontend/src/generated/deployments.json (override with LEASH_CONTRACT).`);
}
