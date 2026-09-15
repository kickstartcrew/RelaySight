import test from 'node:test';
import assert from 'node:assert/strict';
import { measureTextWrap } from '@evenrealities/pretext';
import { G2_TEXT_LINE_HEIGHT, GLASSES_BODY_INNER_HEIGHT, GLASSES_BODY_INNER_WIDTH } from '../src/glasses-layout';
import { paginateForGlasses, plainTextForGlasses } from '../src/pagination';

test('paginates replies against the G2 firmware font and full-height body', () => {
  const pages = paginateForGlasses('one two three four five six seven eight nine ten eleven twelve '.repeat(12));
  assert.ok(pages.length > 1);
  for (const page of pages) {
    const content = page.lines.join('\n');
    assert.ok(measureTextWrap(content, GLASSES_BODY_INNER_WIDTH).height <= GLASSES_BODY_INNER_HEIGHT);
    assert.equal(page.total, pages.length);
  }
  assert.equal(Math.floor(GLASSES_BODY_INNER_HEIGHT / G2_TEXT_LINE_HEIGHT), 8);
});

test('preserves paragraph breaks and removes common Markdown noise', () => {
  const cleaned = plainTextForGlasses('## Answer\n\n**Use** [your agent](https://example.com).');
  assert.equal(cleaned, 'Answer\n\nUse your agent.');
  assert.deepEqual(paginateForGlasses(cleaned)[0]?.lines, [
    'Answer',
    '',
    'Use your agent.',
  ]);
});

test('does not split surrogate pairs while breaking oversized text', () => {
  const pages = paginateForGlasses('😀'.repeat(500));
  assert.equal(pages.map((page) => page.lines.join('\n')).join(''), '😀'.repeat(500));
});

test('conversation overflow keeps the newest pages available on glasses', () => {
  const pages = paginateForGlasses('old\n' + 'middle '.repeat(30) + '\nnewest answer', {
    width: 120,
    height: G2_TEXT_LINE_HEIGHT * 2,
    maxPages: 2,
    overflowDirection: 'end',
  });
  const visible = pages.flatMap((page) => page.lines).join('\n');
  assert.match(visible, /Earlier/);
  assert.match(visible, /newest/);
  assert.doesNotMatch(visible, /^old$/m);
});
