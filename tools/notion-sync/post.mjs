import matter from 'gray-matter';

export const SYNC_VERSION = 6;

// Notion content is literal Markdown, not executable Liquid. YAML titles are
// data and must stay unchanged (including braces) for headings and SEO output.
// Disabling the document's Liquid pass also protects inline/fenced code and
// standalone raw/endraw tags without wrappers or HTML entity double escaping.
export function serializePost(body, frontmatter) {
  // Jekyll 4.x auto-closes Liquid blocks in automatic excerpts even when
  // render_with_liquid is false. Supply a literal excerpt in that case.
  const separator = frontmatter.excerpt_separator ?? '\n\n';
  const normalized = body.replace(/\r\n/g, '\n');
  const boundary = separator ? normalized.indexOf(separator) : -1;
  const head = boundary < 0 ? normalized : normalized.slice(0, boundary);
  const excerpt = {};
  if (frontmatter.excerpt == null && head.includes('{%')) {
    const tail = boundary < 0 ? '' : normalized.slice(boundary + separator.length);
    const references = (tail.match(/^ {0,3}\[[^\]]+\]:.+$/gm) || [])
      .filter((line) => head.includes(line.trimStart().split(']:')[0] + ']'));
    excerpt.excerpt = head + (references.length ? `\n\n${references.join('\n')}` : '');
  }
  return matter.stringify(body, {
    ...frontmatter,
    ...excerpt,
    render_with_liquid: false,
    notion_sync_version: SYNC_VERSION,
  });
}
