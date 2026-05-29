"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Employee, type Submission } from "@/lib/api";

const STATUS_STYLES: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600",
  pending:  "bg-yellow-100 text-yellow-700",
  reviewed: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
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
    employee_id: "",
    trip_purpose: "",
    destination: "",
    trip_start: "",
    trip_end: "",
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-800">Expense Submissions</h1>
        <button
          onClick={() => setShowNew(!showNew)}
          className="text-sm px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + New Submission
        </button>
      </div>

      {showNew && (
        <form onSubmit={handleCreate} className="bg-white rounded-lg shadow-sm p-4 mb-6 space-y-3">
          <div className="text-sm font-semibold text-gray-700">New Submission</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-500">Employee *</label>
                <button
                  type="button"
                  onClick={() => setShowNewEmp((v) => !v)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {showNewEmp ? "Cancel" : "+ New Employee"}
                </button>
              </div>
              {showNewEmp ? (
                <div className="border border-blue-200 rounded p-3 bg-blue-50 space-y-2">
                  <div className="text-xs font-semibold text-blue-700 mb-1">New Employee</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Employee Ref *</label>
                      <input type="text" required value={empForm.employee_ref}
                        onChange={(e) => setEmpForm((f) => ({ ...f, employee_ref: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                        placeholder="e.g. NW-09999" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Full Name *</label>
                      <input type="text" required value={empForm.name}
                        onChange={(e) => setEmpForm((f) => ({ ...f, name: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                        placeholder="e.g. Jane Smith" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Grade *</label>
                      <input type="number" required min={1} max={12} value={empForm.grade}
                        onChange={(e) => setEmpForm((f) => ({ ...f, grade: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                        placeholder="1–12" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Email</label>
                      <input type="email" value={empForm.email}
                        onChange={(e) => setEmpForm((f) => ({ ...f, email: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                        placeholder="optional" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Title</label>
                      <input type="text" value={empForm.title}
                        onChange={(e) => setEmpForm((f) => ({ ...f, title: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                        placeholder="optional" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Department</label>
                      <input type="text" value={empForm.department}
                        onChange={(e) => setEmpForm((f) => ({ ...f, department: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                        placeholder="optional" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-0.5">Home Base</label>
                      <input type="text" value={empForm.home_base}
                        onChange={(e) => setEmpForm((f) => ({ ...f, home_base: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                        placeholder="optional" />
                    </div>
                  </div>
                  {empError && <p className="text-xs text-red-600">{empError}</p>}
                  <button
                    type="button"
                    onClick={handleCreateEmployee}
                    disabled={creatingEmp}
                    className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {creatingEmp ? "Creating..." : "Create & Select"}
                  </button>
                </div>
              ) : (
                <select
                  required
                  value={form.employee_id}
                  onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                >
                  <option value="">Select employee...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.employee_ref})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Destination</label>
              <input
                type="text"
                value={form.destination}
                onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                placeholder="e.g. Denver, CO"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Trip Purpose</label>
              <input
                type="text"
                value={form.trip_purpose}
                onChange={(e) => setForm((f) => ({ ...f, trip_purpose: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                placeholder="e.g. Operations review"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                <input
                  type="date"
                  value={form.trip_start}
                  onChange={(e) => setForm((f) => ({ ...f, trip_start: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">End Date</label>
                <input
                  type="date"
                  value={form.trip_end}
                  onChange={(e) => setForm((f) => ({ ...f, trip_end: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowNew(false)} className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={creating} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {!loading && error && !showNew && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        {submissions.map((sub) => {
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
                    {sub.trip_purpose || "No trip purpose"}{sub.destination ? ` · ${sub.destination}` : ""}
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
        {!loading && submissions.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">No submissions yet. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}
