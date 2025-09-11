export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export async function postJSON(path, data){
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
  return res.json();
}
