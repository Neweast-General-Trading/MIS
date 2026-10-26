/**
 * ponytail: smallest runnable check for policy Word helpers.
 * Run: npx ts-node --transpile-only src/ai-bpm/ai-bpm-policy-word.util.check.ts
 */
import {
  bpmActivityDeepLink,
  htmlToWordPlain,
  relatedPolicyMarkdown,
  relatedSubProcessMarkdown,
  toWordPolicyDocument,
} from './ai-bpm-policy-word.util';

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const plain = htmlToWordPlain(
  '<p>Hello <b>world</b></p><ul><li>One</li><li>Two</li></ul>',
);
assert(plain.includes('Hello world'), 'html strip lost text');
assert(plain.includes('• One'), 'html list bullets missing');

const tablePlain = htmlToWordPlain(
  '<table><tr><td><p>Age: 15 calendar days, including holidays</p></td></tr></table>',
);
assert(
  tablePlain.includes('Age: 15 calendar days, including holidays'),
  'table plain must keep commas letter-for-letter',
);
assert(!tablePlain.includes('·'), 'table must not inject · separators');

const deep = bpmActivityDeepLink('dept-1', 'proc-1', 'act-1');
assert(deep.includes('/departments/dept-1/processes/proc-1/activities-table'), 'path');
assert(deep.includes('activity=act-1'), 'query');

const spMd = relatedSubProcessMarkdown([
  {
    id: 'act-1',
    code: '001',
    activityName: 'Sample',
    processId: 'proc-1',
    departmentId: 'dept-1',
    bpmUrl: deep,
  },
]);
assert(spMd.includes('Integrated sub-process'), 'integrated SP heading');
assert(spMd.includes('001 — Sample'), 'related SP title');
assert(spMd.includes(`[001 — Sample](${deep})`), 'name + BPM deep link');

const policy = toWordPolicyDocument({
  id: 'p1',
  name: 'Governance',
  version: 2,
  companyName: 'FZCO',
  departmentName: 'IT',
  businessRole: 'Role text',
  sections: [{ title: 'Purpose', content: '<p>Body</p>' }],
});
const policyMd = relatedPolicyMarkdown([policy]);
assert(policyMd.includes(':::bpm-policy'), 'policy fence');
assert(policyMd.includes('Related Policy'), 'policy heading');
assert(policy.sections[0].contentPlain === 'Body', 'section plain text');

console.log('ai-bpm-policy-word.util.check: ok');
