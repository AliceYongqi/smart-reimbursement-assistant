// src/components/FileUploadSection.tsx
import React from "react";
import styles from "./reimbursement.module.css";

interface FileUploadSectionProps {
  onTemplateSelect: (file: File) => void;
  onInvoicesSelect: (files: FileList) => void;
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
        <label>1. 上传 Excel 模板</label>
        {/* <input className={`${styles.btn} ${styles.btnUplaod}`} */}
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => e.target.files && onTemplateSelect(e.target.files[0])}
        />
        {templateFile && <p>✅ 已选择: {templateFile.name}</p>}
      </div>

      <div className={styles.uploadBox}>
        <label>2. 上传发票文件（支持 JPG/PNG/PDF）</label>
        {/* <input className={`${styles.btn} ${styles.btnUplaod}`} */}
        <input
          type="file"
          accept="image/*,.pdf"
          multiple
          onChange={(e) => e.target.files && onInvoicesSelect(e.target.files)}
        />
        {fapiaoFiles && <p>✅ 已选择 {fapiaoFiles.length} 张发票</p>}
      </div>
    </div>
  );
};

export default FileUploadSection;