import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppColors } from '../constants/appColors';
import { ACCOUNTS_LEDGER } from '../constants/appConstants';
import { useTransactions } from '../context/TransactionContext';
import { formatCurrency } from '../lib/formatters';
import { Transaction } from '../types';

export default function NagarPlotsScreen() {
  const { nagar } = useLocalSearchParams<{ nagar?: string }>();
  const router = useRouter();
  const { transactions } = useTransactions();

  const projectTransactions = useMemo(
    () => transactions.filter((t) => t.nagar_name !== ACCOUNTS_LEDGER && t.nagar_name === (nagar ?? '')),
    [transactions, nagar]
  );

  const plotGroups = useMemo(() => {
    const map: Record<string, Transaction[]> = {};
    for (const t of projectTransactions) {
      const key = t.plot_no || 'Unassigned';
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return Object.entries(map).map(([plotNo, items]) => ({
      plotNo,
      items,
      cashIn: items.reduce((s, t) => s + (t.cash_in || 0), 0),
      cashOut: items.reduce((s, t) => s + (t.cash_out || 0), 0),
      profit: items.reduce((s, t) => s + (t.cash_in || 0) - (t.cash_out || 0), 0),
    }));
  }, [projectTransactions]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{nagar}</Text>
        <View style={{ width: 56 }} />
      </View>
      <Text style={styles.sub}>Plots — tap a plot for entries & documents</Text>

      <FlatList
        data={plotGroups}
        keyExtractor={(item) => item.plotNo}
        contentContainerStyle={styles.list}
        renderItem={({ item: plot }) => (
          <TouchableOpacity
            style={styles.plotCard}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/property-plot', params: { nagar, plot: plot.plotNo } })}
          >
            <View style={styles.plotHeader}>
              <Text style={styles.plotNo}>{plot.plotNo}</Text>
              <Text style={[styles.plotProfit, { color: plot.profit >= 0 ? AppColors.income : AppColors.expense }]}>
                {plot.profit >= 0 ? '' : '-'}{formatCurrency(Math.abs(plot.profit))}
              </Text>
            </View>
            <View style={styles.plotStats}>
              <Text style={styles.inText}>By Cash: {formatCurrency(plot.cashIn)}</Text>
              <Text style={styles.outText}>To Cash: {formatCurrency(plot.cashOut)}</Text>
              <Text style={styles.count}>{plot.items.length} entries</Text>
            </View>
            <Text style={styles.hint}>Open plot →</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No plots yet for this property.</Text>
            <Text style={styles.emptySub}>Add an entry with this Nagar Name and a Plot No.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backText: { color: AppColors.primary, fontWeight: '700', fontSize: 15 },
  title: { flex: 1, marginHorizontal: 8, textAlign: 'center', fontSize: 17, fontWeight: '800', color: AppColors.text },
  sub: { fontSize: 12, color: AppColors.textSecondary, paddingHorizontal: 16, marginBottom: 10 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  plotCard: { backgroundColor: AppColors.card, borderRadius: 14, padding: 16, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  plotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  plotNo: { fontSize: 16, fontWeight: '800', color: AppColors.text },
  plotProfit: { fontSize: 15, fontWeight: '800' },
  plotStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  inText: { fontSize: 13, fontWeight: '700', color: AppColors.income },
  outText: { fontSize: 13, fontWeight: '700', color: AppColors.expense },
  count: { fontSize: 12, color: AppColors.textSecondary, fontWeight: '600' },
  hint: { fontSize: 12, color: AppColors.primary, fontWeight: '700' },
  empty: { marginTop: 48, alignItems: 'center', paddingHorizontal: 24 },
  emptyText: { fontSize: 16, fontWeight: '700', color: AppColors.textSecondary },
  emptySub: { marginTop: 8, fontSize: 13, color: AppColors.textSecondary, textAlign: 'center' },
});
