import { validateStacksAddress } from '@stacks/transactions';
import { scaffoldConfig } from '@/scaffold.config';
import deployments from '@/generated/deployments.json';

export const LEASH_CONTRACT_ID: string =
  (deployments as { contracts?: Record<string, { contract_id?: string }> }).contracts?.leash?.contract_id ?? '';

export interface Policy {
  owner: string;
  balance: bigint;
  txCap: bigint;
  periodCap: bigint;
  periodLength: bigint;
  periodStart: bigint;
  periodSpent: bigint;
  active: boolean;
  payments: bigint;
}

export type TxStatus = 'pending' | 'success' | 'abort_by_response' | 'error';

export const PERIODS = [
  { label: '10 minutes', seconds: 600 },
  { label: '1 hour', seconds: 3600 },
  { label: '1 day', seconds: 86400 },
] as const;

export const ERRORS: Record<number, string> = {
  100: 'Only the owner can do that',
  101: 'This agent already has a policy',
  102: 'No policy for this agent',
  103: 'Agent is paused or revoked',
  104: 'Recipient not approved',
  105: 'Over the per payment limit',
  106: 'Over the period budget',
  107: 'Not enough funds in the policy',
  108: 'Amount must be above zero',
  109: 'Caps must be above zero, and the budget at least the per payment cap',
  110: 'This wallet already has 20 agents',
};

/** Turns an `(err uNNN)` result into the message for that code. */
export function errorFromRepr(repr: string | null | undefined): string {
  const match = repr?.match(/\(err u(\d+)\)/);
  if (!match) return repr || 'Transaction failed';
  return ERRORS[Number(match[1])] ?? `Contract error u${match[1]}`;
}

/** Strips the `{ type, value }` wrappers cvToValue leaves on nested values. */
export function plain(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw.map(plain);
  if (raw && typeof raw === 'object' && 'type' in raw && 'value' in raw) {
    return plain((raw as { value: unknown }).value);
  }
  if (raw && typeof raw === 'object') {
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, plain(v)]));
  }
  return raw;
}

function big(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' || typeof v === 'string') return BigInt(v);
  return BigInt(0);
}

export function parsePolicy(raw: unknown): Policy | null {
  const p = plain(raw) as Record<string, unknown> | null;
  if (!p || typeof p !== 'object') return null;
  return {
    owner: String(p.owner),
    balance: big(p.balance),
    txCap: big(p['tx-cap']),
    periodCap: big(p['period-cap']),
    periodLength: big(p['period-length']),
    periodStart: big(p['period-start']),
    periodSpent: big(p['period-spent']),
    active: p.active === true,
    payments: big(p.payments),
  };
}

export function parseUint(raw: unknown): bigint {
  return big(plain(raw));
}

export function parsePrincipals(raw: unknown): string[] {
  const list = plain(raw);
  return Array.isArray(list) ? list.map(String) : [];
}

/** "1.5" STX to 1500000 micro STX. Returns null for anything that is not a positive amount. */
export function toMicroStx(stx: string): bigint | null {
  const match = stx.trim().match(/^(\d+)(?:\.(\d{0,6}))?$/);
  if (!match) return null;
  const micro = BigInt(match[1]) * BigInt(1_000_000) + BigInt((match[2] ?? '').padEnd(6, '0') || '0');
  return micro > BigInt(0) ? micro : null;
}

export function formatStx(micro: bigint): string {
  const whole = micro / BigInt(1_000_000);
  const frac = (micro % BigInt(1_000_000)).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function isAddress(value: string): boolean {
  return validateStacksAddress(value.trim());
}

export function shortAddr(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export function periodLabel(seconds: bigint): string {
  const found = PERIODS.find(p => BigInt(p.seconds) === seconds);
  if (found) return found.label;
  const s = Number(seconds);
  if (s % 3600 === 0) return `${s / 3600} hours`;
  if (s % 60 === 0) return `${s / 60} minutes`;
  return `${s} seconds`;
}

export function explorerTx(txid: string): string {
  return `${scaffoldConfig.explorerBaseUrl}${txid}${scaffoldConfig.explorerChainQuery}`;
}

export function hiroHeaders(): Record<string, string> {
  return scaffoldConfig.hiroApiKey ? { 'x-api-key': scaffoldConfig.hiroApiKey } : {};
}

/** Polls Hiro until the transaction leaves the mempool. */
export async function waitForTx(txid: string): Promise<{ status: TxStatus; repr: string | null }> {
  for (let attempt = 0; attempt < 200; attempt++) {
    await new Promise(r => setTimeout(r, attempt === 0 ? 1500 : 3000));
    try {
      const res = await fetch(`${scaffoldConfig.nodeUrl}/extended/v1/tx/${txid}`, {
        headers: hiroHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) continue;
      const tx = await res.json();
      const status = String(tx?.tx_status ?? '');
      const repr = tx?.tx_result?.repr ?? null;
      if (status === 'success') return { status: 'success', repr };
      if (status.startsWith('abort')) return { status: 'abort_by_response', repr };
      if (status.startsWith('dropped')) return { status: 'error', repr: `Dropped: ${status}` };
    } catch {
      // Network blip, try again.
    }
  }
  return { status: 'error', repr: 'Timed out waiting for the transaction' };
}
