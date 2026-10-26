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

export type ApiResponse = {
  cachedAt: string | null;
  rowCount: number;
  rows: Lst5yrsRow[];
  employeeFilter?: string | null;
  employeeCompanies?: string[];
  message?: string;
};
