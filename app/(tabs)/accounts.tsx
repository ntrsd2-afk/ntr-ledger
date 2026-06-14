import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { AppColors } from '../../constants/appColors';
import { ACCOUNTS_LEDGER } from '../../constants/appConstants';
import { useAuth } from '../../context/AuthContext';
import { useTransactions } from '../../context/TransactionContext';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { Transaction } from '../../types';

type AccountTableRow = {
  tx: Transaction;
  closingBalance: number;
};
type EntryFilter = 'All' | 'By Cash' | 'To Cash';

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

let DateTimePickerModule: any = null;
try {
  DateTimePickerModule = require('@react-native-community/datetimepicker').default;
} catch {
  DateTimePickerModule = null;
}

function EntryRow({ item, onPress, showDetails }: { item: AccountTableRow; onPress: () => void; showDetails: boolean }) {
  const isLand = item.tx.category === 'Govt';
  const hasIn = (item.tx.cash_in || 0) > 0;
  const accentColor = isLand ? AppColors.balance : hasIn ? AppColors.income : AppColors.expense;
  return (
    <TouchableOpacity style={[styles.entryRow, { borderLeftColor: accentColor }]} onPress={onPress} activeOpacity={0.75}>
      <Text style={styles.colDate}>{formatDate(item.tx.date)}</Text>
      <Text style={styles.colName} numberOfLines={1}>{item.tx.name}</Text>
      {showDetails && <Text style={styles.colDetails} numberOfLines={1}>{item.tx.transaction_details || '-'}</Text>}
      <Text style={styles.colBy}>{item.tx.cash_in ? formatCurrency(item.tx.cash_in) : '-'}</Text>
      <Text style={styles.colTo}>{item.tx.cash_out ? formatCurrency(item.tx.cash_out) : '-'}</Text>
      <Text style={[styles.colBal, { color: isLand ? AppColors.balance : item.closingBalance >= 0 ? AppColors.income : AppColors.expense }]}>
        {isLand ? 'LAND' : `${item.closingBalance >= 0 ? '+' : '-'}${formatCurrency(Math.abs(item.closingBalance))}`}
      </Text>
    </TouchableOpacity>
  );
}

