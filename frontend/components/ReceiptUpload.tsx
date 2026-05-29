"use client";
import { useCallback, useState } from "react";
import { api } from "@/lib/api";

const ACCEPTED = ".pdf,.jpg,.jpeg,.png,.txt";

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
      setTimeout(onSuccess, 800);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  if (done) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
        <div className="text-green-700 font-medium text-sm">Receipt uploaded and analyzed!</div>
        <div className="text-xs text-green-600 mt-1">Redirecting to submission…</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
          dragging ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400 bg-white"
        }`}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <div className="text-2xl mb-2">📎</div>
        <p className="text-sm text-gray-600">
          {file ? file.name : "Drop a receipt here or click to select"}
        </p>
        <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, or TXT</p>
      </div>

      {file && (
        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3">
          <div>
            <div className="text-sm font-medium text-gray-700">{file.name}</div>
            <div className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFile(null)}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
            >
              Remove
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="text-xs px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? "Uploading & Analyzing…" : "Upload & Analyze"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
        After upload, the system will automatically extract receipt details, retrieve relevant policy clauses, and generate a compliance verdict.
      </div>
    </div>
  );
}
