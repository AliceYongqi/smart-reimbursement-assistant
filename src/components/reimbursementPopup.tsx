// src/components/ReimbursementPopup.tsx
import { useState, useRef } from "react";
import ReimbursementUI from "./reimbursementUI";
import {
  parseInvoiceWithQwen,
  parseTemplateWithQwen,
} from "../utils/qwenApi";
import { generateFilledExcel } from "../utils/excelUtils";
import { downloadJson, downloadExcel } from "../utils/downloadUtils";
import { type RawInvoice, type OutputJson } from "../types";

function ReimbursementPopup() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [fapiaoFiles, setInvoiceFiles] = useState<File[]>([]);
  const processedDataRef = useRef<{ excelBlob: Blob; json: OutputJson } | null>(null);

  const handleTemplateSelect = (file: File) => setTemplateFile(file);
  const handleInvoicesSelect = (files: File[]) => setInvoiceFiles(files);

  const handleTokenChange = (t: string) => {
    setToken(t);
  };

  const handleSubmit = async () => {
      if (!token.trim()) {
      alert("请输入有效的千问 API Token! ");
      return;
    }
    if (!templateFile) {
      alert("请上传 Excel 模板！");
      return;
    }
    if (fapiaoFiles.length === 0) {
      alert("请上传至少一张发票！");
      return;
    }

    setStatus("loading");

    try {
      // 1. 将模板文件发送给后端/大模型解析（由模型返回模板字段或解析规则）
      const headers = templateFile
        ? await parseTemplateWithQwen(templateFile, token)
        : [];
      // const headers = ['名称', '金额', '日期', '总金额', '消费方']; // 临时硬编码，避免每次都调用接口
      console.log("Parsed templateFile:", headers);


      // 2. 解析所有发票, 并把 headers 一并传给后端以便填充Excel
      // const invoicePromises = fapiaoFiles.map(file => parseInvoiceWithQwen(file, token, headers));
      const result: any = await parseInvoiceWithQwen(fapiaoFiles, token, headers);

      console.log("Parsed invoices:", result);

      // 3. 构建 JSON
      const rawFapiao: RawInvoice[] = result.parsedFapiao;
      const totalAmount = rawFapiao.reduce((sum, inv) => sum + inv.amount, 0);
      const byCategory: Record<string, { count: number; total: number }> = {};
      const byDate: Record<string, number> = {};

      rawFapiao.forEach(inv => {
        // 按日期汇总
        byDate[inv.date] = (byDate[inv.date] || 0) + inv.amount;

        // 按分类汇总（这里简化：取第一个商品分类）
        const category = inv.items[0]?.category || "其他";
        if (!byCategory[category]) {
          byCategory[category] = { count: 0, total: 0 };
        }
        byCategory[category].count += 1;
        byCategory[category].total += inv.amount;
      });

      const outputJson: OutputJson = {
        invoices: rawFapiao,
        summary: { totalAmount, byCategory, byDate }
      };

      console.log("outputJson:", outputJson);

      // 4. 接收返回的Blob
      const excelBlob: Blob = result.excelRows;
      // 5. 缓存结果
      processedDataRef.current = { excelBlob, json: outputJson };

      setStatus("success");
    } catch (error) {
      console.error(error);
      alert("处理失败：" + (error instanceof Error ? error.message : "未知错误"));
      setStatus("idle");
    }
  };

  const handleDownload = () => {
    if (!processedDataRef.current) return;
    const { excelBlob, json } = processedDataRef.current;
    downloadExcel(excelBlob, "报销明细.csv");
    downloadJson(json, "发票数据.json");
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <ReimbursementUI
      token={token}
      onTokenChange={handleTokenChange}
      status={status}
      onSubmit={handleSubmit}
      onKeyPress={handleKeyPress}
      onTemplateSelect={handleTemplateSelect}
      onInvoicesSelect={handleInvoicesSelect}
      templateFile={templateFile}
      fapiaoFiles={fapiaoFiles}
      onDownload={handleDownload}
    />
  );
}

export default ReimbursementPopup;