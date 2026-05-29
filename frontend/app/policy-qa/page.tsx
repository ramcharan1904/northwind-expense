"use client";
import { useEffect, useRef, useState } from "react";
import { api, type PolicyQAResponse } from "@/lib/api";

type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; response: PolicyQAResponse };

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
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          response: {
            answer: `Error: ${err.message}`,
            citations: [],
            refused: true,
            refusal_reason: "api_error",
            top_similarity: null,
          },
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
      <h1 className="text-xl font-semibold text-gray-800 mb-4">Policy Q&amp;A</h1>

      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
        {messages.length === 0 && (
          <div className="bg-white rounded-lg p-6 text-sm text-gray-500 text-center">
            <p className="font-medium text-gray-700 mb-2">Ask anything about Northwind&apos;s T&amp;E policies</p>
            <p className="text-xs">Examples: &quot;What is the meal cap for Grade 5?&quot; · &quot;Can I expense alcohol at a client dinner?&quot; · &quot;What receipts are required for flights over $500?&quot;</p>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="bg-blue-600 text-white text-sm rounded-lg px-4 py-2.5 max-w-lg">
                  {msg.text}
                </div>
              </div>
            );
          }

          const { response } = msg;
          return (
            <div key={i} className="flex justify-start">
              <div className="max-w-2xl space-y-2">
                <div className={`text-sm rounded-lg px-4 py-3 ${response.refused ? "bg-amber-50 border border-amber-200" : "bg-white border border-gray-200"}`}>
                  {response.refused ? (
                    <div>
                      <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Refused</span>
                      <p className="text-gray-700 mt-1">{response.answer}</p>
                      {response.refusal_reason && (
                        <p className="text-xs text-amber-600 mt-1">Reason: {response.refusal_reason}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-800 whitespace-pre-wrap">{response.answer}</p>
                  )}
                </div>

                {response.citations.length > 0 && (
                  <div className="space-y-1.5">
                    {response.citations.map((c, ci) => (
                      <div key={ci} className="bg-gray-50 border border-gray-200 rounded px-3 py-2 text-xs">
                        <span className="font-semibold text-gray-600">{c.doc_id}</span>
                        {c.section && <span className="text-gray-400"> {c.section}</span>}
                        <span className="text-gray-400"> · {(c.similarity_score * 100).toFixed(0)}% match</span>
                        <blockquote className="text-gray-700 italic mt-1">&ldquo;{c.quoted_text}&rdquo;</blockquote>
                      </div>
                    ))}
                  </div>
                )}

                {response.top_similarity !== null && !response.refused && (
                  <div className="text-xs text-gray-400">
                    Top policy match: {(response.top_similarity * 100).toFixed(0)}%
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-400 animate-pulse">
              Searching policy documents…
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 bg-white border border-gray-300 rounded-lg p-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a T&E policy question…"
          disabled={loading}
          className="flex-1 text-sm px-2 py-1.5 outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
