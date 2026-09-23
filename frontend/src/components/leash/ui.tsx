"use client";
import { useEffect, useRef, type ReactNode } from 'react';
import { errorFromRepr } from '@/lib/leash';

export function Card({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="bg-[#1F1E1F] rounded-[24px] p-5 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-instrument text-[18px] font-medium">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-mono text-[#908E8E] mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] font-mono text-[#6b6a6a] mt-1">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full bg-[#131416] border border-[#2c2b2c] rounded-[12px] px-3 py-2 text-[14px] font-mono text-white placeholder:text-[#555] focus:outline-none focus:border-[#8F8D8E]';

export function Button({
  children,
  onClick,
  disabled,
  tone = 'default',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'default' | 'primary' | 'danger';
  type?: 'button' | 'submit';
}) {
  const tones = {
    default: 'bg-[#434242] hover:bg-[#525151] text-[#F4F3EF]',
    primary: 'bg-[#F4F3EF] hover:bg-white text-[#131416]',
    danger: 'bg-[#7f1d1d] hover:bg-[#991b1b] text-white',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${tones[tone]} rounded-[40px] px-4 h-[38px] text-[12px] font-mono disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
    >
      {children}
    </button>
  );
}

interface TxState {
  loading: boolean;
  error: Error | null;
  txStatus: string | null;
  txStatusError: string | null;
  explorerUrl: string | null;
}

/** Shows wallet and transaction progress, and fires onSuccess once per confirmed tx. */
export function TxNotice({ tx, onSuccess }: { tx: TxState; onSuccess?: () => void }) {
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (tx.txStatus === 'success' && tx.explorerUrl && fired.current !== tx.explorerUrl) {
      fired.current = tx.explorerUrl;
      onSuccess?.();
    }
  }, [tx.txStatus, tx.explorerUrl, onSuccess]);

  let text: string | null = null;
  let color = 'text-[#908E8E]';
  if (tx.loading) text = 'Waiting for wallet…';
  else if (tx.error) {
    text = /cancel|reject|denied/i.test(tx.error.message) ? 'Cancelled in wallet' : tx.error.message;
    color = 'text-red-400';
  } else if (tx.txStatus === 'pending') text = 'Submitted, waiting for confirmation…';
  else if (tx.txStatus === 'success') {
    text = 'Confirmed';
    color = 'text-emerald-400';
  } else if (tx.txStatus) {
    text = errorFromRepr(tx.txStatusError);
    color = 'text-red-400';
  }
  if (!text) return null;

  return (
    <p className={`text-[12px] font-mono mt-2 ${color}`}>
      {text}
      {tx.explorerUrl && (
        <>
          {' '}
          <a href={tx.explorerUrl} target="_blank" rel="noopener noreferrer" className="underline text-[#908E8E]">
            view tx
          </a>
        </>
      )}
    </p>
  );
}
