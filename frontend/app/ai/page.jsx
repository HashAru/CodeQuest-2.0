'use client';
import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';

import { API_BASE } from '../../lib/api';
import { useAuth } from '../../lib/authContext';

/* -----------------------
   Small UI building blocks
   ----------------------- */

// Typing indicator (animated dots)
function TypingIndicator() {
  return (
    <div className="mb-3 flex justify-start">
      <div className="inline-block p-3 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce-slow" />
          <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce-slow animation-delay-75" />
          <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce-slow animation-delay-150" />
        </div>
      </div>
    </div>
  );
}

// Chat bubble (renders markdown)
function ChatMessage({ m }) {
  const isUser = m.role === 'user';
  return (
    <div className={`mb-3 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] inline-block p-3 rounded-lg shadow-sm ${
          isUser ? 'bg-amber-500 text-white' : 'bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white'
        }`}
      >
        <div className="prose prose-sm max-w-none dark:prose-invert break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {m.content || ''}
          </ReactMarkdown>
        </div>
        <div className="text-xs text-gray-400 mt-2 text-right">
          {m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}
        </div>
      </div>
    </div>
  );
}

/* --------------------
   Toast component
   -------------------- */
function Toast({ id, kind = 'info', message, open, onClose, autoHide = 3500 }) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => onClose && onClose(id), autoHide);
    return () => clearTimeout(t);
  }, [open, id, onClose, autoHide]);

  if (!open) return null;
  const bg = kind === 'error' ? 'bg-red-600' : 'bg-green-600';
  return (
    <div className="fixed right-6 bottom-6 z-50">
      <div className={`${bg} text-white px-4 py-2 rounded shadow-lg flex items-center gap-3`}>
        <div className="text-sm">{message}</div>
        <button onClick={() => onClose && onClose(id)} className="ml-2 text-white/90 hover:text-white">✕</button>
      </div>
    </div>
  );
}

/* --------------------
   Confirm Modal
   -------------------- */
