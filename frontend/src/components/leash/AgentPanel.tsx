"use client";
import { useEffect, useState } from 'react';
import { Cl } from '@stacks/transactions';
import { useLeash_GetAvailable, useLeash_GetPolicy } from '@/generated/hooks';
import { parsePolicy, parseUint } from '@/lib/leash';
import PolicyCard from './PolicyCard';
import Activity from './Activity';
import Recipients from './Recipients';
import Controls from './Controls';
import { Card } from './ui';

const POLL_MS = 15_000;

export default function AgentPanel({
  agent,
  owner,
  refresh,
  onChanged,
}: {
  agent: string;
  owner: string;
  refresh: number;
  onChanged: () => void;
}) {
  const { call: loadPolicy, data: policyData } = useLeash_GetPolicy();
  const { call: loadAvailable, data: availableData } = useLeash_GetAvailable();
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const args = [Cl.principal(agent)];
    Promise.all([loadPolicy(args), loadAvailable(args)])
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [agent, refresh, tick, loadPolicy, loadAvailable]);

  const policy = parsePolicy(policyData);

  if (!policy) {
    return (
      <Card title="Policy">
        <p className="text-[13px] font-mono text-[#908E8E]">{loaded ? 'No policy found for this agent yet.' : 'Loading…'}</p>
      </Card>
    );
  }

  const isOwner = policy.owner === owner;

  return (
    <div className="space-y-5">
      <PolicyCard agent={agent} policy={policy} available={parseUint(availableData)} />
      <Activity agent={agent} refresh={refresh} />
      {isOwner ? (
        <>
          <Recipients agent={agent} refresh={refresh + tick} onChanged={onChanged} />
          <Controls agent={agent} owner={owner} policy={policy} onChanged={onChanged} />
        </>
      ) : (
        <Card title="Read only">
          <p className="text-[13px] font-mono text-[#908E8E]">This policy belongs to another wallet.</p>
        </Card>
      )}
    </div>
  );
}
