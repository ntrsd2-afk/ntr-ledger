import * as FileSystem from 'expo-file-system/legacy';

export type ExtractedTransactionFields = {
  name?: string;
  date?: string;
  phone_no?: string;
  district?: string;
  taluk?: string;
  village?: string;
  survey_no?: string;
  patta_no?: string;
  sq_ft?: string;
  plot_no?: string;
  nagar_name?: string;
  location?: string;
  latitude?: string;
  longitude?: string;
  transaction_details?: string;
  cash_in?: string;
  cash_out?: string;
  sub_total?: string;
  remarks?: string;
  is_land_document?: boolean;
};

export type ExtractedAccountFields = {
  name?: string;
  date?: string;
  details?: string;
  byCash?: string;
  toCash?: string;
  remarks?: string;
};

export type ScanDocumentType = 'image' | 'pdf';

/** Tried in order until one succeeds (flash-lite is not available for new API keys). */
const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
] as const;

function getApiKey(): string {
  const key = process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      'Gemini API key is missing. Add EXPO_PUBLIC_GEMINI_API_KEY to your .env file and restart Expo.'
    );
  }
  return key;
}

function cleanString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function cleanAmount(value: unknown): string | undefined {
  const text = cleanString(value);
  if (!text) return undefined;
  const normalized = text.replace(/[^\d.]/g, '');
  return normalized || undefined;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI response did not contain valid JSON.');
  }
  return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
}

async function readDocumentBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

function formatGeminiError(status: number, errorText: string): string {
  if (status === 429) {
    return (
      'Gemini API quota exceeded for this key.\n\n' +
      '• Wait 1–24 hours for free quota to reset, or\n' +
      '• Enable billing in Google AI Studio (aistudio.google.com), or\n' +
      '• Create a new API key in a new Google Cloud project.\n\n' +
      'Then rebuild the APK so the new key is included.'
    );
  }
  if (status === 403) {
    return 'API key invalid or Gemini API not enabled. Check your key in Google AI Studio.';
  }
  if (status === 404) {
    return 'AI model not available for your API key. Update the app or set EXPO_PUBLIC_GEMINI_MODEL in .env.';
  }
  if (status === 400) {
    return 'Could not read this file. Try a clearer photo or a smaller PDF.';
  }
  return `Document scan failed (${status}). ${errorText.slice(0, 120)}`;
}

async function callGeminiModel(
  model: string,
  apiKey: string,
  mimeType: string,
  base64Data: string,
  prompt: string
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; text: string }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64Data } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    return { ok: false, status: response.status, text: errorText };
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return { ok: false, status: 0, text: 'empty response' };
  }

  return { ok: true, data: parseJsonObject(text) };
}

async function callGemini(
  mimeType: string,
  base64Data: string,
  prompt: string
): Promise<Record<string, unknown>> {
  const apiKey = getApiKey();
  const preferred = process.env.EXPO_PUBLIC_GEMINI_MODEL?.trim();
  const models = preferred ? [preferred, ...GEMINI_MODELS.filter((m) => m !== preferred)] : [...GEMINI_MODELS];

  let lastStatus = 0;
  let lastText = '';

  for (const model of models) {
    const result = await callGeminiModel(model, apiKey, mimeType, base64Data, prompt);
    if (result.ok) {
      if (model !== models[0]) {
        console.warn(`[Gemini] Used fallback model: ${model}`);
      }
      return result.data;
    }

    console.warn(`[Gemini] Model ${model} failed (${result.status}): ${result.text.slice(0, 80)}`);
    lastStatus = result.status;
    lastText = result.text;
    // Try next model when this one is missing, rate-limited, or empty
    const retryable = [0, 400, 404, 429, 503];
    if (!retryable.includes(result.status)) {
      break;
    }
  }

  throw new Error(formatGeminiError(lastStatus, lastText));
}

const TRANSACTION_PROMPT = `You are an OCR assistant for a Tamil Nadu real-estate transaction app.
Read the attached document (sale deed, patta, receipt, agreement, or property record) and extract fields.
Return ONLY valid JSON with these keys (use empty string if not found):
{
  "name": "person or party name",
  "date": "YYYY-MM-DD if possible",
  "phone_no": "10-digit mobile if present",
  "district": "",
  "taluk": "",
  "village": "",
  "survey_no": "",
  "patta_no": "",
  "sq_ft": "numeric area in square feet",
  "plot_no": "",
  "nagar_name": "",
  "location": "full address or place name for Google Maps",
  "latitude": "decimal latitude if visible on document",
  "longitude": "decimal longitude if visible on document",
  "transaction_details": "short summary of transaction or property",
  "is_land_document": true,
  "cash_in": "amount received",
  "cash_out": "amount paid",
  "sub_total": "total amount",
  "remarks": "other useful notes"
}
Use English or transliterated Tamil text. Normalize dates to YYYY-MM-DD when possible.
Set is_land_document to true for patta, sale deed, land records, survey documents; false for receipts only.`;

