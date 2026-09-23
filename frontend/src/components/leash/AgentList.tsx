"use client";
import { shortAddr } from '@/lib/leash';
import { Card } from './ui';

export default function AgentList({
  agents,
  selected,
  onSelect,
  loading,
}: {
  agents: string[];
  selected: string | null;
  onSelect: (agent: string) => void;
  loading: boolean;
}) {
  return (
    <Card title="Your agents" aside={loading ? <span className="text-[11px] font-mono text-[#6b6a6a]">refreshing…</span> : null}>
      <div className="flex flex-wrap gap-2">
        {agents.map(agent => (
          <button
            key={agent}
            onClick={() => onSelect(agent)}
            title={agent}
            className={`rounded-[40px] px-4 h-[34px] text-[12px] font-mono border transition-colors ${
              agent === selected
                ? 'bg-[#F4F3EF] text-[#131416] border-[#F4F3EF]'
                : 'bg-transparent text-[#F4F3EF] border-[#434242] hover:border-[#8F8D8E]'
            }`}
          >
            {shortAddr(agent)}
          </button>
        ))}
      </div>
    </Card>
  );
}