function ConfirmModal({ open, title, description, onCancel, onConfirm, loading, confirmLabel = 'Confirm' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel}></div>
      <div className="relative z-50 max-w-lg w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{description}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} disabled={loading} className="px-3 py-2 rounded border text-sm bg-white dark:bg-gray-700">Cancel</button>
          <button onClick={onConfirm} disabled={loading} className="px-4 py-2 rounded bg-red-600 text-white text-sm">
            {loading ? 'Deleting...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------
   Rename Modal
   -------------------- */
function RenameModal({ open, convo, onCancel, onSave, loading }) {
  const [value, setValue] = useState(convo?.title || '');
  useEffect(() => setValue(convo?.title || ''), [convo]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel}></div>
      <div className="relative z-50 max-w-lg w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Rename conversation</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">Choose a short descriptive title for this conversation.</p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full px-3 py-2 border rounded mb-4 bg-white dark:bg-gray-700"
          placeholder="Conversation title"
        />
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} disabled={loading} className="px-3 py-2 rounded border text-sm">Cancel</button>
          <button onClick={() => onSave(value)} disabled={loading || !value.trim()} className="px-4 py-2 rounded bg-amber-600 text-white text-sm">
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------
   Main AI page
   -------------------- */
export default function AIPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [current, setCurrent] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const token = typeof window !== 'undefined' ? localStorage.getItem('cq_token') : null;

  // UI state for modals/toasts
  const [deleteModal, setDeleteModal] = useState({ open: false, convo: null, loading: false });
  const [renameModal, setRenameModal] = useState({ open: false, convo: null, loading: false });
  const [toasts, setToasts] = useState([]);

  // menu state: tracks which conversation's menu is open (id or null)
  const [menuOpenId, setMenuOpenId] = useState(null);
  const menuRef = useRef(null);

  const chatScrollRef = useRef(null);
  const chatContentRef = useRef(null);

  // toast helpers
  const pushToast = (message, kind = 'info') => {
    const id = String(Date.now()) + Math.random().toString(36).slice(2, 7);
    setToasts((s) => [...s, { id, message, kind }]);
  };
  const removeToast = (id) => setToasts((s) => s.filter(t => t.id !== id));

  // fetch conversations
  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ai/conversations`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(()=>({ message: 'Failed' }));
        throw new Error(body.message || 'Failed to fetch conversations');
      }
      const data = await res.json();
      setConversations(data || []);
      if (!current && data && data.length) setCurrent(data[0]);
    } catch (err) {
      console.error('fetchConversations', err);
      pushToast('Failed to load conversations', 'error');
    }
  };

  useEffect(() => {
    if (user) fetchConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // close menu on outside click
  useEffect(() => {
    function onDocClick(e) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, []);

  // autoscroll
  useEffect(() => {
    if (!chatScrollRef.current) return;
    const t = setTimeout(() => {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }, 60);
    return () => clearTimeout(t);
  }, [current?.messages?.length, loading]);

  // create new local conversation
  const createNew = () => setCurrent({ messages: [], title: 'New Study Plan' });

  // load conversation by id
  const loadConversation = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/ai/conversations/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(()=>({ message: 'Failed' }));
        throw new Error(body.message || 'Failed to load conversation');
      }
      const data = await res.json();
      setCurrent(data);
      setMenuOpenId(null);
    } catch (err) {
      console.error('loadConversation', err);
      pushToast('Failed to load conversation', 'error');
    }
  };

  // send message
  const sendMessage = async () => {
    if (!input.trim()) return;
    setLoading(true);
    try {
      const body = { conversationId: current?._id, message: input, title: current ? undefined : `Study: ${input.slice(0, 40)}` };
      const res = await fetch(`${API_BASE}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.details || 'Chat failed');

      setCurrent(data.conversation);
      setConversations(prev => {
        const rest = prev.filter(c => c._id !== data.conversation._id);
        return [data.conversation, ...rest];
      });
      setInput('');
    } catch (err) {
      console.error('sendMessage error', err);
      pushToast(err.message || 'Send failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  // open delete modal
  const openDeleteModal = (convo) => {
    setMenuOpenId(null);
    setDeleteModal({ open: true, convo, loading: false });
  };
  const closeDeleteModal = () => setDeleteModal({ open: false, convo: null, loading: false });

  // confirm delete
  const confirmDeleteConversation = async () => {
    if (!deleteModal.convo) return;
    setDeleteModal(d => ({ ...d, loading: true }));

    const id = deleteModal.convo._id;
    const backup = [...conversations];
    // optimistic update
    setConversations(prev => prev.filter(c => c._id !== id));
    if (current && current._id === id) setCurrent(null);

    try {
      const res = await fetch(`${API_BASE}/api/ai/conversations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await res.json().catch(()=>({}));
      if (!res.ok) {
        throw new Error(body.message || 'Delete failed');
      }
      pushToast('Conversation deleted', 'info');
      closeDeleteModal();
    } catch (err) {
      console.error('delete conversation failed', err);
      setConversations(backup); // restore
      pushToast(err.message || 'Delete failed', 'error');
      setDeleteModal(d => ({ ...d, loading: false }));
    }
  };

  // open rename modal
  const openRenameModal = (convo) => {
    setMenuOpenId(null);
    setRenameModal({ open: true, convo, loading: false });
  };
  const closeRenameModal = () => setRenameModal({ open: false, convo: null, loading: false });

  // save rename
  const saveRenameConversation = async (newTitle) => {
    if (!renameModal.convo) return;
    setRenameModal(r => ({ ...r, loading: true }));
    const id = renameModal.convo._id;
    try {
      const res = await fetch(`${API_BASE}/api/ai/conversations/${id}/title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: newTitle })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Rename failed');

      setConversations(prev => prev.map(c => (c._id === id ? data : c)));
      if (current && current._id === id) setCurrent(data);
      pushToast('Conversation renamed', 'info');
      closeRenameModal();
    } catch (err) {
      console.error('rename failed', err);
      pushToast(err.message || 'Rename failed', 'error');
      setRenameModal(r => ({ ...r, loading: false }));
    }
  };

  /* ----------------
     Export helpers
     ---------------- */
  const downloadMarkdown = () => {
    if (!current) return;
    try {
      const lines = [];
      lines.push(`# ${current.title || 'Study Plan'}`);
      lines.push('');
      (current.messages || []).forEach((m) => {
        const who = m.role === 'user' ? 'User' : 'Assistant';
        lines.push(`**${who}** — ${m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}`);
        lines.push('');
        lines.push(m.content || '');
        lines.push('');
        lines.push('---');
        lines.push('');
      });
      const markdown = lines.join('\n');
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(current.title || 'conversation').replace(/\s+/g, '_').toLowerCase()}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      pushToast('Markdown downloaded', 'info');
    } catch (err) {
      console.error('downloadMarkdown', err);
      pushToast('Failed to export markdown', 'error');
    }
  };

  const downloadPDF = async () => {
    if (!current) return;
    setExporting(true);
    try {
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;

      const node = chatContentRef.current;
      if (!node) throw new Error('Chat content not found');

      const clone = node.cloneNode(true);
      clone.querySelectorAll('button, textarea, input').forEach((el) => el.remove());
      clone.style.background = '#ffffff';
      clone.style.padding = '20px';
      clone.style.color = '#111827';
      clone.style.maxWidth = '800px';
      clone.style.margin = '0 auto';

      const wrap = document.createElement('div');
      const titleEl = document.createElement('h1');
      titleEl.innerText = current.title || 'Study Plan';
      titleEl.style.fontFamily = 'sans-serif';
      titleEl.style.fontSize = '20px';
      titleEl.style.marginBottom = '12px';
      wrap.appendChild(titleEl);
      wrap.appendChild(clone);

      const opt = {
        margin: 10,
        filename: `${(current.title || 'conversation').replace(/\s+/g, '_').toLowerCase()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' }
      };

      await html2pdf().set(opt).from(wrap).save();
      pushToast('PDF exported', 'info');
    } catch (err) {
      console.error('downloadPDF', err);
      pushToast('PDF export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  if (!user) return <div className="container py-8">Please log in to use the Study Planner AI.</div>;

  return (
    <main className="container py-8">
      <h2 className="text-2xl font-bold mb-4">AI Study Planner</h2>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <aside className="col-span-1 border rounded p-4 bg-white dark:bg-gray-800 h-[80vh] overflow-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold">Conversations</div>
            <button onClick={createNew} className="px-2 py-1 rounded bg-amber-500 text-white text-sm">New</button>
          </div>

          <div className="space-y-2" ref={menuRef}>
            {conversations.map((c) => (
              <div key={c._id} className={`p-2 rounded flex justify-between items-start ${current && current._id === c._id ? 'bg-gray-100 dark:bg-gray-700' : ''}`}>
                <div onClick={() => loadConversation(c._id)} className="cursor-pointer">
                  <div className="font-medium">{c.title}</div>
                  <div className="text-xs text-gray-500">{c.updatedAt ? new Date(c.updatedAt).toLocaleString() : ''}</div>
                </div>

                {/* three-dot menu */}
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenuOpenId(prev => prev === c._id ? null : c._id); }}
                    className="px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                    aria-haspopup="true"
                    aria-expanded={menuOpenId === c._id}
                    title="More"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-gray-600 dark:text-gray-300">
                      <circle cx="12" cy="5" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </button>

                  {menuOpenId === c._id && (
                    <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-gray-800 border rounded shadow-lg z-50">
                      <button
                        onClick={() => openRenameModal(c)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => openDeleteModal(c)}
                        className="w-full text-left px-3 py-2 text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {conversations.length === 0 && <div className="text-sm text-gray-500">No saved conversations yet.</div>}
          </div>
        </aside>

        {/* Chat area */}
        <section className="col-span-3 border rounded p-4 bg-white dark:bg-gray-800 h-[80vh] flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-500 font-medium">{current?.title || 'New Study Plan'}</div>

            <div className="flex items-center gap-2">
              <button onClick={downloadMarkdown} className="px-3 py-1 border rounded text-sm">Download .md</button>
              <button onClick={downloadPDF} disabled={exporting} className="px-3 py-1 border rounded text-sm">
                {exporting ? 'Exporting...' : 'Download PDF'}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto mb-4" ref={chatScrollRef}>
            <div ref={chatContentRef} className="px-2">
              <div className="flex flex-col">
                {(current?.messages || []).map((m, i) => <ChatMessage key={i} m={m} />)}
                {loading && <TypingIndicator />}
              </div>
            </div>
          </div>

          <div className="mt-auto">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a study plan, topics, exercises, or schedules..."
              className="w-full p-3 border rounded mb-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              rows={3}
            />
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">Be polite and ask only academic questions — the assistant will refuse otherwise.</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setInput('')} type="button" className="px-3 py-2 border rounded text-sm">Clear</button>
                <button onClick={sendMessage} disabled={loading} className="px-4 py-2 bg-amber-600 text-white rounded">
                  {loading ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Modals */}
      <ConfirmModal
        open={deleteModal.open}
        title="Delete conversation"
        description={`Are you sure you want to permanently delete "${deleteModal.convo?.title || ''}"? This cannot be undone.`}
        onCancel={closeDeleteModal}
        onConfirm={confirmDeleteConversation}
        loading={deleteModal.loading}
        confirmLabel="Delete"
      />

      <RenameModal
        open={renameModal.open}
        convo={renameModal.convo}
        onCancel={closeRenameModal}
        onSave={saveRenameConversation}
        loading={renameModal.loading}
      />

      {/* Toasts (stacked) */}
      <div>
        {toasts.map(t => (
          <Toast key={t.id} id={t.id} open={true} kind={t.kind} message={t.message} onClose={removeToast} />
        ))}
      </div>

      {/* tiny animations for the typing dots */}
      <style jsx>{`
        .animate-bounce-slow { animation: bounce-slow 1s infinite ease-in-out; }
        .animation-delay-75 { animation-delay: .12s; }
        .animation-delay-150 { animation-delay: .24s; }
        @keyframes bounce-slow {
          0%, 80%, 100% { transform: translateY(0); opacity: .6; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </main>
  );
}
