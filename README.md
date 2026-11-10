# TennisDoodle

파트너와 함께 테니스 작전을 그려 보는 아이폰용 웹앱(PWA). 코트 위의 선수와 공을 손가락으로 끌어 옮깁니다.

- 단식(2명) / 복식(4명) 전환
- 선수·공 드래그 (멀티터치), 이동 중 네트·센터 기준 거리 표시
- 포메이션 불러오기, 되돌리기
- 홈 화면에 추가하면 전체 화면 앱으로 실행, 오프라인 지원

## 개발

```bash
npm install
npm run dev      # 같은 와이파이의 아이폰에서 http://<맥 IP>:5173
npm run build    # dist/ 생성
npm run icons    # public/ 아이콘 PNG 다시 만들기
```

`main` 브랜치에 푸시하면 GitHub Actions가 GitHub Pages로 배포합니다.
