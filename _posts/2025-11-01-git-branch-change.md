---
title: '[Git] 브랜치 이름 변경 방법'
date: '2025-11-01 00:00:00 +0900'
permalink: /posts/git-branch-change/
categories:
  - "\U0001D5EA\U0001D5F5\U0001D5EE\U0001D601 \U0001D5DC \U0001D5DF\U0001D5F2\U0001D5EE\U0001D5FF\U0001D5FB\U0001D5F2\U0001D5F1"
tags:
  - Git
  - GitHub
  - Troubleshooting
notion_id: 3d90b704-6937-8015-b540-ddbd7a7d8452
notion_last_edited: '2026-09-12T12:16:00.000Z'
notion_asset_dir: assets/img/posts/git-branch-change
notion_sync_version: 5
---

<br>


`git add`까지 완료한 상태에서 브랜치 이름을 잘못 설정했다는 것을 알게 되었습니다 😢


아직 commit은 하지 않은 상황이었는데, 다행히 작업 내용을 그대로 유지하면서 브랜치 이름만 간단하게 변경할 수 있었습니다.


`git branch -m`을 사용하여 현재 브랜치의 이름을 변경하는 방법을 정리해 봅니다.


<br>


## 1️⃣ 현재 브랜치 확인


먼저 현재 작업 중인 브랜치를 확인합니다.


```bash
git branch
```


현재 브랜치 앞에는 `*`가 표시됩니다.


```plaintext
* feature-79-profile
  main
```


<br>


## 2️⃣ 브랜치 이름 변경


현재 브랜치의 이름을 변경하려면 `git branch -m` 명령어를 사용합니다.


```bash
git branch -m 새로운-브랜치-이름
```


예를 들어 `feature-79-profile`을 `ui-79-profile`로 변경하고 싶다면 다음과 같이 입력합니다.


```bash
git branch -m ui-79-profile
```

- `m`은 브랜치를 새로운 이름으로 **이동(move)하거나 이름을 변경(rename)**할 때 사용하는 옵션입니다.

<br>


## 3️⃣ 변경된 브랜치 확인


브랜치 이름이 정상적으로 변경되었는지 다시 확인합니다.


```bash
git branch
```


또는


```bash
git status
```


를 통해 현재 브랜치를 확인할 수 있습니다.


```plaintext
On branch ui-79-profile
```


기존 `feature-79-profile`에서 `ui-79-profile`로 무사히 변경된 것을 확인할 수 있습니다.


<br>


## 4️⃣ commit 진행


브랜치 이름을 변경한 뒤에는 기존 작업 내용을 그대로 commit하면 됩니다.


```bash
git commit -m "커밋 메시지"
```


`git add`로 staging한 변경 사항 역시 브랜치 이름을 변경했다고 해서 사라지지 않습니다.


<br>


### 💡 commit 후에도 변경할 수 있을까?


가능합니다.


`git branch -m`을 통한 로컬 브랜치 이름 변경은 **commit 전일 때만 사용할 수 있는 방법이 아닙니다.**


제가 해당 명령어를 사용했을 당시에는 우연히 `git add`까지 완료하고 아직 commit하지 않은 상태였을 뿐, 이미 commit한 로컬 브랜치도 동일한 방법으로 이름을 변경할 수 있습니다.


단, 이미 원격 저장소에 push한 브랜치의 이름을 변경하려는 경우에는 원격 브랜치까지 별도로 처리해야 합니다.

