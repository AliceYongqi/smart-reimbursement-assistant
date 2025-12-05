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
  invoiceFiles: File[] | null;
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
  invoiceFiles,
  onDownload,
}) => {
  return (
    <div className={styles.container}>
      <h1>发票管家 · 千问版</h1>

      <div className={styles.inputGroup}>
        <label htmlFor="tokenInput">请输入千问 API Token</label>
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
        invoiceFiles={invoiceFiles}
      />

      <button className={styles.btn} onClick={onSubmit} disabled={status === "loading"}>
        {status === "loading" ? "处理中..." : "提交并解析发票"}
      </button>

      {status === "success" && (
        <div className={`${styles.status} ${styles.success}`}>
          <h3>✅ 处理完成！</h3>
          <button className={styles.downloadBtn} onClick={onDownload}>
            ⬇️ 下载 Excel 和 JSON
          </button>
        </div>
      )}

      <div className={styles.footer}>
        <p>支持增值税/电子/卷式发票 · 所有请求通过千问 API 完成</p>
      </div>
    </div>
  );
};

export default ReimbursementUI;