// src/utils/qwenApi.ts
import { type RawInvoice } from "../types";

// const QWEN_API_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation";
const QWEN_API_URL = "http://localhost:5000/api/parse-invoice";

export async function parseInvoiceWithQwen(
  imageFile: File,
  token: string
): Promise<RawInvoice> {
  const formData = new FormData();
  formData.append("file", imageFile);

  // 将图片转为 base64（Qwen 要求）
  const base64 = await fileToBase64(imageFile);
  const payload = {
    model: "qwen-vl-plus",
    input: {
      messages: [
        {
          role: "user",
          content: [
            { image: base64 },
            { text: "请从这张发票中提取以下信息，以 JSON 格式返回：金额（number）、税号（string）、开票日期（YYYY-MM-DD）、销售方（string）、购买方（string）、发票类型（string）、商品明细（数组，含名称、分类、单价、数量）。不要包含其他内容。" }
          ]
        }
      ]
    }
  };

  const res = await fetch(QWEN_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error(`Qwen API error: ${res.statusText}`);
  const data = await res.json();
  const text = data.output.choices[0].message.content[0].text;

  try {
    return JSON.parse(text) as RawInvoice;
  } catch (e) {
    throw new Error("Failed to parse Qwen response as JSON");
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}