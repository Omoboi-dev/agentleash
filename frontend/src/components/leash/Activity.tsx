"use client";
import { useEffect, useState } from 'react';
import { cvToValue, hexToCV } from '@stacks/transactions';
import { scaffoldConfig } from '@/scaffold.config';
import { LEASH_CONTRACT_ID, errorFromRepr, explorerTx, formatStx, hiroHeaders, plain, shortAddr } from '@/lib/leash';
import { Card } from './ui';

interface Row {
  txid: string;
  time: number | null;
  recipient: string;
  amount: bigint;
  memo: string;
  status: 'success' | 'failed' | 'pending';
  reason: string | null;
}

interface HiroTx {
  tx_id: string;
  tx_status: string;
  sender_address: string;
  block_time?: number;
  receipt_time?: number;
  tx_result?: { repr?: string };
  contract_call?: { contract_id: string; function_name: string; function_args?: { hex: string }[] };
}

function toRow(tx: HiroTx): Row | null {
  const args = tx.contract_call?.function_args;
  if (!args || args.length < 3) return null;
  try {
    const [recipient, amount, memo] = args.map(a => plain(cvToValue(hexToCV(a.hex))));
    const status = tx.tx_status === 'success' ? 'success' : tx.tx_status === 'pending' ? 'pending' : 'failed';
    return {
      txid: tx.tx_id,
      time: tx.block_time ?? tx.receipt_time ?? null,
      recipient: String(recipient),
      amount: BigInt(String(amount)),
      memo: String(memo),
      status,
      reason: status === 'failed' ? errorFromRepr(tx.tx_result?.repr) : null,
    };
  } catch {
    return null;
  }
}

const isAgentPay = (agent: string) => (tx: HiroTx) =>
  tx.sender_address === agent &&
  tx.contract_call?.contract_id === LEASH_CONTRACT_ID &&
  tx.contract_call?.function_name === 'pay';

async function loadActivity(agent: string): Promise<Row[]> {
  const opts = { headers: hiroHeaders(), cache: 'no-store' as const };
  const [mined, mempool] = await Promise.all([
    fetch(`${scaffoldConfig.nodeUrl}/extended/v1/address/${LEASH_CONTRACT_ID}/transactions?limit=50`, opts).then(r =>
      r.ok ? r.json() : { results: [] },
    ),
    fetch(`${scaffoldConfig.nodeUrl}/extended/v1/tx/mempool?address=${agent}&limit=50`, opts)
      .then(r => (r.ok ? r.json() : { results: [] }))
      .catch(() => ({ results: [] })),
  ]);
  const minedRows = ((mined.results ?? []) as HiroTx[]).filter(isAgentPay(agent)).map(toRow);
  const seen = new Set(minedRows.map(r => r?.txid));
  const pendingRows = ((mempool.results ?? []) as HiroTx[])
    .filter(isAgentPay(agent))
    .filter(tx => !seen.has(tx.tx_id))
    .map(toRow);
  return [...pendingRows, ...minedRows].filter((r): r is Row => r !== null);
}

const badge = {
  success: 'bg-emerald-900/60 text-emerald-300',
  failed: 'bg-red-900/60 text-red-300',
  pending: 'bg-[#2c2b2c] text-[#908E8E]',
};

export default function Activity({ agent, refresh }: { agent: string; refresh: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let live = true;
    loadActivity(agent)
      .then(r => live && setRows(r))
      .catch(() => live && setRows(prev => prev ?? []));
    return () => {
      live = false;
    };
  }, [agent, refresh, tick]);

  const paid = rows?.filter(r => r.status === 'success').length ?? 0;
  const blocked = rows?.filter(r => r.status === 'failed').length ?? 0;

  return (
    <Card
      title="Agent activity"
      aside={
        rows && rows.length > 0 ? (
          <span className="text-[11px] font-mono text-[#908E8E]">
            {paid} paid · {blocked} blocked
          </span>
        ) : null
      }
    >
      {rows === null ? (
        <p className="text-[12px] font-mono text-[#6b6a6a]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-[12px] font-mono text-[#6b6a6a]">No payment attempts yet. Every attempt shows here, allowed or blocked.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(r => (
            <li key={r.txid} className="bg-[#131416] rounded-[12px] px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-mono truncate">
                    {formatStx(r.amount)} STX to <span title={r.recipient}>{shortAddr(r.recipient)}</span>
                    <span className="text-[#908E8E]"> · {r.memo}</span>
                  </div>
                  <div className="text-[11px] font-mono text-[#6b6a6a] mt-0.5">
                    {r.time ? new Date(r.time * 1000).toLocaleTimeString() : 'just now'} ·{' '}
                    <a href={explorerTx(r.txid)} target="_blank" rel="noopener noreferrer" className="underline">
                      view tx
                    </a>
                  </div>
                </div>
                <span className={`shrink-0 text-[11px] font-mono px-3 py-1 rounded-[40px] ${badge[r.status]}`}>
                  {r.status === 'success' ? 'Paid' : r.status === 'pending' ? 'Pending' : 'Blocked'}
                </span>
              </div>
              {r.reason && <p className="text-[12px] font-mono text-red-300 mt-1.5">{r.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
