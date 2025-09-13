// 'use client';
// import { useEffect, useState } from 'react';
// import { API_BASE } from '../../lib/api';
// import { useAuth } from '../../lib/authContext';

// function ProfileCard({ p, onRefresh, onDelete }) {
//   const d = p.data || {};
//   return (
//     <div className="p-4 border rounded bg-white dark:bg-gray-800">
//       <div className="flex justify-between items-start">
//         <div>
//           <div className="font-semibold text-lg">{d.displayName || p.handle}</div>
//           <div className="text-xs text-gray-500">{p.platform.toUpperCase()} • {p.handle}</div>
//           <div className="text-sm mt-2">Solved: <strong>{d.solvedCount ?? '—'}</strong></div>
//           <div className="text-sm">Days Active: <strong>{d.daysActive ?? '—'}</strong></div>
//           {p.platform === 'codeforces' && (
//             <div className="text-sm">Rating: <strong>{d.rating ?? '—'}</strong> (max {d.maxRating ?? '—'})</div>
//           )}
//         </div>
//         <div className="text-right space-y-2">
//           <div className="text-xs text-gray-400">Last fetched</div>
//           <div className="text-sm">{p.lastFetchedAt ? new Date(p.lastFetchedAt).toLocaleString() : 'never'}</div>
//           <div className="flex flex-col gap-2 mt-3">
//             <button onClick={()=>onRefresh(p._id)} className="px-3 py-1 rounded bg-amber-500 text-white text-sm">Refresh</button>
//             <button onClick={()=>onDelete(p._id)} className="px-3 py-1 rounded border text-sm">Delete</button>
//           </div>
//         </div>
//       </div>

//       {/* Topics */}
//       <div className="mt-4">
//         <div className="text-sm font-medium mb-2">Top Topics</div>
//         <div className="flex flex-wrap gap-2">
//           {d.topics && Object.entries(d.topics).slice(0, 10).map(([k,v]) => (
//             <div key={k} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm">{k} ({v})</div>
//           ))}
//           {!d.topics && <div className="text-sm text-gray-500">No topic data</div>}
//         </div>
//       </div>

//       {/* Recent */}
//       {d.recentSolved && d.recentSolved.length > 0 && (
//         <div className="mt-4">
//           <div className="text-sm font-medium mb-2">Recent Solved</div>
//           <ul className="list-disc list-inside text-sm">
//             {d.recentSolved.slice(0,5).map((r, i) => (
//               <li key={i}>{r.title || r.slug} <span className="text-xs text-gray-400">({new Date(r.ts * 1000).toLocaleString()})</span></li>
//             ))}
//           </ul>
//         </div>
//       )}
//     </div>
//   );
// }

// export default function ProfileTrackerPage() {
//   const { user } = useAuth();
//   const [profiles, setProfiles] = useState([]);
//   const [loading, setLoading] = useState(false);
//   const [input, setInput] = useState('');
//   const token = typeof window !== 'undefined' ? localStorage.getItem('cq_token') : null;

//   const fetchProfiles = async () => {
//     setLoading(true);
//     try {
//       const res = await fetch(`${API_BASE}/api/profiles`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
//       const data = await res.json();
//       setProfiles(data);
//     } catch (err) { console.error(err); alert('Failed to load profiles'); }
//     finally { setLoading(false); }
//   };

//   useEffect(()=>{ if (user) fetchProfiles(); }, [user]);

//   const addProfile = async (e) => {
//     e.preventDefault();
//     if (!input.trim()) return;
//     try {
//       const res = await fetch(`${API_BASE}/api/profiles`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
//         body: JSON.stringify({ urlOrHandle: input.trim() })
//       });
//       const data = await res.json();
//       if (!res.ok) throw new Error(data.message || JSON.stringify(data));
//       setProfiles(prev => [data, ...prev]);
//       setInput('');
//     } catch (err) {
//       alert('Failed to add: ' + err.message);
//     }
//   };

//   const refreshProfile = async (id) => {
//     try {
//       const res = await fetch(`${API_BASE}/api/profiles/${id}/refresh`, {
//         method: 'POST',
//         headers: { Authorization: `Bearer ${token}` }
//       });
//       const data = await res.json();
//       if (!res.ok) throw new Error(data.message || JSON.stringify(data));
//       setProfiles(prev => prev.map(p => p._id === id ? data : p));
//     } catch (err) {
//       alert('Refresh failed: ' + err.message);
//     }
//   };

