import { useState, type FormEvent } from 'react';
import { ResultsPanels } from './ResultsPanels';
import type { Ne02Response } from './types';
import './index.css';

const API =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.PROD
    ? 'https://misapi.neweast.cloud/api/ne02-approval'
    : '/api/ne02-approval');

export default function App() {
  const [quotationDocNum, setQuotationDocNum] = useState('');
  const [cardCode, setCardCode] = useState('');
  const [itemCodesText, setItemCodesText] = useState('');
  const [data, setData] = useState<Ne02Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(e?: FormEvent) {
    e?.preventDefault();
    const sq = quotationDocNum.trim();
    const code = cardCode.trim();
    if (!sq && !code) {
      setError('Enter a quotation DocNum and/or a customer card code.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = new URL(API, window.location.origin);
      if (sq) url.searchParams.set('quotationDocNum', sq);
      if (code) url.searchParams.set('cardCode', code);
      const items = itemCodesText.trim();
      if (items) url.searchParams.set('itemCodes', items.replace(/\n+/g, ','));
      const res = await fetch(url.toString());
      const json = (await res.json()) as Ne02Response & { error?: string };
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setData(json);
      if (!code && json.cardCode) setCardCode(json.cardCode);
      if (!items && json.itemCodes?.length) setItemCodesText(json.itemCodes.join('\n'));
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <div className="app-bg" aria-hidden />

      <header className="top-bar">
        <div className="brand-block">
          <img src="/logo.png" alt="NEWEAST" className="logo" />
          <div>
            <p className="eyebrow">MIS · Sales approval pack</p>
            <h1>NE02 Approval Requirements</h1>
          </div>
        </div>
        <p className="top-note">
          Start from a sales quotation, then review brand history, financial standing, item evaluation,
          backorders, and aged allocated stock.
        </p>
      </header>

      <form className="filters panel" onSubmit={load}>
        <div className="field">
          <label htmlFor="quotationDocNum">Quotation DocNum</label>
          <input
            id="quotationDocNum"
            value={quotationDocNum}
            onChange={(e) => setQuotationDocNum(e.target.value)}
            placeholder="e.g. 215597"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label htmlFor="cardCode">Customer card</label>
          <input
            id="cardCode"
            value={cardCode}
            onChange={(e) => setCardCode(e.target.value)}
            placeholder="Auto from SQ, or e.g. C0001"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="field field-grow">
          <label htmlFor="itemCodes">SQ item codes</label>
          <textarea
            id="itemCodes"
            value={itemCodesText}
            onChange={(e) => setItemCodesText(e.target.value)}
            placeholder="Leave blank to use items from quotation"
            rows={2}
            spellCheck={false}
          />
        </div>
        <div className="field field-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Loading…' : 'Run approval pack'}
          </button>
        </div>
      </form>

      {error ? <div className="banner banner-error">{error}</div> : null}

      {!data && !loading && !error ? (
        <div className="welcome panel">
          <h2>Ready when you are</h2>
          <p>
            Enter a quotation DocNum (fills customer + items automatically), or enter customer card and
            item codes manually. Example: quotation <strong>215597</strong>.
          </p>
        </div>
      ) : null}

      {loading ? (
        <div className="loading panel">
          <div className="loader-ring" />
          <p>Pulling approval data from SAP HANA…</p>
        </div>
      ) : null}

      {data && !loading ? <ResultsPanels data={data} /> : null}

      <footer className="footer">NEWEAST · MIS · NE02 Approval Requirements</footer>
    </div>
  );
}
