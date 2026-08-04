# 카페24 프론트 스타터 키트

전역 `FRONT` 하나에 설정 · 통신 · 유틸 · 진입점을 모아둔 것.
카페24 제약(번들 순서, 전역 스코프 공유 등)은 루트 [README](../README.md) 참고.

```
skin/                  ← 이 폴더 내용을 FTP에 올린다
  front.config.js        몰마다 고침
  front.core.js          고치지 않음
  page.template.js       페이지 파일 시작점

docs/                  ← 같은 코드 + 왜 그렇게 짰는지 주석. 읽는 용도
  config.js  utils.js  api.js  member.js  category.js  bootstrap.js
```

`skin/` 과 `docs/` 는 기능이 동일하다. 올리는 건 `skin/` 만.

---

# 설치

## 1. 파일 올리기

`skin/front.config.js`, `skin/front.core.js` 를 스킨 폴더에 올린다. (예: `/myskin/`)

## 2. 레이아웃에 추가

**메인용 · 공통 두 레이아웃 모두**에 넣는다. 한쪽만 넣으면 반대쪽 페이지에서 안 돈다.

```html
<!-- axios CDN — 이것도 양쪽 레이아웃에 -->
<script src="https://unpkg.com/axios/dist/axios.min.js"></script>

<!--@js(/myskin/front.config.js)-->
<!--@js(/myskin/front.core.js)-->
```

jQuery는 카페24가 이미 싣고 있어서 따로 넣지 않는다.

## 3. front.config.js 채우기

```js
MALL_ID: 'yourmallid',          // 필수
CLIENT_ID: '',                  // 프론트 API / SDK 쓸 때
MIDDLEWARE_BASE: '',            // 자체 백엔드 있을 때
```

`MALL_ID` 를 안 고치면 콘솔에 경고가 뜬다.

## 4. 확인

콘솔에서 `FRONT` 를 쳐본다. 객체가 나오면 설치 완료.

---

# 페이지 스크립트 작성

`skin/page.template.js` 를 복사해서 시작한다.

```js
window.FRONT = window.FRONT || {};
FRONT.page = FRONT.page || function () { (FRONT._q = FRONT._q || []).push(arguments); };

FRONT.page(function () {
  const { formatNumber, onError } = FRONT.util;

  FRONT.api.middleware
    .get('/api/v1/mypage/benefits', { mallId: FRONT.config.MALL_ID })
    .then(function (res) {
      $('.benefit-total').text(formatNumber(res.data.total) + '원');
    })
    .catch(onError('마이페이지 혜택'));
});
```

## 규칙 세 가지

**1. 맨 위 두 줄을 지우지 않는다.**
카페24는 페이지 스크립트를 공통 코어보다 **먼저** 실행한다.
이 두 줄이 있어야 순서와 무관하게 동작한다.

**2. 모든 코드를 `FRONT.page()` 안에 넣는다.**
바깥(최상위)에서 `FRONT.util` 같은 걸 건드리면 아직 없어서 터진다.
안에 넣으면 DOM 준비 후에 실행되므로 전부 존재한다.

```js
const api = FRONT.api.middleware;    // ✗ 최상위 — 터짐

FRONT.page(function () {
  const api = FRONT.api.middleware;  // ○
});
```

**3. `FRONT.page()` 안에서만 변수를 선언한다.**
스킨 js는 전부 하나의 스크립트로 합쳐진다. 최상위에 `const productNo` 같은 걸
선언하면 다른 파일과 이름이 겹치는 순간 `SyntaxError` 로 **페이지 전체가 죽는다.**
`FRONT.page()` 안은 함수 스코프라 안전하다.

## 특정 페이지에서만 실행

조건을 주면 맞을 때만 돈다. 레이아웃에 넣는 공통 스크립트용.

```js
// 선택자 — 그 요소가 있는 페이지에서만
FRONT.page('.order-list', function () { ... });

// 함수 — 반환값이 참일 때만. 경로나 카페24 전역으로 판단할 때
FRONT.page(() => location.pathname.startsWith('/order/'), function () { ... });
```

---

# 레퍼런스

## FRONT.config

몰별 설정. `front.config.js` 에서 고친다.

| | |
|---|---|
| `MALL_ID` | 카페24 몰 아이디 |
| `CLIENT_ID` | 카페24 앱 client_id |
| `MIDDLEWARE_BASE` | 자체 백엔드 주소 |
| `SKIN_BASE` | 스킨 경로 접두사 |
| `DEBUG` | 주소에 `?debug=1` 붙이면 true |
| `CAFE24_BASE` | `MALL_ID` 에서 자동 유도 |

## FRONT.sel

셀렉터 모음. 마크업이 바뀌면 여기만 고친다. `front.config.js` 에 있다.

```js
FRONT.sel = { orderList: '.order-list' };
$(FRONT.sel.orderList).show();
```

## FRONT.api

통신은 세 갈래다.

| | 대상 | 인증 |
|---|---|---|
| `FRONT.api.middleware` | 자체 백엔드 | 없음 (필요 시 `setToken`) |
| `FRONT.api.front` | 카페24 프론트 API | `client_id` 헤더 |
| `FRONT.api.sdk` | 카페24 JS SDK | 카페24 세션 |

