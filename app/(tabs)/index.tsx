import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTransactions } from '../../context/TransactionContext';
import { AppColors } from '../../constants/appColors';
import { ACCOUNTS_LEDGER } from '../../constants/appConstants';
import { formatCurrency } from '../../lib/formatters';
import { PropertySummary } from '../../types';


type ProfitFilter = 'All' | 'Profit' | 'Loss';

function PropertyItem({ item, onPress }: { item: PropertySummary; onPress: () => void }) {
  const profitPositive = item.balance >= 0;
  return (
    <TouchableOpacity style={styles.propertyItem} onPress={onPress} activeOpacity={0.88}>
      <View style={[styles.propertyAccent, { backgroundColor: profitPositive ? AppColors.income : AppColors.expense }]} />
      <View style={styles.propertyBody}>
        <View style={styles.propertyItemHead}>
          <View style={styles.propertyTitleWrap}>
            <Text style={styles.propertyEmoji}>🏘️</Text>
            <Text style={styles.propertyName} numberOfLines={2}>{item.nagar_name}</Text>
          </View>
          <View style={[styles.profitPill, { backgroundColor: profitPositive ? AppColors.incomeLight : AppColors.expenseLight }]}>
            <Text style={[styles.propertyProfit, { color: profitPositive ? AppColors.income : AppColors.expense }]}>
              {profitPositive ? '' : '-'}{formatCurrency(Math.abs(item.balance))}
            </Text>
          </View>
        </View>
        <View style={styles.propertyStats}>
          <View style={styles.statChip}>
            <Text style={styles.statChipLabel}>By Cash</Text>
            <Text style={styles.incomeText}>{formatCurrency(item.totalCashIn)}</Text>
          </View>
          <View style={styles.statChip}>
            <Text style={styles.statChipLabel}>To Cash</Text>
            <Text style={styles.expenseText}>{formatCurrency(item.totalCashOut)}</Text>
          </View>
          <Text style={styles.entryCount}>{item.transactionCount} entries</Text>
        </View>
        <Text style={styles.tapHint}>Tap to view plots →</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const { propertySummaries, transactions, isLoading } = useTransactions();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [profitFilter, setProfitFilter] = useState<ProfitFilter>('All');
  const [sortBy, setSortBy] = useState<'Default' | 'Name A-Z' | 'Profit High-Low' | 'Profit Low-High'>('Default');
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const ledgerProperties = useMemo(
    () => propertySummaries.filter((p) => p.nagar_name !== ACCOUNTS_LEDGER),
    [propertySummaries]
  );

  const filteredProperties = useMemo(() => {
    let list = ledgerProperties;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => p.nagar_name.toLowerCase().includes(q));
    }
    if (profitFilter === 'Profit') {
      list = list.filter((p) => p.balance > 0);
    } else if (profitFilter === 'Loss') {
      list = list.filter((p) => p.balance < 0);
    }
    const hasSellPrice = new Set(
      transactions
        .filter((t) => t.nagar_name !== ACCOUNTS_LEDGER && (t.remarks || '').toLowerCase().startsWith('sell price'))
        .map((t) => t.nagar_name)
    );

    const sorted = [...list].sort((a, b) => {
      if (sortBy === 'Name A-Z') return a.nagar_name.localeCompare(b.nagar_name);
      if (sortBy === 'Profit High-Low') return b.balance - a.balance;
      if (sortBy === 'Profit Low-High') return a.balance - b.balance;
      const aSell = hasSellPrice.has(a.nagar_name) ? 1 : 0;
      const bSell = hasSellPrice.has(b.nagar_name) ? 1 : 0;
      if (aSell !== bSell) return aSell - bSell;
      return a.nagar_name.localeCompare(b.nagar_name);
    });
    return sorted;
  }, [ledgerProperties, search, profitFilter, sortBy, transactions]);

  const ledgerSummary = useMemo(() => ({
    totalCashIn: ledgerProperties.reduce((s, p) => s + p.totalCashIn, 0),
    totalCashOut: ledgerProperties.reduce((s, p) => s + p.totalCashOut, 0),
    profit: ledgerProperties.reduce((s, p) => s + p.balance, 0),
  }), [ledgerProperties]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={AppColors.primary} />
        <Text style={styles.loadingText}>Loading properties...</Text>
      </View>
    );
  }

  const filterLabel =
    profitFilter === 'All' ? 'All properties' : profitFilter === 'Profit' ? 'In profit only' : 'At loss only';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.mapBtn} onPress={() => router.push('/all-locations')}>
          <Text style={styles.mapBtnIcon}>🗺️</Text>
          <Text style={styles.mapBtnLabel}>Locations</Text>
        </TouchableOpacity>
        <View style={styles.nBadgeSmall}>
          <Text style={styles.nLetterSmall}>N</Text>
        </View>
        <View style={{ width: 90 }} />
      </View>
      <FlatList
        data={filteredProperties}
        keyExtractor={(item) => item.nagar_name}
        renderItem={({ item }) => (
          <PropertyItem
            item={item}
            onPress={() => router.push({ pathname: '/(tabs)/properties', params: { nagar: item.nagar_name } })}
          />
        )}
        ListHeaderComponent={
          <>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                placeholder="🔍 Search property..."
                placeholderTextColor={AppColors.textSecondary}
                value={search}
                onChangeText={setSearch}
              />
              <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterModalVisible(true)}>
                <Text style={styles.filterBtnText}>⚙ Filter</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.filterHint}>{filterLabel} · Sort: {sortBy}</Text>

            <View style={styles.summaryCard}>
              <View style={styles.summaryInner}>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryColLabel}>By Cash</Text>
                  <Text style={[styles.summaryColValue, { color: AppColors.income }]}>{formatCurrency(ledgerSummary.totalCashIn)}</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={[styles.summaryCol, styles.summaryColCenter]}>
                  <Text style={styles.summaryColLabel}>Profit</Text>
                  <Text style={[styles.summaryColValueLarge, { color: ledgerSummary.profit >= 0 ? AppColors.income : AppColors.expense }]}>
                    {ledgerSummary.profit >= 0 ? '' : '-'}{formatCurrency(Math.abs(ledgerSummary.profit))}
                  </Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={[styles.summaryCol, { alignItems: 'flex-end' }]}>
                  <Text style={styles.summaryColLabel}>To Cash</Text>
                  <Text style={[styles.summaryColValue, { color: AppColors.expense }]}>{formatCurrency(ledgerSummary.totalCashOut)}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Properties ({filteredProperties.length})</Text>
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📄</Text>
            <Text style={styles.emptyText}>
              {search || profitFilter !== 'All' ? 'No properties match your search or filter.' : 'No properties yet.'}
            </Text>
            <Text style={styles.emptySub}>Scan a land document above to create your first property.</Text>
          </View>
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: 32 }]}
      />

      <Modal visible={filterModalVisible} transparent animationType="fade" onRequestClose={() => setFilterModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFilterModalVisible(false)}>
          <View style={styles.filterModal} onStartShouldSetResponder={() => true}>
            <Text style={styles.filterModalTitle}>Profit filter</Text>
            {(['All', 'Profit', 'Loss'] as ProfitFilter[]).map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterOption, profitFilter === f && styles.filterOptionActive]}
                onPress={() => {
                  setProfitFilter(f);
                  setFilterModalVisible(false);
                }}
              >
                <Text style={[styles.filterOptionText, profitFilter === f && styles.filterOptionTextActive]}>
                  {f === 'All' ? 'All properties' : f === 'Profit' ? 'In profit only' : 'At loss only'}
                </Text>
                {profitFilter === f && <Text style={styles.filterCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
            <Text style={[styles.filterModalTitle, { fontSize: 15, marginTop: 8 }]}>Sort by</Text>
            {(['Default', 'Name A-Z', 'Profit High-Low', 'Profit Low-High'] as const).map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.filterOption, sortBy === s && styles.filterOptionActive]}
                onPress={() => setSortBy(s)}
              >
                <Text style={[styles.filterOptionText, sortBy === s && styles.filterOptionTextActive]}>{s}</Text>
                {sortBy === s && <Text style={styles.filterCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.filterClose} onPress={() => setFilterModalVisible(false)}>
              <Text style={styles.filterCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.bg },
  loadingText: { marginTop: 12, color: AppColors.textSecondary, fontSize: 14 },
  listContent: { paddingBottom: 32 },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12,
    backgroundColor: AppColors.card,
    borderBottomWidth: 1, borderBottomColor: AppColors.border,
  },
  nBadgeSmall: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' },
  nLetterSmall: { fontSize: 18, fontWeight: '900', color: '#F5C518', letterSpacing: -1 },
  mapBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: AppColors.primaryLight, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: AppColors.primary },
  mapBtnIcon: { fontSize: 16 },
  mapBtnLabel: { fontSize: 13, fontWeight: '700', color: AppColors.primary },

  searchRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 14, marginBottom: 6, alignItems: 'center' },
  searchInput: {
    flex: 1,
    backgroundColor: AppColors.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: AppColors.text,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  filterBtn: {
    backgroundColor: AppColors.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: AppColors.primary,
  },
  filterBtnText: { color: AppColors.primary, fontWeight: '800', fontSize: 13 },
  filterHint: { fontSize: 12, color: AppColors.textSecondary, paddingHorizontal: 16, marginBottom: 12 },

  summaryCard: {
    marginHorizontal: 16, marginBottom: 16, borderRadius: 16,
    backgroundColor: AppColors.card, borderWidth: 1, borderColor: AppColors.border,
    padding: 16,
  },
  summaryInner: { flexDirection: 'row', alignItems: 'center' },
  summaryCol: { flex: 1 },
  summaryColCenter: { alignItems: 'center' },
  summaryColLabel: { fontSize: 11, fontWeight: '700', color: AppColors.textSecondary, textTransform: 'uppercase', marginBottom: 4 },
  summaryColValue: { fontSize: 15, fontWeight: '800' },
  summaryColValueLarge: { fontSize: 20, fontWeight: '900' },
  summaryDivider: { width: 1, height: 40, backgroundColor: AppColors.border, marginHorizontal: 12 },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: AppColors.text, paddingHorizontal: 16, marginBottom: 10 },
  propertyItem: {
    flexDirection: 'row',
    backgroundColor: AppColors.card,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  propertyAccent: { width: 5 },
  propertyBody: { flex: 1, padding: 14 },
  propertyItemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 },
  propertyTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  propertyEmoji: { fontSize: 18 },
  propertyName: { fontSize: 15, fontWeight: '800', color: AppColors.text, flex: 1 },
  profitPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  propertyProfit: { fontSize: 13, fontWeight: '800' },
  propertyStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  statChip: { backgroundColor: AppColors.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  statChipLabel: { fontSize: 10, color: AppColors.textSecondary, fontWeight: '700', marginBottom: 2 },
  incomeText: { fontSize: 13, fontWeight: '800', color: AppColors.income },
  expenseText: { fontSize: 13, fontWeight: '800', color: AppColors.expense },
  entryCount: { fontSize: 12, color: AppColors.textSecondary, fontWeight: '700' },
  tapHint: { marginTop: 8, fontSize: 12, color: AppColors.primary, fontWeight: '700' },

  empty: { alignItems: 'center', marginTop: 40, paddingHorizontal: 24 },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyText: { fontSize: 15, color: AppColors.textSecondary, fontWeight: '700', textAlign: 'center' },
  emptySub: { fontSize: 13, color: AppColors.textSecondary, marginTop: 6, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 24 },
  filterModal: { backgroundColor: AppColors.card, borderRadius: 16, padding: 18 },
  filterModalTitle: { fontSize: 17, fontWeight: '800', color: AppColors.text, marginBottom: 12 },
  filterOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, marginBottom: 6,
  },
  filterOptionActive: { backgroundColor: AppColors.primaryLight },
  filterOptionText: { fontSize: 15, color: AppColors.text },
  filterOptionTextActive: { color: AppColors.primary, fontWeight: '800' },
  filterCheck: { color: AppColors.primary, fontWeight: '800', fontSize: 16 },
  filterClose: { marginTop: 8, alignItems: 'center', paddingVertical: 10 },
  filterCloseText: { color: AppColors.textSecondary, fontWeight: '700' },
});
