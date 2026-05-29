"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Employee, type Submission } from "@/lib/api";

const STATUS_STYLES: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600",
  pending:  "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
  reviewed: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  approved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  rejected: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

const EMPTY_EMP_FORM = {
  employee_ref: "", name: "", email: "", grade: "", title: "", department: "", home_base: "",
};

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    employee_id: "", trip_purpose: "", destination: "", trip_start: "", trip_end: "",
  });
  const [creating, setCreating] = useState(false);
  const [showNewEmp, setShowNewEmp] = useState(false);
  const [empForm, setEmpForm] = useState(EMPTY_EMP_FORM);
  const [creatingEmp, setCreatingEmp] = useState(false);
  const [empError, setEmpError] = useState("");

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

  useEffect(() => { load(); }, []);

  async function handleCreateEmployee(e: React.FormEvent) {
    e.preventDefault();
    setEmpError("");
    setCreatingEmp(true);
    try {
      const emp = await api.employees.create({
        employee_ref: empForm.employee_ref,
        name: empForm.name,
        email: empForm.email || undefined,
        grade: parseInt(empForm.grade) || 1,
        title: empForm.title || undefined,
        department: empForm.department || undefined,
        home_base: empForm.home_base || undefined,
      });
      setEmployees((prev) => [...prev, emp].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((f) => ({ ...f, employee_id: emp.id }));
      setEmpForm(EMPTY_EMP_FORM);
      setShowNewEmp(false);
    } catch (e: any) {
      setEmpError(e.message);
    } finally {
      setCreatingEmp(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const sub = await api.submissions.create({
        employee_id: form.employee_id,
        trip_purpose: form.trip_purpose || undefined,
        destination: form.destination || undefined,
        trip_start: form.trip_start || undefined,
        trip_end: form.trip_end || undefined,
      });
      setShowNew(false);
      setForm({ employee_id: "", trip_purpose: "", destination: "", trip_start: "", trip_end: "" });
      setSubmissions((prev) => [sub, ...prev]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  const empMap = Object.fromEntries(employees.map((e) => [e.id, e]));

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expense Submissions</h1>
          <p className="text-sm text-gray-500 mt-1">Review and manage employee expense reports</p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="btn-primary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Submission
        </button>
      </div>

      {/* New submission form */}
      {showNew && (
        <div className="card p-6 mb-8">
          <h2 className="text-base font-semibold text-gray-900 mb-5">New Submission</h2>
          <form onSubmit={handleCreate} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              {/* Employee selector */}
              <div className="col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label mb-0">Employee *</label>
                  <button
                    type="button"
                    onClick={() => setShowNewEmp((v) => !v)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {showNewEmp ? "← Back to list" : "+ New Employee"}
                  </button>
                </div>

                {showNewEmp ? (
                  <div className="border border-blue-100 rounded-xl p-4 bg-blue-50 space-y-3">
                    <p className="text-xs font-semibold text-blue-700">Create New Employee</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">Employee Ref *</label>
                        <input type="text" required value={empForm.employee_ref}
                          onChange={(e) => setEmpForm((f) => ({ ...f, employee_ref: e.target.value }))}
                          className="input" placeholder="NW-09999" />
                      </div>
                      <div>
                        <label className="label">Full Name *</label>
                        <input type="text" required value={empForm.name}
                          onChange={(e) => setEmpForm((f) => ({ ...f, name: e.target.value }))}
                          className="input" placeholder="Jane Smith" />
                      </div>
                      <div>
                        <label className="label">Grade *</label>
                        <input type="number" required min={1} max={12} value={empForm.grade}
                          onChange={(e) => setEmpForm((f) => ({ ...f, grade: e.target.value }))}
                          className="input" placeholder="1–12" />
                      </div>
                      <div>
                        <label className="label">Email</label>
                        <input type="email" value={empForm.email}
                          onChange={(e) => setEmpForm((f) => ({ ...f, email: e.target.value }))}
                          className="input" placeholder="optional" />
                      </div>
                      <div>
                        <label className="label">Title</label>
                        <input type="text" value={empForm.title}
                          onChange={(e) => setEmpForm((f) => ({ ...f, title: e.target.value }))}
                          className="input" placeholder="optional" />
                      </div>
                      <div>
                        <label className="label">Department</label>
                        <input type="text" value={empForm.department}
                          onChange={(e) => setEmpForm((f) => ({ ...f, department: e.target.value }))}
                          className="input" placeholder="optional" />
                      </div>
                    </div>
                    {empError && <p className="text-xs text-red-600">{empError}</p>}
                    <button type="button" onClick={handleCreateEmployee} disabled={creatingEmp} className="btn-primary text-xs py-1.5">
                      {creatingEmp ? "Creating…" : "Create & Select"}
                    </button>
                  </div>
                ) : (
                  <select
                    required
                    value={form.employee_id}
                    onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))}
                    className="input"
                  >
                    <option value="">Select employee…</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} · {emp.employee_ref}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="label">Destination</label>
                <input type="text" value={form.destination}
                  onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                  className="input" placeholder="Denver, CO" />
              </div>
              <div className="col-span-2">
                <label className="label">Trip Purpose</label>
                <input type="text" value={form.trip_purpose}
                  onChange={(e) => setForm((f) => ({ ...f, trip_purpose: e.target.value }))}
                  className="input" placeholder="e.g. Quarterly client review with Mountain Freight" />
              </div>
              <div>
                <label className="label">Start Date</label>
                <input type="date" value={form.trip_start}
                  onChange={(e) => setForm((f) => ({ ...f, trip_start: e.target.value }))}
                  className="input" />
              </div>
              <div>
                <label className="label">End Date</label>
                <input type="date" value={form.trip_end}
                  onChange={(e) => setForm((f) => ({ ...f, trip_end: e.target.value }))}
                  className="input" />
              </div>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex gap-3 justify-end pt-1">
              <button type="button" onClick={() => setShowNew(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={creating} className="btn-primary">
                {creating ? "Creating…" : "Create Submission"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Submissions list */}
      {!loading && (
        <div className="space-y-3">
          {submissions.map((sub) => {
            const emp = empMap[sub.employee_id];
            return (
              <Link
                key={sub.id}
                href={`/submissions/${sub.id}`}
                className="card p-5 flex items-center justify-between hover:shadow-md hover:border-gray-200 transition-all group block"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-blue-700 font-semibold text-sm">
                    {emp?.name?.charAt(0) ?? "?"}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {emp ? emp.name : "Unknown Employee"}
                      {emp && <span className="font-normal text-gray-400 ml-1.5">· {emp.employee_ref}</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {sub.trip_purpose && <span>{sub.trip_purpose}</span>}
                      {sub.destination && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          </svg>
                          {sub.destination}
                        </span>
                      )}
                      {sub.trip_start && <span>· {sub.trip_start}{sub.trip_end ? ` → ${sub.trip_end}` : ""}</span>}
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

          {submissions.length === 0 && (
            <div className="card p-16 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">No submissions yet</p>
              <p className="text-xs text-gray-400">Create a submission to start reviewing expenses</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
