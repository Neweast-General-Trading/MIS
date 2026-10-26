import hana from '@sap/hana-client';
import type { Connection } from '@sap/hana-client';

export type Lst5yrsRow = {
  Company: string;
  DocType: string;
  'Year No': number;
  'Month No': number;
  'Week No': number;
  'Document Count': number;
  'Row Lines Count'?: number;
  'Cancelled Document Count': number;
};

function connectConfig() {
  return {
    serverNode: process.env.SERVER_NODE!,
    uid: process.env.SAP_HANA_USER!,
    pwd: process.env.SAP_HANA_PASSWORD!,
    currentSchema: process.env.SAP_HANA_DATABASE!,
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

export async function callLst5yrsAllDBs(): Promise<Lst5yrsRow[]> {
  const conn = hana.createConnection();
  const spCall =
    process.env.HANA_SP_CALL ?? 'CALL "BI_NEGT".DA_Lst5yrs_AllDBs';

  return new Promise((resolve, reject) => {
    conn.connect(connectConfig(), async (err) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        const rows = await exec<Lst5yrsRow[]>(conn, spCall);
        resolve(rows ?? []);
      } catch (e) {
        reject(e);
      } finally {
        conn.disconnect();
      }
    });
  });
}
