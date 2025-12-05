// src/types.ts
export interface RawInvoice {
  amount: number;
  taxId: string;
  date: string;
  seller: string;
  buyer: string;
  invoiceType: string;
  items: Array<{
    name: string;
    category: string;
    price: number;
    quantity: number;
  }>;
}

export interface OutputJson {
  invoices: RawInvoice[];
  summary: {
    totalAmount: number;
    byCategory: Record<string, { count: number; total: number }>;
    byDate: Record<string, number>;
  };
}