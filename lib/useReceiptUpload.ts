"use client";

import { useRef, useState, type RefObject } from "react";

export type ReceiptUploadResult =
  | { ok: true; path: string | null } // path is null when no file was chosen
  | { ok: false; error: string };

export interface ReceiptUpload {
  file: File | null;
  setFile: (file: File | null) => void;
  /** Attach to the <input type="file"> so reset() can clear it. */
  inputRef: RefObject<HTMLInputElement | null>;
  uploading: boolean;
  /** Uploads the chosen file (if any) to /api/expenses/upload. */
  upload: () => Promise<ReceiptUploadResult>;
  reset: () => void;
}

export function useReceiptUpload(): ReceiptUpload {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (): Promise<ReceiptUploadResult> => {
    if (!file) return { ok: true, path: null };
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/expenses/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const e = (await res.json()) as { error?: string };
        return { ok: false, error: e.error ?? "Receipt upload failed" };
      }
      const data = (await res.json()) as { path: string };
      return { ok: true, path: data.path };
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return { file, setFile, inputRef, uploading, upload, reset };
}
