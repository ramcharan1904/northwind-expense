"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Submission, type Employee } from "@/lib/api";

const STATUS_STYLES: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600",
  pending:  "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
  reviewed: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  approved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  rejected: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

const STATUSES = ["", "draft", "pending", "reviewed", "approved", "rejected"];

export default function HistoryPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [subs, emps] = await Promise.all([api.submissions.list(), api.employees.list()]);
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
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Submission History</h1>
        <p className="text-sm text-gray-500 mt-1">Browse all expense submissions by employee or status</p>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6 flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <label className="label">Employee</label>
          <select
            value={filterEmployee}
            onChange={(e) => setFilterEmployee(e.target.value)}
            className="input"
          >
            <option value="">All employees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="label">Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s || "All statuses"}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="label">From</label>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="input"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="label">To</label>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="input"
          />
        </div>
        <button onClick={applyFilter} className="btn-primary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Apply Filter
        </button>
        {(filterEmployee || filterStatus || filterDateFrom || filterDateTo) && (
          <button
            onClick={() => {
              setFilterEmployee("");
              setFilterStatus("");
              setFilterDateFrom("");
              setFilterDateTo("");
              applyFilter();
            }}
            className="btn-secondary"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((sub) => {
            const emp = empMap[sub.employee_id];
            return (
              <Link
                key={sub.id}
                href={`/submissions/${sub.id}`}
                className="card p-5 flex items-center justify-between hover:shadow-md hover:border-gray-200 transition-all group block"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm shrink-0">
                    {emp?.name?.charAt(0) ?? "?"}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {emp ? emp.name : "Unknown Employee"}
                      {emp && <span className="font-normal text-gray-400 ml-1.5">· {emp.employee_ref}</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                      {sub.trip_purpose && <span className="truncate max-w-xs">{sub.trip_purpose}</span>}
                      {sub.destination && <span>· {sub.destination}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span className="text-xs text-gray-400 hidden sm:block">
                    {new Date(sub.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${STATUS_STYLES[sub.status] ?? STATUS_STYLES.draft}`}>
                    {sub.status}
                  </span>
                  <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            );
          })}

          {sorted.length === 0 && (
            <div className="card p-16 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">No submissions match</p>
              <p className="text-xs text-gray-400">Try adjusting the filters above</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
