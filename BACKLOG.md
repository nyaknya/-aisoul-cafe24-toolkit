# 백로그

키트에 추가 예정인 공통 기능. **확인된 것과 미확인을 구분해서** 적는다.

---

## 1. 공통 장바구니 담기

**상태:** 설계 중. 응답 포맷 미확인이라 코드 작성 전 단계.

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

### 경로 후보 2가지

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

- [ ] **응답 포맷** — 위 코드가 `res.json()` 을 쓰는데 JSON을 주는지 미확인.
      카페24 내부 폼 URL은 HTML이나 JS 조각을 뱉는 경우가 흔하다
- [ ] **옵션상품** — 키트에서 처리할지, 원본 함수(`EC_ListAction`)에 넘길지
- [ ] **SDK `addCart`** 가 앱 스코프만으로 되는지
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
