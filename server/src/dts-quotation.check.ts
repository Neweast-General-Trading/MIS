import { normalizeQuotationLine } from './dts.js';

const row = normalizeQuotationLine({
  QuotationDocNum: 215597,
  CardCode: 'C1226',
  CardName: 'New East General Trading - KSA',
  QuotationDate: '2026-09-14 00:00:00.000000000',
  ItemCode: '8-97244446-0',
  ItemDescription: 'ACTUATOR',
  Quantity: '1.000000',
  Price: '744.100000',
  LineTotal: '744.100000',
});

const ok =
  row.quotationDocNum === 215597 &&
  row.quotationDate === '2026-09-14' &&
  row.cardCode === 'C1226' &&
  row.quantity === 1 &&
  row.price === 744.1 &&
  row.lineTotal === 744.1;

if (!ok) {
  console.error(row);
  process.exit(1);
}

console.log('quotation normalize ok');
