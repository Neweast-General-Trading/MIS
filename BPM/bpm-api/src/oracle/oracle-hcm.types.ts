export type OracleLegalEmployerRow = {
  OrganizationId?: number;
  LegalEntityId?: number;
  Name?: string;
  OrganizationCode?: string;
  ActiveStatus?: string;
  LegislationCode?: string;
};

export type OraclePositionRow = {
  PositionId?: number;
  BusinessUnitId?: number;
  PositionCode?: string;
  Name?: string;
  ActiveStatus?: string;
};

/** Oracle HCM Job (job role) — distinct from Position/designation. */
export type OracleJobRow = {
  JobId?: number;
  JobCode?: string;
  Name?: string;
  ActiveStatus?: string;
  SetId?: number;
};

export type OracleListResponse<T> = {
  items?: T[];
  count?: number;
  hasMore?: boolean;
  limit?: number;
  offset?: number;
};

export type OracleLegalEntityRef = {
  legalEntityId: string;
  legalEntityName: string;
  organizationCode?: string;
  businessUnitId?: string;
};

export type OracleDepartmentRow = {
  OrganizationId?: number;
  Name?: string;
  Title?: string;
  ActiveStatus?: string;
};

export type OracleDepartmentRef = {
  departmentId: string;
  departmentName: string;
};
