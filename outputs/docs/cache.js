/* ===================================================================
   FRONT.cache — 캐시하고, 뒤에서 다시 확인하기 (stale-while-revalidate)

   쓰는 곳은 "목록을 받아서 그린다"가 전부인 화면들이다.
   그냥 받아오면 페이지를 옮길 때마다 빈 화면 → 스켈레톤 → 내용이 반복된다.
   그래서 있는 값을 먼저 그리고, 오래됐으면 뒤에서 새로 받아 바뀐 것만 다시 그린다.

     FRONT.cache.get('product:115', () => api.get(...).then((r) => r.data), {
       ttl: 30000,                       // 이 시간이 지났으면 뒤에서 새로 받는다
       onRevalidate: render,             // 내용이 바뀌었을 때만 불린다. 이름 있는 함수로 넘긴다
       isValid: () => page === current,  // 늦게 온 응답을 버릴 조건
       ignore: ['viewCount'],            // 비교에서 뺄 필드
     }).then(render);

     if (!FRONT.cache.has(key)) showSkeleton();

   저장은 sessionStorage 다. 탭 단위라 새 탭은 비어 있고, 목록 → 상세 → 뒤로가기는
   같은 탭이라 살아남는다. localStorage 로 하면 며칠 전 가격이 남는다.

   설계에서 정한 것 두 가지:

     1) ttl 은 "언제 다시 받을까"만 정한다. 얼마나 오래됐든 일단 그린다 —
        단, maxAge(기본 30분)를 넘긴 것은 그리지 않고 기다린다.
        두 시간 전 가격을 보여줬다가 눈앞에서 바꾸는 건 안 보여주느니만 못하다.
     2) 내용이 그대로면 onRevalidate 를 부르지 않는다.
        무조건 다시 그리면 스크롤 위치·열어둔 아코디언·슬라이드 위치가 초기화된다.
=================================================================== */
window.FRONT = window.FRONT || {};

