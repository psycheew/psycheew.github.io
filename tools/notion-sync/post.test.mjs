import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import matter from 'gray-matter';
import { serializePost, SYNC_VERSION } from './post.mjs';

const titles = [
  '[Django] {% extends %}가 동작하지 않는 이유 — {# #}와 {% comment %} 주석 차이',
  '{{ variable }}',
  '{% include "header.html" %}',
  '{% raw %}',
  '{% endraw %}',
  '{%- comment -%}',
  '{# Django comment #}',
  'Normal title: "quotes", 한글 & <text>',
];
const cases = titles.map((title) => ({
  title,
  body: `${title}\n\nInline: \`${title}\`\n\n\`\`\`plaintext\n${title}\n\`\`\`\n`,
}));

for (const { title, body } of cases) {
  test(`preserves literal title and body: ${title}`, () => {
    const metadata = { title, tags: ['Django'], notion_sync_version: 5 };
    const output = serializePost(body, metadata);
    const parsed = matter(output);
    assert.equal(parsed.data.title, title);
    assert.equal(parsed.content, body);
    assert.equal(parsed.data.render_with_liquid, false);
    assert.equal(parsed.data.notion_sync_version, SYNC_VERSION);
    assert.deepEqual(parsed.data.tags, metadata.tags);
    assert.equal(metadata.notion_sync_version, 5);
    assert.equal(serializePost(parsed.content, parsed.data), output);
  });
}

test('regenerates the existing Django post without changing title, body or SEO metadata', () => {
  const file = new URL('../../_posts/2025-10-08-django-template.md', import.meta.url);
  const original = matter(fs.readFileSync(file, 'utf8'));
  const regenerated = matter(serializePost(original.content, original.data));
  assert.equal(regenerated.data.title, titles[0]);
  assert.equal(regenerated.content, original.content);
  assert.deepEqual(regenerated.data, {
    ...original.data, render_with_liquid: false, notion_sync_version: SYNC_VERSION,
  });
});

test('literal excerpts retain reference links, CRLF and explicit overrides', () => {
  const body = '{% raw %} [link][ref]\r\n\r\nRest\r\n\r\n[ref]: https://example.com\r\n[unused]: /other';
  const result = matter(serializePost(body, { title: 'Example' }));
  assert.equal(result.data.excerpt, '{% raw %} [link][ref]\n\n[ref]: https://example.com');
  assert.equal(result.content, body + '\n');
  assert.equal(matter(serializePost(body, { excerpt: 'Custom' })).data.excerpt, 'Custom');
  assert.equal(matter(serializePost('Normal\n\n{% raw %}', {})).data.excerpt, undefined);
});

test('real Jekyll renders literal titles, SEO, excerpts and code', {
  skip: process.env.NOTION_JEKYLL_TEST !== '1',
}, () => {
  const result = spawnSync('ruby', ['-S', 'bundle', 'exec', 'ruby',
    'tools/notion-sync/render.test.rb'], {
    input: JSON.stringify(cases.map(({ title, body }) => ({
      title, markdown: serializePost(body, { title, layout: 'post' }),
    }))),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
});