```js
// get 은 두 번째 인자가 쿼리스트링
FRONT.api.middleware.get('/api/v1/orders', { page: 1, size: 10 })
FRONT.api.middleware.post('/api/v1/orders', { productNo: 123 })

FRONT.api.front.get('/api/v2/categories', { parent_category_no: 115 })
```

`get` `post` `put` `patch` `delete` / `setToken(값또는함수)` / `raw()` (axios 인스턴스)

`FormData` 를 넘기면 `multipart/form-data` 로 자동 전환된다.

새 인증 방식이 필요하면 직접 만든다.

```js
const custom = FRONT.api.create({
  name: '외부API',
  baseURL: 'https://...',
  token: () => sessionStorage.getItem('t'),
});
```

### FRONT.api.sdk

카페24 SDK는 전부 콜백 방식이다. 이걸 Promise로 감싼 것.

```js
FRONT.api.sdk.init()          // 쓰기 전에 한 번
FRONT.api.sdk.cartCount()
FRONT.api.sdk.couponCount()

// 위에 없는 메서드는 call() 로. 마지막 인자가 콜백인 것 전부
FRONT.api.sdk.call('addCurrentProductToCart', mallId, time, appKey, memberId, hmac)
```

실패는 전부 `reject` 로 온다. `.catch()` 하나만 달면 되고 `try/catch` 는 필요 없다.

`FRONT.api.sdk.customer()` 도 있지만 **회원 정보는 `FRONT.member.fetch()` 를 쓴다.**
`sdk.customer()` 는 캐시도 재시도도 없는 날것이라, 로그인 직후 `member_id` 가
아직 안 채워진 타이밍에 비회원으로 보인다.

## FRONT.member

로그인 회원 정보. **쿠키 30분 캐시 + SDK 재시도**가 들어 있다.

```js
FRONT.member.fetch().then(function (m) {
  if (!m) return;                          // 비회원
  $('.user-name').text(m.nick_name || m.name);
});

FRONT.member.info      // 마지막 조회 결과
FRONT.member.clear()   // 로그아웃 시. 안 하면 30분간 남는다
```

카페24 SDK는 로그인 상태인데도 초기에 `member_id` 없이 빈 값을 주는 경우가 있어서
1초 간격 10회까지 다시 묻는다. 비로그인(403)은 재시도하지 않는다.

## FRONT.category

```js
FRONT.category.list(115)                    // 하위 카테고리 목록. parentNo별 캐시
FRONT.category.findByName('브랜드명', 115)   // 이름 일치. 없으면 null
```

## FRONT.util

```js
formatNumber(1000)                  // '1,000'
formatDate('2026-08-04T12:00:00')   // '2026.08.04'
escapeHtml(v)                       // html 넣기 전 필수
listToHtml('a, b', 'opt')           // '<p class="opt">a<br>b</p>'
query('cate_no')                    // 주소의 ?cate_no 값

cookie.get / set / remove / getJSON / setJSON

once(fn)          // 한 번만 계산해서 재사용. 실패하면 다음에 재시도
debounce(fn, ms)  // 마지막 호출만 실행
toPromise(fn)     // 콜백 방식 → Promise
groupBy(list, 'key' 또는 함수)   // 순서 보존 → { map, keys }

log(...)          // config.DEBUG 일 때만 출력
logError(label, err)
onError(label)    // .catch(onError('주문목록'))
```

### 자주 쓰는 조합

```js
// 요청을 한 번만 보내기 (FRONT.category.list 는 이미 이걸로 캐시된다)
const loadBanners = FRONT.util.once(() => FRONT.api.middleware.get('/api/v1/banners'));

// 사용자 입력을 html로
$el.html(FRONT.util.escapeHtml(userInput));
```

## FRONT.page

```js
FRONT.page(fn)                    // DOM 준비 후 실행
FRONT.page('.sel', fn)            // .sel 이 있는 페이지에서만
FRONT.page(() => 조건, fn)         // 조건이 참일 때만
```

한 개가 예외를 던져도 나머지는 계속 실행된다. 에러는 콘솔에 찍힌다.

---

# 새 몰 시작 체크리스트

1. 콘솔에서 `'FRONT' in window` 가 `false` 인지 확인 (이름 충돌)
2. axios CDN을 **두 레이아웃 모두**에 추가
3. `front.config.js` `front.core.js` 를 **두 레이아웃 모두**에 `@js` 추가
4. `front.config.js` 의 `MALL_ID` 채우기
5. 페이지 스크립트는 `page.template.js` 복사해서 시작

# 문제 해결

**`[FRONT.api] axios가 없습니다`**
그 페이지가 쓰는 레이아웃에 axios CDN 태그가 빠졌다. 메인/공통 양쪽 확인.

**`[FRONT.api] ...의 주소가 비어 있습니다`**
`front.config.js` 의 `MIDDLEWARE_BASE` 가 비었다.

**`FRONT is not defined`**
`front.core.js` 가 그 레이아웃에 안 들어갔거나, 페이지 파일 맨 위 두 줄을 지웠다.

**아무 로그도 안 보임**
주소 뒤에 `?debug=1` 을 붙이면 `FRONT.util.log()` 출력이 켜진다.
