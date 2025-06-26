# QA 테스트 자동화 보고서

**테스트 시작:** 2025. 6. 26. 오후 11:36:22
**테스트 종료:** 2025. 6. 26. 오후 11:37:30 (1.14분 소요)
**테스트 대상:** https://eposo.ai

## 🎯 시나리오 기반 테스트 결과

| Status | Instruction |
| :--- | :--- |
| ✅ completed | Eposo.ai에 로그인합니다. |
| ❌ failed | 'Automated QA Project'라는 이름으로 새 프로젝트를 생성합니다. |
| ✅ completed | 모든 작업 완료 후, 로그아웃합니다. |

## 📊 액션 통계
| 항목 | 수치 |
| :--- | :--- |
| 방문한 페이지 수 | 0 |
| 수행한 총 액션 수 | 10 |
| 성공한 액션 | 9 |
| **실패한 액션 (버그)** | **1** |
| 성공률 | 90.00% |

## 🐞 발견된 버그 및 오류

### ❌ Scenario failed at step 3
- **페이지:** [EPOSO: The New Standard in IT Project Management](https://eposo.ai/#/setting)
- **시나리오:** 'Automated QA Project'라는 이름으로 새 프로젝트를 생성합니다.
- **오류 메시지:** `locator.fill: Timeout 30000ms exceeded.
Call log:
[2m  - waiting for locator('input[type="text"]').first().first()[22m
[2m    - locator resolved to <input readonly class="" type="text" tabindex="0" placeholder="" teleport="false" auto-position="false"/>[22m
[2m    - fill("Automated QA Project")[22m
[2m  - attempting fill action[22m
[2m    2 × waiting for element to be visible, enabled and editable[22m
[2m      - element is not editable[22m
[2m    - retrying fill action[22m
[2m    - waiting 20ms[22m
[2m    2 × waiting for element to be visible, enabled and editable[22m
[2m      - element is not editable[22m
[2m    - retrying fill action[22m
[2m      - waiting 100ms[22m
[2m    59 × waiting for element to be visible, enabled and editable[22m
[2m       - element is not editable[22m
[2m     - retrying fill action[22m
[2m       - waiting 500ms[22m
`

## 📋 페이지별 상세 실행 로그

### 📄 https://eposo.ai/#/ (EPOSO: The New Standard in IT Project Management)

- **[SUCCESS]** ✅ Click the 'Login/Sign Up' button
- **[SUCCESS]** ✅ Click the 'Create a Free Project' button

### 📄 https://eposo.ai/#/login (EPOSO: The New Standard in IT Project Management)

- **[SUCCESS]** ✅ Click the 'Email Login' button
- **[SUCCESS]** ✅ Enter the email address
- **[SUCCESS]** ✅ Enter the password
- **[SUCCESS]** ✅ Click the 'Email Login' button

### 📄 https://eposo.ai/#/setting (EPOSO: The New Standard in IT Project Management)

- **[SUCCESS]** ✅ Click the 'Add Project' button
- **[FAILURE]** ❌ Scenario failed at step 3
  - **에러:** locator.fill: Timeout 30000ms exceeded.
Call log:
[2m  - waiting for locator('input[type="text"]').first().first()[22m
[2m    - locator resolved to <input readonly class="" type="text" tabindex="0" placeholder="" teleport="false" auto-position="false"/>[22m
[2m    - fill("Automated QA Project")[22m
[2m  - attempting fill action[22m
[2m    2 × waiting for element to be visible, enabled and editable[22m
[2m      - element is not editable[22m
[2m    - retrying fill action[22m
[2m    - waiting 20ms[22m
[2m    2 × waiting for element to be visible, enabled and editable[22m
[2m      - element is not editable[22m
[2m    - retrying fill action[22m
[2m      - waiting 100ms[22m
[2m    59 × waiting for element to be visible, enabled and editable[22m
[2m       - element is not editable[22m
[2m     - retrying fill action[22m
[2m       - waiting 500ms[22m

- **[SUCCESS]** ✅ Click on profile button
- **[SUCCESS]** ✅ Click the 'Logout' button

