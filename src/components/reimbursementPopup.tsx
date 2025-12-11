// src/components/ReimbursementPopup.tsx
import { useState, useRef } from "react";
import ReimbursementUI from "./reimbursementUI";
import {
  parseInvoiceWithQwen,
} from "../utils/qwenApi";
import { generateFilledExcel } from "../utils/excelUtils";
import { downloadJson, downloadExcel } from "../utils/downloadUtils";
import { type RawInvoice, type OutputJson } from "../types";

function ReimbursementPopup() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [fapiaoFiles, setInvoiceFiles] = useState<File[]>([]);
  const [aggregate, setAggregate] = useState<boolean>(true);
  const processedDataRef = useRef<{ excelBlob: Blob; json: any } | null>(null);

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
    if (fapiaoFiles.length === 0) {
      alert("请上传至少一张发票！");
      return;
    }

    setStatus("loading");

    try {

      // 解析所有发票, 并把 headers 一并传给后端以便填充Excel
      const result: any[] = await parseInvoiceWithQwen(fapiaoFiles, token, templateFile, aggregate);

      console.log("Parsed invoices:", result);
      const blob = new Blob(['\uFEFF' + result[result.length-1].csv], { type: 'text/csv;charset=utf-8' });
      // 缓存结果
      processedDataRef.current = { excelBlob: blob, json: result.slice(0, -1) };

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
      aggregateAmounts={aggregate}
      onAggregateChange={setAggregate}
    />
  );
}

export default ReimbursementPopup;