import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppColors } from '../../constants/appColors';
import { ACCOUNTS_LEDGER } from '../../constants/appConstants';
import { useTransactions } from '../../context/TransactionContext';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { Transaction } from '../../types';

function Row({ item, onPress }: { item: Transaction; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.sub}>{formatDate(item.date)} • {item.transaction_details || '-'}</Text>
      </View>
      <Text style={styles.amount}>{formatCurrency(item.cash_in || 0)}</Text>
    </TouchableOpacity>
  );
}

export default function ByLandScreen() {
  const router = useRouter();
  const { transactions } = useTransactions();
  const rows = useMemo(
    () => [...transactions]
      .filter((t) => t.nagar_name === ACCOUNTS_LEDGER && t.category === 'Govt' && (t.cash_in || 0) > 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [transactions]
  );
  const total = rows.reduce((sum, r) => sum + (r.cash_in || 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>By Land Entries</Text>
        <View style={{ width: 56 }} />
      </View>
      <View style={styles.totalBox}>
        <Text style={styles.totalLabel}>Total By Land</Text>
        <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Row item={item} onPress={() => router.push({ pathname: '/account-entry/[id]', params: { id: item.id } })} />}
        ListEmptyComponent={<Text style={styles.empty}>No By Land entries.</Text>}
        contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  back: { color: AppColors.primary, fontWeight: '700' },
  title: { fontSize: 18, fontWeight: '800', color: AppColors.text },
  totalBox: { marginHorizontal: 12, marginBottom: 8, backgroundColor: AppColors.card, borderRadius: 10, borderWidth: 1, borderColor: AppColors.border, padding: 12 },
  totalLabel: { fontSize: 12, fontWeight: '700', color: AppColors.textSecondary, textTransform: 'uppercase' },
  totalValue: { marginTop: 4, fontSize: 22, fontWeight: '900', color: AppColors.income },
  row: { backgroundColor: AppColors.card, borderRadius: 10, borderWidth: 1, borderColor: AppColors.border, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 14, fontWeight: '700', color: AppColors.text },
  sub: { marginTop: 2, fontSize: 12, color: AppColors.textSecondary },
  amount: { fontSize: 14, fontWeight: '800', color: AppColors.income },
  empty: { textAlign: 'center', marginTop: 30, color: AppColors.textSecondary },
});
