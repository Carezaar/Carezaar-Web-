import {strict as assert} from 'node:assert';
import {requestPreview} from '../src/ui/requestPreview.ts';
const cases=[['Hi','Hi'],[' \n\t ',''],['Hi\n there   friend','Hi there friend'],['First sentence. Another sentence.','First sentence...'],['你好 👨‍👩‍👧‍👦 & <hello>','你好 👨‍👩‍👧‍👦 & <hello>'],['a'.repeat(200),'a'.repeat(80)+'...'],['👨‍👩‍👧‍👦'.repeat(81),'👨‍👩‍👧‍👦'.repeat(80)+'...']];
for(const [input,expected] of cases) assert.equal(requestPreview(input),expected);
console.log(`${cases.length} preview edge cases passed`);
