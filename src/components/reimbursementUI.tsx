// src/components/ReimbursementUI.tsx
import React, { useState } from "react";
import FileUploadSection from "./fileUploadSection";
import styles from "./reimbursement.module.css";

interface InvoiceUIProps {
  token: string;
  onTokenChange: (value: string) => void;
  /** 可选：父组件传入的初始汇总值（默认 true） */
  aggregateAmounts?: boolean;
  /** 可选：当用户切换汇总选项时触发 */
  onAggregateChange?: (value: boolean) => void;
  status: "idle" | "loading" | "success";
  onSubmit: () => void;
  onKeyPress: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onTemplateSelect: (file: File) => void;
  onInvoicesSelect: (files: File[]) => void;
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
  aggregateAmounts,
  onAggregateChange,
}) => {
  const [aggregate, setAggregate] = useState<boolean>(aggregateAmounts ?? true);

  const handleAggregateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setAggregate(checked);
    onAggregateChange?.(checked);
  };
  return (
    <div className={styles.container}>
      <h1>Smart Reimbursement · Qwen</h1>

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

      <div className={`${styles.inputGroup} ${styles.flex}`} style={{ alignItems: "center" }}>
        <label htmlFor="aggregateCheckbox" style={{ marginRight: 8 }}>是否汇总金额</label>
        <input
          id="aggregateCheckbox"
          type="checkbox"
          checked={aggregate}
          onChange={handleAggregateChange}
        />
      </div>

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