//   const deleteProfile = async (id) => {
//     if (!confirm('Delete this profile?')) return;
//     try {
//       const res = await fetch(`${API_BASE}/api/profiles/${id}`, {
//         method: 'DELETE',
//         headers: { Authorization: `Bearer ${token}` }
//       });
//       const data = await res.json();
//       if (!res.ok) throw new Error(data.message || JSON.stringify(data));
//       setProfiles(prev => prev.filter(p => p._id !== id));
//     } catch (err) {
//       alert('Delete failed: ' + err.message);
//     }
//   };

//   if (!user) {
//     return <div className="container py-8"><div className="max-w-md mx-auto p-6 rounded border bg-white dark:bg-gray-800">Please log in to track profiles.</div></div>;
//   }

//   return (
//     <main className="container py-8">
//       <h2 className="text-2xl font-bold mb-4">Profile Tracker</h2>

//       <div className="max-w-2xl">
//         <form onSubmit={addProfile} className="flex gap-2 mb-4">
//           <input value={input} onChange={e=>setInput(e.target.value)} placeholder="Paste Codeforces or LeetCode profile link or username" className="flex-1 px-3 py-2 border rounded" />
//           <button className="px-4 py-2 bg-amber-600 text-white rounded">Add</button>
//         </form>

//         {loading ? <div>Loading...</div> : (
//           <div className="space-y-4">
//             {profiles.length === 0 && <div className="text-sm text-gray-500">No tracked profiles yet.</div>}
//             {profiles.map(p => (
//               <ProfileCard key={p._id} p={p} onRefresh={refreshProfile} onDelete={deleteProfile} />
//             ))}
//           </div>
//         )}
//       </div>
//     </main>
//   );
// }

// 'use client';
// import { useEffect, useState } from 'react';
// import { API_BASE } from '../../lib/api';
// import { useAuth } from '../../lib/authContext';
// import AnalyticsPanel from '../../components/Profile/AnalyticsPanel';

// function ProfileCard({ p, onRefresh, onDelete }) {
//   const d = p.data || {};
//   return (
//     <div className="p-4 border rounded bg-white dark:bg-gray-800">
//       <div className="flex justify-between items-start">
//         <div>
//           <div className="font-semibold text-lg">{d.displayName || p.handle}</div>
//           <div className="text-xs text-gray-500">{p.platform.toUpperCase()} • {p.handle}</div>
//           <div className="text-sm mt-2">Solved: <strong>{d.solvedCount ?? '—'}</strong></div>
//           <div className="text-sm">Days Active: <strong>{d.daysActive ?? '—'}</strong></div>
//           {p.platform === 'codeforces' && (
//             <div className="text-sm">Rating: <strong>{d.rating ?? '—'}</strong> (max {d.maxRating ?? '—'})</div>
//           )}
//         </div>
//         <div className="text-right space-y-2">
//           <div className="text-xs text-gray-400">Last fetched</div>
//           <div className="text-sm">{p.lastFetchedAt ? new Date(p.lastFetchedAt).toLocaleString() : 'never'}</div>
//           <div className="flex flex-col gap-2 mt-3">
//             <button onClick={()=>onRefresh(p._id)} className="px-3 py-1 rounded bg-amber-500 text-white text-sm">Refresh</button>
//             <button onClick={()=>onDelete(p._id)} className="px-3 py-1 rounded border text-sm">Delete</button>
//           </div>
//         </div>
//       </div>

//       {/* Analytics */}
//       <AnalyticsPanel data={d} />
//     </div>
//   );
// }

// export default function ProfileTrackerPage() {
//   const { user } = useAuth();
//   const [profiles, setProfiles] = useState([]);
//   const [loading, setLoading] = useState(false);
//   const [input, setInput] = useState('');
//   const token = typeof window !== 'undefined' ? localStorage.getItem('cq_token') : null;

//   const fetchProfiles = async () => {
//     setLoading(true);
//     try {
//       const res = await fetch(`${API_BASE}/api/profiles`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
//       const data = await res.json();
//       setProfiles(data);
//     } catch (err) { console.error(err); alert('Failed to load profiles'); }
//     finally { setLoading(false); }
//   };

//   useEffect(()=>{ if (user) fetchProfiles(); }, [user]);

//   const addProfile = async (e) => {
//     e.preventDefault();
//     if (!input.trim()) return;
//     try {
//       const res = await fetch(`${API_BASE}/api/profiles`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
//         body: JSON.stringify({ urlOrHandle: input.trim() })
//       });
//       const data = await res.json();
//       if (!res.ok) throw new Error(data.message || JSON.stringify(data));
//       setProfiles(prev => [data, ...prev]);
//       setInput('');
//     } catch (err) {
//       alert('Failed to add: ' + err.message);
//     }
//   };

