import React from "react";
import styles from "./reimbursement.module.css";

interface FileUploadSectionProps {
  onTemplateSelect: (file: File) => void;
  onFapiaoSelect: (files: File[]) => void;
  templateFile: File | null;
  fapiaoFiles: File[] | null;
}

const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  onTemplateSelect,
  onFapiaoSelect,
  templateFile,
  fapiaoFiles,
}) => {
  return (
    <div className={styles.uploadSection}>
      <div className={styles.uploadBox}>
        <label>1. 上传 Excel Template 文件(可选)</label>
        
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          id="template-upload"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files && onTemplateSelect(e.target.files[0])}
        />
        <label htmlFor="template-upload" className={styles.btnUplaod}>
          📄 选择文件
        </label>

        {templateFile ? (
          <p>✅ 选择了: {templateFile.name}</p>
        ) : (
          <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
            （可选）您可以跳过上传模板——助手将根据发票内容自动生成表格。
          </p>
        )}
      </div>

      <div className={styles.uploadBox}>
        <label>2. 上传发票文件(支持格式: JPG、PNG、PDF)</label>
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf"
          multiple
          id="fapiao-upload"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files && onFapiaoSelect(Array.from(e.target.files))}
        />
        <label htmlFor="fapiao-upload" className={styles.btnUplaod}>
          📄 选择文件
        </label>
        {fapiaoFiles && <p>✅ 选择了 {fapiaoFiles.length} 张发票 </p>}
      </div>
    </div>
  );
};

export default FileUploadSection;