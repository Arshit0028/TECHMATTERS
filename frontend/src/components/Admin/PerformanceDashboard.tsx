import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { CheckSquare, Square, Plus, Eye, Image as ImageIcon, CheckCircle } from 'lucide-react';
import api from '../../api/client';

interface Employee {
  _id: string;
  name: string;
  email: string;
  progress: {
    previousMonth: boolean;
    currentMonth: boolean;
    nextMonthPlan: boolean;
    reimbursement: boolean;
    planned: boolean;
    score: number;
    remarks: string;
  };
  monthlyPlans: {
    previousMonthPlan: string;
    currentMonthPlan: string;
    nextMonthPlan: string;
  };
}

interface TeamUpdate {
  _id: string;
  user: { name: string; _id: string };
  project: { name: string; _id: string };
  updateText: string;
  date: string;
  isCompleted: boolean;
}

interface ReimbursementItem {
  _id: string;
  employee: { name: string };
  project?: { name: string };
  title: string;
  amount: number;
  status: string;
  receipts: Array<{ url: string; name: string }>;
}

export const PerformanceDashboard: React.FC = () => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [updates, setUpdates] = useState<TeamUpdate[]>([]);
  const [reimbursements, setReimbursements] = useState<ReimbursementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);

  useEffect(() => {
    if (user?.accessLevel !== 'super-admin') return;
    loadDashboard();
  }, [user]);

  const loadDashboard = async () => {
    try {
      const res = await api.get('/performance/full-dashboard');
      setEmployees(res.data.employees);
      setUpdates(res.data.updates);
      setReimbursements(res.data.reimbursements);
    } catch (err) {
      console.error(err);
      alert('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // Update progress (existing)
  const updateProgress = async (empId: string, updates: Partial<Employee['progress']>) => {
    setSaving(empId);
    try {
      const current = employees.find(e => e._id === empId)!;
      const updatedProgress = { ...current.progress, ...updates };
      await api.put(`/performance/progress/${empId}`, updatedProgress);
      setEmployees(prev => prev.map(e => e._id === empId ? { ...e, progress: updatedProgress } : e));
    } catch (err) {
      console.error(err);
      alert('Failed to save progress');
    } finally {
      setSaving(null);
    }
  };

  // Update monthly plans for an employee
  const updateMonthlyPlans = async (empId: string, field: keyof Employee['monthlyPlans'], value: string) => {
    setSaving(`${empId}-plans`);
    try {
      const current = employees.find(e => e._id === empId)!;
      const updatedPlans = { ...current.monthlyPlans, [field]: value };
      await api.put(`/performance/monthly-plans/${empId}`, updatedPlans);
      setEmployees(prev => prev.map(e => e._id === empId ? { ...e, monthlyPlans: updatedPlans } : e));
    } catch (err) {
      console.error(err);
      alert('Failed to save plans');
    } finally {
      setSaving(null);
    }
  };

  // Mark an update as completed (tick)
  const markUpdateCompleted = async (updateId: string) => {
    try {
      await api.put(`/performance/updates/${updateId}/complete`);
      setUpdates(prev => prev.filter(u => u._id !== updateId));
    } catch (err) {
      console.error(err);
      alert('Failed to mark update as completed');
    }
  };

  if (loading) return <div className="text-center py-12">Loading dashboard...</div>;
  if (user?.accessLevel !== 'super-admin') return <div className="text-center py-12">Access denied.</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        <h1 className="text-3xl font-bold mb-6">Super Admin Performance Dashboard</h1>

        {/* ========== 1. EMPLOYEE PROGRESS TABLE (existing) ========== */}
        <div className="bg-white rounded-2xl shadow-md overflow-hidden mb-8">
          <div className="p-4 bg-gradient-to-r from-purple-500 to-purple-600 text-white">
            <h2 className="text-xl font-semibold">Employee Progress Overview</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-100">
                <tr><th className="px-4 py-2">Employee</th><th>Previous</th><th>Current</th><th>Next Plan</th><th>Reimb.</th><th>Planned</th><th>Score</th><th>Remarks</th></tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp._id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">{emp.name}<div className="text-xs text-gray-400">{emp.email}</div></td>
                    {['previousMonth', 'currentMonth', 'nextMonthPlan', 'reimbursement', 'planned'].map(field => (
                      <td key={field} className="px-2 py-2 text-center">
                        <button onClick={() => updateProgress(emp._id, { [field]: !emp.progress[field as keyof Employee['progress']] })}>
                          {emp.progress[field as keyof Employee['progress']] ? <CheckSquare className="text-green-600 w-5 h-5" /> : <Square className="text-gray-400 w-5 h-5" />}
                        </button>
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center"><input type="number" min="0" max="100" value={emp.progress.score} onChange={e => updateProgress(emp._id, { score: parseInt(e.target.value) || 0 })} className="w-16 border rounded p-1 text-center" /></td>
                    <td className="px-2 py-2"><input type="text" value={emp.progress.remarks} onChange={e => updateProgress(emp._id, { remarks: e.target.value })} className="w-full border rounded p-1" placeholder="Remark" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ========== 2. MONTHLY PLANS (expandable per employee) ========== */}
        <div className="bg-white rounded-2xl shadow-md overflow-hidden mb-8">
          <div className="p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white">
            <h2 className="text-xl font-semibold">Monthly Plans (Previous, Current, Next)</h2>
          </div>
          {employees.map(emp => (
            <div key={emp._id} className="border-b border-gray-100 p-3">
              <button onClick={() => setExpandedEmployee(expandedEmployee === emp._id ? null : emp._id)} className="flex justify-between items-center w-full text-left font-medium">
                {emp.name} <span className="text-gray-400">{expandedEmployee === emp._id ? '▲' : '▼'}</span>
              </button>
              {expandedEmployee === emp._id && (
                <div className="grid md:grid-cols-3 gap-4 mt-3 p-2">
                  <textarea value={emp.monthlyPlans.previousMonthPlan} onChange={e => updateMonthlyPlans(emp._id, 'previousMonthPlan', e.target.value)} placeholder="Previous Month Plan" rows={3} className="border rounded p-2 w-full" />
                  <textarea value={emp.monthlyPlans.currentMonthPlan} onChange={e => updateMonthlyPlans(emp._id, 'currentMonthPlan', e.target.value)} placeholder="Current Month Plan" rows={3} className="border rounded p-2 w-full" />
                  <textarea value={emp.monthlyPlans.nextMonthPlan} onChange={e => updateMonthlyPlans(emp._id, 'nextMonthPlan', e.target.value)} placeholder="Next Month Plan" rows={3} className="border rounded p-2 w-full" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ========== 3. TEAM UPDATES (with tick to mark done) ========== */}
        <div className="bg-white rounded-2xl shadow-md overflow-hidden mb-8">
          <div className="p-4 bg-gradient-to-r from-green-500 to-green-600 text-white flex justify-between items-center">
            <h2 className="text-xl font-semibold">Pending Team Updates (from Projects)</h2>
            <button onClick={() => alert('Add new update feature – can be implemented')} className="bg-white text-green-600 px-3 py-1 rounded-full text-sm flex items-center gap-1"><Plus size={16} /> Add Update</button>
          </div>
          <div className="divide-y">
            {updates.length === 0 ? <p className="p-4 text-gray-400">No pending updates.</p> : updates.map(update => (
              <div key={update._id} className="p-4 hover:bg-gray-50 flex justify-between items-start">
                <div><p className="font-medium">{update.user.name} – {update.project.name}</p><p className="text-gray-600 text-sm mt-1">{update.updateText}</p><p className="text-xs text-gray-400 mt-1">{new Date(update.date).toLocaleString()}</p></div>
                <button onClick={() => markUpdateCompleted(update._id)} className="text-green-600 hover:text-green-800"><CheckCircle size={24} /></button>
              </div>
            ))}
          </div>
        </div>

        {/* ========== 4. REIMBURSEMENTS WITH PHOTOS ========== */}
        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          <div className="p-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white">
            <h2 className="text-xl font-semibold">Reimbursement Claims (with receipts)</h2>
          </div>
          <div className="divide-y">
            {reimbursements.length === 0 ? <p className="p-4 text-gray-400">No pending reimbursements.</p> : reimbursements.map(claim => (
              <div key={claim._id} className="p-4">
                <div className="flex justify-between items-start"><div><p className="font-medium">{claim.employee.name} – {claim.title}</p><p>Amount: ₹{claim.amount} | Status: {claim.status}</p><p className="text-sm text-gray-500">{claim.project?.name && `Project: ${claim.project.name}`}</p></div></div>
                {claim.receipts.length > 0 && <div className="mt-2 flex gap-2">{claim.receipts.map((r, idx) => <a key={idx} href={`http://localhost:5000/${r.url}`} target="_blank" rel="noopener noreferrer" className="border rounded p-1 inline-flex items-center gap-1 text-sm"><ImageIcon size={14} /> View Receipt</a>)}</div>}
              </div>
            ))}
          </div>
        </div>

        {saving && <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow">Saving...</div>}
      </div>
    </div>
  );
};

