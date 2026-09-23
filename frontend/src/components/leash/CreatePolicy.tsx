"use client";
import { useRef, useState } from 'react';
import { Cl, Pc } from '@stacks/transactions';
import { leash_createPolicy } from '@/generated/contracts';
import { useWrite } from '@/lib/useWrite';
import { PERIODS, formatStx, isAddress, toMicroStx } from '@/lib/leash';
import { Button, Card, Field, TxNotice, inputClass } from './ui';

export default function CreatePolicy({ owner, onCreated }: { owner: string; onCreated: (agent: string) => void }) {
  const [agent, setAgent] = useState('');
  const [txCap, setTxCap] = useState('1');
  const [periodCap, setPeriodCap] = useState('3');
  const [period, setPeriod] = useState<number>(PERIODS[0].seconds);
  const [deposit, setDeposit] = useState('10');
  const tx = useWrite(leash_createPolicy);
  const submitted = useRef('');

  const agentAddr = agent.trim();
  const txCapMicro = toMicroStx(txCap);
  const periodCapMicro = toMicroStx(periodCap);
  const depositMicro = toMicroStx(deposit);

  let problem: string | null = null;
  if (agentAddr && !isAddress(agentAddr)) problem = 'Agent address is not a valid Stacks address';
  else if (agentAddr && agentAddr === owner) problem = 'Use a separate key for the agent, not your own wallet';
  else if (!txCapMicro || !periodCapMicro || !depositMicro) problem = 'Amounts must be above zero';
  else if (periodCapMicro < txCapMicro) problem = 'The period budget must be at least the per payment cap';

  const canSubmit = !!agentAddr && !problem && !tx.loading && tx.txStatus !== 'pending';

  const submit = () => {
    if (!canSubmit || !txCapMicro || !periodCapMicro || !depositMicro) return;
    submitted.current = agentAddr;
    tx.call(
      [Cl.principal(agentAddr), Cl.uint(txCapMicro), Cl.uint(periodCapMicro), Cl.uint(period), Cl.uint(depositMicro)],
      [Pc.principal(owner).willSendEq(depositMicro).ustx()],
    );
  };

  return (
    <Card title="Create a policy">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Field label="Agent address" hint="The key your agent signs with. One policy per agent key.">
            <input className={inputClass} value={agent} onChange={e => setAgent(e.target.value)} placeholder="ST…" />
          </Field>
        </div>
        <Field label="Per payment cap (STX)">
          <input className={inputClass} value={txCap} onChange={e => setTxCap(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Budget per period (STX)">
          <input className={inputClass} value={periodCap} onChange={e => setPeriodCap(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Period">
          <select className={inputClass} value={period} onChange={e => setPeriod(Number(e.target.value))}>
            {PERIODS.map(p => (
              <option key={p.seconds} value={p.seconds}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="First deposit (STX)" hint="Moves from your wallet into the contract.">
          <input className={inputClass} value={deposit} onChange={e => setDeposit(e.target.value)} inputMode="decimal" />
        </Field>
      </div>
      {problem && agentAddr && <p className="text-[12px] font-mono text-amber-400 mt-3">{problem}</p>}
      <div className="mt-4 flex items-center gap-3">
        <Button tone="primary" onClick={submit} disabled={!canSubmit}>
          {depositMicro ? `Create and deposit ${formatStx(depositMicro)} STX` : 'Create policy'}
        </Button>
      </div>
      <TxNotice tx={tx} onSuccess={() => { setAgent(''); onCreated(submitted.current); }} />
    </Card>
  );
}
