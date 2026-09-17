# 카페24 프론트 스타터 키트

전역 `FRONT` 하나에 설정 · 통신 · 유틸 · 진입점을 모아둔 것.
카페24 제약(번들 순서, 전역 스코프 공유 등)은 루트 [README](../README.md) 참고.

```
skin/                  ← 이 폴더 내용을 FTP에 올린다
  front.config.js        몰마다 고침
  front.core.js          고치지 않음
  front.core.css         코어가 그리는 것(토스트·스켈레톤)의 최소 모양
  page.template.js       페이지 파일 시작점

docs/                  ← 같은 코드 + 왜 그렇게 짰는지 주석. 읽는 용도
  config.js  utils.js  api.js  cache.js  member.js  category.js  bootstrap.js
```

`skin/` 과 `docs/` 는 기능이 동일하다. 올리는 건 `skin/` 만.

---

# 설치

## 1. 파일 올리기

`skin/front.config.js`, `skin/front.core.js`, `skin/front.core.css` 를 스킨 폴더에 올린다. (예: `/myskin/`)

## 2. 레이아웃에 추가

**메인용 · 공통 두 레이아웃 모두**에 넣는다. 한쪽만 넣으면 반대쪽 페이지에서 안 돈다.

```html
<!-- axios CDN — 이것도 양쪽 레이아웃에 -->
<script src="https://unpkg.com/axios/dist/axios.min.js"></script>

<!--@css(/myskin/front.core.css)-->
<!--@js(/myskin/front.config.js)-->
<!--@js(/myskin/front.core.js)-->
```

`front.core.css` 를 빠뜨리면 `FRONT.util.toast()` 와 `FRONT.util.skeleton()` 이
마크업만 붙고 화면에는 아무것도 안 보인다. 에러도 안 난다.

**스켈레톤은 이 파일만으로는 부족하다.** `front.core.css` 가 주는 건 반짝임뿐이고,
블록의 높이·너비·배치는 몰 CSS 에서 줘야 한다. 안 주면 높이 0으로 그려져 역시 안 보인다.

```css
/* 몰 CSS */
.card-skeleton { height: 330px; }
.card-skeleton .skeleton-block.img { height: 180px; }
.card-skeleton .skeleton-block.title { height: 18px; margin-top: 12px; }
```

jQuery는 카페24가 이미 싣고 있어서 따로 넣지 않는다.

## 3. front.config.js 채우기

