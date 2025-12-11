// src/components/FileUploadSection.tsx
import React from "react";
import styles from "./reimbursement.module.css";

interface FileUploadSectionProps {
  onTemplateSelect: (file: File) => void;
  onInvoicesSelect: (files: File[]) => void;
  templateFile: File | null;
  fapiaoFiles: File[] | null;
}

const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  onTemplateSelect,
  onInvoicesSelect,
  templateFile,
  fapiaoFiles,
}) => {
  return (
    <div className={styles.uploadSection}>
      <div className={styles.uploadBox}>
        <label>1. Upload Excel Template (optional)</label>
        {/* <input className={`${styles.btn} ${styles.btnUplaod}`} */}
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => e.target.files && onTemplateSelect(e.target.files[0])}
        />
        {templateFile ? (
          <p>✅ 已选择: {templateFile.name}</p>
        ) : (
          <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
            (Optional) You may skip uploading a template — the assistant will
            automatically generate the table based on the invoice contents.
          </p>
        )}
      </div>

      <div className={styles.uploadBox}>
        <label>2. Upload Invoice Files (supports JPG/PNG/PDF)</label>
        {/* <input className={`${styles.btn} ${styles.btnUplaod}`} */}
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf"
          multiple
          onChange={(e) => e.target.files && onInvoicesSelect(Array.from(e.target.files))}
        />
        {fapiaoFiles && <p>✅ 已选择 {fapiaoFiles.length} 张发票</p>}
      </div>
    </div>
  );
};

export default FileUploadSection;