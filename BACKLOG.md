# 백로그

키트에 추가 예정인 공통 기능. **확인된 것과 미확인을 구분해서** 적는다.

---

## 1. 공통 장바구니 담기

**상태:** 경로 확정(SDK `addCart`). 실제 몰에서 돌려본 결과가 아래에 있다.
남은 건 키트용 `FRONT.cart.add()` 로 묶는 일뿐이다.

> 아래 "실호출로 확인된 것"은 노바딜(etlandmall) 작업에서 나온 결과다.
> 내부 폼 URL(`/exec/front/order/basket/`) 갈래는 **쓰지 않아도 된다**는 것도 여기서 정해졌다.

### 목표

- 페이지마다 `onclick="category_add_basket('24','1',...)"` 로 박던 걸 공통 함수로
- 프론트용 클래스명 통일

### 이건 기존 3종과 다른 갈래다

```
FRONT.api.middleware   자체 백엔드        JSON
FRONT.api.front        카페24 프론트 API  JSON + client_id
FRONT.api.sdk          카페24 JS SDK      콜백 + 세션
─────────────────────────────────────────────────────
/exec/front/...        카페24 내부 폼 URL  form-urlencoded + 세션 쿠키
```

문서화된 API가 아니라 스킨이 내부적으로 쓰는 폼 처리 URL이다.
`FRONT.api` 아래가 아니라 `FRONT.cart` 같은 도메인 모듈로 간다.

### 실호출로 확인된 것 (2026-09, 노바딜)

**SDK `addCart` 는 앱 스코프만으로 된다.** 개인화정보 쓰기(`mall.write_personal`) 권한이
있으면 되고, `hmac` 도 백엔드도 필요 없다. 내부 폼 URL을 쓸 이유가 없어졌다.

```js
FRONT.api.sdk.call('addCart', 'A0000', 'P', [
  { product_no: 24, variants_code: 'P000BXYZ000A', quantity: 1 },
]);
//  basket_type          A0000 일반 / A0001 무이자
//  prepaid_shipping_fee P 선불 / C 착불
//  한 번에 10개까지
```

**실패가 콜백 첫 인자로 오지 않는다.** `err` 는 `null` 인 채로 두 번째 인자에 실려 온다.
그래서 `toPromise` 만 믿으면 실패해도 `resolve` 로 흘러간다 —
실제로 그 탓에 담기지 않았는데 장바구니로 이동해버렸다. **키트에 래퍼가 필요한 지점이다.**

```js
//  { cart: [...] }                              성공
//  { errors: [{ code, message, more_info }] }   담기 거절 (422 등)
//  { error: { code, message } }                 세션 문제 (403 비로그인)
function throwIfCartError(res) {
  const first = (res && res.errors && res.errors[0]) || (res && res.error) || null;
  if (first) {
    const err = new Error(first.message || '장바구니 담기에 실패했습니다.');
    err.code = first.code;
    err.moreInfo = first.more_info;   // 어느 상품이 왜 거절됐는지가 여기 담긴다
    throw err;
  }
  return res;
}
```

**세트(번들)상품은 프론트 `addCart` 가 아예 받지 않는다.** 상품 상세에서만 담긴다.
구분할 코드가 따로 없어서 메시지로 가른다 —
`"You cannot add a bundle product to shopping cart."`

**착불(`'C'`)은 상품 설정과 다르면 422로 거절된다.**
`"Check which shipping fee payment method is configured for this product"`

**여러 개는 묶지 말고 한 개씩 보낸다.** 10개를 한 요청에 묶으면 한 상품이 거절될 때
묶음이 통째로 떨어진다 — 세트상품 하나 때문에 정상 상품까지 안 담기고, 어느 상품
탓인지도 알 수 없다. 한 개씩 보내면 담길 것은 담기고 떨어진 것만 짚어줄 수 있다.
**실패해도 reject 하지 않고 결과만 모은다.** 재시도도 하지 않는다 —
묶어 보낼 때 일부만 담겼는지 알 수 없어, 재시도하면 같은 상품이 두 번 담길 수 있었다.

### 키트에 넣을 때 정할 것

