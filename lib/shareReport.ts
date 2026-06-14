import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Transaction } from '../types';

function formatCurrency(amount: number) {
  return '₹' + amount.toLocaleString('en-IN');
}

export async function shareTransactionReport(t: Transaction) {
  const imageAttachments = (t.attachments || []).filter((url) => !url.toLowerCase().includes('.pdf'));

  const imageSection = imageAttachments.length > 0
    ? `<div class="section-title">Attached Photos</div>
       <div class="photos">${imageAttachments.map((url) => `<img src="${url}" />`).join('')}</div>`
    : '';

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #1a1a2e; font-size: 13px; }
  h1 { font-size: 22px; color: #2563eb; margin-bottom: 4px; }
  .subtitle { color: #64748b; margin-bottom: 24px; font-size: 13px; }
  .summary { display: flex; gap: 16px; margin-bottom: 24px; }
  .summary-card { flex: 1; padding: 14px; border-radius: 10px; text-align: center; }
  .in { background: #dcfce7; color: #16a34a; }
  .out { background: #fee2e2; color: #dc2626; }
  .summary-card .label { font-size: 11px; font-weight: 600; margin-bottom: 6px; text-transform: uppercase; }
  .summary-card .amount { font-size: 18px; font-weight: 800; }
  .row { display: flex; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; }
  .row-label { width: 140px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; }
  .row-value { flex: 1; font-size: 13px; color: #1a1a2e; }
  .badge { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; }
  .badge-buyer { background: #dcfce7; color: #16a34a; }
  .badge-seller { background: #fee2e2; color: #dc2626; }
  .badge-govt { background: #fef9c3; color: #ca8a04; }
  .section-title { font-size: 14px; font-weight: 700; color: #2563eb; margin: 20px 0 12px; text-transform: uppercase; letter-spacing: 0.5px; border-left: 3px solid #2563eb; padding-left: 10px; }
  .photos { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 24px; }
  .photos img { width: 160px; height: 160px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0; }
  .footer { margin-top: 24px; font-size: 11px; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
  <h1>${t.name}</h1>
  <div class="subtitle">NTR Ledger — Transaction Receipt &nbsp;|&nbsp; ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>

  <div class="summary">
    ${t.cash_in ? `<div class="summary-card in"><div class="label">Cash In</div><div class="amount">${formatCurrency(t.cash_in)}</div></div>` : ''}
    ${t.cash_out ? `<div class="summary-card out"><div class="label">Cash Out</div><div class="amount">${formatCurrency(t.cash_out)}</div></div>` : ''}
  </div>

  <div class="section-title">Transaction Details</div>
  <div class="row"><div class="row-label">Date</div><div class="row-value">${t.date}</div></div>
  <div class="row"><div class="row-label">Category</div><div class="row-value"><span class="badge badge-${t.category.toLowerCase()}">${t.category}</span></div></div>
  <div class="row"><div class="row-label">Nagar</div><div class="row-value">${t.nagar_name || '-'}</div></div>
  ${t.plot_no ? `<div class="row"><div class="row-label">Plot No</div><div class="row-value">${t.plot_no}</div></div>` : ''}
  ${t.village ? `<div class="row"><div class="row-label">Village</div><div class="row-value">${t.village}</div></div>` : ''}
  ${t.district ? `<div class="row"><div class="row-label">District</div><div class="row-value">${t.district}</div></div>` : ''}
  ${t.survey_no ? `<div class="row"><div class="row-label">Survey No</div><div class="row-value">${t.survey_no}</div></div>` : ''}
  ${t.patta_no ? `<div class="row"><div class="row-label">Patta No</div><div class="row-value">${t.patta_no}</div></div>` : ''}
  ${t.sq_ft ? `<div class="row"><div class="row-label">Sq.Ft</div><div class="row-value">${t.sq_ft}</div></div>` : ''}
  ${t.transaction_details ? `<div class="row"><div class="row-label">Details</div><div class="row-value">${t.transaction_details}</div></div>` : ''}
  ${t.sub_total ? `<div class="row"><div class="row-label">Sub Total</div><div class="row-value">${formatCurrency(t.sub_total)}</div></div>` : ''}
  ${t.remarks ? `<div class="row"><div class="row-label">Remarks</div><div class="row-value">${t.remarks}</div></div>` : ''}

  ${imageSection}
  <div class="footer">NTR Ledger • Real Estate Transaction Manager</div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${t.name} Receipt` });
  }
}

export async function sharePlotReport(
  nagarName: string,
  plotNo: string,
  entries: Transaction[]
) {
  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let running = 0;
  const rows = sorted.map((t) => {
    running += (t.cash_in || 0) - (t.cash_out || 0);
    const byCash = (t.remarks || '').toLowerCase().startsWith('sell price') ? 0 : (t.cash_in || 0);
    const toCash = t.cash_out || 0;
    return { t, byCash, toCash, balance: running };
  });

  const totalByCash = rows.reduce((s, r) => s + r.byCash, 0);
  const totalToCash = rows.reduce((s, r) => s + r.toCash, 0);
  const finalBalance = running;

  const txRows = [...rows].reverse().map(({ t, byCash, toCash, balance }) => `
    <tr>
      <td>${t.date}</td>
      <td>${t.name || '-'}</td>
      <td class="income">${byCash ? formatCurrency(byCash) : '-'}</td>
      <td class="expense">${toCash ? formatCurrency(toCash) : '-'}</td>
      <td class="${balance >= 0 ? 'income' : 'expense'}">${balance >= 0 ? '' : '-'}${formatCurrency(Math.abs(balance))}</td>
    </tr>`
  ).join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #1a1a2e; font-size: 13px; }
  h1 { font-size: 22px; color: #2563eb; margin-bottom: 4px; }
  .subtitle { color: #64748b; margin-bottom: 24px; font-size: 13px; }
  .summary { display: flex; gap: 16px; margin-bottom: 24px; }
  .summary-card { flex: 1; padding: 14px; border-radius: 10px; text-align: center; }
  .in { background: #dcfce7; color: #16a34a; }
  .out { background: #fee2e2; color: #dc2626; }
  .bal { background: #dbeafe; color: #2563eb; }
  .summary-card .label { font-size: 11px; font-weight: 600; margin-bottom: 6px; text-transform: uppercase; }
  .summary-card .amount { font-size: 18px; font-weight: 800; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; color: #64748b; }
  td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
  tr:nth-child(even) td { background: #fafafa; }
  .income { color: #16a34a; font-weight: 700; }
  .expense { color: #dc2626; font-weight: 700; }
  .section-title { font-size: 14px; font-weight: 700; color: #2563eb; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-left: 3px solid #2563eb; padding-left: 10px; }
  .footer { margin-top: 24px; font-size: 11px; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
  <h1>${nagarName} · Plot ${plotNo}</h1>
  <div class="subtitle">NTR Ledger — Plot Report &nbsp;|&nbsp; ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>

  <div class="summary">
    <div class="summary-card in">
      <div class="label">By Cash</div>
      <div class="amount">${formatCurrency(totalByCash)}</div>
    </div>
    <div class="summary-card out">
      <div class="label">To Cash</div>
      <div class="amount">${formatCurrency(totalToCash)}</div>
    </div>
    <div class="summary-card bal">
      <div class="label">Balance</div>
      <div class="amount">${finalBalance >= 0 ? '' : '-'}${formatCurrency(Math.abs(finalBalance))}</div>
    </div>
  </div>

  <div class="section-title">Entries (${entries.length})</div>
  <table>
    <thead>
      <tr>
        <th>Date</th><th>Name</th><th>By Cash</th><th>To Cash</th><th>Balance</th>
      </tr>
    </thead>
    <tbody>${txRows}</tbody>
  </table>

  <div class="footer">NTR Ledger • Real Estate Transaction Manager</div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `${nagarName} · Plot ${plotNo} Report`,
    });
  }
}

export async function shareNagarReport(
  nagarName: string,
  transactions: Transaction[],
  nagarAttachments: string[]
) {
  const totalCashIn = transactions.reduce((s, t) => s + (t.cash_in || 0), 0);
  const totalCashOut = transactions.reduce((s, t) => s + (t.cash_out || 0), 0);
  const balance = totalCashIn - totalCashOut;

  const txRows = transactions
    .map(
      (t) => `
      <tr>
        <td>${t.date}</td>
        <td>${t.name}</td>
        <td><span class="badge badge-${t.category.toLowerCase()}">${t.category}</span></td>
        <td>${t.plot_no || '-'}</td>
        <td>${t.transaction_details || '-'}</td>
        <td class="income">${t.cash_in ? formatCurrency(t.cash_in) : '-'}</td>
        <td class="expense">${t.cash_out ? formatCurrency(t.cash_out) : '-'}</td>
        <td>${t.remarks || '-'}</td>
      </tr>`
    )
    .join('');

  const imageAttachments = [
    ...nagarAttachments,
    ...transactions.flatMap((t) => t.attachments || []),
  ].filter((url) => !url.toLowerCase().includes('.pdf'));

  const imageSection =
    imageAttachments.length > 0
      ? `<div class="section-title">Attached Photos</div>
         <div class="photos">
           ${imageAttachments.map((url) => `<img src="${url}" />`).join('')}
         </div>`
      : '';

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #1a1a2e; font-size: 13px; }
  h1 { font-size: 22px; color: #2563eb; margin-bottom: 4px; }
  .subtitle { color: #64748b; margin-bottom: 24px; font-size: 13px; }
  .summary { display: flex; gap: 16px; margin-bottom: 24px; }
  .summary-card { flex: 1; padding: 14px; border-radius: 10px; text-align: center; }
  .in { background: #dcfce7; color: #16a34a; }
  .out { background: #fee2e2; color: #dc2626; }
  .bal { background: #dbeafe; color: #2563eb; }
  .summary-card .label { font-size: 11px; font-weight: 600; margin-bottom: 6px; text-transform: uppercase; }
  .summary-card .amount { font-size: 18px; font-weight: 800; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; color: #64748b; }
  td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
  tr:nth-child(even) td { background: #fafafa; }
  .income { color: #16a34a; font-weight: 700; }
  .expense { color: #dc2626; font-weight: 700; }
  .badge { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; }
  .badge-buyer { background: #dcfce7; color: #16a34a; }
  .badge-seller { background: #fee2e2; color: #dc2626; }
  .badge-govt { background: #fef9c3; color: #ca8a04; }
  .section-title { font-size: 14px; font-weight: 700; color: #2563eb; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-left: 3px solid #2563eb; padding-left: 10px; }
  .photos { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 24px; }
  .photos img { width: 160px; height: 160px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0; }
  .footer { margin-top: 24px; font-size: 11px; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
  <h1>${nagarName}</h1>
  <div class="subtitle">NTR Ledger — Transaction Report &nbsp;|&nbsp; Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>

  <div class="summary">
    <div class="summary-card in">
      <div class="label">Total Cash In</div>
      <div class="amount">${formatCurrency(totalCashIn)}</div>
    </div>
    <div class="summary-card out">
      <div class="label">Total Cash Out</div>
      <div class="amount">${formatCurrency(totalCashOut)}</div>
    </div>
    <div class="summary-card bal">
      <div class="label">Balance</div>
      <div class="amount">${formatCurrency(balance)}</div>
    </div>
  </div>

  <div class="section-title">Transactions (${transactions.length})</div>
  <table>
    <thead>
      <tr>
        <th>Date</th><th>Name</th><th>Category</th><th>Plot</th>
        <th>Details</th><th>Cash In</th><th>Cash Out</th><th>Remarks</th>
      </tr>
    </thead>
    <tbody>${txRows}</tbody>
  </table>

  ${imageSection}

  <div class="footer">NTR Ledger • Real Estate Transaction Manager</div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `${nagarName} Report`,
    });
  }
}
