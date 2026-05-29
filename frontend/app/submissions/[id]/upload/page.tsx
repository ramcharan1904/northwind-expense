"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ReceiptUpload } from "@/components/ReceiptUpload";

export default function UploadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
        <Link href="/submissions" className="hover:text-blue-600">Submissions</Link>
        <span>/</span>
        <Link href={`/submissions/${id}`} className="hover:text-blue-600">{id.slice(0, 8)}…</Link>
        <span>/</span>
        <span className="text-gray-700">Upload Receipt</span>
      </div>

      <h1 className="text-xl font-semibold text-gray-800 mb-6">Upload Receipt</h1>

      <ReceiptUpload
        submissionId={id}
        onSuccess={() => router.push(`/submissions/${id}`)}
      />
    </div>
  );
}