//   const refreshProfile = async (id) => {
//     try {
//       const res = await fetch(`${API_BASE}/api/profiles/${id}/refresh`, {
//         method: 'POST',
//         headers: { Authorization: `Bearer ${token}` }
//       });
//       const data = await res.json();
//       if (!res.ok) throw new Error(data.message || JSON.stringify(data));
//       setProfiles(prev => prev.map(p => p._id === id ? data : p));
//     } catch (err) {
//       alert('Refresh failed: ' + err.message);
//     }
//   };

//   const deleteProfile = async (id) => {
//     if (!confirm('Delete this profile?')) return;
//     try {
//       const res = await fetch(`${API_BASE}/api/profiles/${id}`, {
//         method: 'DELETE',
//         headers: { Authorization: `Bearer ${token}` }
//       });
//       const data = await res.json();
//       if (!res.ok) throw new Error(data.message || JSON.stringify(data));
//       setProfiles(prev => prev.filter(p => p._id !== id));
//     } catch (err) {
//       alert('Delete failed: ' + err.message);
//     }
//   };

//   if (!user) {
//     return <div className="container py-8"><div className="max-w-md mx-auto p-6 rounded border bg-white dark:bg-gray-800">Please log in to track profiles.</div></div>;
//   }

//   return (
//     <main className="container py-8">
//       <h2 className="text-2xl font-bold mb-4">Profile Tracker</h2>

//       <div className="max-w-3xl">
//         <form onSubmit={addProfile} className="flex gap-2 mb-4">
//           <input value={input} onChange={e=>setInput(e.target.value)} placeholder="Paste Codeforces/LeetCode/HackerRank/GfG link or username" className="flex-1 px-3 py-2 border rounded" />
//           <button className="px-4 py-2 bg-amber-600 text-white rounded">Add</button>
//         </form>

//         {loading ? <div>Loading...</div> : (
//           <div className="space-y-4">
//             {profiles.length === 0 && <div className="text-sm text-gray-500">No tracked profiles yet.</div>}
//             {profiles.map(p => (
//               <ProfileCard key={p._id} p={p} onRefresh={refreshProfile} onDelete={deleteProfile} />
//             ))}
//           </div>
//         )}
//       </div>
//     </main>
//   );
// }


'use client';
import { useEffect, useState } from 'react';
import { API_BASE } from '../../lib/api';
import { useAuth } from '../../lib/authContext';
import AnalyticsPanel from '../../components/Profile/AnalyticsPanel';

function ProfileCard({ p, onRefresh, onRequestDelete }) {
  const d = p.data || {};
  return (
    <div className="p-4 border rounded bg-white dark:bg-gray-800">
      <div className="flex justify-between items-start">
        <div>
          <div className="font-semibold text-lg">{d.displayName || p.handle}</div>
          <div className="text-xs text-gray-500">{p.platform.toUpperCase()} • {p.handle}</div>
          <div className="text-sm mt-2">Solved: <strong>{d.solvedCount ?? '—'}</strong></div>
          <div className="text-sm">Days Active: <strong>{d.daysActive ?? '—'}</strong></div>
          {p.platform === 'codeforces' && (
            <div className="text-sm">Rating: <strong>{d.rating ?? '—'}</strong> (max {d.maxRating ?? '—'})</div>
          )}
        </div>
        <div className="text-right space-y-2">
          <div className="text-xs text-gray-400">Last fetched</div>
          <div className="text-sm">{p.lastFetchedAt ? new Date(p.lastFetchedAt).toLocaleString() : 'never'}</div>
          <div className="flex flex-col gap-2 mt-3">
            <button onClick={()=>onRefresh(p._id)} className="px-3 py-1 rounded bg-amber-500 text-white text-sm">Refresh</button>
            <button onClick={()=>onRequestDelete(p)} className="px-3 py-1 rounded border text-sm">Delete</button>
          </div>
        </div>
      </div>

      {/* Analytics */}
      <AnalyticsPanel data={d} />
    </div>
  );
}

/* Simple toast component */
function Toast({ show, message, kind = 'info', onClose }) {
  if (!show) return null;
  const bg = kind === 'error' ? 'bg-red-600' : 'bg-green-600';
  return (
    <div className="fixed right-6 bottom-6 z-50">
      <div className={`${bg} text-white px-4 py-2 rounded shadow-lg flex items-center gap-3`}>
        <div className="text-sm">{message}</div>
        <button onClick={onClose} className="ml-2 text-white/80 hover:text-white">✕</button>
      </div>
    </div>
  );
}

