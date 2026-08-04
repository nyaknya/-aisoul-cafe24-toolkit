# -aisoul-cafe24-toolkit

카페24 프론트 작업에 필요한 플랫폼 정보와, 프로젝트 시작 시 가져다 쓸 공통 JS.

- `outputs/skin/` — 스킨에 올릴 파일. 설치와 사용법은 [outputs/README.md](outputs/README.md)
- `outputs/docs/` — 같은 코드에 주석을 상세히 단 것. 읽는 용도

아래는 **카페24에서 프론트 작업할 때 알아야 하는 것들**만 정리한 것이다.

---

# 스킨 문법

카페24 스킨은 HTML 주석처럼 생긴 지시자로 다른 파일을 불러온다.
**서버(PHP)에서 렌더링할 때 실제 태그로 치환되는 방식**이라 ES 모듈 `import` 와는 다르다.

## 지시자

| 문법 | 하는 일 |
|---|---|
| `<!--@layout(/layout/basic/layout.html)-->` | 상속할 레이아웃 지정. 페이지 html 맨 위에 씀 |
| `<!--@css(/myskin/mypage.css)-->` | `<link>` 태그로 치환 |
| `<!--@js(/myskin/mypage.js)-->` | `<script>` 태그로 치환 |
| `<!--@import(/layout/basic/header.html)-->` | html 조각을 그 자리에 삽입 |
| `<!--@contents-->` | 레이아웃 안에서 페이지 본문이 들어갈 자리 |

```html
<!-- 페이지 html -->
<!--@layout(/layout/basic/layout.html)-->
<!--@css(/myskin/mypage.css)-->
<!--@js(/myskin/mypage.js)-->
```

```html
<!-- 레이아웃 html -->
<div id="wrap">
  <!--@import(/layout/basic/header.html)-->
  <div id="contents">
    <!--@contents-->        ← 페이지 본문이 여기로
  </div>
  <!--@import(/layout/basic/footer.html)-->
</div>
```

- 경로는 **스킨 폴더 루트 기준 절대경로**
- 스킨에 실제로 존재하는 파일만 가리킬 수 있다 → **외부 CDN은 `@js` 로 못 부른다**
- `@css` / `@js` 는 모듈 블록 안에도 쓸 수 있고, 그 모듈이 출력될 때만 로드된다

```html
<div module="Layout_multishopShipping">
  <!--@css(/css/module/layout/multishopShipping.css)-->
  <!--@js(/js/module/layout/multishopShipping.js)-->
</div>
```

## 모듈과 치환자

`module="..."` 이 붙은 요소는 카페24가 데이터를 채워 출력한다.
안에서 `{$변수}` 로 값을 꺼낸다. 목록형 모듈은 자식 요소가 자동 반복된다.

```html
<select module="Layout_multishopShippingCountrylist">
  <option value="{$country_code}" {$country_default_selected}>{$country_name}</option>
  <option value="{$country_code}" {$country_default_selected}>{$country_name}</option>
</select>
```

`{$변수}` 는 속성값 자리에도 들어간다. `onclick="{$go_back}"` 처럼 핸들러로도 쓰인다.

**치환되지 않은 `{$` 가 문자열에 그대로 남는 경우가 있다.** JS에서 값을 쓰기 전에 걸러낼 것.

```js
if (value.includes('{$')) return;   // 치환 실패한 값
```

## EZ (디자인 편집) 영역

`ez-` 계열은 카페24 디자인 편집 기능이 쓴다. 임의로 건드리지 말 것.

```html
<!--ez-favicon[--><!--ez-favicon]-->
<!--@js(/ez/init.js)-->
<script type="text/ez-prop">
  <ez-prop data-version="1.0.0">
    <ez-var data-prop="theme" data-namespace="ez.layout.theme" data-type="array">
      <ez-item data-id="theme01" data-name="MODERN" ...></ez-item>
    </ez-var>
  </ez-prop>
</script>
```

---

# 제한사항

## 1. npm / 빌드 도구 없음

`import` / `export`, 번들러, 트랜스파일러 전부 못 쓴다. `<script>` 로딩만 가능하다.
외부 라이브러리는 CDN을 레이아웃에 직접 박는다.

