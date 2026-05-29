import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Northwind Expense Review",
  description: "AI-assisted expense pre-review for Northwind Logistics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
          <span className="font-semibold text-gray-800 text-sm tracking-wide">
            Northwind Expense Review
          </span>
          <Link href="/submissions" className="text-sm text-gray-600 hover:text-blue-600">
            Submissions
          </Link>
          <Link href="/history" className="text-sm text-gray-600 hover:text-blue-600">
            History
          </Link>
          <Link href="/policy-qa" className="text-sm text-gray-600 hover:text-blue-600">
            Policy Q&amp;A
          </Link>
        </nav>
        <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
