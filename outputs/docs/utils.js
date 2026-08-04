/* ===================================================================
   FRONT.util — 공통 유틸
=================================================================== */
window.FRONT = window.FRONT || {};

(() => {
  const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  const util = {
    /* --- 포맷 ------------------------------------------------- */

    // 1000 → '1,000'
    formatNumber(n) {
      return Number(n || 0).toLocaleString();
    },

    // '2026-08-04T12:00:00' → '2026.08.04'
    formatDate(s) {
      return String(s || '').slice(0, 10).replace(/-/g, '.');
    },

    // 사용자 입력을 innerHTML/html()에 넣기 전에 반드시 통과시킬 것
    escapeHtml(v) {
      return String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
    },

    // '옵션A, 옵션B' → '<p class="opt">옵션A<br>옵션B</p>' (빈 값이면 '')
    listToHtml(value, className = '') {
      const parts = String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!parts.length) return '';
      const rows = parts.map((p) => util.escapeHtml(p)).join('<br>');
      return `<p class="${className}">${rows}</p>`;
    },

    /* --- URL -------------------------------------------------- */

    // 현재 주소의 ?cate_no=125 → util.query('cate_no') → '125'
    // 두 번째 인자로 다른 URL을 넘길 수도 있다
    query(key, url) {
      const search = url ? url.split('?')[1] || '' : location.search;
      return new URLSearchParams(search).get(key);
    },

    /* --- 쿠키 ------------------------------------------------- */

    cookie: {
      get(key) {
        const m = document.cookie.match(new RegExp(`(?:^|; )${key}=([^;]*)`));
        return m ? decodeURIComponent(m[1]) : null;
      },
      set(key, value, minutes = 30) {
        const expires = new Date(Date.now() + minutes * 60000).toUTCString();
        document.cookie = `${key}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
      },
      // set을 재사용한다. 쿠키 속성(path 등)을 쓰는 곳이 한 군데여야
      // 나중에 domain이나 SameSite가 붙었을 때 지우기가 같이 따라간다
      remove(key) {
        util.cookie.set(key, '', -1);
      },

      // 객체를 JSON으로 저장/복원. 값이 없거나 깨졌으면 null
      getJSON(key) {
        try {
          const raw = util.cookie.get(key);
          return raw ? JSON.parse(raw) : null;
        } catch (e) {
          return null;
        }
      },
      setJSON(key, obj, minutes) {
        util.cookie.set(key, JSON.stringify(obj), minutes);
      },
    },

    /* --- 흐름 제어 -------------------------------------------- */

    // 결과를 한 번만 계산해서 재사용. 실패하면 다음 호출에서 다시 시도한다.
    //   const loadCategories = util.once(() => FRONT.api.cafe24Public.get('/api/v2/categories'));
    //   loadCategories().then(...)   // 두 번째부터는 요청 안 나감
    once(fn) {
      let has = false;
      let cached;
      return (...args) => {
        if (has) return cached;
        cached = fn(...args);
        has = true;
        if (cached && typeof cached.then === 'function') {
          cached.catch(() => {
            has = false;
            cached = undefined;
          });
        }
        return cached;
      };
    },

    // 마지막 호출만 wait(ms) 뒤에 실행. 스크롤·입력 핸들러용
    debounce(fn, wait = 200) {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
      };
    },

    // 카페24 SDK의 콜백 방식을 Promise로 변환
    //   util.toPromise((cb) => CAFE24API.getCustomerInfo(cb)).then(...)
    toPromise(fn) {
      return new Promise((resolve, reject) =>
        fn((err, res) => (err ? reject(err) : resolve(res))),
      );
    },

    /* --- 배열 ------------------------------------------------- */

    // 입력 순서를 보존하며 그룹핑 → { map, keys }
    //   util.groupBy(items, 'shippingGroup')
    //   util.groupBy(items, (it) => it.shippingGroup)
    groupBy(list, keyOf) {
      const map = {};
      const keys = [];
      (list || []).forEach((item) => {
        const key = (typeof keyOf === 'function' ? keyOf(item) : item[keyOf]) ?? 'NONE';
        if (!map[key]) {
          map[key] = [];
          keys.push(key);
        }
        map[key].push(item);
      });
      return { map, keys };
    },

    /* --- 로그 ------------------------------------------------- */

    // config.DEBUG가 true일 때만 출력. 운영에 로그 남기고 배포해도 안전
    log(...args) {
      if (FRONT.config?.DEBUG) console.log('[FRONT]', ...args);
    },

    logError(label, err) {
      console.error(`[${label}]`, err);
    },

    // .catch(util.onError('주문목록')) 형태로 쓴다
    onError(label) {
      return (err) => util.logError(label, err);
    },
  };

  FRONT.util = util;
})();
