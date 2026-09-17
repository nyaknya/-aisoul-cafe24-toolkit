# 백로그

키트에 추가 예정인 공통 기능. **확인된 것과 미확인을 구분해서** 적는다.

---

## 0. 실제 몰에서 확인할 것 (2026-09-17 변경분)

코드는 Node 에서 가짜 SDK · 가짜 브라우저로만 테스트했다. 아래는 실제 스킨에서 봐야 한다.

- [ ] **SDK init 자동화** — `sdk.call()` 이 처음 불릴 때 `CAFE24API.init` 을 한 번 부른다.
      `sdk.init()` 을 직접 안 부르던 페이지에서 회원 정보(`FRONT.member.fetch`) · 장바구니 수량이 전처럼 나오는지.
      `CLIENT_ID` 가 비어 있는 몰에서 어떻게 되는지
- [ ] **`FRONT.cart.add()`** — 일반 · 품절 · 세트상품을 담아 결과의 `ok` / `err` / `err.bundle` 이 맞는지
- [ ] **사파리(아이폰)** — `FRONT.util.parseDate()` 로 날짜 · 카운트다운이 나오는지
- [ ] **탭 복귀** — 목록 화면에서 다른 앱 갔다 돌아왔을 때 한 번만 바뀌고 슬라이드가 안 깨지는지
- [ ] **401 갱신** — 토큰 만료 상태로 탭에 돌아와 조회가 한꺼번에 나갈 때 갱신이 한 번만 나가는지

---

## 1. 공통 장바구니 담기

