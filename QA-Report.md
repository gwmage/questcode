# QA 테스트 자동화 보고서

**테스트 시작:** 2025. 6. 26. 오후 11:02:40
**테스트 종료:** 2025. 6. 26. 오후 11:03:03 (0.39분 소요)
**테스트 대상:** https://eposo.ai

## 🎯 시나리오 기반 테스트 결과

| Status | Instruction |
| :--- | :--- |
| ✅ completed | Eposo.ai에 로그인합니다. |
| ❌ failed | 'Automated QA Project'라는 이름으로 새 프로젝트를 생성합니다. |
| ❌ failed | 생성된 프로젝트의 '설정' 페이지로 이동합니다. |
| ❌ failed | '알림'과 관련된 모든 옵션을 비활성화합니다. |
| ❌ failed | 모든 작업 완료 후, 로그아웃합니다. |

## 📊 액션 통계
| 항목 | 수치 |
| :--- | :--- |
| 방문한 페이지 수 | 0 |
| 수행한 총 액션 수 | 11 |
| 성공한 액션 | 7 |
| **실패한 액션 (버그)** | **4** |
| 성공률 | 63.64% |

## 🐞 발견된 버그 및 오류

### ❌ Scenario failed
- **페이지:** [EPOSO: The New Standard in IT Project Management](https://eposo.ai/#/setting)
- **시나리오:** 'Automated QA Project'라는 이름으로 새 프로젝트를 생성합니다.
- **오류 메시지:** `AI가 유효하지 않은 URL(https://eposo.ai/#/dashboard/0)로 이동하려고 시도했습니다.`

### ❌ Scenario failed
- **페이지:** [EPOSO: The New Standard in IT Project Management](https://eposo.ai/#/instruction/new-register)
- **시나리오:** 생성된 프로젝트의 '설정' 페이지로 이동합니다.
- **오류 메시지:** `AI가 유효하지 않은 URL(null)로 이동하려고 시도했습니다.`

### ❌ Scenario failed
- **페이지:** [EPOSO: The New Standard in IT Project Management](https://eposo.ai/#/instruction/new-register)
- **시나리오:** '알림'과 관련된 모든 옵션을 비활성화합니다.
- **오류 메시지:** `AI가 유효하지 않은 URL(null)로 이동하려고 시도했습니다.`

### ❌ Scenario failed
- **페이지:** [EPOSO: The New Standard in IT Project Management](https://eposo.ai/#/instruction/new-register)
- **시나리오:** 모든 작업 완료 후, 로그아웃합니다.
- **오류 메시지:** `AI가 유효하지 않은 URL(null)로 이동하려고 시도했습니다.`

## 📋 페이지별 상세 실행 로그

### 📄 https://eposo.ai/#/ (EPOSO: The New Standard in IT Project Management)

- **[SUCCESS]** ✅ Click Login/Sign Up button
- **[SUCCESS]** ✅ Click the Email Login button
- **[SUCCESS]** ✅ Click the first 'Create a Free Project' button
- **[SUCCESS]** ✅ Click the 'Create project with Modified AI' button

### 📄 https://eposo.ai/#/login (EPOSO: The New Standard in IT Project Management)

- **[SUCCESS]** ✅ Fill email field with test email
- **[SUCCESS]** ✅ Fill password field with test password
- **[SUCCESS]** ✅ Click the Email Login button

### 📄 https://eposo.ai/#/setting (EPOSO: The New Standard in IT Project Management)

- **[FAILURE]** ❌ Scenario failed
  - **에러:** AI가 유효하지 않은 URL(https://eposo.ai/#/dashboard/0)로 이동하려고 시도했습니다.

### 📄 https://eposo.ai/#/instruction/new-register (EPOSO: The New Standard in IT Project Management)

- **[FAILURE]** ❌ Scenario failed
  - **에러:** AI가 유효하지 않은 URL(null)로 이동하려고 시도했습니다.
- **[FAILURE]** ❌ Scenario failed
  - **에러:** AI가 유효하지 않은 URL(null)로 이동하려고 시도했습니다.
- **[FAILURE]** ❌ Scenario failed
  - **에러:** AI가 유효하지 않은 URL(null)로 이동하려고 시도했습니다.

