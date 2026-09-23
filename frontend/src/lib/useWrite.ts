"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClarityValue, PostCondition } from '@stacks/transactions';
import { explorerTx, waitForTx, type TxStatus } from './leash';

type ContractFn = (args: ClarityValue[], postConditions: PostCondition[]) => Promise<{ txid?: string } | undefined>;

/**
 * Same shape as the generated write hooks, but passes post conditions through.
 * The generated hooks always send an empty post condition list.
 */
export function useWrite(fn: ContractFn) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [txid, setTxid] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);
  const [txStatusError, setTxStatusError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const call = useCallback(
    async (args: ClarityValue[], postConditions: PostCondition[] = []) => {
      setLoading(true);
      setError(null);
      setTxid(null);
      setTxStatus(null);
      setTxStatusError(null);
      try {
        const result = await fn(args, postConditions);
        if (!result?.txid) return;
        setTxid(result.txid);
        setTxStatus('pending');
        setLoading(false);
        const done = await waitForTx(result.txid);
        if (!mounted.current) return;
        setTxStatus(done.status);
        if (done.status !== 'success') setTxStatusError(done.repr);
      } catch (e) {
        if (mounted.current) setError(e as Error);
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [fn],
  );

  return { loading, error, txid, txStatus, txStatusError, explorerUrl: txid ? explorerTx(txid) : null, call };
}