/* Confirmation modal */
function DeleteConfirmModal({ open, profile, onCancel, onConfirm, deleting }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel}></div>
      <div className="relative z-50 max-w-lg w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Delete tracked profile</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Are you sure you want to remove this tracked profile? This will delete it from your tracked list — your other data won't be affected.
        </p>

        <div className="border rounded p-3 bg-gray-50 dark:bg-gray-700 mb-4">
          <div className="font-medium">{profile?.data?.displayName || profile?.handle}</div>
          <div className="text-xs text-gray-500">{profile?.platform?.toUpperCase()} • {profile?.handle}</div>
          <div className="text-sm mt-2">Solved: <strong>{profile?.data?.solvedCount ?? '—'}</strong></div>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onCancel} disabled={deleting} className="px-3 py-2 rounded border text-sm bg-white dark:bg-gray-700">Cancel</button>
          <button onClick={() => onConfirm(profile?._id)} disabled={deleting} className="px-4 py-2 rounded bg-red-600 text-white text-sm">
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProfileTrackerPage() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', kind: 'info' });

  // modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toDeleteProfile, setToDeleteProfile] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('cq_token') : null;

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/profiles`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) {
        const err = await res.json().catch(()=>({ message: 'Failed' }));
        throw new Error(err.message || 'Failed to load profiles');
      }
      const data = await res.json();
      setProfiles(data || []);
    } catch (err) { console.error(err); setToast({ show: true, message: 'Failed to load profiles', kind: 'error' }); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ if (user) fetchProfiles(); }, [user]);

  const addProfile = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ urlOrHandle: input.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || JSON.stringify(data));
      setProfiles(prev => [data, ...prev]);
      setInput('');
      setToast({ show: true, message: 'Profile added', kind: 'info' });
    } catch (err) {
      alert('Failed to add: ' + err.message);
    }
  };

  const refreshProfile = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/profiles/${id}/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || JSON.stringify(data));
      setProfiles(prev => prev.map(p => p._id === id ? data : p));
      setToast({ show: true, message: 'Profile refreshed', kind: 'info' });
    } catch (err) {
      alert('Refresh failed: ' + err.message);
    }
  };

  // request deletion (opens modal)
  const requestDeleteProfile = (profile) => {
    setToDeleteProfile(profile);
    setConfirmOpen(true);
  };

  // confirm deletion
  const deleteProfile = async (id) => {
    if (!id) return;
    setDeleting(true);

    // Optimistic UI: remove from list immediately, but keep a backup to restore on error
    const backup = [...profiles];
    setProfiles(prev => prev.filter(p => p._id !== id));
    setConfirmOpen(false);

    try {
      const res = await fetch(`${API_BASE}/api/profiles/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        // restore
        setProfiles(backup);
        throw new Error(data.message || 'Delete failed');
      }
      setToast({ show: true, message: 'Profile deleted', kind: 'info' });
      setToDeleteProfile(null);
    } catch (err) {
      console.error('Delete failed', err);
      setToast({ show: true, message: 'Delete failed: ' + (err.message || ''), kind: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  if (!user) {
    return <div className="container py-8"><div className="max-w-md mx-auto p-6 rounded border bg-white dark:bg-gray-800">Please log in to track profiles.</div></div>;
  }

  return (
    <main className="container py-8">
      <h2 className="text-2xl font-bold mb-4">Profile Tracker</h2>

      <div className="max-w-3xl">
        <form onSubmit={addProfile} className="flex gap-2 mb-4">
          <input
            value={input}
            onChange={e=>setInput(e.target.value)}
            placeholder="Paste Codeforces/LeetCode/HackerRank/GfG link or username"
            className="flex-1 px-3 py-2 border rounded"
          />
          <button className="px-4 py-2 bg-amber-600 text-white rounded">Add</button>
        </form>

        {loading ? <div>Loading...</div> : (
          <div className="space-y-4">
            {profiles.length === 0 && <div className="text-sm text-gray-500">No tracked profiles yet.</div>}
            {profiles.map(p => (
              <ProfileCard key={p._id} p={p} onRefresh={refreshProfile} onRequestDelete={requestDeleteProfile} />
            ))}
          </div>
        )}
      </div>

      {/* Confirm modal */}
      <DeleteConfirmModal
        open={confirmOpen}
        profile={toDeleteProfile}
        onCancel={() => { setConfirmOpen(false); setToDeleteProfile(null); }}
        onConfirm={deleteProfile}
        deleting={deleting}
      />

      {/* Toast */}
      <Toast
        show={toast.show}
        message={toast.message}
        kind={toast.kind}
        onClose={() => setToast(prev => ({ ...prev, show: false }))}
      />

    </main>
  );
}
