export type BpmDocParagraph = { type: 'paragraph'; text: string };

export type BpmDocBullets = { type: 'bullets'; items: string[] };

export type BpmDocTable = {
  type: 'table';
  headers: string[];
  rows: string[][];
};

export type BpmDocRaciRow = {
  stepId: string;
  stepName: string;
  r: string;
  a: string;
  c: string;
  i: string;
  notes?: string;
};

export type BpmDocRaciTable = {
  type: 'raciTable';
  rows: BpmDocRaciRow[];
};

export type BpmDocSwimlaneLane = {
  lane: string;
  cells: string[];
};

export type BpmDocSwimlaneTable = {
  type: 'swimlaneTable';
  phases: string[];
  lanes: BpmDocSwimlaneLane[];
};

export type BpmDocBlock =
  | BpmDocParagraph
  | BpmDocBullets
  | BpmDocTable
  | BpmDocRaciTable
  | BpmDocSwimlaneTable;

export type BpmDocSection = {
  heading: string;
  level?: 1 | 2 | 3;
  content: BpmDocBlock[];
};

export type BpmDocumentJson = {
  cover: {
    title: string;
    subtitle?: string;
    processFunction: string;
    processFunctionCode: string;
    processTarget: string;
    companyCode?: string;
    documentVersion?: string;
    confidentiality?: string;
  };
  sections: BpmDocSection[];
};
