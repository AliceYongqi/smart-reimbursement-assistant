// src/utils/qwenApi.ts
import { type RawInvoice, type OutputJson } from "../types";
import { pdfToImages, dataURLToFile } from "./utils";

/**
 * 将多张发票文件发送到后端/大模型解析。可选地传入模板文件，允许模型根据模板优化解析结果。
 */
export async function parseInvoiceWithQwen(
  fapiaoFiles: File[],
  token: string,
  templateFile?: File,
  aggregate: boolean = true
) {
  try {
    const formData = new FormData();
    for(const file of fapiaoFiles) {
      if (file.type === 'application/pdf' || file.name?.endsWith('.pdf')) {
        const dataUrl = await pdfToImages(file);
        // const fileImage = dataURLToBlob(dataUrl);
        const fileImage = dataURLToFile(dataUrl, `${file.name}.jpg`);
        formData.append('fapiao', fileImage);
        console.log("Converted invoice to images:", dataUrl.slice(0, 30) + "...");
      } else {
        formData.append("fapiao", file);
      }
    }

    formData.append("token", token);
    if (templateFile) formData.append("template", templateFile);

    // 将汇总选项发送给后端（字符串形式）
    formData.append("summary", String(aggregate));

    const res = await fetch("http://localhost:5000/api/parse-fapiao", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Request failed with status ${res.status}: ${text}`);
    }

    const data = await res.json();
    console.log("Qwen parseInvoiceWithQwen data:", data);
    
    return data.jsonData;
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Failed to parse Qwen response as JSON");
  }
}
