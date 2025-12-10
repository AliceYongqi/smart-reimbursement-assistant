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

export function getExcelBlobFromBase64(excelBase64: string): Blob {
  // Robustly convert base64 (possibly a data URL) to a Blob in chunks to avoid memory/string issues
  if (!excelBase64 || typeof excelBase64 !== 'string') {
    return new Blob([], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  // If a data URL was passed, extract the base64 portion
  const maybeDataUrlMatch = excelBase64.match(/^data:.*;base64,(.*)$/i);
  const b64 = maybeDataUrlMatch ? maybeDataUrlMatch[1] : excelBase64.replace(/\s+/g, '');

  // Basic validation: allow base64 chars only (will still try to decode if non-standard)
  const isValidBase64 = /^[A-Za-z0-9+/=]+$/.test(b64);

  try {
    // Decode in chunks to avoid creating a huge intermediate string in memory
    const sliceSize = 1024 * 1024; // 1MB slices of base64 input (not bytes)
    const byteArrays: Uint8Array[] = [];

    for (let offset = 0; offset < b64.length; offset += sliceSize) {
      const slice = b64.slice(offset, offset + sliceSize);
      // atob will throw if invalid base64 characters are present
      const binary = atob(slice);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      byteArrays.push(bytes);
    }

    // Concatenate all byte arrays into a single Uint8Array
    let totalLength = 0;
    for (const arr of byteArrays) totalLength += arr.length;
    const result = new Uint8Array(totalLength);
    let position = 0;
    for (const arr of byteArrays) {
      result.set(arr, position);
      position += arr.length;
    }

    return new Blob([result.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  } catch (err) {
    // If decoding fails, return an empty blob to avoid throwing in callers; caller may log/handle
    console.error('Failed to decode excel base64 to blob', err, { isValidBase64 });
    return new Blob([], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
}