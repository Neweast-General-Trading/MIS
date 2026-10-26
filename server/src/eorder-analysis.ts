import hana from '@sap/hana-client';
import type { Connection } from '@sap/hana-client';

export const EORDER_SCHEMAS = [
  { id: 'BI_NEGT', label: 'NEGT (Default)' },
  { id: 'BI_NEGTLLC', label: 'NEGT LLC' },
  { id: 'BI_NEGT_KSA', label: 'NEGT KSA' },
  { id: 'BI_NEGT_OMAN', label: 'NEGT Oman' },
  { id: 'BI_NEGT_KW', label: 'NEGT Kuwait' },
  { id: 'BI_NEGT_BAHRAIN', label: 'NEGT Bahrain' },
  { id: 'BI_NESA', label: 'NESA' },
] as const;

export type SalesOrderSummaryRow = {
  Company: string;
  Division: string;
  SlpName: string;
  Customers: number;
  Orders: number;
  SOAmount: string | number;
  Deliveries: number;
  DNAmount: string | number;
  Invoices: number;
  INVAmount: string | number;
};

function connectConfig(schema: string) {
  return {
    serverNode: process.env.SERVER_NODE!,
    uid: process.env.SAP_HANA_USER!,
    pwd: process.env.SAP_HANA_PASSWORD!,
    currentSchema: schema,
    pooling: true,
    connectionLifetime: 1800,
  };
}

function exec<T>(conn: Connection, sql: string): Promise<T> {
  return new Promise((resolve, reject) => {
    conn.exec(sql, [], (err, result) => {
      if (err) reject(err);
      else resolve(result as T);
    });
  });
}

export function normalizeDateInput(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Date is required');
  }
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function escapeSqlDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid SQL date: ${date}`);
  }
  return `'${date}'`;
}

export function isValidEorderSchema(schema: string): boolean {
  return EORDER_SCHEMAS.some((s) => s.id === schema);
}

export async function callSalesOrderSummary(
  fromDate: string,
  toDate: string,
  schema = 'BI_NEGT',
): Promise<SalesOrderSummaryRow[]> {
  if (!isValidEorderSchema(schema)) {
    throw new Error(`Unsupported schema: ${schema}`);
  }
  if (fromDate > toDate) {
    throw new Error('fromDate must be on or before toDate');
  }

  const conn = hana.createConnection();
  const sql = `CALL BI_EOA_3(${escapeSqlDate(fromDate)}, ${escapeSqlDate(toDate)})`;

  return new Promise((resolve, reject) => {
    conn.connect(connectConfig(schema), async (err) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        const rows = await exec<SalesOrderSummaryRow[]>(conn, sql);
        resolve(rows ?? []);
      } catch (e) {
        reject(e);
      } finally {
        conn.disconnect();
      }
    });
  });
}

export type AiAnalyzePayload = {
  question: string;
  report: 'sales-order-summary';
  fromDate: string;
  toDate: string;
  filters?: {
    company?: string;
    division?: string;
    salesman?: string;
  };
  summary: Record<string, unknown>;
  sampleRows: Record<string, unknown>[];
};

export async function analyzeWithClaude(payload: AiAnalyzePayload): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('AI assistant is not configured (ANTHROPIC_API_KEY missing)');
  }

  const systemPrompt = `You are a senior sales analytics assistant for NEWEAST eOrder / SAP B1 reports.
Analyze the provided Sales Order Summary data (sales orders, deliveries, invoices, conversion rates).
Be concise, use bullet points when helpful, cite specific salesperson or company names from the data.
Amounts are in local currency. Conversion rate = Invoice Amount / Sales Order Amount.
Answer in the same language as the user's question (Arabic or English).`;

  const userContent = JSON.stringify(
    {
      report: payload.report,
      period: { from: payload.fromDate, to: payload.toDate },
      activeFilters: payload.filters ?? {},
      aggregateSummary: payload.summary,
      detailRowsSample: payload.sampleRows.slice(0, 80),
      userQuestion: payload.question,
    },
    null,
    2,
  );

  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errText.slice(0, 300)}`);
  }

  const json = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const text = json.content?.find((c) => c.type === 'text')?.text?.trim();
  if (!text) {
    throw new Error('Empty response from AI assistant');
  }
  return text;
}
