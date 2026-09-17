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

   3) 캐시와 실제 상태의 어긋남 잡기
      쿠키는 30분이라, 그 사이 로그아웃하거나 다른 아이디로 갈아타면
      화면은 계속 이전 회원으로 남는다. 세 겹으로 막는다.
        · 주소에 logout 이 있으면 바로 비운다
        · 로그아웃 링크 클릭을 위임으로 잡는다 (나중에 그려지는 링크도 걸린다)
        · 그래도 새는 경로(폼 제출 로그아웃, 다른 탭에서의 로그인)는
          fetch() 가 뒤에서 SDK 에 한 번 물어 확인한다 (verify)

      호출부가 clear() 를 부르기로 약속해두는 방식은 언젠가 빠뜨린다.
      실제로 그래서 로그아웃한 사람이 30분간 회원으로 보였다.
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
          if (guest) { verified = true; return resolve(null); }

          // 정상
          if (customer?.member_id) {
            verified = true;
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

  /* 캐시가 실제 로그인 상태와 같은지 뒤에서 확인한다.

     캐시된 값은 그대로 돌려준 뒤에 확인한다 — 화면을 세우는 일을 SDK 왕복만큼
     늦추지 않기 위해서다. 어긋났으면 캐시를 버리고, 계정이 바뀐 경우엔 새로 채운다.
     (그 사이 잠깐 이전 회원으로 그려질 수 있다. 회원 전용 값을 화면에 그리는
      페이지라면 verify 가 끝난 뒤 다시 그리도록 호출부에서 처리한다)

     페이지당 한 번만 돈다. 단 '판단 불가'로 끝난 경우에는 플래그를 되돌려
     다음 fetch() 가 다시 시도하게 한다 */
  let verified = false;

  const verify = (cachedId) => {
    if (verified) return;
    verified = true;

    getCustomer().then(({ ready, guest, customer }) => {
      // SDK가 아직 없다 = 판단 불가. 캐시를 건드리지 않고 다음 기회로 미룬다.
      // 여기서 캐시를 지우면 SDK가 늦게 뜬 몰에서 멀쩡한 회원이 매번 떨어져 나간다
      if (!ready) { verified = false; return; }

      const actual = guest ? null : (customer && customer.member_id) || null;

      // 로그인인데 member_id가 아직 비어 있는 과도기. 역시 판단 불가
      if (!guest && !actual) { verified = false; return; }

      if (actual === cachedId) return;

      FRONT.util.log('member 캐시 불일치 — 캐시:', cachedId, '실제:', actual);
      member.clear();           // clear()는 verified 를 건드리지 않는다 — 재검증이 루프가 되지 않는다
      if (actual) fromSdk();    // 계정이 바뀐 경우 새 회원으로 다시 채운다
    });
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
      const cached = member.info?.member_id ? member.info : FRONT.util.cookie.getJSON(COOKIE_KEY);
      if (cached?.member_id) {
        member.info = cached;
        verify(cached.member_id);
        return Promise.resolve(cached);
      }

      return fromSdk();
    },

    // 직접 부를 일은 드물다 — 아래에서 로그아웃을 스스로 잡는다.
    // 회원 정보가 바뀌는 다른 경로(회원정보 수정 후 등)를 알고 있다면 그때 부른다
    clear() {
      member.info = null;
      promise = null;
      FRONT.util.cookie.remove(COOKIE_KEY);
    },
  };

  FRONT.member = member;

  /* 로그아웃 감지 --------------------------------------------------

     쿠키가 30분이라 로그아웃해도 그 시간 동안 회원으로 보인다.

     주소로 한 번, 클릭으로 한 번 잡는다. 클릭은 위임이라 나중에 그려지는
     헤더의 링크도 걸리고, 캡처 단계(true)라 다른 핸들러가 stopPropagation 해도 온다.
     폼 제출로 로그아웃하는 스킨은 이 둘로 못 잡는다 — 그 경로는 fetch()의 verify가 받는다 */
  if (/logout/i.test(location.pathname)) member.clear();

  document.addEventListener('click', (e) => {
    if (e.target?.closest?.('a[href*="logout"]')) member.clear();
  }, true);
})();
