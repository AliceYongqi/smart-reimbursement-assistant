import { useState, useRef } from "react";
import ReimbursementUI from "./reimbursementUI";
import {
  parseInvoiceWithQwen,
} from "../utils/qwenApi";
import { downloadJson, downloadExcel } from "../utils/utils";
import { type RawInvoice, type OutputJson } from "../types";

function ReimbursementPopup() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [fapiaoFiles, setInvoiceFiles] = useState<File[]>([]);
  const [aggregate, setAggregate] = useState<boolean>(true);
  const processedDataRef = useRef<{ excelBlob: Blob; json: any } | null>(null);

  const handleTemplateSelect = (file: File) => setTemplateFile(file);
  const handleFapiaoSelect = (files: File[]) => setInvoiceFiles(files);

  const handleTokenChange = (t: string) => {
    setToken(t);
  };

  const handleSubmit = async () => {
      if (!token.trim()) {
      alert("Please enter a valid Qwen API key!");
      return;
    }
    if (fapiaoFiles.length === 0) {
      alert("Please select at least one fapiao file.");
      return;
    }

    setStatus("loading");

    try {

      // 解析所有发票, 并把 headers 一并传给后端以便填充Excel
      const result: any[] = await parseInvoiceWithQwen(fapiaoFiles, token, templateFile, aggregate);

      console.log("Parsed fapiao:", result);
      const blob = new Blob(['\uFEFF' + result[result.length-1].csv], { type: 'text/csv;charset=utf-8' });
      // 缓存结果
      processedDataRef.current = { excelBlob: blob, json: result.slice(0, -1) };

      setStatus("success");
    } catch (error) {
      console.error(error);
      alert("Processing Failure: " + (error instanceof Error ? error.message : "Unknown error"));
      setStatus("idle");
    }
  };

  const handleDownload = () => {
    if (!processedDataRef.current) return;
    const { excelBlob, json } = processedDataRef.current;
    downloadExcel(excelBlob, "ReimbursementDetails.csv");
    downloadJson(json, "FapiaoData.json");
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
      onFapiaoSelect={handleFapiaoSelect}
      templateFile={templateFile}
      fapiaoFiles={fapiaoFiles}
      onDownload={handleDownload}
      aggregateAmounts={aggregate}
      onAggregateChange={setAggregate}
    />
  );
}

export default ReimbursementPopup;