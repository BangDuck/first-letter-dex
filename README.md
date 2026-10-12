# 첫 글자 도감

한글 한 글자를 입력하면 그 글자로 **시작하는** 포켓몬만 보여주는 도감입니다.
내 성(姓)으로 시작하는 포켓몬을 찾아 SNS 프로필 사진(800×800 PNG)으로 저장할 수 있습니다.

**사이트 주소: https://firstletterdex.github.io**
(검색 결과로 바로 가는 링크 예: https://firstletterdex.github.io/?q=방)

## 사용 방법

`index.html` 을 더블클릭하면 브라우저에서 열립니다. 인터넷 연결만 있으면 됩니다(일러스트와 폰트를 인터넷에서 불러옴).

- 검색: 글자 하나 입력 → 바로 결과 표시 (두 글자 이상이면 첫 글자만 사용)
- 상세 보기: 카드 클릭 (키보드: Tab으로 이동 후 Enter, 닫기는 Esc)
- 프로필 사진: 상세 화면 → 배경 선택(흰색/투명/타입 색/도감 화면) → "프로필 사진으로 저장"
- 옵션: 두음법칙(이↔리 등), 특수 폼(메가진화·리전폼 등) 포함 — 기본은 모두 꺼짐
- 공유 링크: 검색하면 주소가 `index.html?q=방` 형태로 바뀝니다. "공유 링크 복사" 버튼으로 복사할 수 있습니다.

## 데이터 갱신 (새 포켓몬이 나왔을 때)

```
python3 scripts/fetch_data.py
```

PokeAPI에서 전체 포켓몬을 다시 받아 `data/pokemon-data.js` 를 새로 만들고, 끝에 검증 결과(빈 이름·설명, 샘플 대조)를 출력합니다. 추가 설치는 필요 없습니다(맥에 기본으로 있는 Python 3 사용).

## 파일 구조

| 파일 | 역할 |
|---|---|
| `index.html` | 화면 뼈대 |
| `style.css` | 디자인(도감 기기, LCD, 카드, 애니메이션) |
| `app.js` | 동작(검색, 상세 보기, 프로필 사진, 옵션, 최근 검색) |
| `data/pokemon-data.js` | 포켓몬 데이터 — 스크립트가 자동 생성, 직접 수정하지 않음 |
| `data/overrides.json` | 수동 보정 목록 — PokeAPI 값이 비었거나 공식 도감과 다를 때 여기에 적음 |
| `scripts/fetch_data.py` | 데이터 수집·검증 스크립트 |

### overrides.json 에 들어 있는 것 (2026-10-13 공식 도감 대조)

- `pokemon`: 9세대 이후 127마리의 한국어 도감 설명 (PokeAPI에 한국어가 없어 공식 도감의 설명을 사용)
- `forms`: PokeAPI에 한국어 이름이 없는 특수 폼의 공식 표기 (예: `raichu-mega-x` → 메가라이츄X)
- `excludeForms`: PokeAPI에는 있지만 공식 도감 목록에 없는 폼 (모자 피카츄, 캐스퐁 날씨 폼 등) — 사이트에 표시하지 않음

## 데이터 출처와 저작권

- 데이터: [PokeAPI](https://pokeapi.co), 이름·설명 대조: [포켓몬코리아 공식 도감](https://pokemonkorea.co.kr/pokedex)
- 폰트: [Galmuri](https://galmuri.quiple.dev) (SIL Open Font License)

비공식 팬 프로젝트입니다. 포켓몬 및 관련 이미지의 저작권은 Nintendo, Creatures, GAME FREAK, The Pokémon Company에 있습니다.