```js
MALL_ID: 'yourmallid',          // 필수
CLIENT_ID: '',                  // 프론트 API / SDK 쓸 때
MIDDLEWARE_BASE: '',            // 자체 백엔드 있을 때
SKIN_BASE: '',                  // 멀티스킨일 때 (작업 스킨과 라이브 스킨이 다르면 필수)
TOKEN: null,                    // 로그인 토큰을 쓰는 몰만
ON_UNAUTHORIZED: null,          // 401 일 때 토큰 갱신
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
| `SKIN_BASE` | 스킨 경로 접두사. `FRONT.util.url()` 이 쓴다 |
| `TOKEN` | 미들웨어에 붙일 토큰을 돌려주는 함수. 없으면 헤더 없이 나간다 |
| `ON_UNAUTHORIZED` | 401 일 때 부를 토큰 갱신 함수(Promise). 없으면 401 이 그대로 올라간다 |
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
| `FRONT.api.middleware` | 자체 백엔드 | `config.TOKEN` (없으면 인증 없음) |
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

### 401 자동 갱신

`config.ON_UNAUTHORIZED` 가 있으면 미들웨어 요청이 401을 받았을 때
그 함수를 한 번 부르고 **같은 요청만** 다시 보낸다.

- 요청 하나당 한 번이다. 갱신된 토큰도 거절당하는 경우에 무한 재시도가 되지 않는다
- 갱신이 실패하면 **원래의 401** 이 호출부로 간다. 호출부는 '인증 안 됨'으로 처리하면 된다
- 훅을 안 채운 몰에서는 아무 일도 일어나지 않는다(401 그대로)

토큰을 붙이는 방식이 코어에 박혀 있지 않은 이유가 이것이다.
코어가 특정 로그인 방식의 함수를 직접 부르면, 그 방식이 없는 몰에서 첫 요청이
`TypeError` 로 죽는다.

새 인증 방식이 필요하면 직접 만든다.

```js
const custom = FRONT.api.create({
  name: '외부API',
  baseURL: 'https://...',
  token: () => sessionStorage.getItem('t'),
  onUnauthorized: () => refresh(),   // 선택
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

## FRONT.cache

목록을 받아 그리는 화면용. **있는 값을 먼저 그리고, 오래됐으면 뒤에서 새로 받아
바뀐 것만 다시 그린다.** 저장은 `sessionStorage` — 목록 → 상세 → 뒤로가기를 넘어 살아남고,
새 탭은 비어 있다.

```js
if (!FRONT.cache.has(KEY)) $list.html(FRONT.util.skeleton(8, 'card-skeleton', BLOCKS));

FRONT.cache.get(KEY, () => FRONT.api.middleware.get('/api/v1/products').then((r) => r.data), {
  ttl: 30000,                          // 이 시간이 지났으면 뒤에서 새로 받는다
  onRevalidate: render,                // 이름 있는 함수로 — 아래 주의 참고
}).then(render);
```

| 옵션 | |
|---|---|
| `ttl` | 기본 30초. 지났으면 뒤에서 새로 받는다 |
| `maxAge` | 기본 30분. **이걸 넘긴 캐시는 그리지 않고** 새로 받을 때까지 기다린다. `0` 이면 상한 없음 |
| `onRevalidate(fresh)` | 새로 받은 내용이 **캐시와 다를 때만** 불린다 |
| `isValid()` | 늦게 온 응답을 버릴 조건. 페이지를 넘겼는데 이전 응답이 도착하는 경우 |
| `ignore` | 비교에서 뺄 필드명 배열. 조회수처럼 매번 올라가는 값 |

```js
FRONT.cache.has(key, maxAge)  // 지금 그릴 수 있는 값이 있나 (스켈레톤 판단용)
FRONT.cache.clear(key)        // 하나만. 인자 없으면 전부
FRONT.cache.revalidateAll()   // 보통 직접 부를 일 없다 (아래 참고)
```

`get()` 에 `maxAge` 를 기본값과 다르게 줬다면 **`has()` 에도 같은 값을 넘긴다.**
판단 기준이 어긋나면, 너무 오래돼서 `get()` 이 안 그리고 기다리는 캐시를 `has()` 가
"있다"고 답한다 — 스켈레톤이 가장 필요한 순간에 사라진다.

**탭에 돌아오면 저절로 다시 확인한다.** `visibilitychange` · `focus` · `online` ·
`pageshow(bfcache)` 에서 화면에 살아 있는 조회만 다시 받는다. 앱을 바꿨다 10분 뒤
돌아와도 옛 화면이 남지 않는다.

### 주의

- `onRevalidate` 는 **내용이 바뀌었을 때만** 불린다. 무조건 다시 그리면 스크롤 위치와
  열어둔 UI가 초기화된다
- 그 콜백이 이전 DOM을 부수고 새로 만든다면(슬라이드 teardown → rebuild) `isValid` 를
  같이 준다
- 같은 키로 동시에 들어온 요청은 하나로 합쳐진다(`inflight`)
- `onRevalidate` 함수 자체가 "화면의 이 자리"를 가리키는 열쇠다. **이름 있는 함수를 넘긴다.**
  매번 새 익명 함수를 넘기면서 같은 자리를 반복 갱신하면 등록이 쌓이고, 탭에 돌아올 때마다
  유령 등록까지 다시 받는다. 자리마다 다른 클로저가 필요하면 `isValid` 를 같이 준다

## FRONT.member

로그인 회원 정보. **쿠키 30분 캐시 + SDK 재시도**가 들어 있다.

```js
FRONT.member.fetch().then(function (m) {
  if (!m) return;                          // 비회원
  $('.user-name').text(m.nick_name || m.name);
});

FRONT.member.info      // 마지막 조회 결과
FRONT.member.clear()   // 직접 부를 일은 드물다 (아래)
```

카페24 SDK는 로그인 상태인데도 초기에 `member_id` 없이 빈 값을 주는 경우가 있어서
1초 간격 10회까지 다시 묻는다. 비로그인(403)은 재시도하지 않는다.

### 로그아웃은 코어가 잡는다

쿠키가 30분이라 로그아웃해도 그 시간 동안 회원으로 보인다. 세 겹으로 막는다.

1. 주소에 `logout` 이 있으면 바로 비운다
2. `a[href*="logout"]` 클릭을 위임으로 잡는다 (나중에 그려지는 헤더의 링크도 걸린다)
3. 그래도 새는 경로(폼 제출 로그아웃, 다른 탭에서 계정 전환)는 `fetch()` 가 뒤에서
   SDK에 한 번 물어 확인하고, 어긋났으면 캐시를 버린다

`clear()` 를 호출부가 챙기는 방식은 언젠가 빠뜨린다 — 그래서 코어로 올렸다.
다만 3번은 **캐시를 먼저 돌려준 뒤** 확인하므로, 회원 전용 값을 그리는 화면이라면
잠깐 이전 회원으로 보일 수 있다. 그런 화면은 확인 후 다시 그리도록 짠다.

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
url('/pages/list.html')             // config.SKIN_BASE 접두사를 붙인다

cookie.get / set / remove / getJSON / setJSON

once(fn)          // 한 번만 계산해서 재사용. 실패하면 다음에 재시도
debounce(fn, ms)  // 마지막 호출만 실행
toPromise(fn)     // 콜백 방식 → Promise
groupBy(list, 'key' 또는 함수)   // 순서 보존 → { map, keys }

log(...)          // config.DEBUG 일 때만 출력
logError(label, err)
onError(label)    // .catch(onError('주문목록'))

toast(msg, { type, duration })   // 하단 알림. type: success | error | info
skeleton(8, 'card-skeleton', [{ className: 'img' }, { className: 'title' }])
destroySwipers($scope)           // 다시 그리기 전에 Swiper 정리 (4.x 포함)
afterReady(fn)                   // ready 배치가 전부 끝난 뒤에 실행
```

`toast` 와 `skeleton` 은 `front.core.css` 가 있어야 보인다.
`skeleton` 은 거기에 더해 블록 크기를 몰 CSS 에서 줘야 한다(위 설치 2번).
`url()` 은 멀티스킨에서 필수다 — 안 붙이면 링크가 라이브 스킨으로 튄다.

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
   (`front.core.css` 는 `@css`)
4. `front.config.js` 의 `MALL_ID` 채우기. 멀티스킨이면 `SKIN_BASE` 도
5. 페이지 스크립트는 `page.template.js` 복사해서 시작

# 문제 해결

**`[FRONT.api] axios가 없습니다`**
그 페이지가 쓰는 레이아웃에 axios CDN 태그가 빠졌다. 메인/공통 양쪽 확인.

**`[FRONT.api] ...의 주소가 비어 있습니다`**
`front.config.js` 의 `MIDDLEWARE_BASE` 가 비었다.

**`FRONT is not defined`**
`front.core.js` 가 그 레이아웃에 안 들어갔거나, 페이지 파일 맨 위 두 줄을 지웠다.

**`FRONT.util.toast()` 를 불렀는데 아무것도 안 뜸**
`front.core.css` 가 그 레이아웃에 안 들어갔다. 마크업은 붙어 있으므로
개발자도구에서 `.front-toast` 를 찾아보면 확인된다.

**로그아웃했는데 회원으로 보임**
`FRONT.member` 가 잡는 경로 세 가지를 다 비껴간 경우다. 그 스킨의 로그아웃이
폼 제출이고 주소에 `logout` 도 없으면, 로그아웃 처리 쪽에서 `FRONT.member.clear()` 를
한 번 불러준다.

**아무 로그도 안 보임**
주소 뒤에 `?debug=1` 을 붙이면 `FRONT.util.log()` 출력이 켜진다.
