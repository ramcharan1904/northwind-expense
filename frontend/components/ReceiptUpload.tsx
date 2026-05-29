"use client";
import { useCallback, useState } from "react";
import { api } from "@/lib/api";

const ACCEPTED = ".pdf,.jpg,.jpeg,.png,.txt";

const FILE_ICONS: Record<string, string> = {
  pdf: "📄", jpg: "🖼️", jpeg: "🖼️", png: "🖼️", txt: "📝",
};

export function ReceiptUpload({
  submissionId,
  onSuccess,
}: {
  submissionId: string;
  onSuccess: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      await api.receipts.upload(submissionId, file);
      setDone(true);
      setTimeout(onSuccess, 1200);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  const ext = file?.name.split(".").pop()?.toLowerCase() ?? "";
  const fileIcon = FILE_ICONS[ext] ?? "📎";

  if (done) {
    return (
      <div className="card p-10 text-center">
        <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-base font-semibold text-gray-900 mb-1">Receipt uploaded and analyzed</p>
        <p className="text-sm text-gray-500">Redirecting to submission…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full max-w-xl">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById("file-input")?.click()}
        className={`relative cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-all ${
          dragging
            ? "border-blue-400 bg-blue-50"
            : file
            ? "border-emerald-300 bg-emerald-50"
            : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
        }`}
      >
        <input
          id="file-input"
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <div className="text-4xl mb-3">{file ? fileIcon : "📎"}</div>
        {file ? (
          <>
            <p className="text-sm font-semibold text-gray-800 break-all">{file.name}</p>
            <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-700">Drop a receipt here, or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, or TXT up to 10 MB</p>
          </>
        )}
      </div>

      {/* Actions */}
      {file && (
        <div className="flex items-center gap-3">
          <button onClick={() => setFile(null)} disabled={uploading} className="btn-secondary shrink-0">
            Remove
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="btn-primary min-w-0 flex-1 justify-center"
          >
            {uploading ? (
              <>
                <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="truncate">Uploading &amp; Analyzing…</span>
              </>
            ) : (
              <span>Upload &amp; Analyze</span>
            )}
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg p-3">
          <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Info */}
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-lg p-3.5">
        <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-blue-700">
          After upload, the system automatically extracts receipt details, retrieves relevant policy clauses, and generates a compliance verdict with citations.
        </p>
      </div>
    </div>
  );
}