(() => {
  const memory = {};   // 이 페이지가 살아있는 동안의 캐시
  const inflight = {}; // 같은 키로 동시에 들어온 요청은 하나만 나간다
  const PREFIX = 'front_cache:';

  /* ttl 은 '언제 뒤에서 다시 받을까'만 정한다. 얼마나 오래됐든 일단 화면에 뿌린다.
     sessionStorage 는 탭이 살아 있는 내내 남으므로, 두 시간 자리를 비웠다 돌아오면
     두 시간 전 가격과 재고가 먼저 그려졌다가 교체된다. 값이 눈앞에서 바뀌는 건
     안 보여주느니만 못하다.

     maxAge 를 넘긴 캐시는 그리지 않고 새로 받을 때까지 기다린다(스켈레톤 유지).
     단, 새로 받는 데 실패하면 아무리 오래됐어도 있는 걸 쓴다 — 끊긴 사용자에게
     빈 화면을 주는 게 더 나쁘다. */
  const MAX_AGE = 30 * 60 * 1000;

  // sessionStorage는 페이지 이동(리스트→상세→뒤로가기)을 넘어 살아남는다.
  // 탭 단위라 새 탭에서 열면 비어 있다 — 그게 더 안전하다
  const readSession = (key) => {
    try {
      const raw = sessionStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  };

  const writeSession = (key, entry) => {
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify(entry));
    } catch (e) {
      // 용량 초과 등. 캐시는 실패해도 흐름을 막지 않는다
    }
  };

  // 메모리 → sessionStorage 순으로 읽고, 읽은 것은 메모리에 올린다
  const readEntry = (key) => {
    const entry = memory[key] || readSession(key);
    if (entry) memory[key] = entry;
    return entry;
  };

  // _run(무엇을 그릴까)과 has(스켈레톤을 띄울까)가 같은 기준을 써야 한다 — 한 곳에만 둔다
  const isExpired = (entry, maxAge) => !!maxAge && Date.now() - entry.time >= maxAge;

  // 바뀌었는지 비교할 때 쓸 지문. ignore에 준 이름은 깊이 상관없이 빼고 본다.
  // 요청할 때마다 값이 달라지는 필드(조회수처럼 우리 조회로 값이 올라가는 것)가
  // 섞여 있으면, 내용이 그대로인데도 매번 다시 그리게 된다
  const fingerprint = (value, ignore) =>
    (!ignore || !ignore.length)
      ? JSON.stringify(value)
      : JSON.stringify(value, (k, v) => (ignore.indexOf(k) > -1 ? undefined : v));

  /* 화면에 살아 있는 조회들.
     탭에 돌아왔을 때 무엇을 다시 확인할지 알아야 한다.

     onRevalidate 함수를 열쇠로 쓴다. 같은 렌더 함수 = 같은 DOM 자리라는 뜻이라,
     상품목록에서 1→2→3페이지로 넘어가면 3페이지 등록이 1페이지 것을 밀어낸다.
     키로 모으면 세 페이지를 다 다시 받아 마지막에 도착한 것이 화면을 차지한다 —
     3페이지를 보고 있는데 1페이지가 그려질 수 있다.

     이 목록은 페이지 자바스크립트와 수명이 같다. 다른 페이지로 가면 통째로 사라지고,
     뒤로가기(bfcache)로 돌아오면 등록도 같이 살아 돌아온다 */
  const live = new Map();

  const cache = {
    // 캐시가 있으면 즉시 반환하고, ttl이 지났으면 뒤에서 새로 받아 onRevalidate로 알린다.
    // 내용이 그대로면 onRevalidate는 부르지 않는다 — 불필요한 리렌더를 막는다
    //   FRONT.cache.get(key, fetcher, { ttl, maxAge, onRevalidate, isValid, ignore })
    // maxAge 를 넘긴 캐시는 아예 그리지 않는다(위 MAX_AGE 참고). 0 을 주면 상한 없음
    get(key, fetcher, opts = {}) {
      // 기본값은 여기서 한 번만 채운다. live 에도 채운 것을 담아야 revalidateAll 이 다시 채우지 않는다
      const { ttl = 30000, maxAge = MAX_AGE } = opts;
      const o = { ...opts, ttl, maxAge };
      if (o.onRevalidate) live.set(o.onRevalidate, { key, fetcher, opts: o });
      return cache._run(key, fetcher, o);
    },

    _run(key, fetcher, { ttl, maxAge, onRevalidate, isValid, ignore }) {
      const entry = readEntry(key);

      const refetch = () => {
        if (inflight[key]) return inflight[key];
        inflight[key] = fetcher()
          .then((data) => {
            memory[key] = { data, time: Date.now() };
            writeSession(key, memory[key]);
            delete inflight[key];
            return data;
          })
          .catch((err) => {
            delete inflight[key];
            throw err;
          });
        return inflight[key];
      };

      if (!entry) return refetch();

      // 너무 오래됐다 — 그리지 않고 기다린다.
      // 못 받아오면 그때 가서 있는 것이라도 쓴다
      if (isExpired(entry, maxAge)) {
        FRONT.util.log('캐시가 maxAge 를 넘겨 새로 받는다:', key);
        return refetch().catch(() => entry.data);
      }

      if (Date.now() - entry.time >= ttl) {
        refetch()
          .then((fresh) => {
            if (!onRevalidate) return;
            // 응답이 늦게 왔는데 그 사이 화면이 바뀌었으면 그리지 않는다
            if (isValid && !isValid()) return;
            if (fingerprint(fresh, ignore) === fingerprint(entry.data, ignore)) return;
            onRevalidate(fresh);
          })
          .catch(() => {}); // 백그라운드 실패는 조용히 넘긴다. 화면엔 이미 캐시가 떠 있다
      }
      return Promise.resolve(entry.data);
    },

    /* 화면에 살아 있는 조회들을 다시 확인한다.
       ttl이 안 지난 것은 _run이 알아서 그냥 캐시를 돌려주고 끝나므로,
       여기서 나이를 따로 볼 필요가 없다. 같은 키로 이미 나간 요청이 있으면
       inflight이 합쳐준다 — 이벤트가 겹쳐 들어와도 요청은 한 번만 나간다 */
    revalidateAll() {
      let n = 0;
      live.forEach(({ key, fetcher, opts }) => {
        // 호출부가 '아직 이 화면이 맞나'를 판단할 수 있으면 존중한다
        if (opts.isValid && !opts.isValid()) return;
        n++;
        // maxAge 는 첫 렌더에서 '무엇을 그릴까'를 정하는 규칙이다.
        // 여기선 화면에 이미 내용이 떠 있으므로 꺼야 한다 — 켜두면 _run 이
        // 그냥 refetch 만 하고 onRevalidate 를 안 불러, 오래 자리를 비웠던
        // 사람일수록 화면이 안 바뀐다
        cache._run(key, fetcher, { ...opts, maxAge: 0 })
          .catch(() => {});   // 화면엔 이미 캐시가 떠 있다. 조용히 넘긴다
      });
      FRONT.util.log('재검증 대상 ' + n + '건');
      return n;
    },

    // 키를 주면 하나만, 안 주면 전부.
    // 살아 있는 조회 목록도 같이 정리한다 — 안 그러면 비워놓은 캐시를
    // 다음 탭 복귀 때 유령 등록이 도로 채운다
    clear(key) {
      if (key) {
        delete memory[key];
        try { sessionStorage.removeItem(PREFIX + key); } catch (e) {}
        live.forEach((v, fn) => { if (v.key === key) live.delete(fn); });
        return;
      }
      live.clear();
      Object.keys(memory).forEach((k) => delete memory[k]);
      try {
        Object.keys(sessionStorage)
          .filter((k) => k.indexOf(PREFIX) === 0)
          .forEach((k) => sessionStorage.removeItem(k));
      } catch (e) {}
    },


    /* '지금 그릴 수 있는 값이 있나'를 묻는 것이다. 호출부는 전부
       if (!has(key)) 스켈레톤 으로 쓴다.

       maxAge 를 넘긴 캐시는 _run 이 그리지 않고 새로 받을 때까지 기다린다.
       그런데 여기서 true 를 주면 호출부가 스켈레톤을 감춰버려, 정작 기다리는
       동안 빈 자리가 남는다 — 스켈레톤이 가장 필요한 순간에 없어지는 셈이다.
       그래서 나이도 같이 본다. 기준은 _run 과 같아야 하므로 인자로 받는다 */
    has(key, maxAge = MAX_AGE) {
      const entry = readEntry(key);
      return !!entry && !isExpired(entry, maxAge);
    },

  };

  FRONT.cache = cache;

  /* 돌아왔을 때 다시 확인한다 ------------------------------------------
     여태는 페이지를 옮겨야만 재검증이 걸렸다. 모바일에서 앱을 바꿨다가
     10분 뒤 돌아오면 옛날 화면이 그대로 남아 있었다.

     visibilitychange  탭 전환·화면 끔 (모바일은 대부분 이것)
     focus             데스크톱에서 다른 앱 갔다 오기 — 이땐 탭이 계속 visible 이라
                       visibilitychange 가 안 뜬다
     online            끊겼다 붙었을 때. 그동안 실패한 조회를 만회한다
     pageshow          뒤로가기 bfcache 복원. persisted 일 때만.
                       — 카페24 스킨 페이지에서는 보통 안 뜬다. 카페24가
                         Cache-Control: no-store 를 보내 bfcache 를 막는다
                         (notRestoredReasons: response-cache-control-no-store).
                         뒤로가면 페이지가 통째로 다시 뜨므로 그 경로는 어차피
                         스크립트가 처음부터 도는 것과 같다. 언젠가 헤더가 바뀌면
                         저절로 맞게 도록 남겨둔다

     visibilitychange 와 focus 는 복귀 때 같이 뜬다. inflight 이 요청은 하나로
     합쳐주지만 콜백까지 합쳐주진 않는다 — _run 이 그 하나의 약속에 저마다
     .then(onRevalidate) 을 매달아서, 요청 한 번에 onRevalidate 가 두 번 불렸다.
     다시 그리며 이전 것을 부수는 렌더(스와이퍼를 destroy 하고 다시 만드는 것 등)는
     두 번 돌면 깨진다. 그래서 요청이 아니라 트리거 쪽에서 합친다 */
  const WAKE_MERGE = 50;   // 같은 복귀에서 온 이벤트끼리만 묶일 만큼 짧게
  let wakeTimer = null;

  const wake = (why) => {
    if (document.visibilityState === 'hidden') return;
    clearTimeout(wakeTimer);
    wakeTimer = setTimeout(() => {
      wakeTimer = null;
      FRONT.util.log('재검증 트리거:', why);
      cache.revalidateAll();
    }, WAKE_MERGE);
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake('visibilitychange');
  });
  window.addEventListener('focus', () => wake('focus'));
  window.addEventListener('pageshow', (e) => { if (e.persisted) wake('bfcache'); });
  window.addEventListener('online', () => wake('online'));
})();