export default function AccountsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const showDetails = width >= 900 || isLandscape;
  const { transactions, refresh } = useTransactions();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 800);
  }, [refresh]);
  const accountTransactions = useMemo(
    () => transactions.filter((t) => t.nagar_name === ACCOUNTS_LEDGER),
    [transactions]
  );
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [entryFilter, setEntryFilter] = useState<EntryFilter>('All');
  const [isSharingPdf, setIsSharingPdf] = useState(false);

  const baseRows = useMemo<AccountTableRow[]>(() => {
    const q = search.trim().toLowerCase();
    const source = accountTransactions.filter((t) => {
      const txDate = t.date || '';
      const matchesFrom = !fromDate || txDate >= fromDate;
      const matchesTo = !toDate || txDate <= toDate;
      const matchesSearch = !q || t.name.toLowerCase().includes(q) || t.transaction_details.toLowerCase().includes(q);
      return matchesFrom && matchesTo && matchesSearch;
    });

    const sorted = [...source].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let running = 0;
    return sorted.map((tx) => {
      const isLand = tx.category === 'Govt';
      if (!isLand) {
        running += (tx.cash_in || 0) - (tx.cash_out || 0);
      }
      return { tx, closingBalance: running };
    });
  }, [accountTransactions, search, fromDate, toDate]);

  const tableRows = useMemo(() => {
    if (entryFilter === 'By Cash') return baseRows.filter((r) => r.tx.category !== 'Govt' && (r.tx.cash_in || 0) > 0);
    if (entryFilter === 'To Cash') return baseRows.filter((r) => r.tx.category !== 'Govt' && (r.tx.cash_out || 0) > 0);
    return baseRows;
  }, [baseRows, entryFilter]);

  const cashRows = baseRows.filter((r) => r.tx.category !== 'Govt');
  const totalBalance = cashRows.length ? cashRows[cashRows.length - 1].closingBalance : 0;
  const totalByCash = cashRows.reduce((sum, r) => sum + (r.tx.cash_in || 0), 0);
  const totalToCash = cashRows.reduce((sum, r) => sum + (r.tx.cash_out || 0), 0);

  function escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function shareFilteredAsPdf() {
    try {
      if (!tableRows.length) {
        Alert.alert('No data', 'No filtered entries available to export.');
        return;
      }

      setIsSharingPdf(true);
      const generatedAt = new Date();
      const rowsHtml = tableRows.map((row) => {
        const details = row.tx.transaction_details || '-';
        const isLand = row.tx.category === 'Govt';
        return `
          <tr class="${isLand ? 'land' : ''}">
            <td>${escapeHtml(formatDate(row.tx.date))}</td>
            <td>${escapeHtml(row.tx.name)}</td>
            <td>${escapeHtml(details)}</td>
            <td class="amountCol">${escapeHtml(row.tx.cash_in ? formatCurrency(row.tx.cash_in) : '-')}</td>
            <td class="amountCol">${escapeHtml(row.tx.cash_out ? formatCurrency(row.tx.cash_out) : '-')}</td>
          </tr>
        `;
      }).join('');

      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              * { box-sizing: border-box; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                margin: 0;
                color: #111827;
                background: #f3f6fb;
                padding: 18px;
              }
              .sheet {
                background: #ffffff;
                border-radius: 16px;
                overflow: hidden;
                border: 1px solid #dbe4f0;
              }
              .hero {
                padding: 18px 20px;
                background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 60%, #2563eb 100%);
                color: #ffffff;
                text-align: center;
              }
              .title {
                margin: 0;
                font-size: 22px;
                font-weight: 800;
                letter-spacing: 0.2px;
              }
              .metaGrid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                padding: 14px 16px 8px 16px;
              }
              .metaCard {
                border: 1px solid #e5e7eb;
                border-radius: 10px;
                background: #f8fafc;
                padding: 10px;
              }
              .metaLabel {
                font-size: 10px;
                text-transform: uppercase;
                font-weight: 700;
                color: #64748b;
                margin: 0 0 4px 0;
              }
              .metaValue {
                margin: 0;
                font-size: 12px;
                font-weight: 700;
                color: #0f172a;
              }
              .chips {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                padding: 0 16px 14px 16px;
              }
              .chip {
                padding: 6px 10px;
                border-radius: 999px;
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                border: 1px solid #cfe0ff;
                background: #e8f0ff;
                color: #1e40af;
              }
              .content {
                padding: 0 16px 16px 16px;
              }
              table {
                width: 100%;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 11.5px;
                border: 1px solid #d7deea;
                border-radius: 10px;
                overflow: hidden;
              }
              th {
                background: #111827;
                color: #ffffff;
                font-weight: 700;
                text-align: left;
                padding: 9px 8px;
                border-bottom: 1px solid #1f2937;
              }
              td {
                padding: 8px;
                border-bottom: 1px solid #e5e7eb;
                color: #111827;
                vertical-align: top;
              }
              tbody tr:nth-child(even) td { background: #f8fafc; }
              tbody tr.land td { background: #fff8e6; }
              tbody tr:last-child td { border-bottom: none; }
              .num { text-align: right; white-space: nowrap; font-weight: 700; }
              .amountCol { text-align: center; white-space: nowrap; }
              .footer {
                border-top: 1px solid #e5e7eb;
                padding: 10px 16px 14px 16px;
                font-size: 10px;
                color: #64748b;
                text-align: right;
              }
            </style>
          </head>
          <body>
            <div class="sheet">
              <div class="hero">
                <h1 class="title">Accounts Report</h1>
              </div>

              <div class="metaGrid">
                <div class="metaCard">
                  <p class="metaLabel">Generated On</p>
                  <p class="metaValue">${escapeHtml(generatedAt.toLocaleString())}</p>
                </div>
                <div class="metaCard">
                  <p class="metaLabel">Total Rows</p>
                  <p class="metaValue">${tableRows.length}</p>
                </div>
                <div class="metaCard">
                  <p class="metaLabel">Date Range</p>
                  <p class="metaValue">${escapeHtml(fromDate || 'Any')} to ${escapeHtml(toDate || 'Any')}</p>
                </div>
                <div class="metaCard">
                  <p class="metaLabel">Search</p>
                  <p class="metaValue">${escapeHtml(search.trim() || 'All')}</p>
                </div>
              </div>

              <div class="chips">
                <span class="chip">Filter: ${escapeHtml(entryFilter)}</span>
                <span class="chip">By Cash: ${escapeHtml(formatCurrency(tableRows.reduce((sum, row) => sum + (row.tx.cash_in || 0), 0)))}</span>
                <span class="chip">To Cash: ${escapeHtml(formatCurrency(tableRows.reduce((sum, row) => sum + (row.tx.cash_out || 0), 0)))}</span>
              </div>

              <div class="content">
                <table>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Name</th>
                      <th>Details</th>
                      <th class="amountCol">By Cash</th>
                      <th class="amountCol">To Cash</th>
                    </tr>
                  </thead>
                  <tbody>${rowsHtml}</tbody>
                </table>
              </div>

              <div class="footer">Generated from NTR Accounts module</div>
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { dialogTitle: 'Share filtered accounts report' });
      } else {
        Alert.alert('Share unavailable', 'Sharing is not available on this device.');
      }
    } catch (error) {
      Alert.alert('Export failed', 'Unable to create PDF right now. Please try again.');
    } finally {
      setIsSharingPdf(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={tableRows}
        keyExtractor={(item) => item.tx.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[AppColors.primary]} />}
        renderItem={({ item }) => (
          <EntryRow
            item={item}
            showDetails={showDetails}
            onPress={() => router.push({ pathname: '/account-entry/[id]', params: { id: item.tx.id } })}
          />
        )}
        ListHeaderComponent={
          <>
            <View style={[styles.header, isLandscape && { paddingTop: 10, paddingBottom: 10 }]}>
              <View style={styles.headerTextBlock}>
                <Text style={styles.headerTitle}>Accounts</Text>
                <Text style={styles.headerSub}>Account-wise cash register</Text>
              </View>
              <TouchableOpacity
                style={styles.signOutBtn}
                onPress={() => {
                  Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Sign Out', style: 'destructive', onPress: signOut },
                  ]);
                }}
              >
                <Text style={styles.signOutText}>Sign Out</Text>
              </TouchableOpacity>
            </View>

            {isLandscape ? (
              <View style={styles.summaryLandscape}>
                <View style={styles.summaryStripCompact}>
                  <Text style={styles.summaryLabel}>Balance</Text>
                  <Text style={[styles.summaryBalance, { color: totalBalance >= 0 ? AppColors.income : AppColors.expense }]}>
                    {totalBalance >= 0 ? '+' : '-'}{formatCurrency(Math.abs(totalBalance))}
                  </Text>
                </View>
                <View style={styles.cashCardsLandscape}>
                  <TouchableOpacity style={styles.cashCard} onPress={() => router.push('/account-entry/by-cash')} activeOpacity={0.8}>
                    <Text style={styles.cashCardLabel}>By Cash</Text>
                    <Text style={[styles.cashCardValue, { color: AppColors.income }]}>{formatCurrency(totalByCash)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cashCard} onPress={() => router.push('/account-entry/to-cash')} activeOpacity={0.8}>
                    <Text style={styles.cashCardLabel}>To Cash</Text>
                    <Text style={[styles.cashCardValue, { color: AppColors.expense }]}>{formatCurrency(totalToCash)}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.summaryStrip}>
                  <Text style={styles.summaryLabel}>Balance</Text>
                  <Text style={[styles.summaryBalance, { color: totalBalance >= 0 ? AppColors.income : AppColors.expense }]}>
                    {totalBalance >= 0 ? '+' : '-'}{formatCurrency(Math.abs(totalBalance))}
                  </Text>
                </View>
                <View style={styles.cashCardRow}>
                  <TouchableOpacity style={styles.cashCard} onPress={() => router.push('/account-entry/by-cash')} activeOpacity={0.8}>
                    <Text style={styles.cashCardLabel}>By Cash</Text>
                    <Text style={[styles.cashCardValue, { color: AppColors.income }]}>{formatCurrency(totalByCash)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cashCard} onPress={() => router.push('/account-entry/to-cash')} activeOpacity={0.8}>
                    <Text style={styles.cashCardLabel}>To Cash</Text>
                    <Text style={[styles.cashCardValue, { color: AppColors.expense }]}>{formatCurrency(totalToCash)}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {isLandscape ? (
              <View style={styles.filterSearchLandscape}>
                <View style={styles.filterRowInline}>
                  {(['All', 'By Cash', 'To Cash'] as EntryFilter[]).map((f) => (
                    <TouchableOpacity
                      key={f}
                      style={[styles.filterChip, entryFilter === f && styles.filterChipActive]}
                      onPress={() => setEntryFilter(f)}
                    >
                      <Text style={[styles.filterChipText, entryFilter === f && styles.filterChipTextActive]}>{f}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.searchInputLandscape}
                  placeholder="Search..."
                  placeholderTextColor={AppColors.textSecondary}
                  value={search}
                  onChangeText={setSearch}
                />
              </View>
            ) : (
              <>
                <View style={styles.filterRow}>
                  {(['All', 'By Cash', 'To Cash'] as EntryFilter[]).map((f) => (
                    <TouchableOpacity
                      key={f}
                      style={[styles.filterChip, entryFilter === f && styles.filterChipActive]}
                      onPress={() => setEntryFilter(f)}
                    >
                      <Text style={[styles.filterChipText, entryFilter === f && styles.filterChipTextActive]}>{f}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search name or details..."
                  placeholderTextColor={AppColors.textSecondary}
                  value={search}
                  onChangeText={setSearch}
                />
              </>
            )}
            <View style={styles.dateRow}>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowFromPicker(true)}>
                <Text style={styles.dateBtnLabel}>From</Text>
                <Text style={styles.dateBtnValue}>{fromDate || 'Select date'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowToPicker(true)}>
                <Text style={styles.dateBtnLabel}>To</Text>
                <Text style={styles.dateBtnValue}>{toDate || 'Select date'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.clearBtn} onPress={() => { setFromDate(''); setToDate(''); }}>
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>
            {DateTimePickerModule ? (
              <>
                {showFromPicker && (
                  <DateTimePickerModule
                    value={fromDate ? new Date(fromDate) : new Date()}
                    mode="date"
                    display="default"
                    onChange={(_: unknown, selectedDate?: Date) => {
                      setShowFromPicker(false);
                      if (selectedDate) setFromDate(toIsoDate(selectedDate));
                    }}
                  />
                )}
                {showToPicker && (
                  <DateTimePickerModule
                    value={toDate ? new Date(toDate) : new Date()}
                    mode="date"
                    display="default"
                    onChange={(_: unknown, selectedDate?: Date) => {
                      setShowToPicker(false);
                      if (selectedDate) setToDate(toIsoDate(selectedDate));
                    }}
                  />
                )}
              </>
            ) : (
              <Text style={styles.dateHint}>Calendar unavailable in current build. Enter dates as YYYY-MM-DD using the fields.</Text>
            )}

            <View style={styles.tableHeader}>
              <Text style={styles.hDate}>Timestamp</Text>
              <Text style={styles.hName}>Name</Text>
              {showDetails && <Text style={styles.hDetails}>Details</Text>}
              <Text style={styles.hBy}>By Cash</Text>
              <Text style={styles.hTo}>To Cash</Text>
              <Text style={styles.hBal}>Closing Bal</Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No account entries found.</Text>
          </View>
        }
        contentContainerStyle={[styles.content, { paddingBottom: 150 }]}
      />
      <View style={[styles.fabRow, isLandscape && { bottom: 16 }]}>
        <TouchableOpacity
          style={[styles.fab, styles.shareFab, isSharingPdf && styles.fabDisabled]}
          onPress={shareFilteredAsPdf}
          disabled={isSharingPdf}
        >
          <Text style={styles.fabText}>{isSharingPdf ? 'Creating PDF...' : 'Share PDF'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/account-entry/add')}>
          <Text style={styles.fabText}>+ Add Account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.bg },
  content: { paddingBottom: 24 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: AppColors.card,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  headerTextBlock: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: AppColors.text },
  headerSub: { fontSize: 12, color: AppColors.textSecondary, marginTop: 2 },
  signOutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: AppColors.expenseLight,
    borderRadius: 8,
    marginTop: 2,
  },
  signOutText: { fontSize: 13, fontWeight: '700', color: AppColors.expense },
  fabRow: {
    position: 'absolute',
    bottom: 34,
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 10,
  },
  fab: {
    flex: 1,
    backgroundColor: AppColors.primary,
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 14,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    alignItems: 'center',
  },
  shareFab: { backgroundColor: AppColors.balance },
  fabDisabled: { opacity: 0.7 },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  summaryStrip: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    backgroundColor: AppColors.card,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flexDirection: 'column',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  summaryLabel: { color: AppColors.textSecondary, fontWeight: '700', fontSize: 14, textTransform: 'uppercase', textAlign: 'center' },
  summaryBalance: { fontWeight: '900', fontSize: 30, textAlign: 'center', marginTop: 4 },
  cashCardRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 10 },
  cashCard: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: AppColors.card,
    borderWidth: 1,
    borderColor: AppColors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cashCardLabel: { color: AppColors.textSecondary, fontWeight: '700', fontSize: 12, textTransform: 'uppercase' },
  cashCardValue: { marginTop: 4, fontSize: 18, fontWeight: '800' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 10 },
  filterChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: AppColors.card,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  filterChipActive: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  filterChipText: { fontSize: 13, color: AppColors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  searchInput: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: AppColors.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: AppColors.text,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  dateRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 16, marginBottom: 10 },
  dateBtn: {
    flex: 1,
    backgroundColor: AppColors.card,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  dateBtnLabel: { fontSize: 11, fontWeight: '700', color: AppColors.textSecondary, textTransform: 'uppercase' },
  dateBtnValue: { marginTop: 3, fontSize: 13, fontWeight: '700', color: AppColors.text },
  clearBtn: {
    backgroundColor: AppColors.expenseLight,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  clearBtnText: { color: AppColors.expense, fontWeight: '700', fontSize: 12 },
  dateHint: { paddingHorizontal: 16, marginTop: -4, marginBottom: 10, fontSize: 12, color: AppColors.textSecondary },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 8,
    marginBottom: 4,
    borderRadius: 8,
    backgroundColor: '#111827',
  },
  hDate: { width: 82, color: AppColors.white, fontSize: 11, fontWeight: '700' },
  hName: { flex: 1, color: AppColors.white, fontSize: 11, fontWeight: '700' },
  hDetails: { flex: 1.2, color: AppColors.white, fontSize: 11, fontWeight: '700' },
  hBal: { width: 86, color: AppColors.white, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  hBy: { width: 78, color: AppColors.white, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  hTo: { width: 78, color: AppColors.white, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  entryRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 13,
    marginHorizontal: 8,
    marginBottom: 1,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
    backgroundColor: AppColors.card,
    borderLeftWidth: 3,
    borderLeftColor: AppColors.border,
  },
  colDate: { width: 82, color: AppColors.textSecondary, fontSize: 11, fontWeight: '600' },
  colName: { flex: 1, color: AppColors.text, fontSize: 13, fontWeight: '700' },
  colDetails: { flex: 1.2, color: AppColors.textSecondary, fontSize: 11 },
  colBal: { width: 86, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  colBy: { width: 78, color: AppColors.income, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  colTo: { width: 78, color: AppColors.expense, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  empty: { alignItems: 'center', marginTop: 40 },
  emptyText: { fontSize: 14, color: AppColors.textSecondary },
  summaryLandscape: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 10,
  },
  summaryStripCompact: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: AppColors.card,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  cashCardsLandscape: {
    flex: 1,
    gap: 8,
  },
  filterSearchLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  filterRowInline: {
    flexDirection: 'row',
    gap: 8,
  },
  searchInputLandscape: {
    flex: 1,
    backgroundColor: AppColors.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: AppColors.text,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
});
