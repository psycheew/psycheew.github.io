---
title: '[Django] {% extends %}가 동작하지 않는 이유 — {# #}와 {% comment %} 주석 차이'
date: '2025-10-08 00:00:00 +0900'
permalink: /posts/django-template/
categories:
  - "\U0001D5EA\U0001D5F5\U0001D5EE\U0001D601 \U0001D5DC \U0001D5DF\U0001D5F2\U0001D5EE\U0001D5FF\U0001D5FB\U0001D5F2\U0001D5F1"
tags:
  - Django
  - HTML
  - Troubleshooting
notion_id: 3d90b704-6937-8095-86b6-ca8a3d5ea7bc
notion_last_edited: '2026-09-12T12:06:00.000Z'
notion_asset_dir: assets/img/posts/django-template
notion_sync_version: 5
---

<br>


VSCode에서 HTML 파일을 작업할 때 `Ctrl + /`를 누르면 Django 템플릿 환경에서는 설정이나 확장 프로그램에 따라 다음과 같은 형태의 주석이 삽입될 수 있습니다.


```plaintext
{% comment %}
주석 내용
{% endcomment %}
```


Django 템플릿에는 이외에도 `{# #}`와 HTML 주석인 `<!-- -->`을 사용할 수 있습니다.


비슷해 보이지만 각각의 동작 방식에는 차이가 있습니다.


<br>


## ❓ Django 템플릿의 주석 방식


Django 템플릿에서는 크게 다음 세 가지 방식으로 주석을 작성할 수 있습니다.


| 주석 방식                                | 여러 줄 사용 | Django 템플릿에서 처리 | 최종 HTML에 남음 |
| ------------------------------------ | ------- | --------------- | ----------- |
| `{# ... #}`                          | ❌       | ✅               | ❌           |
| `{% comment %} ... {% endcomment %}` | ✅       | ✅               | ❌           |
| `<!-- ... -->`                       | ✅       | ❌               | ✅           |


<br>


### 1. `{# ... #}`


```plaintext
{# CSS 파일 불러오기 #}
<link rel="stylesheet" href="...">
```


`{# ... #}`는 Django 템플릿에서 제공하는 **한 줄 주석 문법**입니다.


템플릿을 렌더링하는 과정에서 처리되기 때문에 최종 HTML에는 주석 내용이 남지 않습니다.


간단한 메모나 특정 코드에 대한 설명을 남길 때 사용하기 좋습니다.


<br>


### 2. `{% comment %} ... {% endcomment %}`


```plaintext
{% comment %}
이 영역은 렌더링되지 않습니다.
여러 줄의 내용을 주석으로 작성할 수 있습니다.
{% endcomment %}
```


`{% comment %}` 역시 Django에서 제공하는 템플릿 태그입니다.


`{# ... #}`와 달리 여러 줄을 한 번에 주석 처리할 수 있다는 장점이 있습니다.


<br>


### 3. `<!-- ... -->`


```html
<!-- CSS 파일 불러오기 -->
<link rel="stylesheet" href="...">
```


HTML 주석은 Django가 제거하는 주석이 아닙니다.


따라서 렌더링된 HTML에도 그대로 남아 브라우저의 개발자 도구나 페이지 소스에서 확인할 수 있습니다.


**HTML 주석 안에 Django 템플릿 문법을 넣는다고 해서 해당 문법의 실행까지 막아주는 것은 아닙니다.**


<br>


```plaintext
<!-- {% include "header.html" %} -->
```


겉으로는 주석처럼 보이지만 Django 템플릿 엔진은 HTML 주석을 별도로 인식하지 않기 때문에 내부의 템플릿 태그를 처리할 수 있습니다.


Django 템플릿 코드 자체를 비활성화하고 싶다면 HTML 주석 대신 `{# ... #}` 또는 `{% comment %}`를 사용하는 것이 안전합니다.


<br>


## 💡 `{% extends %}`를 사용할 때는?


```plaintext
{% extends "base.html" %}
```


Django에서 템플릿 상속을 사용할 경우 `{% extends %}`는 해당 템플릿의 **첫 번째 템플릿 태그**여야 합니다.


여기서 중요한 점은 단순히 파일의 물리적인 첫 줄이어야 한다는 의미와는 조금 다르다는 것입니다.


예를 들어 Django가 템플릿 태그로 취급하지 않는 내용과 `{% extends %}`의 관계, 또는 사용 중인 Django 버전과 템플릿 구조에 따라 동작을 정확히 구분할 필요가 있습니다.


<br>


따라서 단순히 ‘`{% comment %}`가 `{% extends %}`보다 위에 있으면 무조건 오류가 발생한다.’라고 이해하기보다는, **`{% extends %}`** **앞에 다른 템플릿 태그를 두지 않는 것**을 기본 원칙으로 기억하는 편이 정확합니다.


```plaintext
{% extends "base.html" %}

{% block content %}
...
{% endblock %}
```


간단한 코드 설명을 남길 때는 `{# ... #}`를 사용하면 편리합니다.


<br>


## 🌱 정리


간단한 한 줄 메모라면


```plaintext
{# 주석 내용 #}
```


<br>


여러 줄을 주석 처리해야 한다면


```plaintext
{% comment %}
주석 내용
{% endcomment %}
```


<br>


최종 HTML에도 주석을 남기고 싶다면


```html
<!-- 주석 내용 -->
```


<br>


**Django 템플릿 문법을 비활성화하려는 목적이라면 HTML 주석이 아니라 Django의 주석 문법을 사용해야 한다는 점**을 기억해 두면 좋습니다.

