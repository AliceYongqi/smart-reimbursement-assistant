import React, { useState } from "react";
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
  const [showToken, setShowToken] = useState(false);
  const handleAggregateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onAggregateChange?.(e.target.checked);
  };

  const handleButtonClick = () => {
    if (status === "success") {
      onDownload();
    } else {
      onSubmit();
    }
  };

  const toggleTokenVisibility = () => {
    setShowToken(!showToken);
  };

  return (
    <div className={styles.container}>
      <h1>发票助手 ● 千问版</h1>

      <div className={styles.inputGroup}>
        <label htmlFor="tokenInput">输入千问 Token</label>
        <div className={styles.passwordWrapper}>
          <input
            type={showToken ? "text" : "password"}
            id="tokenInput"
            value={token}
            onChange={(e) => onTokenChange(e.target.value)}
            onKeyPress={onKeyPress}
            placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
            autoComplete="off"
            className={styles.passwordInput}
          />
          <button
            type="button"
            className={styles.togglePassword}
            onClick={toggleTokenVisibility}
            aria-label={showToken ? "Hide token" : "Show token"}
          >
            <span className={styles.eyeIcon}>
              {showToken ? (
                // 睁开的眼睛（显示状态）
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              ) : (
                // 闭着的眼睛（隐藏状态）
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              )}
            </span>
          </button>
        </div>
      </div>

      <FileUploadSection
        onTemplateSelect={onTemplateSelect}
        onFapiaoSelect={onFapiaoSelect}
        templateFile={templateFile}
        fapiaoFiles={fapiaoFiles}
      />

      <div className={`${styles.inputGroup} ${styles.flex}`} style={{ alignItems: "center" }}>
        <label htmlFor="aggregateCheckbox" style={{ marginRight: 8 }}>
          汇总数据
        </label>
        <input
          id="aggregateCheckbox"
          type="checkbox"
          checked={aggregateAmounts ?? true}
          onChange={handleAggregateChange}
        />
      </div>

      <button
        className={`${styles.btn} ${styles.btnSubmit} ${
          status === "loading" ? styles.loading : ""
        } ${status === "success" ? styles.success : ""}`}
        onClick={handleButtonClick}
        disabled={status === "loading"}
      >
        {status === "loading" && (
          <div className={styles.progressOverlay}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <span className={styles.btnText}>
          {status === "idle" && "提交并解析发票"}
          
          {status === "loading" && (
            <>
              {`处理中 ${progress}% `}
              <span className={styles.dots} aria-hidden="true">
                <span className={styles.dot}></span>
                <span className={styles.dot}></span>
                <span className={styles.dot}></span>
              </span>
            </>
          )}

          {status === "success" && "⬇️ 下载文件"}
        </span>
      </button>

      <div className={styles.footer}>
        <p>支持增值税发票/电子发票/卷式发票 · 解析过程通过千问API处理</p>
      </div>
    </div>
  );
};

export default ReimbursementUI;