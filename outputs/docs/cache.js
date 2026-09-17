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

   목록 화면이면 위 둘을 묶은 load 를 쓴다. has 와 get 의 maxAge 를 맞출 필요가 없고,
   늦게 온 응답·실패를 isValid 로 거르는 것까지 한다.

     FRONT.cache.load(key, fetcher, { render, skeleton: showSkeleton, onError: showError, isValid });

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

  // get(무엇을 그릴까)과 has(스켈레톤을 띄울까)가 같은 기준을 써야 한다 — 한 곳에만 둔다
  const isExpired = (entry, maxAge) => !!maxAge && Date.now() - entry.time >= maxAge;

  // get(뒤에서 새로 받을까)과 revalidateAll(탭 복귀 때 받을까)의 기준. 역시 한 곳에만 둔다.
  // isExpired 와 달리 0 은 '항상 오래됨'이다
  const isStale = (entry, ttl) => Date.now() - entry.time >= ttl;

  // 바뀌었는지 비교할 때 쓸 지문. ignore에 준 이름은 깊이 상관없이 빼고 본다.
  // 요청할 때마다 값이 달라지는 필드(조회수처럼 우리 조회로 값이 올라가는 것)가
  // 섞여 있으면, 내용이 그대로인데도 매번 다시 그리게 된다
  const fingerprint = (value, ignore) =>
    JSON.stringify(value, ignore?.length ? (k, v) => (ignore.includes(k) ? undefined : v) : undefined);

  // 같은 키로 이미 나간 요청이 있으면 그것을 돌려준다.
  // 돌아왔을 때 inflight 에서 빠져 있으면 clear() 가 버린 요청이다. 캐시에 쓰지 않고(지운 값이 되살아난다)
  // p.cancelled 로 남겨, 뒤에 매달린 revalidate · get 도 그리지 않게 한다
  const refetch = (key, fetcher) => {
    if (inflight[key]) return inflight[key];
    const p = fetcher()
      .then((data) => {
        if (inflight[key] !== p) {
          p.cancelled = true;
        } else {
          memory[key] = { data, time: Date.now() };
          writeSession(key, memory[key]);
        }
        return data;
      })
      .finally(() => { if (inflight[key] === p) delete inflight[key]; });
    p.notified = new Set();   // 이 응답에 이미 매단 onRevalidate 들
    p.direct = new Set();     // 이 응답을 get() 이 기다려 돌려줘서 호출부가 직접 그리는 onRevalidate 들
    return (inflight[key] = p);
  };

  /* 뒤에서 새로 받아, 화면에 떠 있는 것(prev)과 다를 때만 onRevalidate 를 부른다.
     prev 가 없으면(첫 조회가 실패해 화면이 비어 있다) 받는 대로 부른다.

     한 응답에 같은 onRevalidate 는 한 번만 매단다. 탭 복귀 때 visibilitychange 와
     focus 가 같이 뜨거나, 페이지 로드 때 나간 재검증에 복귀가 합류하면 같은 요청에
     두 번 매달려 두 번 그려진다. 부수고 다시 만드는 렌더(스와이퍼 등)는 그러면 깨진다 */
  const revalidate = (key, fetcher, prev, { onRevalidate, isValid, ignore }) => {
    const p = refetch(key, fetcher);
    if (!onRevalidate) return p.catch(() => {});
    if (p.notified.has(onRevalidate)) return p;
    p.notified.add(onRevalidate);
    return p
      .then((fresh) => {
        // clear() 가 버린 요청이다. 늦게 와서 새로 받은 화면을 덮지 않게
        if (p.cancelled) return;
        // 응답이 늦게 왔는데 그 사이 화면이 바뀌었으면 그리지 않는다
        if (isValid && !isValid()) return;
        // 먼저 매달린 뒤 get() 이 같은 요청을 기다려 돌려줬다 — 그쪽이 그리므로 여기선 넘긴다
        if (p.direct.has(onRevalidate)) return;
        if (prev && fingerprint(fresh, ignore) === fingerprint(prev.data, ignore)) return;
        onRevalidate(fresh);
      })
      .catch(() => {}); // 백그라운드 실패는 조용히 넘긴다
  };

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

      // 호출부가 이 응답을 직접 그린다. 기다리는 사이 탭 복귀(revalidateAll)가 같은 요청에
      // onRevalidate 를 매달면 한 응답이 두 번 그려지므로, 이미 매단 것으로 쳐둔다
      const awaited = () => {
        const p = refetch(key, fetcher);
        if (o.onRevalidate) { p.notified.add(o.onRevalidate); p.direct.add(o.onRevalidate); }
        return p.then((data) => {
          if (!p.cancelled) return data;
          // 기다리는 사이 clear() 가 이 요청을 버렸다. 그 뒤에 받은 값이 있으면 그것을, 없으면 다시 기다린다
          const fresh = readEntry(key);
          return fresh ? fresh.data : awaited();
        });
      };

      const entry = readEntry(key);
      if (!entry) return awaited();

      // 너무 오래됐다 — 그리지 않고 기다린다.
      // 못 받아오면 그때 가서 있는 것이라도 쓴다
      if (isExpired(entry, maxAge)) {
        FRONT.util.log('캐시가 maxAge 를 넘겨 새로 받는다:', key);
        // 지금 캐시에 있는 값으로 물러선다 — 그 사이 새로 받았으면 새 값, clear() 로 지워졌으면 에러
        return awaited().catch((err) => {
          const cur = readEntry(key);
          if (cur) return cur.data;
          throw err;
        });
      }

      if (isStale(entry, ttl)) revalidate(key, fetcher, entry, o);
      return Promise.resolve(entry.data);
    },

    /* 목록 화면의 흐름을 한 번에 — 스켈레톤 → get → 그리기 → 실패 처리.
         FRONT.cache.load(key, fetcher, { render, skeleton, onError, isValid, ttl, maxAge, ignore })

       get + has 를 손으로 조합하면 두 군데서 어긋났다.
         - has() 에 get() 과 같은 maxAge 를 넘겨야 한다
         - isValid 는 재검증 때만 불린다. 캐시가 없는 첫 조회는 get().then 으로 바로 오므로
           호출부가 거기서 한 번 더 확인해야 했다 — 빠뜨리면 늦게 온 1페이지가 3페이지를 덮는다
       여기선 성공·재검증·실패 모두 isValid 를 거친다.
       render 는 onRevalidate 로도 쓰이므로 이름 있는 함수로 넘긴다(get 의 주의와 같다).
       onError 가 없으면 reject 를 그대로 올린다 */
    load(key, fetcher, { render, skeleton, onError, isValid = () => true, ...opts }) {
      if (skeleton && !cache.has(key, opts.maxAge)) skeleton();
      return cache.get(key, fetcher, { ...opts, isValid, onRevalidate: render })
        .then((data) => { if (isValid()) render(data); })
        .catch((err) => {
          if (!isValid()) return;
          if (!onError) throw err;
          onError(err);
        });
    },

    /* 화면에 살아 있는 조회들을 다시 확인한다.
       maxAge 는 보지 않는다 — 그건 첫 렌더에서 '무엇을 그릴까'를 정하는 규칙이고,
       여기선 화면에 이미 무언가 떠 있다. 캐시가 아예 없는 것(첫 조회가 실패한 것)도
       다시 받아 그린다 — online 복귀가 만회하려는 게 바로 그 경우다.
       같은 키로 이미 나간 요청이 있으면 inflight 이 합쳐준다 */
    revalidateAll() {
      let n = 0;
      live.forEach(({ key, fetcher, opts }) => {
        // 호출부가 '아직 이 화면이 맞나'를 판단할 수 있으면 존중한다
        if (opts.isValid && !opts.isValid()) return;
        const entry = readEntry(key);
        if (entry && !isStale(entry, opts.ttl)) return;
        n++;
        revalidate(key, fetcher, entry, opts);
      });
      FRONT.util.log('재검증 대상 ' + n + '건');
      return n;
    },

    // 키를 주면 하나만, 안 주면 전부.
    // 살아 있는 조회 목록도 같이 정리한다 — 안 그러면 비워놓은 캐시를
    // 다음 탭 복귀 때 유령 등록이 도로 채운다.
    // 나가 있는 요청도 놓는다 — 돌아와서 옛 값을 다시 쓰지 않게, 다음 get() 이 거기 합류하지 않게
    clear(key) {
      if (key) {
        delete memory[key];
        delete inflight[key];
        try { sessionStorage.removeItem(PREFIX + key); } catch (e) {}
        live.forEach((v, fn) => { if (v.key === key) live.delete(fn); });
        return;
      }
      live.clear();
      Object.keys(memory).forEach((k) => delete memory[k]);
      Object.keys(inflight).forEach((k) => delete inflight[k]);
      try {
        Object.keys(sessionStorage)
          .filter((k) => k.indexOf(PREFIX) === 0)
          .forEach((k) => sessionStorage.removeItem(k));
      } catch (e) {}
    },


    /* '지금 그릴 수 있는 값이 있나'를 묻는 것이다. 호출부는 전부
       if (!has(key)) 스켈레톤 으로 쓴다.

       maxAge 를 넘긴 캐시는 get 이 그리지 않고 새로 받을 때까지 기다린다.
       그런데 여기서 true 를 주면 호출부가 스켈레톤을 감춰버려, 정작 기다리는
       동안 빈 자리가 남는다 — 스켈레톤이 가장 필요한 순간에 없어지는 셈이다.
       그래서 나이도 같이 본다. 기준은 get 과 같아야 하므로 인자로 받는다 */
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

     visibilitychange 와 focus 는 복귀 때 같이 뜬다. 따로 합치지 않는다 —
     요청은 inflight 이, 콜백은 revalidate 가 응답당 한 번으로 합친다 */
  const wake = (why) => {
    if (document.visibilityState === 'hidden') return;
    FRONT.util.log('재검증 트리거:', why);
    cache.revalidateAll();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake('visibilitychange');
  });
  window.addEventListener('focus', () => wake('focus'));
  window.addEventListener('pageshow', (e) => { if (e.persisted) wake('bfcache'); });
  window.addEventListener('online', () => wake('online'));
})();
