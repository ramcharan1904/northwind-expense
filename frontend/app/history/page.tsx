"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Submission, type Employee } from "@/lib/api";

const STATUS_STYLES: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600",
  pending:  "bg-yellow-100 text-yellow-700",
  reviewed: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const STATUSES = ["", "draft", "pending", "reviewed", "approved", "rejected"];

export default function HistoryPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [subs, emps] = await Promise.all([
          api.submissions.list(),
          api.employees.list(),
        ]);
        setSubmissions(subs);
        setEmployees(emps);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function applyFilter() {
    setLoading(true);
    try {
      const subs = await api.submissions.list({
        employee_id: filterEmployee || undefined,
        status: filterStatus || undefined,
      });
      setSubmissions(subs);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const empMap = Object.fromEntries(employees.map((e) => [e.id, e]));

  const sorted = [...submissions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-800 mb-6">Submission History</h1>

      <div className="bg-white rounded-lg shadow-sm p-4 mb-6 flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Employee</label>
          <select
            value={filterEmployee}
            onChange={(e) => setFilterEmployee(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm min-w-[160px]"
          >
            <option value="">All employees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s || "All statuses"}</option>
            ))}
          </select>
        </div>
        <button
          onClick={applyFilter}
          className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Filter
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        {sorted.map((sub) => {
          const emp = empMap[sub.employee_id];
          return (
            <Link
              key={sub.id}
              href={`/submissions/${sub.id}`}
              className="block bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-800">
                    {emp ? `${emp.name} — ${emp.employee_ref}` : sub.employee_id}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {sub.trip_purpose || "No trip purpose"}
                    {sub.destination ? ` · ${sub.destination}` : ""}
                    {sub.trip_start ? ` · ${sub.trip_start}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">
                    {new Date(sub.created_at).toLocaleDateString()}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[sub.status] || STATUS_STYLES.draft}`}>
                    {sub.status}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
        {!loading && sorted.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">No submissions match the filter.</p>
        )}
      </div>
    </div>
  );
}
