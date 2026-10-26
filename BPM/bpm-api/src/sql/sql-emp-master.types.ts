export type SqlMasterRow = {
  legalEmployerName: string;
  businessUnitName: string;
  departmentName: string;
  jobName: string;
  positionName: string;
  sourceTable: 'Or_EmpMaster' | 'Or_EXEmpMaster';
};

export type SqlLegalEntitySnapshot = {
  legalEmployerName: string;
  businessUnitName: string;
  database: string;
  employeeCount: number;
  departments: Array<{ code: string; name: string }>;
  designations: string[];
};

export type SqlMasterSnapshot = {
  database: string;
  rows: SqlMasterRow[];
  error?: string;
};
