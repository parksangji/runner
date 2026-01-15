# Runner

> Claude Code 워크벤치 — 멀티 터미널과 git을 한 창에서

Runner는 여러 터미널 세션과 git 작업을 하나의 데스크톱 앱에서 다루는 Electron 기반 워크벤치입니다.
터미널 세션은 창과 분리된 백그라운드 데몬이 소유하므로 창을 닫았다 열어도 셸이 살아있습니다.

## 주요 기능

- **멀티 터미널** — 분할/탭 배치, 디렉토리(cwd) 자동 추적
- **영속 세션** — 터미널 PTY를 데몬이 소유, 앱 재시작 후에도 복원
- **디렉토리별 git** — 열린 터미널의 git 저장소를 변경내역 패널에 디렉토리별로 표시
- **변경내역 / diff** — 파일별 diff 보기, 라인 단위 스테이징, Pull/Push/Commit/Branch
- **테마** — 라이트 / 다크 / 시스템

## 아키텍처

```
src/
├── daemon/    # PTY를 소유하는 백그라운드 프로세스 (유닉스 소켓 RPC)
├── main/      # Electron 메인 — IPC 허브 + 데몬 관리
├── preload/   # contextBridge 보안 경계
├── renderer/  # React UI (zustand, dockview, xterm)
└── shared/    # 프로토콜 타입 / 경로
```

## 개발 / 실행

```bash
npm install
npm run dev        # 개발 모드 (electron-vite)
npm run build      # 프로덕션 빌드
npm run typecheck  # 타입 체크
npm run package    # 앱 패키징
```

## 단축키

| 키 | 동작 |
|----|------|
| ⌘T | 새 터미널 |
| ⌘D / ⌘⇧D | 오른쪽 / 아래로 분할 |
| ⌘W | 현재 터미널 닫기 |
| ⌘B | 변경내역 패널 토글 |
| ⌘K | 커맨드 팔레트 |

## 수정 이력

### 2026-01-15 — 백엔드: cwd 추적 · IPC 직렬화 · 이벤트 포워더
- 셸 프로세스의 실제 작업 디렉토리를 폴링해 cwd를 추적 (OSC 7 미지원 셸 대응)
- git 스냅샷을 structured-clone 가능한 plain 객체로 직렬화 (IPC 클론 오류 해결)
- 데몬 이벤트 포워더를 client 인스턴스 기준으로 재부착 (재연결 시 이벤트 유실 방지)
