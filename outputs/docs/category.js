/* ===================================================================
   FRONT.category — 카테고리 조회

   카페24 프론트 API(/api/v2/categories)로 하위 카테고리를 가져온다.
   같은 목록을 여러 곳에서 쓰는 일이 잦아서 parentNo별로 캐시한다.

   SDK(CAFE24API.get)로도 부를 수 있지만 프론트 API 쪽이 단순하다.
   client_id 헤더만 있으면 되고 SDK 초기화가 필요 없다.

   캐시 정책("성공은 재사용, 실패는 버리고 다음에 재시도")은 FRONT.util.once 가
   이미 구현하고 있다. 여기서 직접 짜면 정책이 두 벌이 되므로 once 를 쓴다.
   once 는 인자를 키로 쓰지 않으므로, parentNo별로 once 를 하나씩 만들어 둔다.
=================================================================== */
window.FRONT = window.FRONT || {};

(() => {
  // { 'parentNo:limit': once로 감싼 로더 }
  const loaders = {};

  const category = {
    // 하위 카테고리 목록
    //   FRONT.category.list(115).then((list) => ...)
    //
    // 같은 parentNo로 여러 번 불러도 요청은 한 번만 나간다
    list(parentNo, limit = 100) {
      const key = `${parentNo}:${limit}`;

      loaders[key] = loaders[key] || FRONT.util.once(() =>
        FRONT.api.front
          .get('/api/v2/categories', { parent_category_no: parentNo, limit })
          .then((res) => res.data?.categories || []));

      return loaders[key]();
    },

    // 이름이 정확히 일치하는 하위 카테고리. 없으면 null
    //   FRONT.category.findByName('브랜드명', 115)
    //     .then((c) => { if (c) location.href = `/product/list.html?cate_no=${c.category_no}`; })
    findByName(name, parentNo, limit) {
      const target = String(name ?? '').trim();
      if (!target) return Promise.resolve(null);

      return category
        .list(parentNo, limit)
        .then((list) => list.find((c) => c.category_name === target) || null);
    },
  };

  FRONT.category = category;
})();