- [ ] `FRONT.cart.add(items)` 의 반환 형태 — `[{ item, ok, err }]` 를 그대로 줄지
- [ ] 담긴 뒤 처리(장바구니 카운트 갱신, 완료 레이어)를 키트가 할지 호출부가 할지
- [ ] 옵션(variant) 있는 상품을 키트에서 고르게 할지, 원본 옵션 레이어(`EC_ListAction`)로 넘길지
- [ ] 중복 클릭 방지를 키트에서 할지 (원본 `unsetOnclikAction` 이 하던 일)

### 경로 후보 2가지 (기록용 — SDK 경로로 정해졌다)

| | 내부 엔드포인트 | SDK `addCart` |
|---|---|---|
| 백엔드 개발 | 불필요 | 불필요 (`hmac` 없는 버전) |
| 앱 등록·스코프 | 불필요 | **필요** (`order` / `personal`) |
| 안정성 | 비문서. 카페24가 바꿀 수 있음 | 공식 |

SDK가 스코프만으로 동작하면 그쪽이 낫다. 확인 필요.

```js
// SDK 경로 — 이미 키트로 부를 수 있다
FRONT.api.sdk.call('addCart', 'A0000', 'F', [{ product_no: 24, quantity: 1 }]);
```

관련 SDK 메서드 (렌더링 소스에서 확인):
`addCart` `addCurrentProductToCart`(hmac 필요) `addBundleProductsCart`
`getCartList` `getCartCount` `emptyCart` `deleteCartItems`

### 내부 엔드포인트 호출 형태

```js
const params = new URLSearchParams({
  command: 'add',
  quantity: '1',
  product_no: '24',
  main_cate_no: '1',
  display_group: '5',
  basket_type: 'A0000',   // A0000 일반 / A0001 무이자
  delvtype: 'A',
  product_max_type: 'F',
  product_max: '0',
  iQuantity: '1',
  sFrom: 'category'
});

fetch('/exec/front/order/basket/', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest'
  },
  body: params.toString()
});
```

### 카페24 원본 함수 (참고)

페이지별로 다른 장바구니 함수가 더 있는 것으로 보인다. 작업 시 더 뜯어볼 것.

```js
function category_add_basket(iProductNo, iCategoryNo, iDisplayGroup, sBasketType, bList,
                             iQuantity, sItemCode, sDelvType, sProductMaxType, sProductMax)
{
    if (unsetOnclikAction(this.event.target) === false) return;
    if (iQuantity == undefined) iQuantity = 1;

    // 전용상품 구매 제한
    if (typeof EC_FRONT_JS_CONFIG_SHOP !== 'undefined'
        && EC_FRONT_JS_CONFIG_SHOP.aExclusivePurchase != null
        && EC_FRONT_JS_CONFIG_SHOP.aExclusivePurchase.hasOwnProperty(iProductNo)) {
        if (EC_FRONT_JS_CONFIG_SHOP.aExclusivePurchase[iProductNo]) {
            alert(__('EXCLUSIVE.PURCHASE.ONLY.CANNOT', 'SHOP.JS.FRONT.NEW.PRODUCT.ACTION'));
            setTimeout(setOnclikAction, 1000);
            return false;
        }
    }

    if (bList == true) {
        // ★ POST 하지 않고 옵션 선택 레이어를 띄운다
        EC_ListAction.getOptionSelect(iProductNo, iCategoryNo, iDisplayGroup, sBasketType);
    } else {
        var sAction = '/exec/front/order/basket/';
        var sData = 'command=add&quantity=' + iQuantity + '&product_no=' + iProductNo
            + '&main_cate_no=' + iCategoryNo + '&display_group=' + iDisplayGroup
            + '&basket_type=' + sBasketType + '&delvtype=' + sDelvType
            + '&product_max_type=' + sProductMaxType + '&product_max=' + sProductMax
            + '&iQuantity=' + iQuantity + '&sFrom=category';

        if (typeof basket_page_flag !== 'undefined' && basket_page_flag == 'T') {
            sData += '&basket_page_flag=' + basket_page_flag;
        }
        action_basket(2, 'category', sAction, sData, sBasketType);
    }
}
```

