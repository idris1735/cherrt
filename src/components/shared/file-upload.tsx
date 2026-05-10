"use client";

import { useRef, useState } from "react";
import { uploadAttachment, appendAttachmentUrl } from "@/lib/services/supabase-attachments";

type RecordType = "expenses" | "issues";
type Table = "toolkit_expense_entries" | "toolkit_issue_reports";

const TABLE_MAP: Record<RecordType, Table> = {
  expenses: "toolkit_expense_entries",
  issues: "toolkit_issue_reports",
};

interface FileUploadProps {
  workspaceId: string;
  recordType: RecordType;
  recordId: string;
  attachments: string[];
  onAttached: (url: string) => void;
  accept?: string;
  label?: string;
}

export function FileUpload({
  workspaceId,
  recordType,
  recordId,
  attachments,
  onAttached,
  accept = "image/*,application/pdf",
  label = "Attach file",
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setError("File must be under 10 MB");
      return;
    }
    setUploading(true);
    setError(null);

    const url = await uploadAttachment(workspaceId, recordType, recordId, file);
    if (!url) {
      setError("Upload failed. Try again.");
      setUploading(false);
      return;
    }

    const ok = await appendAttachmentUrl(TABLE_MAP[recordType], recordId, url, attachments);
    if (!ok) {
      setError("Saved file but could not update record.");
    }

    onAttached(url);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function isImage(url: string) {
    return /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(url);
  }

  return (
    <div className="file-upload">
      {attachments.length > 0 && (
        <div className="file-upload__grid">
          {attachments.map((url, i) =>
            isImage(url) ? (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="file-upload__thumb-link">
                <img src={url} alt={`Attachment ${i + 1}`} className="file-upload__thumb" />
              </a>
            ) : (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="file-upload__file-chip">
                📎 File {i + 1}
              </a>
            )
          )}
        </div>
      )}

      <div className="file-upload__actions">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <button
          type="button"
          className="button button--ghost"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : `+ ${label}`}
        </button>
        {error && <span className="file-upload__error">{error}</span>}
      </div>
    </div>
  );
}
