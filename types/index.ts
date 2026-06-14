export type TransactionCategory = 'Buyer' | 'Seller' | 'Govt';

export interface Transaction {
  id: string;
  date: string;
  name: string;
  category: TransactionCategory;
  // Property Details
  district: string;
  taluk: string;
  village: string;
  survey_no: string;
  patta_no: string;
  sq_ft: number;
  plot_no: string;
  nagar_name: string;
  phone_no: string;
  // Financial
  transaction_details: string;
  cash_in: number;
  cash_out: number;
  sub_total: number;
  remarks: string;
  attachments: string[];
  created_at: string;
}

export type TransactionInput = Omit<Transaction, 'id' | 'created_at'>;

export interface DashboardSummary {
  totalCashIn: number;
  totalCashOut: number;
  balance: number;
}

export interface PropertySummary {
  nagar_name: string;
  totalCashIn: number;
  totalCashOut: number;
  balance: number;
  transactionCount: number;
}
