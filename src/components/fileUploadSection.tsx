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
        
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          id="template-upload"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files && onTemplateSelect(e.target.files[0])}
        />
        <label htmlFor="template-upload" className={styles.btnUplaod}>
          📄 Select file
        </label>

        {templateFile ? (
          <p>✅ Selected: {templateFile.name}</p>
        ) : (
          <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
            (Optional) You may skip uploading a template — the assistant will
            automatically generate the table based on the invoice contents.
          </p>
        )}
      </div>

      <div className={styles.uploadBox}>
        <label>2. Upload Invoice Files (supports JPG/PNG/PDF)</label>
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf"
          multiple
          id="fapiao-upload"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files && onInvoicesSelect(Array.from(e.target.files))}
        />
        <label htmlFor="fapiao-upload" className={styles.btnUplaod}>
          📄 Select file
        </label>
        {fapiaoFiles && <p>✅ {fapiaoFiles.length} fapiao Selected </p>}
      </div>
    </div>
  );
};

export default FileUploadSection;