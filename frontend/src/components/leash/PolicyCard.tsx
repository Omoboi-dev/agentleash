"use client";
import { formatStx, periodLabel, shortAddr, type Policy } from '@/lib/leash';
import { Card } from './ui';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-mono text-[#908E8E]">{label}</div>
      <div className="text-[18px] font-instrument font-medium mt-0.5">{value}</div>
    </div>
  );
}

export default function PolicyCard({ agent, policy, available }: { agent: string; policy: Policy; available: bigint }) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const periodEnd = policy.periodStart + policy.periodLength;
  // Mirrors the contract: an expired period counts as nothing spent.
  const expired = now >= periodEnd;
  const spent = expired ? BigInt(0) : policy.periodSpent;
  const pct = policy.periodCap > BigInt(0) ? Number((spent * BigInt(1000)) / policy.periodCap) / 10 : 0;

  const status = policy.active
    ? { text: 'Active', cls: 'bg-emerald-900/60 text-emerald-300' }
    : policy.balance === BigInt(0)
      ? { text: 'Revoked', cls: 'bg-red-900/60 text-red-300' }
      : { text: 'Paused', cls: 'bg-amber-900/60 text-amber-300' };

  const resetText = expired
    ? 'New period starts with the next payment'
    : `Resets at ${new Date(Number(periodEnd) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <Card
      title={`Agent ${shortAddr(agent)}`}
      aside={<span className={`text-[11px] font-mono px-3 py-1 rounded-[40px] ${status.cls}`}>{status.text}</span>}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Balance" value={`${formatStx(policy.balance)} STX`} />
        <Stat label="Available now" value={`${formatStx(available)} STX`} />
        <Stat label="Per payment cap" value={`${formatStx(policy.txCap)} STX`} />
        <Stat label="Payments" value={policy.payments.toString()} />
      </div>

      <div className="mt-5">
        <div className="flex justify-between text-[11px] font-mono text-[#908E8E] mb-1.5">
          <span>
            Spent this period: {formatStx(spent)} of {formatStx(policy.periodCap)} STX ({periodLabel(policy.periodLength)})
          </span>
          <span>{resetText}</span>
        </div>
        <div className="h-2 rounded-full bg-[#131416] overflow-hidden">
          <div
            className={`h-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-400' : 'bg-emerald-400'}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>

      <p className="text-[11px] font-mono text-[#6b6a6a] mt-4 break-all">{agent}</p>
    </Card>
  );
}
