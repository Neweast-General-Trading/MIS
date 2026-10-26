import { useState } from 'react';

const STORAGE_KEY = 'mis_report_viewer';

export type ViewerIdentity = {
  userId: string;
  userName: string;
  userEmail: string;
};

export function loadViewer(): ViewerIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ViewerIdentity;
  } catch {
    return null;
  }
}

export function saveViewer(v: ViewerIdentity) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
}

export default function ViewerIdentifyModal({
  onDone,
}: {
  onDone: (viewer: ViewerIdentity) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() && !email.trim()) return;
    const viewer: ViewerIdentity = {
      userId: userId.trim() || email.trim(),
      userName: name.trim() || email.trim(),
      userEmail: email.trim(),
    };
    saveViewer(viewer);
    onDone(viewer);
  };

  return (
    <div className="viewer-overlay">
      <form className="viewer-modal" onSubmit={submit}>
        <h2>Identify yourself</h2>
        <p className="meta">Your name is recorded when you open this report (view tracking).</p>
        <label>
          Full name
          <input className="filter-input" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Email
          <input className="filter-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          User ID (optional)
          <input className="filter-input" value={userId} onChange={(e) => setUserId(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
          Continue to dashboard
        </button>
      </form>
    </div>
  );
}
