// src/utils/excelUtils.ts
import * as XLSX from "xlsx";
import type { RawInvoice } from "../types";

// 读取模板（获取字段顺序）
export function readTemplateHeaders(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      const headers = json[0] as string[]; // 第一行
      resolve(headers);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// 根据模板 + 发票数据生成新 Excel
export function generateFilledExcel(
  templateHeaders: string[],
  invoices: RawInvoice[]
): Blob {
  const rows: any[] = [];

  invoices.forEach(inv => {
    const row: Record<string, any> = {};
    templateHeaders.forEach(field => {
      // 简单映射（可扩展为配置映射表）
      switch (field) {
        case "金额":
        case "报销金额":
          row[field] = inv.amount;
          break;
        case "税号":
          row[field] = inv.taxId;
          break;
        case "日期":
        case "开票日期":
          row[field] = inv.date;
          break;
        case "发票类型":
          row[field] = inv.invoiceType;
          break;
        case "销售方":
          row[field] = inv.seller;
          break;
        default:
          row[field] = ""; // 未匹配留空
      }
    });
    rows.push(row);
  });

  const ws = XLSX.utils.json_to_sheet(rows, { header: templateHeaders });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "发票明细");
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([wbout], { type: "application/octet-stream" });
}