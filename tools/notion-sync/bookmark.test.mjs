import test from 'node:test';
import assert from 'node:assert/strict';
import { NotionToMarkdown } from 'notion-to-md';
import { createBookmarkTransformer, metadata, publicAddress, fetchPage } from './bookmark.mjs';

const block = (url) => ({ object: 'block', id: 'bookmark', type: 'bookmark', bookmark: { url, caption: [] } });
const unavailable = async () => { throw new Error('timeout / HTTP error'); };

test('YouTube variants and existing playlist URLs embed even without metadata', async () => {
  const render = createBookmarkTransformer({ fetchMetadata: unavailable });
  for (const url of [
    'https://youtu.be/fMMtbCZzjMc?si=tracking',
    'https://www.youtube.com/watch?v=fMMtbCZzjMc',
    'https://m.youtube.com/shorts/fMMtbCZzjMc',
    'https://youtube.com/live/fMMtbCZzjMc',
    'https://www.youtube-nocookie.com/embed/fMMtbCZzjMc',
    'https://youtube.com/playlist?list=PLlvhy5_zjb8ZwwcbaR189Ydy0XcBJ3Dwn'
  ]) {
    const html = await render(block(url));
    assert.match(html, /<iframe src="https:\/\/www.youtube-nocookie.com\/embed\//);
    assert.match(html, /allowfullscreen/);
    assert.doesNotMatch(html, />bookmark</);
  }
});

test('OG/Twitter/HTML metadata, relative thumbnails, entities and injection', async () => {
  const html = '<title>Fallback</title><meta content="Video &amp; &quot;title&quot; {{ site.secret }}" property="og:title"><meta name="description" content="&lt;script&gt;bad&lt;/script&gt;"><meta property="og:image" content="/thumb.jpg"><meta property="og:video" content="https://evil.example/embed">';
  const render = createBookmarkTransformer({ fetchMetadata: async () => ({ html, url: 'https://example.com/video' }) });
  const result = await render(block('https://example.com/video'));
  assert.match(result, /class="notion-bookmark"/);
  assert.match(result, /https:\/\/example.com\/thumb.jpg/);
  assert.match(result, /Video &amp; &quot;title&quot;/);
  assert.doesNotMatch(result, /<script>|{{|<iframe|evil.example/);
  assert.equal(metadata('<title>Only title</title>', 'https://example.com').image, undefined);
  assert.equal(metadata('<meta name="twitter:title" content="Twitter">', 'https://example.com').title, 'Twitter');
});

test('failed/empty metadata and unsupported hosts fall back; unsafe schemes are not linked', async () => {
  for (const fetchMetadata of [unavailable, async () => ({ html: '<html></html>', url: 'https://example.com' })]) {
    const render = createBookmarkTransformer({ fetchMetadata });
    assert.match(await render(block('https://example.com')), /^<p><a href=/);
    assert.doesNotMatch(await render(block('https://youtube.com.evil.example/watch?v=fMMtbCZzjMc')), /iframe/);
    assert.doesNotMatch(await render(block('javascript:alert(1)')), /href=/);
  }
});

test('private, loopback and mapped addresses are denied; local requests fail', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.0.1', '::1', 'fc00::1', '::ffff:127.0.0.1']) assert.equal(publicAddress(address), false);
  assert.equal(publicAddress('8.8.8.8'), true);
  await assert.rejects(fetchPage('http://127.0.0.1'));
  await assert.rejects(fetchPage('file:///etc/passwd'));
});

test('notion-to-md custom transformer integration and per-run cache', async () => {
  let requests = 0;
  const render = createBookmarkTransformer({ fetchMetadata: async () => {
    requests++;
    return { html: '<title>Example</title>', url: 'https://example.com' };
  } });
  const converter = new NotionToMarkdown({ notionClient: {} });
  converter.setCustomTransformer('bookmark', render);
  const output = converter.toMarkdownString(await converter.blocksToMarkdown([
    block('https://example.com'), block('https://example.com')
  ])).parent;
  assert.equal(requests, 1);
  assert.equal((output.match(/class="notion-bookmark"/g) || []).length, 2);
});
