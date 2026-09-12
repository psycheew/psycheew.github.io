---
title: '[Git] commit 작성자 정보 변경하기 — 이름, 이메일'
date: '2025-11-17 00:00:00 +0900'
permalink: /posts/git-change-author/
categories:
  - "\U0001D5EA\U0001D5F5\U0001D5EE\U0001D601 \U0001D5DC \U0001D5DF\U0001D5F2\U0001D5EE\U0001D5FF\U0001D5FB\U0001D5F2\U0001D5F1"
tags:
  - Git
  - GitHub
  - Troubleshooting
notion_id: 3d90b704-6937-803d-8afc-ed3289d6b49f
notion_last_edited: '2026-09-12T12:21:00.000Z'
notion_asset_dir: assets/img/posts/git-change-author
notion_sync_version: 5
---

PR을 준비하던 중 commit 작성자 정보(`user.name`, `user.email`)가 제대로 설정되지 않아 기본값인 `user`로 기록된 것을 발견했습니다.


여러 환경에서 작업하다 보면 저처럼 Git config 설정이 누락되는 경우가 있을 텐데요.


이미 생성한 commit의 작성자 정보를 수정하는 방법을 정리해 봅니다.


<br>

> ⚠️ 아래 방법은 commit history를 다시 작성하는 **rebase와 force push**를 사용합니다. 이미 다른 사람과 공유하고 있는 브랜치라면 주의가 필요합니다.

<br>


## 1️⃣ 사용자 정보 설정


먼저 같은 문제가 다시 발생하지 않도록 앞으로 생성할 commit에 사용할 사용자 정보를 설정합니다.


```bash
git config --global user.name "본인 이름"
git config --global user.email "이메일 주소"
```


설정된 값은 다음 명령어로 확인할 수 있습니다.


```bash
git config --global user.name
git config --global user.email
```


GitHub에서 commit을 자신의 계정과 연결하여 표시하려면 GitHub 계정에 등록된 이메일 주소를 사용하는 것이 좋습니다.


<br>


## 2️⃣ 수정할 commit이 있는 브랜치로 이동


먼저 현재 브랜치를 확인합니다.


```bash
git branch
```


현재 위치한 브랜치 앞에는 `*`가 표시됩니다.


다른 브랜치에 있다면 수정할 commit이 존재하는 브랜치로 이동합니다.


```bash
git switch branch-name
```


`git checkout branch-name`을 사용해도 되지만, 브랜치 이동만을 목적으로 한다면 `git switch`를 사용할 수 있습니다.


<br>


## 3️⃣ 수정할 commit 확인


최근 commit 목록을 확인합니다.


```bash
git log -N --oneline
```


여기서 `N`에는 확인하고 싶은 commit 개수를 입력합니다.


예를 들어 최근 5개의 commit을 확인하려면 다음과 같이 입력합니다.


```bash
git log -5 --oneline
```


작성자 정보를 변경해야 하는 commit의 위치와 개수를 확인합니다.


<br>


## 4️⃣ 편집기 실행


수정할 commit을 포함하도록 편집기를 실행합니다.


```bash
git rebase -i HEAD~N
```


예를 들어 최근 3개의 commit 중 수정할 commit이 있다면 다음과 같이 입력합니다.


```bash
git rebase -i HEAD~3
```


<br>


## 5️⃣ 수정할 commit을 `edit`으로 변경


편집기가 열리면 다음과 같이 commit 목록이 나타납니다.


```plaintext
pick a1b2c3d commit message 1
pick e4f5g6h commit message 2
pick i7j8k9l commit message 3
```


작성자 정보를 변경할 commit 앞의 `pick`을 `edit`으로 변경합니다.


```plaintext
edit a1b2c3d commit message 1
pick e4f5g6h commit message 2
edit i7j8k9l commit message 3
```


Vim이 열렸다면 `i` 또는 `a`를 눌러 삽입 모드로 진입하여 수정한 뒤, `ESC`를 누르고 `:wq`를 입력해 저장하고 종료합니다.


<br>


## 6️⃣ commit 작성자 정보 수정


Git이 `edit`으로 지정한 commit에서 멈추면 작성자 정보를 수정합니다.


```bash
git commit --amend --author="이름 <이메일 주소>" --no-edit
```


예를 들면 다음과 같습니다.


```bash
git commit --amend --author="Hong Gildong <example@email.com>" --no-edit
```

- `-author`는 해당 commit의 작성자(Author)를 변경하고, `-no-edit`은 기존 commit message를 그대로 유지합니다.

<br>


## 7️⃣ 다음 commit으로 이동


수정이 끝났다면 rebase를 계속 진행합니다.


```bash
git rebase --continue
```


다른 commit도 `edit`으로 지정했다면 Git이 해당 commit에서 다시 멈춥니다.


그때마다


```bash
git commit --amend --author="이름 <이메일 주소>" --no-edit
git rebase --continue
```


를 반복합니다.


모든 작업이 완료되면 rebase가 종료됩니다.


<br>


## 8️⃣ 원격 저장소에 변경 사항 반영


이미 원격 저장소에 push한 commit의 history를 수정했다면 기존 commit과 hash가 달라지기 때문에 일반적인 push가 거부될 수 있습니다.


이 경우 다음과 같이 `--force-with-lease`를 사용하여 변경 사항을 반영할 수 있습니다.


```bash
git push --force-with-lease origin branch-name
```

- `-force-with-lease`는 원격 브랜치가 예상하지 못한 상태로 변경되어 있다면 강제 push를 거부하기 때문에 단순한 `-force`보다 안전합니다.

저의 경우 혼자 작업하고 있는 브랜치였기 때문에 해당 방법을 사용했습니다.


하지만 **다른 팀원과 공유하는 브랜치의 history를 변경하면 다른 사람의 작업에 영향을 줄 수 있으므로**, 반드시 상황을 확인하고 협의한 뒤 진행하는 것이 좋습니다.


<br>


## ➕ Rebase 작업을 취소하고 싶다면


편집기 사용 도중 문제가 발생했다면 다음 명령어로 작업을 취소할 수 있습니다.


```bash
git rebase --abort
```

