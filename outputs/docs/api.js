/* ===================================================================
   FRONT.api — API 통신

   axios(CDN)가 전역에 있어야 한다.
   인스턴스는 첫 요청 때 만들어진다. 번들이 CDN보다 먼저 실행되는 경우가
   있어서 최상위에서 axios.create() 를 부르면 안 되기 때문이다.
=================================================================== */
window.FRONT = window.FRONT || {};

(() => {
  const resolve = (v) => (typeof v === 'function' ? v() : v);

  // opts: { name, baseURL, headers, token, onUnauthorized, ...그 외 axios 옵션 }
  //   baseURL / headers 는 함수로 넘기면 첫 요청 때 평가된다 (config 로드 순서 무관)
  //   token 은 문자열 또는 함수. 있으면 Authorization: Bearer 로 붙는다
  //   onUnauthorized 는 401 을 만났을 때 부를 갱신 함수. Promise 를 돌려줘야 한다
  //   나머지(timeout, withCredentials, responseType …)는 axios로 그대로 전달된다.
  //   키트가 아는 옵션만 화이트리스트로 받으면, 옵션 하나 쓰려고 raw()로
  //   인스턴스를 꺼내 defaults를 직접 만지는 상황이 생긴다.
  const create = ({ name = 'API', baseURL, headers, token, onUnauthorized, ...axiosOpts } = {}) => {
    let inst = null;
    let auth = token;

    // 진행 중인 토큰 갱신. 401을 동시에 여러 개 받아도 갱신은 한 번만 나가게 한다
    let refreshing = null;

    const client = () => {
      if (inst) return inst;

      if (typeof axios === 'undefined') {
        throw new Error(
          `[FRONT.api] axios가 없습니다. (${name})\n` +
            '이 페이지가 쓰는 레이아웃에 axios CDN <script> 태그가 있는지 확인하세요.\n' +
            '레이아웃이 메인용/공통 두 개라면 양쪽 다 넣어야 합니다.',
        );
      }

      const url = resolve(baseURL);
      if (!url) {
        throw new Error(`[FRONT.api] ${name}의 주소가 비어 있습니다. FRONT.config를 확인하세요.`);
      }

      // Content-Type을 여기서 고정하지 않는다.
      // axios가 본문 종류를 보고 정한다 — 객체면 application/json,
      // FormData면 boundary가 포함된 multipart/form-data.
      // 직접 'multipart/form-data' 를 박으면 boundary가 빠져서 서버가 못 읽는다.
      inst = axios.create({ ...axiosOpts, baseURL: url, headers: resolve(headers) });

      inst.interceptors.request.use((cfg) => {
        const t = resolve(auth);
        cfg.__token = t;   // 어떤 토큰으로 나갔는지. 401 때 이미 갱신됐는지 가린다
        if (t) cfg.headers.Authorization = `Bearer ${t}`;
        return cfg;
      });

      /* 401 → 토큰 한 번 갱신 → 그 요청만 재전송.

         cfg.__retried 로 한 번만 한다. 표시를 안 남기면 갱신된 토큰도 거절당하는
         경우(권한 부족, 서버가 계속 401)에 무한 재시도가 된다.

         갱신 자체도 하나로 합친다(refreshing). 요청마다 따로 부르면 같은
         refreshToken 으로 갱신 요청이 동시에 여러 개 나간다. 쓴 refreshToken 을
         무효화하는 서버라면 두 번째부터 4xx 를 받고, 그걸 '재로그인 필요'로 해석하는
         쪽에서는 멀쩡한 사용자가 로그아웃된다. 회전하지 않는 서버라도 늦게 온 갱신이
         먼저 받은 accessToken 을 덮어써서, 재시도 요청이 이미 버려진 토큰으로 나간다.

         이게 드문 상황이 아니다 — 탭에 돌아오면 FRONT.cache 가 화면에 살아 있는
         조회를 한꺼번에 다시 던지는데, 자리를 오래 비웠다 돌아온 참이라 토큰이
         만료돼 있을 확률이 가장 높은 순간이기도 하다.

         갱신이 실패하면 원래의 401 을 올린다. 갱신 실패 에러를 그대로 올리면
         호출부가 '인증 안 됨'을 '토큰 서버 오류'로 보게 된다 —
         훅을 안 채운 몰에서도 같은 이유로 401 이 그대로 나가야 맞다.

         응답 인터셉터는 요청이 나갈 axios 인스턴스에만 건다. 전역 axios 에 걸면
         몰에 설치된 다른 스크립트의 요청까지 같이 낚아챈다 */
      if (onUnauthorized) {
        inst.interceptors.response.use(null, (err) => {
          const cfg = err.config;
          if (!cfg || cfg.__retried || !err.response || err.response.status !== 401) {
            return Promise.reject(err);
          }
          cfg.__retried = true;

          // 이 요청이 나간 뒤 토큰이 이미 바뀌었다 = 앞선 갱신이 끝났다. 새 토큰으로 다시 보내기만 한다.
          // refreshing 은 갱신이 끝나면 비워지므로 그것만으로는 합쳐지지 않는다 — 옛 토큰으로 나갔던
          // 느린 요청의 401 이 뒤늦게 오면 이미 쓴 refreshToken 으로 갱신이 한 번 더 나간다
          if (!refreshing && cfg.__token !== resolve(auth)) return inst.request(cfg);

          if (!refreshing) {
            refreshing = onUnauthorized();
            // 성공·실패 둘 다 여기서 받아 놓아준다. 실패를 안 받으면 처리되지 않은
            // 거절로 남고, 놓아주지 않으면 다음 401 이 영영 갱신을 못 한다
            refreshing.then(() => { refreshing = null; }, () => { refreshing = null; });
          }

          return refreshing.then(() => inst.request(cfg), () => Promise.reject(err));
        });
      }

      return inst;
    };

    const api = {
      // get('/path', { page: 1 })  ← 두 번째 인자가 쿼리스트링
      get(url, params, config) {
        return client().get(url, { params, ...config });
      },
      post(url, data, config) {
        return client().post(url, data, config);
      },
      put(url, data, config) {
        return client().put(url, data, config);
      },
      patch(url, data, config) {
        return client().patch(url, data, config);
      },
      delete(url, config) {
        return client().delete(url, config);
      },

      // 토큰을 나중에 넣거나 바꿀 때. 문자열도 함수도 받는다
      setToken(v) {
        auth = v;
        return api;
      },

      // axios 인스턴스가 직접 필요할 때 (인터셉터 추가 등)
      raw: client,
    };

    return api;
  };

  /* -------------------------------------------------------------
     카페24 프론트에서 쓰는 통신은 세 갈래다.

       FRONT.api.middleware  자체 백엔드          우리 토큰
       FRONT.api.front       카페24 프론트 API    client_id 헤더
       FRONT.api.sdk         카페24 JS SDK        카페24 세션 (콜백)

     그 외 인증 방식이 필요하면 create() 로 직접 만든다.
       const custom = FRONT.api.create({ name: '...', baseURL: '...', token: '...' });
  ------------------------------------------------------------- */

  const api = {
    create,

    /* 자체 백엔드(중계 서버).

       로그인 토큰이 있는 몰은 front.config.js 의 TOKEN · ON_UNAUTHORIZED 를 채운다.
       코어가 특정 로그인 방식(SSO 등)의 함수를 직접 부르면, 그 방식이 없는 몰에서
       첫 요청이 TypeError 로 죽는다. 훅이 비어 있으면 헤더 없이 나가고 401 도 그대로 올라간다.

       나중에 붙이거나 바꿀 때는 FRONT.api.middleware.setToken(() => ...) 도 된다 */
    middleware: create({
      name: '미들웨어',
      baseURL: () => FRONT.config.MIDDLEWARE_BASE,
      token: () => (FRONT.config.TOKEN ? FRONT.config.TOKEN() : null),
      onUnauthorized: () => {
        if (FRONT.config.ON_UNAUTHORIZED) return FRONT.config.ON_UNAUTHORIZED();
        // 갱신할 방법이 없다. 거절하면 인터셉터가 원래의 401 을 올린다
        FRONT.util.log('ON_UNAUTHORIZED 훅이 없어 401 을 그대로 올린다');
        return Promise.reject();
      },
    }),

    // 카페24 프론트 API — client_id 헤더로 부른다 (카테고리 조회 등)
    front: create({
      name: '카페24 프론트 API',
      baseURL: () => FRONT.config.CAFE24_BASE,
      headers: () => ({ 'X-Cafe24-Client-Id': FRONT.config.CLIENT_ID }),
    }),
  };

  const noSdk = () =>
    new Error('[FRONT.api.sdk] CAFE24API가 없습니다. 카페24 앱 스크립트가 로드됐는지 확인하세요.');

  // 카페24 자바스크립트 SDK(CAFE24API)를 Promise로 감싼 것.
  // SDK는 전부 콜백 방식이다 —
  //   CAFE24API.addCurrentProductToCart(mall_id, request_time, app_key, member_id, hmac, callback)
  //
  // 실패는 전부 reject로 통일한다. 일부는 throw, 일부는 reject로 나가면
  // 호출부가 try/catch와 .catch()를 둘 다 써야 하고, 하나를 빠뜨리면
  // FRONT.page의 try/catch가 삼켜서 "처리된 것처럼 보이는" 실패가 된다.
  api.sdk = {
    // SDK를 client_id로 초기화한다. 쓰기 전에 한 번 부른다.
    // 이건 Promise를 돌려주지 않으므로 throw가 맞다
    init() {
      if (typeof CAFE24API === 'undefined') throw noSdk();
      return CAFE24API.init({ client_id: FRONT.config.CLIENT_ID });
    },

    // 마지막 인자가 콜백인 SDK 메서드는 전부 이걸로 부른다
    //   FRONT.api.sdk.call('addCurrentProductToCart', mallId, time, appKey, memberId, hmac)
    call(method, ...args) {
      if (typeof CAFE24API === 'undefined') return Promise.reject(noSdk());
      if (typeof CAFE24API[method] !== 'function') {
        return Promise.reject(new Error(`[FRONT.api.sdk] CAFE24API.${method}() 가 없습니다.`));
      }
      return FRONT.util.toPromise((cb) => CAFE24API[method](...args, cb));
    },

    cartCount() {
      return api.sdk.call('getCartCount');
    },

    couponCount() {
      return api.sdk.call('getCouponCount');
    },
  };

  FRONT.api = api;
})();
