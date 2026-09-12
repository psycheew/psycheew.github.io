# Notion bookmark rendering

Bookmark blocks use `tools/notion-sync/bookmark.mjs`. Other block transformers,
asset downloads, permalink generation and front matter fields are unchanged.
Sync version 5 causes existing version 4 posts to be regenerated on the next
Notion sync, even if their Notion modification time has not changed.

| URL | Output |
| --- | --- |
| YouTube `watch?v=`, `youtu.be/`, `shorts/`, `live/`, `embed/` with a valid video ID | Responsive 16:9 YouTube iframe and source link |
| YouTube `playlist?list=` or `embed/videoseries?list=` | Responsive playlist iframe and source link |
| Other videos and ordinary web pages with Open Graph, Twitter, or HTML title/description metadata | Preview card with available title, description, thumbnail and domain |
| HTTP(S) pages with no usable metadata, failed requests, or unsupported response types | Plain link labelled with the Notion caption or URL |
| Invalid URLs, credentials in URLs, non-HTTP(S) schemes | Escaped text without a clickable link |

Missing metadata fields are omitted; a missing title uses the caption or URL.
Arbitrary `og:video` URLs and external HTML are never used as iframe markup.
YouTube parameters follow the [official player documentation](https://developers.google.com/youtube/player_parameters).
Embedding restrictions imposed by a video owner, login requirements, or deleted
videos can still prevent playback; the source link remains available.

Metadata requests have a five-second total timeout, a 1 MiB response limit,
three redirects maximum, HTTP(S) and standard-port restrictions, and public-IP
validation with pinned DNS resolution at every hop. Failures are cached for the
current sync and fall back without failing the sync. Text and attributes are
escaped, including Liquid delimiters. Thumbnails remain remote and may be
unavailable if the source blocks hotlinking. Notion image downloads are unaffected.

Run `node --test tools/notion-sync/bookmark.test.mjs` for offline transformation,
metadata, failure, security and notion-to-md integration tests.
