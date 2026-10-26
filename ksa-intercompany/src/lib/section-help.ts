export const SECTION_HELP = {
  filters:
    'Narrow the intercompany pipeline by company, customer card, integration outcome, pipeline stage, supplier, EPL statuses, invoice dates, or free-text search. Set values then click Apply.',
  kpis:
    'Row 2: Complete, Pending, Invoicing (Phase 1 through EPL1), Transfer & GRPO (Phase 2 open past EPL1). Row 3: stuck stage cards.',
  overviewTrend:
    'Daily invoice count by invoice date (ISUZU vs Spare Parts). Hover a day to see count and SAR invoice value per company. Date range and company filter in this panel are independent from the main filters.',
  overviewCycleTime:
    'Averages use only documents that finished the full pipeline (Invoice → GRPO). Center = full cycle avg. Chips = Invoicing (INV→EPL1) and Transfer (EPL1→GRPO). Slices = sub-steps with avg > 0 days; same-day steps are omitted. Click a slice to list documents.',
  overviewOutcome:
    'Complete vs open documents by SAR value (unique invoices). Center = total value. Click Complete or Open to filter the dashboard.',
  overviewProgress:
    'Where documents sit in the pipeline — same Progress logic as Document details. Center = average progress %. Click a stage to filter.',
  overviewCompany:
    'Share of filtered documents by target company. Click a slice or legend item to filter the dashboard to that company only.',
  overviewCompanyIntegration:
    'Target company mix (ISUZU / Parts) plus integration status for the same filtered documents. Click a company slice or an integration chip to filter the dashboard.',
  overviewStuck:
    'Shows where documents are waiting in the pipeline — the first missing stage after invoice, or Complete if all stages are filled. Click a bar to filter by that stage.',
  overviewSuppliers:
    'Purchase orders grouped by PO supplier code. Click a bar to filter by supplier.',
  overviewIntegration:
    'Integration status — Completed / Initiated / None — whether intercompany posting finished between companies. Click a chip to filter; percentages are of the current filtered set.',
  pipelineFunnel:
    'How many filtered documents have reached each pipeline stage (Invoice → … → GRPO). Green ≈ nearly all, blue = mid, red = lower reach. Click a card to open the document list.',
  pipelineJourney:
    'Per-document tracker: green dots = done, blue = waiting stage. Filter by company or stage; search by invoice/doc/card. Days badge = Invoice→GRPO if complete, else Invoice→today. Click a card for full details.',
  detailsTable:
    'Line-level document list with key numbers and progress %. Click a row to open full details in a popup.',
  filterIntegrationStatus:
    'Integration status — typically Completed when the intercompany posting finished successfully between source and target company.',
  filterPipelineStage:
    'Filter by where the document is in the physical/logistics pipeline, or use presets: in transit, awaiting GRPO, or fully complete.',
  filterEpl1:
    'EPL1 (Export Packing List 1) confirmation status on the KSA side — logistics step after declaration.',
  filterEpl2:
    'EPL2 status when a second export packing list exists in the process.',
} as const;

export const INTEGRATION_STATUS_DESC: Record<string, string> = {
  Completed:
    'Intercompany integration finished — the document was posted/synced successfully between companies.',
  Pending:
    'Integration not finished yet — document is still being processed or waiting.',
  Failed:
    'Integration attempt failed — may need correction or re-posting.',
  Error:
    'Integration returned an error — check document status.',
};

export function integrationStatusDescription(status: string): string {
  return (
    INTEGRATION_STATUS_DESC[status] ??
    `Documents with integration status “${status}”.`
  );
}
