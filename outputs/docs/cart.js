/* ===================================================================
   FRONT.cart — 장바구니 담기 (SDK addCart)

   경로는 SDK addCart 로 정했다. 앱에 개인화정보 쓰기(mall.write_personal) 권한만
   있으면 되고 hmac 도 백엔드도 필요 없다. 스킨 내부 폼 URL(/exec/front/order/basket/)은
   비문서라 쓰지 않는다. (2026-09 노바딜 실호출로 확인 — BACKLOG 1번)

   키트가 하는 것: 한 개씩 순서대로 보내기, 성공 응답에 숨은 실패 걸러내기, 결과 모으기.
   호출부가 하는 것: 옵션(variant) 고르기, 중복 클릭 막기, 담은 뒤 카운트·레이어.
   화면마다 달라서 코어가 정하면 몰마다 우회하게 된다.
=================================================================== */
window.FRONT = window.FRONT || {};

(() => {
  /* SDK addCart 는 실패를 콜백 첫 인자로 주지 않는다. err 는 null 이고 두 번째 인자에 실려 온다.
       { cart: [...] }                              성공
       { errors: [{ code, message, more_info }] }   담기 거절 (422 — 품절, 착불 설정 불일치 등)
       { error: { code, message } }                 세션 문제 (403 비로그인)
     sdk.call 만 믿으면 실패도 resolve 로 흘러, 안 담겼는데 장바구니로 이동한다 */
  const toError = (res) => {
    const first = res?.errors?.[0] || res?.error;
    if (!first) return null;
    return Object.assign(new Error(first.message || '장바구니 담기에 실패했습니다.'), {
      code: first.code,
      moreInfo: first.more_info,   // 어느 상품이 왜 거절됐는지
      // 세트상품은 프론트 addCart 가 받지 않는다(상세에서만 담긴다). 구분 코드가 없어 메시지로 가른다
      bundle: /bundle/i.test(first.message || ''),
    });
  };

  // item 은 호출부의 원래 객체다. 결과에 그대로 돌려줘야 상품명 등으로 실패를 짚을 수 있다
  // toItem 이 던져도(필드 누락 등) 그 상품만 실패로 남긴다
  const addOne = async (item, toItem, basketType, prepaid) => {
    try {
      const err = toError(await FRONT.api.sdk.call('addCart', basketType, prepaid, [toItem(item)]));
      return err ? { item, ok: false, err } : { item, ok: true };
    } catch (err) {
      return { item, ok: false, err };
    }
  };

  FRONT.cart = {
    /* 한 개씩 순서대로 담고 [{ item, ok, err }] 를 준다. reject 하지 않는다.
       묶어 보내면 하나가 거절될 때 묶음이 통째로 떨어지고 어느 상품 탓인지 모른다.
       재시도도 하지 않는다 — 일부만 담겼는지 알 수 없어 같은 상품이 두 번 담길 수 있다.
       담은 뒤 처리(카운트 갱신, 완료 레이어)와 중복 클릭 막기는 호출부 몫이다.

         FRONT.cart.add(selected, {
           toItem: (p) => ({ product_no: Number(p.productNo), variants_code: p.variantsCode, quantity: 1 }),
         }).then((results) => results.filter((r) => !r.ok))   // r.item 은 selected 의 원소

       toItem      호출부 객체 → SDK 형식. 없으면 이미 SDK 형식이라고 본다
       basketType  A0000 일반 / A0001 무이자
       prepaid     P 선불 / C 착불 — 상품 설정과 다르면 422 */
    async add(items, { toItem = (x) => x, basketType = 'A0000', prepaid = 'P' } = {}) {
      const results = [];
      for (const item of [].concat(items || [])) {
        results.push(await addOne(item, toItem, basketType, prepaid));
      }
      return results;
    },
  };
})();
