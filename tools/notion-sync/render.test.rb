# frozen_string_literal: true

require "jekyll"
require "jekyll-seo-tag"
require "nokogiri"
require "tmpdir"
require "json"
require "cgi"

cases = JSON.parse($stdin.read)
Dir.mktmpdir("notion-liquid-") do |root|
  FileUtils.mkdir_p("#{root}/_posts")
  FileUtils.mkdir_p("#{root}/_layouts")
  File.write("#{root}/_layouts/post.html", '<html><head>{% seo %}</head><body><h1>{{ page.title | escape }}</h1>{{ content }}</body></html>')
  cases.each_with_index do |entry, index|
    File.write("#{root}/_posts/2025-01-01-case-#{index}.md", entry.fetch("markdown"))
  end
  site = Jekyll::Site.new(Jekyll.configuration(
    "source" => root, "destination" => "#{root}/_site", "title" => "Fixture blog",
    "url" => "https://example.com", "timezone" => "Asia/Seoul", "quiet" => true
  ))
  site.process
  site.posts.docs.each do |post|
    index = post.basename_without_ext[/case-(\d+)/, 1].to_i
    title = cases.fetch(index).fetch("title")
    html = Nokogiri::HTML(post.output)
    raise "Heading changed: #{title}" unless html.at_css("h1").text == title
    raise "Code changed: #{title}" unless html.at_css("pre code").text.strip == title
    converter = site.find_converter_instance(Jekyll::Converters::Markdown)
    excerpt_html = post.excerpt.is_a?(String) ? converter.convert(post.excerpt) : post.excerpt.output
    excerpt = Nokogiri::HTML.fragment(excerpt_html).text
    expected = Nokogiri::HTML.fragment(converter.convert(title)).text.strip
    raise "Excerpt changed: #{title}: #{excerpt}" unless excerpt.strip == expected
    # SEO already applies Markdown typography (e.g. smart quotes); preserve it.
    raise "SEO changed" unless html.at_css('meta[property="og:title"]')["content"] == expected
    raise "Page title changed" unless html.at_css("title").text.start_with?(expected)
    seo = JSON.parse(html.at_css('script[type="application/ld+json"]').text)
    raise "JSON-LD changed: #{title}: #{seo['headline']}" unless CGI.unescapeHTML(seo["headline"]) == expected
  end

  # A dangerous title alone is YAML data; the same literal in the body fails.
  post = site.posts.docs.first
  post.data["title"] = "{% comment %}"
  post.data["render_with_liquid"] = true
  post.content = "Ordinary body"
  Jekyll::Renderer.new(site, post).run
  post.content = "Inline: `{% comment %}`"
  begin
    Jekyll::Renderer.new(site, post).run
    raise "Expected the unprotected body to fail"
  rescue Liquid::SyntaxError => error
    raise unless error.message.include?("comment")
  end
end
puts "Jekyll title/body/SEO regression checks passed"
