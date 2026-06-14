import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  subscribeTransactions,
  getTransactionById,
  insertTransaction,
  updateTransaction,
  deleteTransaction,
} from '../lib/database';
import { Transaction, TransactionInput, DashboardSummary, PropertySummary } from '../types';
import { useAuth } from './AuthContext';
import { ACCOUNTS_LEDGER } from '../constants/appConstants';

interface TransactionContextValue {
  transactions: Transaction[];
  isLoading: boolean;
  addTransaction: (t: TransactionInput) => Promise<string>;
  editTransaction: (id: string, t: TransactionInput) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  getTransaction: (id: string) => Promise<Transaction | null>;
  summary: DashboardSummary;
  propertySummaries: PropertySummary[];
  filterTransactions: (query: string, category?: string, nagarName?: string) => Transaction[];
  refresh: () => void;
}

const TransactionContext = createContext<TransactionContextValue | null>(null);

export function TransactionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const unsubscribe = subscribeTransactions(user.uid, (txs) => {
      setTransactions(txs);
      setIsLoading(false);
    });

    return unsubscribe;
  }, [user]);

  const addTransaction = useCallback(async (t: TransactionInput): Promise<string> => {
    if (!user) return '';
    return insertTransaction(user.uid, t);
  }, [user]);

  const editTransaction = useCallback(async (id: string, t: TransactionInput) => {
    if (!user) return;
    await updateTransaction(user.uid, id, t);
  }, [user]);

  const removeTransaction = useCallback(async (id: string) => {
    if (!user) return;
    await deleteTransaction(user.uid, id);
  }, [user]);

  const getTransaction = useCallback(async (id: string) => {
    if (!user) return null;
    return getTransactionById(user.uid, id);
  }, [user]);

  const refresh = useCallback(() => {}, []);

  const ledgerTransactions = useMemo(
    () => transactions.filter((t) => t.nagar_name !== ACCOUNTS_LEDGER),
    [transactions]
  );

  const summary = useMemo<DashboardSummary>(() => ({
    totalCashIn: ledgerTransactions.reduce((s, t) => s + (t.cash_in || 0), 0),
    totalCashOut: ledgerTransactions.reduce((s, t) => s + (t.cash_out || 0), 0),
    balance: ledgerTransactions.reduce((s, t) => s + (t.cash_in || 0) - (t.cash_out || 0), 0),
  }), [ledgerTransactions]);

  const propertySummaries = useMemo<PropertySummary[]>(() => Object.values(
    ledgerTransactions.reduce<Record<string, PropertySummary>>((acc, t) => {
      const key = t.nagar_name || 'Unassigned';
      if (!acc[key]) {
        acc[key] = { nagar_name: key, totalCashIn: 0, totalCashOut: 0, balance: 0, transactionCount: 0 };
      }
      acc[key].totalCashIn += t.cash_in || 0;
      acc[key].totalCashOut += t.cash_out || 0;
      acc[key].balance += (t.cash_in || 0) - (t.cash_out || 0);
      acc[key].transactionCount += 1;
      return acc;
    }, {})
  ), [ledgerTransactions]);

  const filterTransactions = useCallback(
    (query: string, category?: string, nagarName?: string) => {
      const q = query.toLowerCase();
      return transactions.filter((t) => {
        const matchesQuery =
          !q ||
          (t.name || '').toLowerCase().includes(q) ||
          (t.nagar_name || '').toLowerCase().includes(q) ||
          (t.plot_no || '').toLowerCase().includes(q) ||
          (t.village || '').toLowerCase().includes(q) ||
          (t.phone_no || '').toLowerCase().includes(q) ||
          (t.transaction_details || '').toLowerCase().includes(q);
        const matchesCategory = !category || t.category === category;
        const matchesNagar = !nagarName || t.nagar_name === nagarName;
        return matchesQuery && matchesCategory && matchesNagar;
      });
    },
    [transactions]
  );

  return (
    <TransactionContext.Provider
      value={{
        transactions,
        isLoading,
        addTransaction,
        editTransaction,
        removeTransaction,
        getTransaction,
        summary,
        propertySummaries,
        filterTransactions,
        refresh,
      }}
    >
      {children}
    </TransactionContext.Provider>
  );
}

export function useTransactions() {
  const ctx = useContext(TransactionContext);
  if (!ctx) throw new Error('useTransactions must be used inside TransactionProvider');
  return ctx;
}
