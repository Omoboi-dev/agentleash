"use client";
import { useEffect, useState } from 'react';
import { Cl, cvToValue, hexToCV } from '@stacks/transactions';
import { useLeash_SetRecipient } from '@/generated/hooks';
import { leash_isRecipientAllowed } from '@/generated/contracts';
import { scaffoldConfig } from '@/scaffold.config';
import { LEASH_CONTRACT_ID, hiroHeaders, isAddress, plain, shortAddr } from '@/lib/leash';
import { Button, Card, TxNotice, inputClass } from './ui';

/** Addresses this agent's owner ever touched with set-recipient, from the contract's print events. */
async function candidateRecipients(agent: string): Promise<string[]> {
  const found = new Set<string>();
  for (let offset = 0; offset < 500; offset += 50) {
    const res = await fetch(
      `${scaffoldConfig.nodeUrl}/extended/v1/contract/${LEASH_CONTRACT_ID}/events?limit=50&offset=${offset}`,
      { headers: hiroHeaders(), cache: 'no-store' },
    );
    if (!res.ok) break;
    const { results } = await res.json();
    for (const ev of results ?? []) {
      const hex = ev?.contract_log?.value?.hex;
      if (!hex) continue;
      try {
        const e = plain(cvToValue(hexToCV(hex))) as Record<string, unknown>;
        if (e.event === 'recipient-updated' && e.agent === agent) found.add(String(e.recipient));
      } catch {
        // Not one of our tuples.
      }
    }
    if (!results || results.length < 50) break;
  }
  return [...found];
}

export default function Recipients({ agent, refresh, onChanged }: { agent: string; refresh: number; onChanged: () => void }) {
  const [allowed, setAllowed] = useState<string[] | null>(null);
  const [input, setInput] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const tx = useLeash_SetRecipient();

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const candidates = await candidateRecipients(agent);
        const checks = await Promise.all(
          candidates.map(async r => {
            const ok = await leash_isRecipientAllowed([Cl.principal(agent), Cl.principal(r)]);
            return ok === true ? r : null;
          }),
        );
        if (live) setAllowed(checks.filter((r): r is string => r !== null));
      } catch {
        if (live) setAllowed(prev => prev ?? []);
      }
    })();
    return () => {
      live = false;
    };
  }, [agent, refresh]);

  const addr = input.trim();
  const busy = tx.loading || tx.txStatus === 'pending';
  const invalid = addr.length > 0 && !isAddress(addr);

  const update = (recipient: string, isAllowed: boolean) => {
    setRemoving(isAllowed ? null : recipient);
    tx.call([Cl.principal(agent), Cl.principal(recipient), Cl.bool(isAllowed)]).catch(() => {});
  };

  return (
    <Card title="Approved recipients">
      <p className="text-[12px] font-mono text-[#908E8E] mb-3">The agent can only pay these addresses.</p>
      {allowed === null ? (
        <p className="text-[12px] font-mono text-[#6b6a6a]">Loading…</p>
      ) : allowed.length === 0 ? (
        <p className="text-[12px] font-mono text-[#6b6a6a]">None yet. The agent cannot pay anyone until you add one.</p>
      ) : (
        <ul className="space-y-2">
          {allowed.map(r => (
            <li key={r} className="flex items-center justify-between gap-3 bg-[#131416] rounded-[12px] px-3 py-2">
              <span className="text-[12px] font-mono truncate" title={r}>
                <span className="md:hidden">{shortAddr(r)}</span>
                <span className="hidden md:inline">{r}</span>
              </span>
              <Button onClick={() => update(r, false)} disabled={busy}>
                {busy && removing === r ? 'Removing…' : 'Remove'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2 mt-4">
        <input className={inputClass} value={input} onChange={e => setInput(e.target.value)} placeholder="Recipient address ST…" />
        <Button tone="primary" onClick={() => update(addr, true)} disabled={!addr || invalid || busy}>
          Add
        </Button>
      </div>
      {invalid && <p className="text-[12px] font-mono text-amber-400 mt-2">Not a valid Stacks address</p>}
      <TxNotice
        tx={tx}
        onSuccess={() => {
          if (!removing) setInput('');
          onChanged();
        }}
      />
    </Card>
  );
}
