"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ReceiptUpload } from "@/components/ReceiptUpload";

export default function UploadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <div>
      <nav className="flex items-center gap-2 mb-6 text-sm">
        <Link href="/submissions" className="text-gray-400 hover:text-gray-600 transition-colors">Submissions</Link>
        <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <Link href={`/submissions/${id}`} className="text-gray-400 hover:text-gray-600 transition-colors">
          {id.slice(0, 8)}…
        </Link>
        <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-700 font-medium">Upload Receipt</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Upload Receipt</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload a receipt and the system will automatically extract details and generate a compliance verdict.
        </p>
      </div>

      <ReceiptUpload
        submissionId={id}
        onSuccess={() => router.push(`/submissions/${id}`)}
      />
    </div>
  );
}
