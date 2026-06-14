import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from '@react-native-firebase/firestore';
import { Transaction, TransactionInput } from '../types';

function txCollection(uid: string) {
  const db = getFirestore();
  return collection(doc(collection(db, 'users'), uid), 'transactions');
}

export function subscribeTransactions(
  uid: string,
  callback: (txs: Transaction[]) => void
): () => void {
  const q = query(txCollection(uid), orderBy('date', 'desc'));
  return onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map((entry) => ({
        id: entry.id,
        ...(entry.data() as Omit<Transaction, 'id'>),
      }));
      callback(txs);
    }, (error) => {
      console.warn('subscribeTransactions failed:', error?.message ?? error);
      callback([]);
    });
}

export async function getTransactionById(
  uid: string,
  id: string
): Promise<Transaction | null> {
  const entry = await getDoc(doc(txCollection(uid), id));
  if (!entry.exists()) return null;
  return { id: entry.id, ...(entry.data() as Omit<Transaction, 'id'>) };
}

export async function insertTransaction(
  uid: string,
  t: TransactionInput
): Promise<string> {
  const raw = { attachments: [], ...t, created_at: new Date().toISOString() };
  const clean = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined)
  );
  const ref = await addDoc(txCollection(uid), clean);
  return ref.id;
}

export async function updateTransaction(
  uid: string,
  id: string,
  t: TransactionInput
): Promise<void> {
  await setDoc(doc(txCollection(uid), id), { ...t }, { merge: true });
}

export async function deleteTransaction(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(txCollection(uid), id));
}
