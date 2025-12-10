// src/components/ReimbursementUI.tsx
import React from "react";
import FileUploadSection from "./fileUploadSection";
import styles from "./reimbursement.module.css";

interface InvoiceUIProps {
  token: string;
  onTokenChange: (value: string) => void;
  status: "idle" | "loading" | "success";
  onSubmit: () => void;
  onKeyPress: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onTemplateSelect: (file: File) => void;
  onInvoicesSelect: (files: FileList) => void;
  templateFile: File | null;
  fapiaoFiles: File[] | null;
  onDownload: () => void; // 新增
}

const ReimbursementUI: React.FC<InvoiceUIProps> = ({
  token,
  onTokenChange,
  status,
  onSubmit,
  onKeyPress,
  onTemplateSelect,
  onInvoicesSelect,
  templateFile,
  fapiaoFiles,
  onDownload,
}) => {
  return (
    <div className={styles.container}>
      <h1>Smart Reimbursement · Qwen Edition</h1>

      <div className={styles.inputGroup}>
      <label htmlFor="tokenInput">Enter Qwen API Token</label>
        <input
          type="text"
          id="tokenInput"
          value={token}
          onChange={(e) => onTokenChange(e.target.value)}
          onKeyPress={onKeyPress}
          placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
          autoComplete="off"
        />
      </div>

      <FileUploadSection
        onTemplateSelect={onTemplateSelect}
        onInvoicesSelect={onInvoicesSelect}
        templateFile={templateFile}
        fapiaoFiles={fapiaoFiles}
      />

      <button className={`${styles.btn} ${styles.btnSubmit}`} onClick={onSubmit} disabled={status === "loading"}>
        {status === "loading" ? "Processing..." : "Submit and Parse Invoice"}
      </button>

      {status === "success" && (
        <div className={`${styles.status} ${styles.success}`}>
          <h3>✅ Processing Complete!</h3>
          <button className={styles.downloadBtn} onClick={onDownload}>
            ⬇️ Download Excel and JSON
          </button>
        </div>
      )}

      <div className={styles.footer}>
        <p>Supports VAT/Electronic/Roll Invoices · All requests are processed via Qwen API</p>
      </div>
    </div>
  );
};

export default ReimbursementUI;