```html
<script src="https://unpkg.com/axios/dist/axios.min.js"></script>
```

## 2. `@js` 파일들은 하나의 통합 js로 합쳐진다

카페24가 서버에서 스킨 js를 묶어 통합 파일로 출력한다.
`/ind-script/` 아래 두 개로 나온다.

```
/ind-script/optimizer.php?filename=...&type=js&k=...&t=...             ← 카페24 코어
/ind-script/optimizer_user.php?filename=...&type=js&k=...&t=...&user=T ← 스킨(내가 올린 것)
```

- `filename` — 묶인 파일 목록. **raw deflate + base64url** 인코딩
- `k` 무결성 해시, `t` 타임스탬프 → 이 둘이 캐시 키
- **압축(minify)된다.** 주석은 원본 파일에만 남고 전송량엔 안 잡힌다 → 주석은 얼마든지 달아도 된다
- 최신 문법(`?.`, `??`, 화살표, 템플릿 리터럴)은 압축 통과가 확인됐다
- 번들 위치는 `<head>` 가 아니라 **body 끝**

## 3. 실행 순서는 `@js` 선언 위치와 다르다

번들을 디코딩해서 페이지 html · 레이아웃 html의 `@js` 선언과 대조한 결과다.

**(1) 페이지 html 의 `@js` 가 레이아웃의 `@js` 보다 먼저 들어간다.**
그래서 레이아웃에서 부르는 공통 코어보다 페이지 스크립트가 먼저 실행된다.

**(2) 레이아웃 안에서는 선언 순서가 그대로 유지된다.**
head에 쓴 것 → body에 쓴 것(모듈 블록 포함) 순으로, 문서에 나온 차례대로 들어간다.

**(3) `@js` 를 `<head>` 에 선언해도 번들은 body 끝에 나간다.**
아래 예시의 레이아웃은 `@js` 를 전부 `<head>` 안에 선언했지만,
렌더링된 문서에서 번들 `<script>` 는 6,463행(총 6,664행)에 있었다.
그래서 head에 있는 CDN 스크립트(axios 등)는 번들보다 먼저 로드된다.

```
번들 위치   파일                                    선언한 곳
  1        layout/basic/js/main.js                 페이지 html
  2        myskin/timedeal.js                      페이지 html
  3        layout/basic/js/swiper-bundle.min.js    레이아웃 head 1번째
  4        js/module/product/sale_price.js         레이아웃 head 2번째
  5        layout/basic/js/basic.js                레이아웃 head 3번째
  6        layout/basic/js/layout.js               레이아웃 head 4번째
  7        js/common.js                            레이아웃 head 5번째
  8        ez/init.js                              레이아웃 head 6번째
  9        myskin/custom.js                        레이아웃 head 7번째
 10        myskin/sale.js                          레이아웃 head 8번째
 11        myskin/main/main.js                     레이아웃 head 9번째
 12        myskin/product_slide.js                 레이아웃 head 10번째
 13        myskin/front/front.js                   레이아웃 head 11번째  ← 공통 코어
 14        js/module/layout/multishopShipping.js   레이아웃 body 모듈 블록
 15        @EFD/searchpicklite/efd-searchpick.js   (앱 / @import 조각으로 추정)
 16        layout/basic/js/slidemenu.js            (앱 / @import 조각으로 추정)
```

15·16번은 레이아웃 본문에 없다. `@import` 한 조각(`header.html` 등)이나 설치된 앱에서
온 것으로 보이며, 레이아웃 본문의 `@js` 뒤에 붙는다. 이 부분만 미확인이다.

### 여기서 따라오는 가장 중요한 제약

**페이지 스크립트는 공통 코어보다 먼저 실행된다.**
페이지 파일이 파싱되는 시점에 공통 전역은 **아직 없다.**

```js
// 페이지 파일 최상위 — 공통 전역이 아직 없어서 터진다
const api = COMMON_API;                       // ✗

// 콜백 안 — 실행 시점엔 이미 존재한다
document.addEventListener('DOMContentLoaded', () => {
  COMMON_API.get(...);                        // ○
});
```

→ 공통 값은 **반드시 콜백 안에서만** 참조한다. 최상위에서 건드리지 않는다.

