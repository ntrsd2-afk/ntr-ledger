import { todayISO } from './formatters';
import {
  ExtractedTransactionFields,
  isLandDocument,
  resolveNagarName,
  resolvePlotNo,
} from './documentExtract';
import { buildLocationLabel } from './maps';
import { addPlotAttachment, setPlotMetadata, type PlotMetadata } from './nagars';
import { uploadFile, uploadPlotFile } from './storage';
import { TransactionInput } from '../types';

export type ScannedFile = {
  uri: string;
  name: string;
  type: 'image' | 'pdf';
};

export function buildPropertyInput(fields: ExtractedTransactionFields): TransactionInput {
  const nagar = resolveNagarName(fields);
  const plot = resolvePlotNo(fields);
  return {
    date: fields.date || todayISO(),
    name: fields.name?.trim() || 'Property from scan',
    category: 'Buyer',
    district: fields.district || '',
    taluk: fields.taluk || '',
    village: fields.village || '',
    survey_no: fields.survey_no || '',
    patta_no: fields.patta_no || '',
    sq_ft: parseFloat(fields.sq_ft || '0') || 0,
    plot_no: plot,
    nagar_name: nagar,
    phone_no: fields.phone_no || '',
    transaction_details: fields.transaction_details || 'Created from scanned land document',
    cash_in: 0,
    cash_out: 0,
    sub_total: 0,
    remarks: fields.remarks || 'Auto-created from document scan',
    attachments: [],
  };
}

export function buildPlotMetadata(fields: ExtractedTransactionFields): PlotMetadata {
  const nagar = resolveNagarName(fields);
  const plot = resolvePlotNo(fields);
  return {
    name: fields.name,
    location: buildLocationLabel({
      location: fields.location,
      nagar_name: nagar,
      village: fields.village,
      taluk: fields.taluk,
      district: fields.district,
      plot_no: plot,
    }),
    latitude: fields.latitude ? parseFloat(fields.latitude) : undefined,
    longitude: fields.longitude ? parseFloat(fields.longitude) : undefined,
    district: fields.district,
    taluk: fields.taluk,
    village: fields.village,
    survey_no: fields.survey_no,
    patta_no: fields.patta_no,
    sq_ft: parseFloat(fields.sq_ft || '0') || undefined,
    phone_no: fields.phone_no,
  };
}

export async function createPropertyFromScan(
  uid: string,
  fields: ExtractedTransactionFields,
  file: ScannedFile,
  addTransaction: (t: TransactionInput) => Promise<string>,
  editTransaction: (id: string, t: TransactionInput) => Promise<void>
): Promise<{ nagar: string; plot: string; txId: string }> {
  if (!isLandDocument(fields)) {
    throw new Error('This does not look like a land document. Try a patta, sale deed, or survey record.');
  }

  const input = buildPropertyInput(fields);
  const nagar = input.nagar_name;
  const plot = input.plot_no;
  const txId = await addTransaction(input);

  const txUrl = await uploadFile(uid, txId, file.uri, file.name);
  await editTransaction(txId, { ...input, attachments: [txUrl] });

  const plotUrl = await uploadPlotFile(uid, nagar, plot, file.uri, file.name);
  await addPlotAttachment(uid, nagar, plot, { url: plotUrl, name: file.name });
  await setPlotMetadata(uid, nagar, plot, buildPlotMetadata(fields));

  return { nagar, plot, txId };
}
