# Notion 게시물의 Liquid 처리

Notion의 `Title.title[].plain_text`를 합친 제목은 `gray-matter`로 YAML에
직렬화한다. YAML front matter는 Liquid로 실행되지 않으며 레이아웃의
`{{ page.title }}` 출력도 제목 문자열을 다시 파싱하지 않는다.
제목에 HTML 엔티티나 raw 래퍼를 추가하면 오히려 SEO 출력이 달라질 수 있다.

실제 오류 원인은 본문이다. Markdown 코드 펜스와 백틱은 Markdown 변환보다
먼저 실행되는 Liquid 파서를 막지 못한다. Django 예제의 단독 comment 태그도
Liquid 블록으로 해석된다.

`tools/notion-sync/post.mjs`는 Notion 문서에 `render_with_liquid: false`를
설정한다. 본문·코드·이미지 캡션을 문자 그대로 보존하며 Chirpy 레이아웃의
Liquid는 계속 동작한다. Notion 본문에 작성한 include/raw 태그도 예제로
표시되고 실행되지 않는다. 북마크의 기존 HTML escape는 그대로 유지한다.

Jekyll 4.x는 자동 발췌문에 닫는 Liquid 태그를 덧붙일 수 있다. 첫 문단에
태그 구분자가 있으면 참조 링크 정의를 포함한 명시적 excerpt를 생성해 이를
방지한다. 일반 게시물과 명시적으로 지정된 excerpt는 변경하지 않는다.

동기화 버전 6으로 이전 버전 게시물은 Notion 수정 시각이 같아도 재생성된다.
보호 설정이 빠진 버전 6 게시물도 재생성한다.

검증 (프로젝트 의존성이 설치된 Ruby 3.x / Node 환경):

```sh
node --test tools/notion-sync/*.test.mjs
NOTION_JEKYLL_TEST=1 node --test tools/notion-sync/*.test.mjs
bundle exec jekyll build
```

두 번째 명령은 실제 Jekyll과 SEO 플러그인으로 제목, 코드, 발췌문, OG 및
JSON-LD를 확인하고 제목만으로는 오류가 나지 않는 대조군도 검사한다.
Windows PowerShell에서는 `$env:NOTION_JEKYLL_TEST = '1'`을 먼저 설정한다.

관련 Jekyll 문서:
- https://jekyllrb.com/tutorials/orderofinterpretation/
- https://jekyllrb.com/docs/liquid/tags/
