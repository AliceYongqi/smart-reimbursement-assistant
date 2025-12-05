// src/components/FileUploadSection.tsx
import React from "react";
import styles from "./reimbursement.module.css";

interface FileUploadSectionProps {
  onTemplateSelect: (file: File) => void;
  onInvoicesSelect: (files: FileList) => void;
  templateFile: File | null;
  invoiceFiles: File[] | null;
}

const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  onTemplateSelect,
  onInvoicesSelect,
  templateFile,
  invoiceFiles,
}) => {
  return (
    <div className={styles.uploadSection}>
      <div className={styles.uploadBox}>
        <label>1. 上传 Excel 模板</label>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => e.target.files && onTemplateSelect(e.target.files[0])}
        />
        {templateFile && <p>✅ 已选择: {templateFile.name}</p>}
      </div>

      <div className={styles.uploadBox}>
        <label>2. 上传发票文件（支持 JPG/PNG/PDF）</label>
        <input
          type="file"
          accept="image/*,.pdf"
          multiple
          onChange={(e) => e.target.files && onInvoicesSelect(e.target.files)}
        />
        {invoiceFiles && <p>✅ 已选择 {invoiceFiles.length} 张发票</p>}
      </div>
    </div>
  );
};

export default FileUploadSection;