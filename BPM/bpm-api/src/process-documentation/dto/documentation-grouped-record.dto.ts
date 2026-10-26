import type { ProcessDocumentationSource } from '../entities/process-documentation-file.entity';

export type DocumentationFileDto = {
  id: string;
  departmentId: string | null;
  processId: string | null;
  source: ProcessDocumentationSource;
  processFunctionCode: string | null;
  processCode: string | null;
  comments: string | null;
  originalName: string;
  mimeType: string | null;
  fileSize: number;
  uploadedByEmail: string;
  uploadedByName: string;
  createdAt: string;
};

export type DocumentationGroupedRecordDto = {
  scopeKey: string;
  departmentId: string;
  processId: string | null;
  processFunctionCode: string | null;
  processCode: string | null;
  automationFiles: DocumentationFileDto[];
  uploadFiles: DocumentationFileDto[];
  /** Primary row used for scope-level comments (automation file first). */
  commentTargetId: string | null;
  comments: string | null;
};