**상태:** 키트에 `FRONT.cart.add()` 로 들어갔다 (2026-09-17). 사용법은 [outputs/README.md](outputs/README.md#frontcart).
아래는 그렇게 짠 근거와 남은 확인이다.

### 남은 확인

- [ ] 성공 응답에 `cart` 가 항상 오는지. 지금은 `errors` · `error` 가 없으면 성공으로 본다
- [ ] 옵션상품 고르는 UI — 키트는 `variants_code` 를 받아 넘기기만 한다(담기는 것은 확인됨).
      옵션 레이어를 공통으로 만들지, 카페24 원본(`EC_ListAction.getOptionSelect`)을 부를지는 미정
- [ ] 세트상품 담기 — 프론트 `addCart` 는 안 받는다. `addBundleProductsCart` 로 되는지 미확인

### 정한 것

- **경로는 SDK `addCart`.** 개인화정보 쓰기(`mall.write_personal`) 권한만 있으면 되고 `hmac` 도 백엔드도
  필요 없다. 스킨 내부 폼 URL(`/exec/front/order/basket/`)은 비문서라 쓰지 않는다
- **반환은 `[{ item, ok, err }]`.** `item` 은 호출부 원래 객체(`toItem` 으로 SDK 형식 변환), `err.bundle` 로 세트상품 구분
- **한 개씩 순서대로, reject 없이, 재시도 없이** (아래 근거)
- **호출부 몫:** 담긴 뒤 처리(카운트 · 완료 레이어 · 이동), 옵션 고르기, 중복 클릭 막기 — 화면마다 다르다

### 실호출로 확인된 것 (2026-09, 노바딜)

```js
FRONT.api.sdk.call('addCart', 'A0000', 'P', [
  { product_no: 24, variants_code: 'P000BXYZ000A', quantity: 1 },
]);
//  basket_type          A0000 일반 / A0001 무이자
//  prepaid_shipping_fee P 선불 / C 착불
//  한 번에 10개까지
```

**실패가 콜백 첫 인자로 오지 않는다.** `err` 는 `null` 인 채로 두 번째 인자에 실려 온다.
`toPromise` 만 믿으면 실패해도 `resolve` 로 흘러, 담기지 않았는데 장바구니로 이동해버렸다.

```
{ cart: [...] }                              성공
{ errors: [{ code, message, more_info }] }   담기 거절 (422 등)
{ error: { code, message } }                 세션 문제 (403 비로그인)
```

- **세트(번들)상품은 받지 않는다.** 구분 코드가 없어 메시지로 가른다 — `"You cannot add a bundle product to shopping cart."`
- **착불(`'C'`)은 상품 설정과 다르면 422.** `"Check which shipping fee payment method is configured for this product"`
- **품절은 422 `"Failed to add the product to the cart"`** — 어느 상품인지 말해주지 않는다
- **여러 개를 묶으면 하나가 거절될 때 묶음이 통째로 떨어진다.** 어느 상품 탓인지도 알 수 없다.
  한 개씩 보내면 담길 것은 담기고 떨어진 것만 짚을 수 있다
- **재시도하지 않는다.** 일부만 담겼는지 알 수 없어 같은 상품이 두 번 담길 수 있었다

관련 SDK 메서드 (렌더링 소스에서 확인):
`addCart` `addCurrentProductToCart`(hmac 필요) `addBundleProductsCart`
`getCartList` `getCartCount` `emptyCart` `deleteCartItems`

### 기록 — 카페24 원본 `category_add_basket` 이 하던 일

SDK 경로로 가면서 원본 함수를 건너뛴다. 원본이 해주던 방어가 같이 사라지므로 호출부가 챙길 것들이다.

1. **옵션상품 분기** — `bList == true` 면 POST 대신 옵션 선택 레이어(`EC_ListAction.getOptionSelect`)를 연다
2. **중복 클릭 방지** — `unsetOnclikAction` → 1초 뒤 해제. 없으면 연타로 2개 담긴다
3. **전용상품 구매 제한** — `EC_FRONT_JS_CONFIG_SHOP.aExclusivePurchase`
4. **응답 처리** — `action_basket()` 이 완료 레이어, 카운트 갱신, 품절 · 최소수량 · 로그인필요 메시지를 맡았다

---

## 2. 공통 관심상품(위시리스트) 담기

**상태:** 엔드포인트 경로만 확인. 메서드·파라미터·응답 전부 미확인.
장바구니처럼 SDK 경로가 있는지부터 본다 — 있으면 내부 폼 URL 은 쓰지 않는다.

```
/exec/front/Product/Wishlist/
```

관련 SDK: `getWishCount`

### 확인 필요

- [ ] 담기용 SDK 메서드가 있는지 (`addCart` 처럼)
- [ ] 없다면 내부 URL 의 GET / POST, 파라미터명(`product_no` 만인지, `command=add` 같은 게 필요한지), 응답 포맷
- [ ] 이미 담긴 상품일 때 동작 (중복 추가 / 토글 / 에러)
- [ ] 비로그인 시 동작
- [ ] 해제 후 캐시 — 관심상품 목록을 `FRONT.cache` 로 그렸다면 `clear(key)` 가 필요하다

---

## 3. 프론트용 클래스명 통일

페이지마다 `onclick` 에 인자를 손으로 박는 걸 없애는 것이 목적.

```html
<button class="js-cart-add"
        data-product-no="{$product_no}"
        data-variants-code="{$variants_code}">장바구니</button>

<button class="js-wish-add" data-product-no="{$product_no}">관심상품</button>
```

```js
$(document).on('click', '.js-cart-add', function () {
  const d = $(this).data();
  FRONT.cart.add([{ product_no: Number(d.productNo), variants_code: d.variantsCode, quantity: 1 }])
    .then(([r]) => ...);   // 완료 처리는 화면마다
});
```

`{$변수}` 치환자를 `data-` 속성에 넣으면 스킨 쪽도 단순해진다.

### 정할 것

- [ ] 접두사 규칙 (`js-` 로 갈지)
- [ ] 위임 이벤트를 코어에서 자동 등록할지, 페이지에서 걸지.
      `cart.add` 를 "담은 뒤 처리는 호출부 몫"으로 정했으므로 코어 자동 등록이면 완료 처리 훅이 따로 필요하다
- [ ] 클래스명 목록을 `FRONT.sel` 에 둘지 코어에 상수로 둘지

---

## 4. 코어 후보 — 보류

노바딜 분석(2026-09-17)에서 반복은 보였지만 코어에 넣지 않은 것. 다른 몰에서도 같은 게 나오면 다시 본다.
**보류 이유**가 풀리는지가 기준이다.

| 후보 | 근거 | 보류 이유 |
|---|---|---|
| 카운트다운 `countdown(end, onTick)` | 노바딜 5곳+, 허닭 인증 타이머 | 마크업 · 마감임박 규칙이 몰마다 다르다. 날짜 파싱(`parseDate`)만 올렸다 |
| Swiper 재생성 헬퍼 (loop 는 슬라이드가 넘칠 때만) | 노바딜 약 10곳 | 퍼블 `slide.js` · Swiper 버전에 묶인다 |
| 페이지네이션 마크업 | 노바딜 7곳 | 허닭은 카페24 모듈 페이저. 스킨마다 `.ec-base-paginate` 안이 다르다 — README 에 복사용 예시 |
| CMS html 걸러내기 `sanitizeHtml` | 노바딜 4곳, 방식이 제각각 | 직접 짠 필터를 코어에 두면 보안 책임이 커진다. 검증된 라이브러리(DOMPurify 등)를 검토 |
| 늦은 응답 버리기 (`seq` 카운터) | 노바딜 2~3곳 | 목록 조회는 `cache.load` 의 `isValid` 가 맡는다. 캐시 안 쓰는 화면만 남았다 |
| 상품 상세 링크 `productUrl(no)` | 노바딜 8곳, 허닭 11곳 | SEO URL 사용 여부가 몰마다 다르다 |
| 미들웨어 응답 봉투 풀기 (`{ result, msg, data }`) | 노바딜 8곳 | 카페24가 아니라 우리 백엔드 규칙이다. 백엔드가 모든 몰에서 같은 봉투를 쓰는지 확인 후 |
| `copyText` / 공유 | 노바딜 1곳, 허닭 1곳 | 쓰는 곳이 적다. 함정(https · iOS)은 루트 README 13절에 적었다 |
