/**
 * ponytail: assert-based check for stem Activity ID renumber after delete.
 * Run: npx ts-node -r tsconfig-paths/register src/departments/hierarchy-code-renumber.check.ts
 */
import { planStemActivityCodeRenumber } from './hierarchy-code-detail.util';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// Gap under 003-001-004: …-004 then …-007 (000 header kept).
const renames = planStemActivityCodeRenumber({
  deletedCode: '003-001-004-005',
  remaining: [
    { id: 'h0', code: '003-001-004-000', sln: 15 },
    { id: 'a1', code: '003-001-004-001', sln: 16 },
    { id: 'a2', code: '003-001-004-002', sln: 17 },
    { id: 'a3', code: '003-001-004-003', sln: 18 },
    { id: 'a4', code: '003-001-004-004', sln: 19 },
    { id: 'a7', code: '003-001-004-007', sln: 22 },
    { id: 'other', code: '003-001-002-001', sln: 3 },
  ],
});

const byId = Object.fromEntries(renames.map((r) => [r.activityId, r.newCode]));
assert(!byId.h0, 'header 000 must stay');
assert(!byId.a1 && !byId.a2 && !byId.a3 && !byId.a4, '001-004 already correct');
assert(byId.a7 === '003-001-004-005', `a7 -> ${byId.a7}`);
assert(!byId.other, 'other stems untouched');

const noop = planStemActivityCodeRenumber({
  deletedCode: '003-001-004-003',
  remaining: [
    { id: 'h0', code: '003-001-004-000', sln: 1 },
    { id: 'a1', code: '003-001-004-001', sln: 2 },
    { id: 'a2', code: '003-001-004-002', sln: 3 },
  ],
});
assert(noop.length === 0, 'already contiguous should be no-op');

console.log('hierarchy-code-renumber.check: ok');
