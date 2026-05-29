"use client";
import { useEffect, useRef, useState } from "react";
import { api, type PolicyQAResponse } from "@/lib/api";

type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; response: PolicyQAResponse };

const EXAMPLES = [
  "What is the meal cap for Grade 5?",
  "Can I expense alcohol at a client dinner?",
  "What receipts are required for flights over $500?",
  "What is the hotel cap for Tier 2 cities?",
];

export default function PolicyQAPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setLoading(true);
    try {
      const res = await api.policyQA.ask(q);
      setMessages((prev) => [...prev, { role: "assistant", response: res }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        response: { answer: `Error: ${err.message}`, citations: [], refused: true, refusal_reason: "api_error", top_similarity: null },
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 112px)" }}>
      {/* Header */}
      <div className="mb-6 shrink-0">
        <h1 className="text-2xl font-bold text-gray-900">Policy Q&amp;A</h1>
        <p className="text-sm text-gray-500 mt-1">Ask questions about Northwind&apos;s T&amp;E policies — answers are grounded in policy documents</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-5 mb-4 pr-1 min-h-0">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center pb-8">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-800 mb-1">Ask anything about T&amp;E policy</p>
            <p className="text-sm text-gray-400 mb-6">Answers are grounded in Northwind&apos;s policy documents with citations</p>
            <div className="grid grid-cols-2 gap-2 max-w-lg w-full">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setInput(ex)}
                  className="text-left text-xs text-gray-600 bg-white border border-gray-100 rounded-xl px-3.5 py-2.5 hover:border-blue-200 hover:text-blue-700 hover:bg-blue-50 transition-all shadow-sm"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="bg-blue-600 text-white text-sm rounded-2xl rounded-br-sm px-4 py-2.5 max-w-lg shadow-sm">
                  {msg.text}
                </div>
              </div>
            );
          }

          const { response } = msg;
          return (
            <div key={i} className="flex justify-start">
              <div className="max-w-2xl space-y-2">
                <div className={`text-sm rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm ${
                  response.refused
                    ? "bg-amber-50 border border-amber-100"
                    : "bg-white border border-gray-100"
                }`}>
                  {response.refused ? (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Outside Policy Scope</span>
                      </div>
                      <p className="text-gray-700">{response.answer}</p>
                    </div>
                  ) : (
                    <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{response.answer}</p>
                  )}
                </div>

                {response.citations.length > 0 && (
                  <div className="space-y-1.5 pl-1">
                    {response.citations.map((c, ci) => (
                      <div key={ci} className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-gray-700">{c.doc_id}</span>
                          {c.section && <span className="text-xs text-gray-400">{c.section}</span>}
                          <span className="ml-auto text-xs text-gray-400">{(c.similarity_score * 100).toFixed(0)}% match</span>
                        </div>
                        <blockquote className="text-xs text-gray-600 italic border-l-2 border-gray-200 pl-2">
                          &ldquo;{c.quoted_text}&rdquo;
                        </blockquote>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-xs text-gray-400">Searching policy documents…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0">
        <form
          onSubmit={handleSubmit}
          className="flex gap-2 bg-white border border-gray-200 rounded-2xl p-2 shadow-sm focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100 transition-all"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a T&E policy question…"
            disabled={loading}
            className="flex-1 text-sm px-2 py-1.5 outline-none disabled:opacity-50 bg-transparent placeholder-gray-400"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="btn-primary rounded-xl text-sm py-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