### 원본을 건너뛰면 같이 사라지는 것

POST는 마지막 한 줄이고 나머지가 전부 방어 로직이다.

1. **옵션상품 분기 — 제일 큼.**
   `bList == true` 면 POST를 안 하고 옵션 선택창을 연다.
   위 fetch 예시에는 옵션/variant 파라미터가 없어서, 옵션상품에 그대로 쏘면
   담기지 않거나 잘못 담긴다.
2. **중복 클릭 방지.** `unsetOnclikAction` → 실패 시 1초 뒤 해제.
   없으면 연타로 2개 담긴다.
3. **전용상품 구매 제한.** `EC_FRONT_JS_CONFIG_SHOP.aExclusivePurchase`.
4. **응답 처리 전부.** `action_basket()` 이 담기 완료 레이어, 장바구니 카운트 갱신,
   품절·최소수량·로그인필요 에러 메시지를 담당한다. 직접 POST하면 우리가 만들어야 한다.

### 확인 필요

- [x] **SDK `addCart` 가 앱 스코프만으로 되는지** — 된다 (`mall.write_personal`)
- [x] **응답 포맷** — SDK 경로로 정해져서 내부 폼 URL의 응답 포맷은 확인할 필요가 없어졌다.
      SDK 쪽 응답 형태는 위 "실호출로 확인된 것" 참고
- [ ] **옵션상품** — 키트에서 처리할지, 원본 함수(`EC_ListAction`)에 넘길지.
      `variants_code` 를 넘기면 담기는 것은 확인됐다. 고르는 UI 가 남은 문제다
- [ ] 페이지별 장바구니 함수가 몇 종류인지 (상품상세 / 목록 / 위시리스트 …)

응답 포맷 확인용 — 실제 몰 콘솔에서. **담기까지 실행되니 테스트 상품으로:**

```js
fetch('/exec/front/order/basket/', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest'
  },
  body: new URLSearchParams({
    command: 'add', quantity: '1', product_no: '24', main_cate_no: '1',
    display_group: '5', basket_type: 'A0000', delvtype: 'A',
    product_max_type: 'F', product_max: '0', iQuantity: '1', sFrom: 'category'
  }).toString()
}).then(r => r.text().then(t =>
  console.log(r.status, r.headers.get('content-type'), t.slice(0, 500))
));
```

---

## 2. 공통 관심상품(위시리스트) 담기

**상태:** 엔드포인트 경로만 확인. 메서드·파라미터·응답 전부 미확인.

```
/exec/front/Product/Wishlist/
```

관련 SDK: `getWishCount`

### 확인 필요

- [ ] GET / POST 중 무엇인지
- [ ] 파라미터명 (`product_no` 만인지, `command=add` 같은 게 필요한지)
- [ ] 응답 포맷
- [ ] 이미 담긴 상품일 때 동작 (중복 추가 / 토글 / 에러)
- [ ] 비로그인 시 동작

장바구니와 같은 방식으로 콘솔에서 확인할 것.

---

## 3. 프론트용 클래스명 통일

함수보다 이쪽이 실질 이득이 클 수 있다.
페이지마다 `onclick` 에 인자를 손으로 박는 걸 없애는 것이 목적.

```html
<button class="js-cart-add"
        data-product-no="{$product_no}"
        data-cate-no="{$category_no}"
        data-display-group="5">장바구니</button>

<button class="js-wish-add" data-product-no="{$product_no}">관심상품</button>
```

```js
// front.core.js — 위임 이벤트 하나로 전 페이지 커버
$(document).on('click', '.js-cart-add', function () {
  FRONT.cart.add($(this).data());
});
```

`{$변수}` 치환자를 `data-` 속성에 넣으면 스킨 쪽도 단순해진다.

### 정할 것

- [ ] 접두사 규칙 (`js-` 로 갈지)
- [ ] 위임 이벤트를 코어에서 자동 등록할지, 페이지에서 호출할지
- [ ] 클래스명 목록을 `FRONT.sel` 에 둘지 코어에 상수로 둘지
