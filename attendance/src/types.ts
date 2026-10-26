export type PayrollDatabase = {
  id: string;
  label: string;
  country: string;
};

export type AttDiscrepancyRow = {
  SLNo: number;
  HRM_EmpId: string;
  Pr_AttDate: string;
  Pr_Year: number;
  Pr_Month: number;
  Pr_EmpCategory: string;
  Pr_AttOrgTimeIn: string;
  Pr_AttOrgTimeOut: string;
  Pr_AttOrgWorkHrs: number;
  Pr_AttOrgWorkMin: number;
  Pr_AttOrgWorkSec: number;
  Pr_AttTimeIn: string;
  Pr_AttTimeout: string;
  Pr_AttNorHours: number;
  Pr_AttOtHours: number;
  Pr_ExtraOtHours: number;
  Pr_WOOtHours: number;
  Pr_WOExtraOtHours: number;
  Pr_PHOtHours: number;
  Pr_PHExtraOtHours: number;
  Pr_OTEligible: string;
  Verified: string | null;
  Comments: string;
};

export type ApiResponse = {
  cachedAt: string;
  database: string;
  databaseLabel: string;
  country: string;
  year: number;
  month: number;
  rowCount: number;
  rows: AttDiscrepancyRow[];
};
