import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { Parser } from 'htmlparser2';

const escape = (value) => String(value).replace(/[&<>"'{}]/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;', '{': '&#123;', '}': '&#125;' })[char]);

function webUrl(value, base) {
  try {
    const url = new URL(value, base);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch { return null; }
}

export function publicAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; }
  catch { return false; }
}

// Pin DNS results to the connection; validate every redirect, too.
export async function fetchPage(value, { signal = AbortSignal.timeout(5000), redirects = 0 } = {}) {
  const url = webUrl(value);
  if (!url || redirects > 3 || (url.port && !['80', '443'].includes(url.port))) throw new Error('Unsupported URL');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await Promise.race([
    lookup(hostname, { all: true }),
    new Promise((_, reject) => {
      if (signal.aborted) reject(new Error('Metadata timeout'));
      else signal.addEventListener('abort', () => reject(new Error('Metadata timeout')), { once: true });
    })
  ]);
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) throw new Error('Non-public address');
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      signal,
      headers: { 'User-Agent': 'NotionBookmarkPreview/1.0', Accept: 'text/html' },
      lookup: (_host, options, callback) => options.all
        ? callback(null, addresses)
        : callback(null, addresses[0].address, addresses[0].family)
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        resolve(fetchPage(webUrl(response.headers.location, url)?.href, { signal, redirects: redirects + 1 }));
        return;
      }
      if (response.statusCode !== 200 || !/text\/html|application\/xhtml\+xml/i.test(response.headers['content-type'] || '')) {
        response.resume();
        reject(new Error('No HTML metadata'));
        return;
      }
      let size = 0;
      const chunks = [];
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > 1024 * 1024) response.destroy(new Error('Metadata too large'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8'), url: url.href }));
    });
    request.on('error', reject);
  });
}

export function metadata(html, base) {
  const fields = {};
  let inTitle = false;
  let title = '';
  const parser = new Parser({
    onopentag(name, attributes) {
      if (name === 'title') inTitle = true;
      if (name === 'meta') {
        const key = (attributes.property || attributes.name || '').toLowerCase();
        if (!fields[key]) fields[key] = attributes.content;
      }
    },
    ontext(text) { if (inTitle) title += text; },
    onclosetag(name) { if (name === 'title') inTitle = false; }
  }, { decodeEntities: true });
  parser.end(html);
  const clean = (text, limit) => (text || '').replace(/\s+/g, ' ').trim().slice(0, limit);
  return {
    title: clean(fields['og:title'] || fields['twitter:title'] || title, 300),
    description: clean(fields['og:description'] || fields['twitter:description'] || fields.description, 500),
    image: (fields['og:image'] || fields['twitter:image'])
      ? webUrl(fields['og:image'] || fields['twitter:image'], base)?.href : undefined
  };
}

export function videoEmbed(url) {
  const host = url.hostname;
  if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com'].includes(host)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const id = host === 'youtu.be' ? parts[0]
    : parts[0] === 'watch' ? url.searchParams.get('v')
      : ['shorts', 'live', 'embed'].includes(parts[0]) ? parts[1] : null;
  const list = url.searchParams.get('list');
  const validList = list && /^[\w-]{10,100}$/.test(list);
  let embed;
  if (/^[\w-]{11}$/.test(id || '')) embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
  else if (['playlist', 'embed'].includes(parts[0]) && validList) embed = new URL('https://www.youtube-nocookie.com/embed/videoseries');
  else return null;
  if (validList) embed.searchParams.set('list', list);
  const time = url.searchParams.get('start') || url.searchParams.get('t');
  if (/^\d+$/.test(time || '')) embed.searchParams.set('start', time);
  return embed.href;
}

export function createBookmarkTransformer({ fetchMetadata = fetchPage } = {}) {
  const cache = new Map();
  return async (block) => {
    const raw = block.bookmark?.url || '';
    const url = webUrl(raw);
    const caption = (block.bookmark?.caption || []).map((item) => item.plain_text || item.text?.content || '').join('');
    if (!url) return `<p>${escape(caption || raw || 'Invalid URL')}</p>`;
    if (!cache.has(url.href)) {
      cache.set(url.href, Promise.resolve().then(() => fetchMetadata(url.href))
        .then((page) => metadata(page.html, page.url)).catch(() => ({})));
    }
    const data = await cache.get(url.href);
    const title = escape(data.title || caption || url.href);
    const href = escape(url.href);
    const link = `<a href="${href}" rel="noopener noreferrer">${title}</a>`;
    const embed = videoEmbed(url);
    if (embed) return `<div class="notion-video"><iframe src="${escape(embed)}" title="${title}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>\n<p class="notion-bookmark-source">${link}</p>`;
    if (!data.title && !data.description && !data.image) return `<p>${link}</p>`;
    // Separate image and text anchors avoid nested anchors in Chirpy's image refactor.
    const thumbnail = data.image ? `<a href="${href}" rel="noopener noreferrer"><img class="notion-bookmark-image" src="${escape(data.image)}" alt="" referrerpolicy="no-referrer"></a>` : '';
    return `<div class="notion-bookmark">${thumbnail}<a class="notion-bookmark-body" href="${href}" rel="noopener noreferrer"><strong>${title}</strong>${data.description ? `<span class="notion-bookmark-description">${escape(data.description)}</span>` : ''}<span class="notion-bookmark-domain">${escape(url.hostname)}</span></a></div>`;
  };
}
