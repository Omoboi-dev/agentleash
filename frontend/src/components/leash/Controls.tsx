"use client";
import { useEffect, useState } from 'react';
import { Cl, Pc } from '@stacks/transactions';
import { leash_deposit } from '@/generated/contracts';
import { useLeash_Revoke, useLeash_SetActive, useLeash_SetLimits, useLeash_Withdraw } from '@/generated/hooks';
import { useWrite } from '@/lib/useWrite';
import { PERIODS, formatStx, toMicroStx, type Policy } from '@/lib/leash';
import { Button, Card, Field, TxNotice, inputClass } from './ui';

function Row({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-[#2c2b2c] pt-4 mt-4 first:border-0 first:pt-0 first:mt-0">{children}</div>;
}

export default function Controls({
  agent,
  owner,
  policy,
  onChanged,
}: {
  agent: string;
  owner: string;
  policy: Policy;
  onChanged: () => void;
}) {
  const deposit = useWrite(leash_deposit);
  const withdraw = useLeash_Withdraw();
  const setLimits = useLeash_SetLimits();
  const setActive = useLeash_SetActive();
  const revoke = useLeash_Revoke();

  const [depositAmt, setDepositAmt] = useState('');
  const [withdrawAmt, setWithdrawAmt] = useState('');
  const [txCap, setTxCap] = useState(formatStx(policy.txCap));
  const [periodCap, setPeriodCap] = useState(formatStx(policy.periodCap));
  const [period, setPeriod] = useState(Number(policy.periodLength));
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  // Keep the limit form in step with the chain after an update lands.
  useEffect(() => {
    setTxCap(formatStx(policy.txCap));
    setPeriodCap(formatStx(policy.periodCap));
    setPeriod(Number(policy.periodLength));
  }, [policy.txCap, policy.periodCap, policy.periodLength]);

  const depositMicro = toMicroStx(depositAmt);
  const withdrawMicro = toMicroStx(withdrawAmt);
  const txCapMicro = toMicroStx(txCap);
  const periodCapMicro = toMicroStx(periodCap);
  const limitsValid = !!txCapMicro && !!periodCapMicro && periodCapMicro >= txCapMicro;
  const limitsChanged =
    txCapMicro !== policy.txCap || periodCapMicro !== policy.periodCap || BigInt(period) !== policy.periodLength;

  const periodOptions = PERIODS.some(p => p.seconds === period)
    ? PERIODS
    : [...PERIODS, { label: `${period} seconds`, seconds: period }];

  const busy = (t: { loading: boolean; txStatus: string | null }) => t.loading || t.txStatus === 'pending';
  const agentArg = Cl.principal(agent);

  return (
    <Card title="Controls">
      <div>
        <Row>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Field label="Deposit (STX)">
                <div className="flex gap-2">
                  <input className={inputClass} value={depositAmt} onChange={e => setDepositAmt(e.target.value)} inputMode="decimal" />
                  <Button
                    tone="primary"
                    disabled={!depositMicro || busy(deposit)}
                    onClick={() =>
                      depositMicro &&
                      deposit.call([agentArg, Cl.uint(depositMicro)], [Pc.principal(owner).willSendEq(depositMicro).ustx()])
                    }
                  >
                    Deposit
                  </Button>
                </div>
              </Field>
              <TxNotice tx={deposit} onSuccess={() => { setDepositAmt(''); onChanged(); }} />
            </div>
            <div>
              <Field label={`Withdraw (max ${formatStx(policy.balance)} STX)`}>
                <div className="flex gap-2">
                  <input className={inputClass} value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)} inputMode="decimal" />
                  <Button
                    disabled={!withdrawMicro || withdrawMicro > policy.balance || busy(withdraw)}
                    onClick={() => withdrawMicro && withdraw.call([agentArg, Cl.uint(withdrawMicro)]).catch(() => {})}
                  >
                    Withdraw
                  </Button>
                </div>
              </Field>
              <TxNotice tx={withdraw} onSuccess={() => { setWithdrawAmt(''); onChanged(); }} />
            </div>
          </div>
        </Row>

        <Row>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Per payment cap (STX)">
              <input className={inputClass} value={txCap} onChange={e => setTxCap(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Budget per period (STX)">
              <input className={inputClass} value={periodCap} onChange={e => setPeriodCap(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Period">
              <select className={inputClass} value={period} onChange={e => setPeriod(Number(e.target.value))}>
                {periodOptions.map(p => (
                  <option key={p.seconds} value={p.seconds}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {!limitsValid && (
            <p className="text-[12px] font-mono text-amber-400 mt-2">Caps must be above zero, and the budget at least the per payment cap</p>
          )}
          <div className="mt-3">
            <Button
              disabled={!limitsValid || !limitsChanged || busy(setLimits)}
              onClick={() =>
                txCapMicro &&
                periodCapMicro &&
                setLimits.call([agentArg, Cl.uint(txCapMicro), Cl.uint(periodCapMicro), Cl.uint(period)]).catch(() => {})
              }
            >
              Update limits
            </Button>
          </div>
          <TxNotice tx={setLimits} onSuccess={onChanged} />
        </Row>

        <Row>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={busy(setActive) || (!policy.active && policy.balance === BigInt(0))}
              onClick={() => setActive.call([agentArg, Cl.bool(!policy.active)]).catch(() => {})}
            >
              {policy.active ? 'Pause agent' : 'Resume agent'}
            </Button>

            {!confirmRevoke ? (
              <Button tone="danger" disabled={busy(revoke) || (!policy.active && policy.balance === BigInt(0))} onClick={() => setConfirmRevoke(true)}>
                Revoke agent
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-mono text-red-300">
                  Stop this agent and return {formatStx(policy.balance)} STX to you?
                </span>
                <Button
                  tone="danger"
                  disabled={busy(revoke)}
                  onClick={() => {
                    setConfirmRevoke(false);
                    revoke.call([agentArg]).catch(() => {});
                  }}
                >
                  Yes, revoke
                </Button>
                <Button onClick={() => setConfirmRevoke(false)}>Cancel</Button>
              </div>
            )}
          </div>
          <p className="text-[11px] font-mono text-[#6b6a6a] mt-2">
            Pause stops payments and keeps the funds. Revoke stops payments and sends the whole balance back to you.
          </p>
          <TxNotice tx={setActive} onSuccess={onChanged} />
          <TxNotice tx={revoke} onSuccess={onChanged} />
        </Row>
      </div>
    </Card>
  );
}
