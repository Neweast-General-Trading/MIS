import { useState } from 'react';
import type { AiMessage, DashboardFilters } from '../types';

type Props = {
  open: boolean;
  filters: DashboardFilters;
  summary: Record<string, unknown>;
  sampleRows: Record<string, unknown>[];
  onClose: () => void;
};

const AI_API =
  import.meta.env.VITE_API_BASE?.replace('/sales-order-summary', '/ai-assistant') ??
  (import.meta.env.PROD
    ? 'https://misapi.neweast.cloud/api/eorder/ai-assistant'
    : '/api/eorder/ai-assistant');

export function AiAssistantPanel({ open, filters, summary, sampleRows, onClose }: Props) {
  const [messages, setMessages] = useState<AiMessage[]>([
    {
      role: 'assistant',
      content: 'I am your smart assistant. Ask me about the loaded report results.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;

    setError(null);
    setLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setInput('');

    try {
      const res = await fetch(AI_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          fromDate: filters.fromDate,
          toDate: filters.toDate,
          filters: {
            company: filters.company !== 'all' ? filters.company : undefined,
            division: filters.division !== 'all' ? filters.division : undefined,
            salesman: filters.salesman !== 'all' ? filters.salesman : undefined,
          },
          summary,
          sampleRows,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      setMessages((prev) => [...prev, { role: 'assistant', content: json.answer }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Sorry, I could not analyze right now: ${msg}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="ai-panel" aria-label="Smart assistant">
      <div className="ai-panel-head">
        <div>
          <h2>Smart assistant</h2>
        </div>
        <button type="button" className="btn btn-sm" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="ai-messages">
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role}`}>
            <span className="ai-msg-role">{m.role === 'user' ? 'You' : 'Assistant'}</span>
            <div className="ai-msg-body">{m.content}</div>
          </div>
        ))}
        {loading && (
          <div className="ai-msg assistant">
            <span className="ai-msg-role">Assistant</span>
            <div className="ai-msg-body ai-thinking">Analyzing…</div>
          </div>
        )}
      </div>

      {error && <div className="alert-error ai-error">{error}</div>}

      <form
        className="ai-compose"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <textarea
          rows={3}
          placeholder="Ask about the current report results…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading || sampleRows.length === 0}
        />
        <button type="submit" className="btn btn-primary" disabled={loading || !input.trim() || sampleRows.length === 0}>
          Send
        </button>
      </form>
    </aside>
  );
}
