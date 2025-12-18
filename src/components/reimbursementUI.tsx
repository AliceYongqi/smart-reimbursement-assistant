import React from "react";
import FileUploadSection from "./fileUploadSection";
import styles from "./reimbursement.module.css";

interface InvoiceUIProps {
  token: string;
  onTokenChange: (value: string) => void;
  aggregateAmounts?: boolean;
  onAggregateChange?: (value: boolean) => void;
  progress?: number;
  status: string;
  onSubmit: () => void;
  onDownload: () => void;
  onKeyPress: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onTemplateSelect: (file: File) => void;
  onFapiaoSelect: (files: File[]) => void;
  templateFile: File | null;
  fapiaoFiles: File[] | null;
}

const ReimbursementUI: React.FC<InvoiceUIProps> = ({
  token,
  onTokenChange,
  status,
  onSubmit,
  onDownload,
  onKeyPress,
  onTemplateSelect,
  onFapiaoSelect,
  templateFile,
  fapiaoFiles,
  aggregateAmounts,
  onAggregateChange,
  progress = 0,
}) => {
  const handleAggregateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onAggregateChange?.(e.target.checked);
  };

  // 按钮点击逻辑：成功状态点下载，其他状态点提交
  const handleButtonClick = () => {
    if (status === "success") {
      onDownload();
    } else {
      onSubmit();
    }
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
        onFapiaoSelect={onFapiaoSelect}
        templateFile={templateFile}
        fapiaoFiles={fapiaoFiles}
      />

      <div className={`${styles.inputGroup} ${styles.flex}`} style={{ alignItems: "center" }}>
        <label htmlFor="aggregateCheckbox" style={{ marginRight: 8 }}>
          Summarize Amounts
        </label>
        <input
          id="aggregateCheckbox"
          type="checkbox"
          checked={aggregateAmounts ?? true}
          onChange={handleAggregateChange}
        />
      </div>

      {/* 多功能按钮 */}
      <button
        className={`${styles.btn} ${styles.btnSubmit} ${
          status === "loading" ? styles.loading : ""
        } ${status === "success" ? styles.success : ""}`}
        onClick={handleButtonClick}
        disabled={status === "loading"}
      >
        {/* 进度条层（仅在loading时显示） */}
        {status === "loading" && (
          <div className={styles.progressOverlay}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* 按钮文字 */}
        <span className={styles.btnText}>
          {status === "idle" && "Submit and Parse Invoice"}
          {status === "loading" && `Processing ${progress}% ...`}
          {status === "success" && "⬇️ Download Results"}
        </span>
      </button>

      <div className={styles.footer}>
        <p>Supports VAT/Electronic/Roll Fapiao · All requests are processed via Qwen API</p>
      </div>
    </div>
  );
};

export default ReimbursementUI;