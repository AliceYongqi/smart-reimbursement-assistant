// src/components/ReimbursementPopup.tsx
import { useState, useRef } from "react";
import ReimbursementUI from "./reimbursementUI";
import { parseInvoiceWithQwen } from "../utils/qwenApi";
import { readTemplateHeaders, generateFilledExcel } from "../utils/excelUtils";
import { downloadJson, downloadExcel } from "../utils/downloadUtils";
import { type RawInvoice, type OutputJson } from "../types";

function ReimbursementPopup() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([]);
  const processedDataRef = useRef<{ excelBlob: Blob; json: OutputJson } | null>(null);

  const handleTemplateSelect = (file: File) => setTemplateFile(file);
  const handleInvoicesSelect = (files: FileList) => setInvoiceFiles(Array.from(files));

  const handleSubmit = async () => {
    if (!token.trim()) {
      alert("请输入有效的千问 API Token！");
      return;
    }
    if (!templateFile) {
      alert("请上传 Excel 模板！");
      return;
    }
    if (invoiceFiles.length === 0) {
      alert("请上传至少一张发票！");
      return;
    }

    setStatus("loading");

    try {
      // 1. 读取模板字段
      const headers = await readTemplateHeaders(templateFile);

      // 2. 并行解析所有发票
      const invoicePromises = invoiceFiles.map(file => parseInvoiceWithQwen(file, token));
      const rawInvoices: RawInvoice[] = await Promise.all(invoicePromises);

      // 3. 构建 JSON
      const totalAmount = rawInvoices.reduce((sum, inv) => sum + inv.amount, 0);
      const byCategory: Record<string, { count: number; total: number }> = {};
      const byDate: Record<string, number> = {};

      rawInvoices.forEach(inv => {
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
        invoices: rawInvoices,
        summary: { totalAmount, byCategory, byDate }
      };

      // 4. 生成 Excel
      const excelBlob = generateFilledExcel(headers, rawInvoices);

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
    downloadExcel(excelBlob, "报销明细.xlsx");
    downloadJson(json, "发票数据.json");
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <ReimbursementUI
      token={token}
      onTokenChange={setToken}
      status={status}
      onSubmit={handleSubmit}
      onKeyPress={handleKeyPress}
      onTemplateSelect={handleTemplateSelect}
      onInvoicesSelect={(files) => setInvoiceFiles(Array.from(files))}
      templateFile={templateFile}
      invoiceFiles={invoiceFiles}
      onDownload={handleDownload}
    />
  );
}

export default ReimbursementPopup;