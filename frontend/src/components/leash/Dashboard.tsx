"use client";
import { useCallback, useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Cl } from '@stacks/transactions';
import { addressAtom, isMountedAtom } from '@/store/wallet';
import { useLeash_GetAgents } from '@/generated/hooks';
import { LEASH_CONTRACT_ID, parsePrincipals } from '@/lib/leash';
import CreatePolicy from './CreatePolicy';
import AgentList from './AgentList';
import AgentPanel from './AgentPanel';
import { Card } from './ui';

export default function Dashboard() {
  const address = useAtomValue(addressAtom);
  const isMounted = useAtomValue(isMountedAtom);
  const { call: loadAgents, data: agentsData, loading: agentsLoading } = useLeash_GetAgents();
  const [selected, setSelected] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const bump = useCallback(() => setRefresh(r => r + 1), []);

  useEffect(() => {
    setSelected(null);
  }, [address]);

  useEffect(() => {
    if (address) loadAgents([Cl.principal(address)]).catch(() => {});
  }, [address, refresh, loadAgents]);

  const agents = address ? parsePrincipals(agentsData) : [];

  useEffect(() => {
    if (agents.length && !selected) setSelected(agents[agents.length - 1]);
  }, [agents.join(','), selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const onCreated = useCallback(
    (agent: string) => {
      setSelected(agent);
      bump();
    },
    [bump],
  );

  if (!isMounted) return null;

  if (!LEASH_CONTRACT_ID) {
    return (
      <Card title="Contract not deployed">
        <p className="text-[13px] font-mono text-[#908E8E]">Run stacksdapp deploy --network testnet first.</p>
      </Card>
    );
  }

  if (!address) {
    return (
      <Card title="Connect your wallet">
        <p className="text-[13px] font-mono text-[#908E8E]">
          Connect Leather or Xverse on testnet to create and manage spending policies for your agents.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {agents.length > 0 && (
        <AgentList agents={agents} selected={selected} onSelect={setSelected} loading={agentsLoading} />
      )}
      {selected && <AgentPanel key={selected} agent={selected} owner={address} refresh={refresh} onChanged={bump} />}
      <CreatePolicy owner={address} onCreated={onCreated} />
    </div>
  );
}
