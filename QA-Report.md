# QA 테스트 자동화 보고서

**테스트 시작:** 2025. 6. 26. 오후 11:32:41
**테스트 종료:** 2025. 6. 26. 오후 11:33:39 (0.96분 소요)
**테스트 대상:** https://eposo.ai

## 🎯 시나리오 기반 테스트 결과

| Status | Instruction |
| :--- | :--- |
| ✅ completed | Eposo.ai에 로그인합니다. |
| ❌ failed | 'Automated QA Project'라는 이름으로 새 프로젝트를 생성합니다. |
| ❌ failed | 모든 작업 완료 후, 로그아웃합니다. |

## 📊 액션 통계
| 항목 | 수치 |
| :--- | :--- |
| 방문한 페이지 수 | 0 |
| 수행한 총 액션 수 | 8 |
| 성공한 액션 | 6 |
| **실패한 액션 (버그)** | **2** |
| 성공률 | 75.00% |

## 🐞 발견된 버그 및 오류

### ❌ Scenario failed at step 2
- **페이지:** [EPOSO: The New Standard in IT Project Management](https://eposo.ai/#/setting)
- **시나리오:** 'Automated QA Project'라는 이름으로 새 프로젝트를 생성합니다.
- **오류 메시지:** `locator.waitFor: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for locator('button:has-text("추가 프로젝트 추가")').first() to be visible[22m
`

### ❌ Scenario failed at step 1
- **페이지:** [EPOSO: The New Standard in IT Project Management](https://eposo.ai/#/setting)
- **시나리오:** 모든 작업 완료 후, 로그아웃합니다.
- **오류 메시지:** `locator.waitFor: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for locator('button:has-text("T Test")').first() to be visible[22m
`

## 📋 페이지별 상세 실행 로그

### 📄 https://eposo.ai/#/ (EPOSO: The New Standard in IT Project Management)

- **[SUCCESS]** ✅ Click the 'Login/Sign Up' button
- **[SUCCESS]** ✅ Click the '무료로 프로젝트 만들러 가기' button

### 📄 https://eposo.ai/#/login (EPOSO: The New Standard in IT Project Management)

- **[SUCCESS]** ✅ Click the 'Email Login' button
- **[SUCCESS]** ✅ Enter the test user's email
- **[SUCCESS]** ✅ Enter the password
- **[SUCCESS]** ✅ Click the 'Email Login' button

### 📄 https://eposo.ai/#/setting (EPOSO: The New Standard in IT Project Management)

- **[FAILURE]** ❌ Scenario failed at step 2
  - **에러:** locator.waitFor: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for locator('button:has-text("추가 프로젝트 추가")').first() to be visible[22m

- **[FAILURE]** ❌ Scenario failed at step 1
  - **에러:** locator.waitFor: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for locator('button:has-text("T Test")').first() to be visible[22m


