import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getFirestore,
  setDoc,
} from '@react-native-firebase/firestore';

function nagarDoc(uid: string, nagarName: string) {
  const db = getFirestore();
  return doc(collection(doc(collection(db, 'users'), uid), 'nagars'), nagarName);
}

export async function getNagarAttachments(uid: string, nagarName: string): Promise<string[]> {
  const entry = await getDoc(nagarDoc(uid, nagarName));
  if (!entry.exists()) return [];
  return (entry.data()?.attachments as string[]) || [];
}

export async function addNagarAttachment(uid: string, nagarName: string, url: string): Promise<void> {
  await setDoc(nagarDoc(uid, nagarName),
    { attachments: arrayUnion(url) },
    { merge: true }
  );
}

export async function removeNagarAttachment(uid: string, nagarName: string, url: string): Promise<void> {
  await setDoc(nagarDoc(uid, nagarName),
    { attachments: arrayRemove(url) },
    { merge: true }
  );
}

/** Per-plot documents: { url, name } — name is the original file name for display & share */
export type PlotAttachment = { url: string; name: string };

export type PlotMetadata = {
  location?: string;
  latitude?: number;
  longitude?: number;
  district?: string;
  taluk?: string;
  village?: string;
  survey_no?: string;
  patta_no?: string;
  sq_ft?: number;
  phone_no?: string;
  name?: string;
  nickname?: string;
  hidden?: boolean;
};

function plotDocId(nagarName: string, plotNo: string) {
  const plot = plotNo || 'Unassigned';
  const enc = (s: string) => s.replace(/\//g, '\u2215').replace(/\s+/g, ' ').trim();
  return `${enc(nagarName)}__${enc(plot)}`.slice(0, 700);
}

function plotDocRef(uid: string, nagarName: string, plotNo: string) {
  const db = getFirestore();
  return doc(collection(doc(collection(db, 'users'), uid), 'nagarPlots'), plotDocId(nagarName, plotNo));
}

function fileNameFromUrl(url: string): string {
  try {
    const decoded = decodeURIComponent(url);
    const segment = decoded.split('/o/')[1]?.split('?')[0] ?? '';
    const name = segment.split('/').pop() ?? '';
    return name.replace(/^\d+_/, '') || 'Document';
  } catch {
    return 'Document';
  }
}

function normalizeAttachment(entry: unknown): PlotAttachment {
  if (typeof entry === 'string') {
    return { url: entry, name: fileNameFromUrl(entry) };
  }
  if (entry && typeof entry === 'object' && 'url' in (entry as object)) {
    const o = entry as { url: string; name?: string };
    return { url: String(o.url), name: o.name?.trim() || fileNameFromUrl(String(o.url)) };
  }
  return { url: '', name: 'Document' };
}

export async function getPlotAttachments(uid: string, nagarName: string, plotNo: string): Promise<PlotAttachment[]> {
  const snap = await getDoc(plotDocRef(uid, nagarName, plotNo));
  if (!snap.exists()) return [];
  const raw = snap.data()?.attachments;
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeAttachment).filter((a) => a.url);
}

export async function getPlotMetadata(
  uid: string,
  nagarName: string,
  plotNo: string
): Promise<PlotMetadata | null> {
  const snap = await getDoc(plotDocRef(uid, nagarName, plotNo));
  if (!snap.exists()) return null;
  const data = snap.data()?.metadata;
  if (!data || typeof data !== 'object') return null;
  return data as PlotMetadata;
}

export async function setPlotMetadata(
  uid: string,
  nagarName: string,
  plotNo: string,
  metadata: PlotMetadata
): Promise<void> {
  const ref = plotDocRef(uid, nagarName, plotNo);
  const clean = Object.fromEntries(
    Object.entries(metadata).filter(([, v]) => v !== undefined && v !== null)
  ) as PlotMetadata;
  await setDoc(ref, { metadata: clean }, { merge: true });
}

export async function addPlotAttachment(
  uid: string,
  nagarName: string,
  plotNo: string,
  attachment: PlotAttachment
): Promise<void> {
  const ref = plotDocRef(uid, nagarName, plotNo);
  const snap = await getDoc(ref);
  const prev: PlotAttachment[] = snap.exists() ? (snap.data()?.attachments || []).map(normalizeAttachment) : [];
  await setDoc(ref,
    { attachments: [...prev.filter((a) => a.url !== attachment.url), attachment] },
    { merge: true }
  );
}

export async function removePlotAttachment(uid: string, nagarName: string, plotNo: string, url: string): Promise<void> {
  const ref = plotDocRef(uid, nagarName, plotNo);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const prev: PlotAttachment[] = (snap.data()?.attachments || []).map(normalizeAttachment);
  await setDoc(ref, { attachments: prev.filter((a) => a.url !== url) }, { merge: true });
}

export async function renamePlotAttachment(
  uid: string,
  nagarName: string,
  plotNo: string,
  url: string,
  newName: string
): Promise<void> {
  const ref = plotDocRef(uid, nagarName, plotNo);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const prev: PlotAttachment[] = (snap.data()?.attachments || []).map(normalizeAttachment);
  const name = newName.trim() || fileNameFromUrl(url);
  await setDoc(ref,
    { attachments: prev.map((a) => (a.url === url ? { ...a, name } : a)) },
    { merge: true }
  );
}