const ACCOUNT_PROMPT = `You are an OCR assistant for an accounts ledger app.
Read the attached receipt, invoice, bank slip, or payment document and extract fields.
Return ONLY valid JSON with these keys (use empty string if not found):
{
  "name": "person, vendor, or account name",
  "date": "YYYY-MM-DD if possible",
  "details": "transaction description",
  "byCash": "amount received / credit",
  "toCash": "amount paid / debit",
  "remarks": "other useful notes"
}
Normalize dates to YYYY-MM-DD when possible. Amounts should be plain numbers without currency symbols.`;

function mapTransactionFields(raw: Record<string, unknown>): ExtractedTransactionFields {
  const fields: ExtractedTransactionFields = {
    name: cleanString(raw.name),
    date: cleanString(raw.date),
    phone_no: cleanString(raw.phone_no),
    district: cleanString(raw.district),
    taluk: cleanString(raw.taluk),
    village: cleanString(raw.village),
    survey_no: cleanString(raw.survey_no),
    patta_no: cleanString(raw.patta_no),
    sq_ft: cleanAmount(raw.sq_ft),
    plot_no: cleanString(raw.plot_no),
    nagar_name: cleanString(raw.nagar_name),
    location: cleanString(raw.location),
    latitude: cleanAmount(raw.latitude),
    longitude: cleanAmount(raw.longitude),
    transaction_details: cleanString(raw.transaction_details),
    cash_in: cleanAmount(raw.cash_in),
    cash_out: cleanAmount(raw.cash_out),
    sub_total: cleanAmount(raw.sub_total),
    remarks: cleanString(raw.remarks),
    is_land_document: raw.is_land_document === true || raw.is_land_document === 'true',
  };
  if (!fields.is_land_document) {
    fields.is_land_document = isLandDocument(fields);
  }
  return fields;
}

export function isLandDocument(fields: ExtractedTransactionFields): boolean {
  if (fields.is_land_document) return true;
  const signals = [
    fields.survey_no,
    fields.patta_no,
    fields.nagar_name,
    fields.plot_no,
    fields.village,
    fields.district,
    fields.sq_ft,
  ].filter(Boolean);
  return signals.length >= 2;
}

export function resolveNagarName(fields: ExtractedTransactionFields): string {
  if (fields.nagar_name?.trim()) return fields.nagar_name.trim();
  if (fields.village?.trim()) return `${fields.village.trim()} Nagar`;
  if (fields.district?.trim()) return `${fields.district.trim()} Property`;
  return 'New Property';
}

export function resolvePlotNo(fields: ExtractedTransactionFields): string {
  if (fields.plot_no?.trim()) return fields.plot_no.trim();
  if (fields.survey_no?.trim()) return `Survey ${fields.survey_no.trim()}`;
  return 'Plot 1';
}

function mapAccountFields(raw: Record<string, unknown>): ExtractedAccountFields {
  return {
    name: cleanString(raw.name),
    date: cleanString(raw.date),
    details: cleanString(raw.details),
    byCash: cleanAmount(raw.byCash),
    toCash: cleanAmount(raw.toCash),
    remarks: cleanString(raw.remarks),
  };
}

export function summarizeExtractedFields(fields: Record<string, string | boolean | undefined>): string {
  const entries = Object.entries(fields).filter(
    ([key, value]) => key !== 'is_land_document' && value != null && value !== '' && value !== false
  );
  if (entries.length === 0) return 'No fields were detected. You can still attach the document.';
  return entries.map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`).join('\n');
}

export async function extractTransactionFromDocument(
  uri: string,
  type: ScanDocumentType
): Promise<ExtractedTransactionFields> {
  const base64 = await readDocumentBase64(uri);
  const mimeType = type === 'pdf' ? 'application/pdf' : 'image/jpeg';
  const raw = await callGemini(mimeType, base64, TRANSACTION_PROMPT);
  return mapTransactionFields(raw);
}

export async function extractAccountFromDocument(
  uri: string,
  type: ScanDocumentType
): Promise<ExtractedAccountFields> {
  const base64 = await readDocumentBase64(uri);
  const mimeType = type === 'pdf' ? 'application/pdf' : 'image/jpeg';
  const raw = await callGemini(mimeType, base64, ACCOUNT_PROMPT);
  return mapAccountFields(raw);
}