→ 공통 진입점 함수를 만들 거라면 **큐 스텁**으로 짠다. 그래야 로드 순서와 무관하게 동작한다.

```js
// 모든 파일 맨 위
window.FRONT = window.FRONT || {};
FRONT.page = FRONT.page || function (fn) { (FRONT._q = FRONT._q || []).push(fn); };
```

먼저 실행된 파일은 큐에 쌓고, 진짜 구현이 로드되면 큐를 비운다.

## 4. 모든 스크립트가 전역 스코프 하나를 공유한다

모듈 스코프가 없고, 게다가 여러 파일이 **하나의 스크립트로 합쳐져 파싱**되므로
파일 단위 격리가 전혀 없다.

```js
// A.js
const SELECTORS = { ... };

// B.js  ← 같은 번들에 들어가면 SyntaxError → 페이지 전체 스크립트가 죽는다
const SELECTORS = { ... };
```

- 최상위 `const` / `let` 이름이 겹치면 `SyntaxError` 로 **번들 전체가 안 돈다**
- 앞 파일이 최상위에서 예외를 던지면 뒤 파일들은 실행조차 안 된다
- 공유할 자리가 없어서 같은 함수를 이름만 바꿔 복제하게 되기 쉽다

→ **모든 파일을 IIFE로 감싼다.** 취향이 아니라 필수다.
공통으로 쓸 것은 전역 네임스페이스 하나에 모은다.

```js
(() => {
  const helper = ...;        // 밖으로 안 샘
  FRONT.util = { ... };
})();
```

## 5. 전역 이름이 이미 많이 점유돼 있다

카페24가 쓰는 전역 (렌더링 소스에서 확인):

| 이름 | 용도 |
|---|---|
| `CAFE24` | `GLOBAL_INFO`, `CURRENCY_INFO`, `COMMON_UTIL`, `SHOP_LIB_INFO` 등 |
| `CAFE24API` | 프론트 SDK. `init()`, `getCustomerInfo()`, `get/post/put/delete` |
| `CAPP_ASYNC_METHODS` | SDK 내부 구현체 |
| `EC_ROUTE` `EC_JET` `EC_GLOBAL_INFO` `EC_MOBILE_DEVICE` … | `EC_` 계열 전반 |

여기에 GTM, ADN, Enliple, 카카오, 네이버 트래커 등이 몰마다 얹힌다.

→ `CAFE24`, `CAPP_`, `EC_` 는 금지. `APP`, `COMMON` 처럼 흔한 단어도 피한다.

작업 시작 전 콘솔에서 확인:

```js
['FRONT','SHOP','MALL','CORE'].filter(n => n in window)   // [] 면 안전
```

## 6. jQuery 는 카페24 코어가 이미 싣는다

카페24 자체 코드가 `jQuery(...)`, `jQuery.inArray` 를 쓰므로 전역에 존재하고 `$` 도 쓸 수 있다.
**따로 CDN을 넣을 필요가 없다.** DOM 헬퍼를 직접 만들 이유도 없다.

## 7. 레이아웃은 보통 두 개 — 메인용 / 공통

```
/layout/basic/main.html      ← 메인 페이지 전용. 딱 하나
/layout/basic/layout.html    ← 공통. 나머지 페이지 대다수
```

**공통 js 는 두 레이아웃 모두에 `@js` 로 넣어야 한다.** 한쪽에만 넣으면 반대쪽에서 로드되지 않는다.

**둘의 CDN 구성이 다를 수 있다.** 한쪽에만 axios가 있으면 그 레이아웃을 쓰는 페이지에서만
조용히 실패한다. 새 몰 작업 시 양쪽 다 확인할 것.

---

# 작업 시작 체크리스트

1. 레이아웃이 몇 개인지 확인 (`@layout` 경로) — 보통 메인 / 공통 2개
2. 콘솔에서 쓸 네임스페이스 이름이 비어 있는지 확인
3. 필요한 CDN(axios 등)을 **모든 레이아웃**에 추가
4. 공통 js를 **모든 레이아웃**에 `@js` 로 추가
5. 페이지 파일은 IIFE로 감싸고, 공통 값은 콜백 안에서만 참조
