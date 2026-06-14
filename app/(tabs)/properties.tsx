import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useTransactions } from '../../context/TransactionContext';
import { useAuth } from '../../context/AuthContext';
import { AppColors } from '../../constants/appColors';
import { ACCOUNTS_LEDGER } from '../../constants/appConstants';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { Transaction } from '../../types';
import { getPlotAttachments } from '../../lib/nagars';

export default function PropertiesScreen() {
  const { nagar } = useLocalSearchParams<{ nagar?: string }>();
  const { propertySummaries, transactions, isLoading, refresh } = useTransactions();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 800);
  }, [refresh]);
  const [selectedNagar, setSelectedNagar] = useState<string | null>(null);
  const [nagarSortBy, setNagarSortBy] = useState<'Name A-Z' | 'Profit High-Low' | 'Profit Low-High'>('Name A-Z');
  const [plotSortBy, setPlotSortBy] = useState<'Plot A-Z' | 'Profit High-Low' | 'Profit Low-High'>('Plot A-Z');
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    React.useCallback(() => {
      setSelectedNagar(nagar ?? null);
      return () => {};
    }, [nagar])
  );

  useEffect(() => {
    if (nagar) setSelectedNagar(nagar);
  }, [nagar]);

  const propertyTransactions = useMemo(
    () => transactions.filter((t) => t.nagar_name !== ACCOUNTS_LEDGER),
    [transactions]
  );
  const visiblePropertySummaries = useMemo(
    () => {
      const list = propertySummaries.filter((p) => p.nagar_name !== ACCOUNTS_LEDGER);
      return [...list].sort((a, b) => {
        if (nagarSortBy === 'Profit High-Low') return b.balance - a.balance;
        if (nagarSortBy === 'Profit Low-High') return a.balance - b.balance;
        return a.nagar_name.localeCompare(b.nagar_name);
      });
    },
    [propertySummaries, nagarSortBy]
  );

  const projectTransactions = useMemo(() => {
    if (!selectedNagar) return [];
    return propertyTransactions.filter((t) => t.nagar_name === selectedNagar);
  }, [propertyTransactions, selectedNagar]);

  const plotGroups = useMemo(() => {
    const map: Record<string, Transaction[]> = {};
    for (const t of projectTransactions) {
      const key = t.plot_no || 'Unassigned';
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    const groups = Object.entries(map).map(([plotNo, items]) => ({
      plotNo,
      items,
      cashIn: items.reduce((s, t) => s + (t.cash_in || 0), 0),
      cashOut: items.reduce((s, t) => s + (t.cash_out || 0), 0),
      profit: items.reduce((s, t) => s + (t.cash_in || 0) - (t.cash_out || 0), 0),
    }));
    return groups.sort((a, b) => {
      if (plotSortBy === 'Profit High-Low') return b.profit - a.profit;
      if (plotSortBy === 'Profit Low-High') return a.profit - b.profit;
      return a.plotNo.localeCompare(b.plotNo);
    });
  }, [projectTransactions, plotSortBy]);

  function handleEditNagar(nagarName: string) {
    const latest = propertyTransactions
      .filter((t) => t.nagar_name === nagarName)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    if (!latest) {
      Alert.alert('No entries', 'No transaction found to edit for this nagar.');
      return;
    }
    router.push({ pathname: '/transaction/[id]', params: { id: latest.id } });
  }

  function handleEditPlot(plotNo: string) {
    if (!selectedNagar) return;
    const latest = projectTransactions
      .filter((t) => (t.plot_no || 'Unassigned') === plotNo)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    if (!latest) {
      Alert.alert('No entries', 'No transaction found to edit for this plot.');
      return;
    }
    router.push({ pathname: '/transaction/[id]', params: { id: latest.id } });
  }

  function escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function handleSharePlot(plotNo: string) {
    if (!selectedNagar || !user) return;
    try {
      const plotTransactions = projectTransactions
        .filter((t) => (t.plot_no || 'Unassigned') === plotNo)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (!plotTransactions.length) {
        Alert.alert('No entries', 'No transactions found for this plot.');
        return;
      }

      const attachments = await getPlotAttachments(user.uid, selectedNagar, plotNo);
      const latest = plotTransactions[plotTransactions.length - 1];
      const totalBy = plotTransactions.reduce((s, t) => s + (t.cash_in || 0), 0);
      const totalTo = plotTransactions.reduce((s, t) => s + (t.cash_out || 0), 0);
      const profit = totalBy - totalTo;
      let running = 0;
      const rowsHtml = plotTransactions.map((tx) => {
        running += (tx.cash_in || 0) - (tx.cash_out || 0);
        return `
          <tr>
            <td>${escapeHtml(formatDate(tx.date))}</td>
            <td>${escapeHtml(tx.name || '-')}</td>
            <td>${escapeHtml(tx.transaction_details || '-')}</td>
            <td class="num">${escapeHtml(tx.cash_in ? formatCurrency(tx.cash_in) : '-')}</td>
            <td class="num">${escapeHtml(tx.cash_out ? formatCurrency(tx.cash_out) : '-')}</td>
            <td class="num">${escapeHtml(`${running >= 0 ? '+' : '-'}${formatCurrency(Math.abs(running))}`)}</td>
          </tr>
        `;
      }).join('');

      const docsHtml = attachments.length
        ? attachments.map((a, i) => `<li>${i + 1}. ${escapeHtml(a.name)}</li>`).join('')
        : '<li>No plot documents attached.</li>';

      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              * { box-sizing: border-box; }
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 18px; color: #111827; background: #eef3fb; }
              .sheet { background: #fff; border-radius: 14px; border: 1px solid #dbe4f0; overflow: hidden; }
              .hero { padding: 16px 18px; background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 60%, #2563eb 100%); color: #fff; }
              .title { margin: 0; font-size: 20px; font-weight: 800; }
              .sub { margin: 6px 0 0 0; font-size: 12px; opacity: 0.9; }
              .meta { padding: 12px 16px 2px 16px; font-size: 12px; color: #4b5563; }
              .cards { display: flex; gap: 8px; padding: 10px 16px 12px 16px; }
              .card { flex: 1; border: 1px solid #dbe4f0; border-radius: 10px; padding: 8px; background: #f8fafc; }
              .cl { margin: 0; font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; }
              .cv { margin: 4px 0 0 0; font-size: 15px; font-weight: 800; }
              .sec { padding: 0 16px 8px 16px; }
              .sec h2 { margin: 8px 0; font-size: 13px; color: #334155; }
              .pgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; }
              .pi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 8px; background: #fff; }
              .pil { color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: 700; margin: 0 0 2px 0; }
              .piv { color: #0f172a; font-weight: 700; margin: 0; }
              table { width: calc(100% - 32px); margin: 0 16px 10px 16px; border-collapse: collapse; font-size: 11px; }
              th, td { border: 1px solid #d1d5db; padding: 7px; text-align: left; }
              th { background: #111827; color: #fff; font-weight: 700; }
              .num { text-align: right; }
              ul { margin: 0 0 14px 0; padding-left: 18px; font-size: 12px; }
              li { margin-bottom: 4px; }
              .docs { padding: 0 16px 2px 16px; }
              .docs h2 { margin: 8px 0; font-size: 13px; color: #334155; }
            </style>
          </head>
          <body>
            <div class="sheet">
              <div class="hero">
                <h1 class="title">Plot Financial Report</h1>
                <p class="sub">${escapeHtml(selectedNagar)} • ${escapeHtml(plotNo)}</p>
              </div>
              <div class="meta">Generated: ${escapeHtml(new Date().toLocaleString())}</div>
              <div class="cards">
                <div class="card"><p class="cl">By Cash</p><p class="cv" style="color:#15803d;">${escapeHtml(formatCurrency(totalBy))}</p></div>
                <div class="card"><p class="cl">To Cash</p><p class="cv" style="color:#b91c1c;">${escapeHtml(formatCurrency(totalTo))}</p></div>
                <div class="card"><p class="cl">Profit</p><p class="cv" style="color:${profit >= 0 ? '#15803d' : '#b91c1c'};">${escapeHtml(`${profit >= 0 ? '' : '-'}${formatCurrency(Math.abs(profit))}`)}</p></div>
              </div>
              <div class="sec">
                <h2>Property Details</h2>
                <div class="pgrid">
                  <div class="pi"><p class="pil">Nagar</p><p class="piv">${escapeHtml(selectedNagar)}</p></div>
                  <div class="pi"><p class="pil">Plot No</p><p class="piv">${escapeHtml(plotNo)}</p></div>
                  <div class="pi"><p class="pil">Phone</p><p class="piv">${escapeHtml(latest?.phone_no || '-')}</p></div>
                  <div class="pi"><p class="pil">Village</p><p class="piv">${escapeHtml(latest?.village || '-')}</p></div>
                  <div class="pi"><p class="pil">Taluk</p><p class="piv">${escapeHtml(latest?.taluk || '-')}</p></div>
                  <div class="pi"><p class="pil">District</p><p class="piv">${escapeHtml(latest?.district || '-')}</p></div>
                  <div class="pi"><p class="pil">Survey No</p><p class="piv">${escapeHtml(latest?.survey_no || '-')}</p></div>
                  <div class="pi"><p class="pil">Patta No</p><p class="piv">${escapeHtml(latest?.patta_no || '-')}</p></div>
                  <div class="pi"><p class="pil">Sq Ft</p><p class="piv">${escapeHtml(String(latest?.sq_ft || '-'))}</p></div>
                  <div class="pi"><p class="pil">Entries</p><p class="piv">${plotTransactions.length}</p></div>
                </div>
              </div>
              <div class="sec"><h2>Transactions</h2></div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Name</th>
                    <th>Details</th>
                    <th>By Cash</th>
                    <th>To Cash</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>
              <div class="docs">
                <h2>Documents</h2>
                <ul>${docsHtml}</ul>
              </div>
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { dialogTitle: `${selectedNagar} - ${plotNo} report` });
      } else {
        Alert.alert('Share unavailable', 'Sharing is not available on this device.');
      }
    } catch (e: any) {
      Alert.alert('Share failed', e?.message ?? 'Unable to generate report.');
    }
  }

  useFocusEffect(
    React.useCallback(() => {
      if (!selectedNagar) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setSelectedNagar(null);
        return true;
      });
      return () => sub.remove();
    }, [selectedNagar])
  );

  if (selectedNagar) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelectedNagar(null)} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{selectedNagar}</Text>
          <View style={{ width: 60 }} />
        </View>

        <FlatList
          data={plotGroups}
          keyExtractor={(item) => item.plotNo}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[AppColors.primary]} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom + 96, 120) }]}
          ListHeaderComponent={
            <View style={styles.sortHead}>
              <Text style={styles.plotsTitle}>Plots</Text>
              <View style={styles.sortRow}>
                {(['Plot A-Z', 'Profit High-Low', 'Profit Low-High'] as const).map((s) => (
                  <TouchableOpacity key={s} style={[styles.sortChip, plotSortBy === s && styles.sortChipActive]} onPress={() => setPlotSortBy(s)}>
                    <Text style={[styles.sortChipText, plotSortBy === s && styles.sortChipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
          renderItem={({ item: plot }) => (
            <TouchableOpacity
              style={styles.plotCard}
              activeOpacity={0.8}
              onPress={() => router.push({ pathname: '/property-plot', params: { nagar: selectedNagar, plot: plot.plotNo } })}
            >
              <View style={styles.plotHeader}>
                <Text style={styles.plotNo}>{plot.plotNo}</Text>
                <Text style={[styles.plotBalance, { color: plot.profit >= 0 ? AppColors.income : AppColors.expense }]}>
                  {plot.profit >= 0 ? '' : '-'}{formatCurrency(Math.abs(plot.profit))}
                </Text>
              </View>
              <View style={styles.plotStats}>
                <Text style={styles.incomeText}>By Cash: {formatCurrency(plot.cashIn)}</Text>
                <Text style={styles.expenseText}>To Cash: {formatCurrency(plot.cashOut)}</Text>
                <Text style={[styles.countText, { color: plot.profit >= 0 ? AppColors.income : AppColors.expense }]}>
                  Profit: {plot.profit >= 0 ? '' : '-'}{formatCurrency(Math.abs(plot.profit))}
                </Text>
                <Text style={styles.countText}>{plot.items.length} entries</Text>
              </View>
              <View style={styles.plotActions}>
                <View style={styles.plotActionLeft}>
                  <TouchableOpacity
                    style={styles.reportBtn}
                    onPress={() => router.push({ pathname: '/property-plot', params: { nagar: selectedNagar, plot: plot.plotNo } })}
                  >
                    <Text style={styles.reportBtnText}>Report</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => handleEditPlot(plot.plotNo)}
                  >
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => handleSharePlot(plot.plotNo)}
                  >
                    <Text style={styles.editBtnText}>Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No transactions for this project.</Text>
            </View>
          }
        />

        <TouchableOpacity
          style={[styles.propertyAddFab, { bottom: Math.max(insets.bottom + 24, 34) }]}
          onPress={() => router.push({ pathname: '/transaction/add', params: { nagar: selectedNagar, propertyOnly: '1' } })}
        >
          <Text style={styles.addFabText}>+ Add Entry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Properties</Text>
        </View>
        <Text style={styles.headerSub}>Grouped by Project / Nagar</Text>
      </View>

      <FlatList
        data={visiblePropertySummaries}
        keyExtractor={(item) => item.nagar_name}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[AppColors.primary]} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom + 106, 130) }]}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.nagarCard} onPress={() => setSelectedNagar(item.nagar_name)}>
            <View style={styles.nagarHeader}>
              <View style={styles.nagarHeadLeft}>
                <Text style={styles.nagarName}>{item.nagar_name}</Text>
                <Text style={styles.nagarCount}>{item.transactionCount} entries</Text>
              </View>
              <TouchableOpacity style={styles.editBtn} onPress={() => handleEditNagar(item.nagar_name)}>
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.nagarStats}>
              <View style={[styles.nagarStatBadge, { backgroundColor: AppColors.incomeLight }]}>
                <Text style={[styles.nagarStatLabel, { color: AppColors.income }]}>By Cash</Text>
                <Text style={[styles.nagarStatValue, { color: AppColors.income }]}>{formatCurrency(item.totalCashIn)}</Text>
              </View>
              <View style={[styles.nagarStatBadge, { backgroundColor: AppColors.expenseLight }]}>
                <Text style={[styles.nagarStatLabel, { color: AppColors.expense }]}>To Cash</Text>
                <Text style={[styles.nagarStatValue, { color: AppColors.expense }]}>{formatCurrency(item.totalCashOut)}</Text>
              </View>
              <View style={[styles.nagarStatBadge, { backgroundColor: AppColors.balanceLight }]}>
                <Text style={[styles.nagarStatLabel, { color: AppColors.balance }]}>Profit</Text>
                <Text style={[styles.nagarStatValue, { color: item.balance >= 0 ? AppColors.income : AppColors.expense }]}>
                  {item.balance >= 0 ? '' : '-'}{formatCurrency(Math.abs(item.balance))}
                </Text>
              </View>
            </View>
            <Text style={styles.viewMore}>Tap to view plots →</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No properties yet.</Text>
            <Text style={styles.emptySubText}>Add transactions with a Nagar Name to see them here.</Text>
          </View>
        }
        ListHeaderComponent={
          <View style={styles.sortRowTop}>
            {(['Name A-Z', 'Profit High-Low', 'Profit Low-High'] as const).map((s) => (
              <TouchableOpacity key={s} style={[styles.sortChip, nagarSortBy === s && styles.sortChipActive]} onPress={() => setNagarSortBy(s)}>
                <Text style={[styles.sortChipText, nagarSortBy === s && styles.sortChipTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        }
      />
      <TouchableOpacity
        style={[styles.addFab, { bottom: Math.max(insets.bottom + 24, 34) }]}
        onPress={() => router.push({ pathname: '/transaction/add', params: { propertyOnly: '1' } })}
      >
        <Text style={styles.addFabText}>+ Add Property Entry</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.bg },
  header: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: AppColors.card, borderBottomWidth: 1, borderBottomColor: AppColors.border },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: AppColors.text, flex: 1 },
  headerSub: { fontSize: 12, color: AppColors.textSecondary, marginTop: 2 },
  backBtn: { marginBottom: 4 },
  backBtnText: { fontSize: 14, color: AppColors.primary, fontWeight: '600' },
  addFab: {
    position: 'absolute', bottom: 24, alignSelf: 'center',
    backgroundColor: AppColors.primary, borderRadius: 30,
    paddingHorizontal: 24, paddingVertical: 14,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8,
  },
  propertyAddFab: {
    position: 'absolute', bottom: 24, right: 16,
    backgroundColor: AppColors.income, borderRadius: 24,
    paddingHorizontal: 16, paddingVertical: 10,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8,
  },
  addFabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },

  plotsTitle: { fontSize: 15, fontWeight: '800', color: AppColors.text, marginBottom: 12 },

  nagarCard: { backgroundColor: AppColors.card, borderRadius: 14, padding: 16, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  nagarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 },
  nagarHeadLeft: { flex: 1 },
  nagarName: { fontSize: 15, fontWeight: '700', color: AppColors.text, flex: 1 },
  nagarCount: { fontSize: 12, color: AppColors.textSecondary },
  nagarStats: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  nagarStatBadge: { flex: 1, borderRadius: 8, padding: 10 },
  nagarStatLabel: { fontSize: 10, fontWeight: '500', marginBottom: 4 },
  nagarStatValue: { fontSize: 13, fontWeight: '700' },
  viewMore: { fontSize: 12, color: AppColors.primary, fontWeight: '600' },

  plotCard: { backgroundColor: AppColors.card, borderRadius: 12, padding: 14, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3 },
  sortHead: { marginBottom: 8 },
  sortRowTop: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10, flexWrap: 'wrap' },
  sortRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sortChip: { borderRadius: 14, borderWidth: 1, borderColor: AppColors.border, backgroundColor: AppColors.card, paddingHorizontal: 10, paddingVertical: 6 },
  sortChipActive: { borderColor: AppColors.primary, backgroundColor: AppColors.primaryLight },
  sortChipText: { fontSize: 11, color: AppColors.textSecondary, fontWeight: '700' },
  sortChipTextActive: { color: AppColors.primary },
  plotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  plotNo: { fontSize: 15, fontWeight: '700', color: AppColors.text },
  plotBalance: { fontSize: 15, fontWeight: '700' },
  plotStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
  incomeText: { fontSize: 13, fontWeight: '600', color: AppColors.income },
  expenseText: { fontSize: 13, fontWeight: '600', color: AppColors.expense },
  countText: { fontSize: 12, color: AppColors.textSecondary },
  plotActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  plotActionLeft: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  reportBtn: {
    backgroundColor: AppColors.primaryLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppColors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  reportBtnText: { color: AppColors.primary, fontWeight: '800', fontSize: 12 },
  editBtn: {
    backgroundColor: AppColors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editBtnText: { color: AppColors.text, fontWeight: '700', fontSize: 12 },

  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, color: AppColors.textSecondary, fontWeight: '600' },
  emptySubText: { fontSize: 13, color: AppColors.textSecondary, marginTop: 6, textAlign: 'center' },
});
