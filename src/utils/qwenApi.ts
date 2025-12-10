// src/utils/qwenApi.ts
import { type RawInvoice, type OutputJson } from "../types";
import { getExcelBlobFromBase64 } from "./excelUtils";

/**
 * 请求后端/大模型解析上传的 Excel 模板，返回模板中的字段头数组（或其他可用于解析的结构）。
 */
export async function parseTemplateWithQwen(
  templateFile: File,
  token: string
): Promise<string[]> {
  try {
  const formData = new FormData();
  formData.append("template", templateFile);
  formData.append("token", token);

    const res = await fetch("http://localhost:5000/api/parse-template", {
      method: "POST",
      body: formData,
    });

    // console.log

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Request failed with status ${res.status}: ${text}`);
    }

    const data = await res.json();
    return Array.isArray(data) ? (data as string[]) : JSON.parse(data as string);
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Failed to parse template via Qwen");
  }
}

/**
 * 将多张发票文件发送到后端/大模型解析。可选地传入模板文件，允许模型根据模板优化解析结果。
 */
export async function parseInvoiceWithQwen(
  imageFile: File[],
  token: string,
  templateHeaders: string[]
): Promise<any> {
  try {
    const formData = new FormData();
    for(const file of imageFile) {
      formData.append("image", file);
    }
    formData.append("token", token);
    formData.append("templateHeaders", JSON.stringify(templateHeaders));

    const res = await fetch("http://localhost:5000/api/parse-fapiao", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Request failed with status ${res.status}: ${text}`);
    }

    const data = await res.json();
    if (typeof data === "string") return JSON.parse(data);
    console.log("Qwen parseInvoiceWithQwen data:", data);
    const blob = new Blob(['\uFEFF' + data.excel], { type: 'text/csv;charset=utf-8' });

    return {
      parsedFapiao: Array.isArray(data.parsedFapiao) ? (data.parsedFapiao as RawInvoice[]) : [data.parsedFapiao] as RawInvoice[],
      excelRows: blob,
    };
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Failed to parse Qwen response as JSON");
  }
}