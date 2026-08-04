/* ===================================================================
   FRONT.member — 로그인 회원 정보

   카페24 SDK로 회원 정보를 가져오되, 두 가지를 처리한다.

   1) 쿠키 캐시
      페이지마다 SDK를 다시 부르면 느리다. 30분간 쿠키에 담아둔다.
      민감하지 않은 필드만 담는다(FIELDS).

   2) 재시도
      카페24 SDK는 로그인 상태인데도 초기에 member_id 없이
      빈 값을 돌려주는 경우가 있다. 1초 간격으로 최대 10회 다시 묻는다.

      단, 비로그인일 때는 SDK가 Error(403)을 준다.
        __sessionErr: callback(new Error(403), { error: { code: 403 } })
      이건 "아직 안 들어옴"이 아니라 "회원이 아님"이므로 재시도하면 안 된다.
      비회원마다 10초를 헛돌게 된다.
=================================================================== */
window.FRONT = window.FRONT || {};

(() => {
  const COOKIE_KEY = 'front_member';
  const COOKIE_MIN = 30;

  // 쿠키에 담을 필드. 여기 없는 값은 저장되지 않는다
  const FIELDS = ['member_id', 'group_name', 'group_no', 'nick_name', 'name'];

  const MAX_RETRY = 10;
  const RETRY_MS = 1000;

  // 동시에 여러 곳에서 불러도 SDK 요청은 한 번만 나가게 잡아두는 Promise
  let promise = null;

  // 결과를 세 가지로 구분한다. 이 구분이 캐시 정책을 정한다.
  //
  //   { ready: false }              SDK 자체가 아직 없음 → 판단 불가.
  //                                 캐시하면 SDK가 늦게 뜬 회원이 페이지 내내 비회원이 된다
  //   { ready: true, guest: true }  SDK가 Error(403) → 비회원 확정. 재시도 대상 아님
  //   { ready: true, customer }     로그인. member_id가 비어 있으면 재시도 대상
  //
  // FRONT.api.sdk.customer() 를 쓰지 못하는 이유가 이것이다.
  // 그쪽은 세 경우를 전부 null로 뭉갠다.
  const getCustomer = () => {
    if (typeof CAFE24API === 'undefined') return Promise.resolve({ ready: false });

    return FRONT.api.sdk
      .call('getCustomerInfo')
      .then((res) => ({ ready: true, customer: res?.customer }))
      .catch(() => ({ ready: true, guest: true }));
  };

  const saveCookie = (customer) => {
    const slim = {};
    FIELDS.forEach((k) => {
      if (customer[k] != null) slim[k] = customer[k];
    });
    FRONT.util.cookie.setJSON(COOKIE_KEY, slim, COOKIE_MIN);
  };

  const fromSdk = () => {
    if (promise) return promise;

    promise = new Promise((resolve) => {
      let attempts = 0;

      const attempt = () => {
        getCustomer().then(({ ready, guest, customer }) => {
          // 판단 불가 — 메모를 버려서 다음 fetch()가 다시 물어보게 한다
          if (!ready) {
            promise = null;
            return resolve(null);
          }

          // 아래 경로들은 결과가 확정이므로 메모를 유지한다.
          // promise를 null로 되돌리면 비회원이 fetch()를 부를 때마다
          // SDK 왕복이 새로 생긴다 — 쇼핑몰 트래픽은 비회원이 다수다.
          // 다시 묻고 싶으면 clear()를 부른다.
          if (guest) return resolve(null);

          // 정상
          if (customer?.member_id) {
            member.info = customer;
            saveCookie(customer);
            return resolve(customer);
          }

          // 로그인인데 아직 안 채워짐 — 재시도
          if (++attempts < MAX_RETRY) {
            FRONT.util.log(`member 재시도 ${attempts}/${MAX_RETRY}`);
            return setTimeout(attempt, RETRY_MS);
          }

          // 끝까지 못 받음 — 캐시를 지우고 포기.
          // 여기서도 메모는 유지한다. 안 그러면 다음 호출이 10초짜리 루프를 또 돈다
          FRONT.util.cookie.remove(COOKIE_KEY);
          resolve(null);
        });
      };

      attempt();
    });

    return promise;
  };

  const member = {
    // 마지막으로 조회된 회원 정보. 조회 전이면 null
    info: null,

    // 로그인 회원 정보를 Promise로 준다. 비로그인이면 null
    //   FRONT.member.fetch().then((m) => { if (!m) return; ... })
    //
    // 순서: 메모리 → 쿠키 캐시 → SDK
    // 동시에 여러 번 불러도 SDK 요청은 한 번만 나간다
    fetch() {
      if (member.info?.member_id) return Promise.resolve(member.info);

      const cached = FRONT.util.cookie.getJSON(COOKIE_KEY);
      if (cached?.member_id) {
        member.info = cached;
        return Promise.resolve(cached);
      }

      return fromSdk();
    },

    // 로그아웃 링크에 걸어둔다.
    // 안 지우면 로그아웃 후에도 30분간 이전 회원 정보가 남는다
    //   $(document).on('click', '.logout-btn a', FRONT.member.clear);
    clear() {
      member.info = null;
      promise = null;
      FRONT.util.cookie.remove(COOKIE_KEY);
    },
  };

  FRONT.member = member;
})();
