/* ===================================================================
   FRONT.page — 페이지 스크립트 진입점

   페이지 스크립트는 공통 코어보다 먼저 실행될 수 있다.
   그래서 아래 두 줄(큐 스텁)을 모든 파일 맨 위에 둔다.
   이 파일이 나중에 로드되면 진짜 구현으로 교체하고 쌓인 큐를 비운다.
=================================================================== */
window.FRONT = window.FRONT || {};
FRONT.page = FRONT.page || function () { (FRONT._q = FRONT._q || []).push(arguments); };

(() => {
  const pending = [];

  // document.readyState 를 별도 플래그로 복사해두지 않는다.
  // 스스로 최신을 유지하는 값이라, 복사본을 두면 두 곳에서 갱신되는
  // 가변 상태가 하나 늘 뿐이다
  const isReady = () => document.readyState !== 'loading';

  // 조건은 선택자(요소 존재) 또는 함수(반환값)로 준다.
  // 선택자만 받으면 "이 경로에서만" 같은 조건을 표현할 수 없어서,
  // 결국 콜백 안에서 손으로 return 하게 된다
  const passes = (when) =>
    typeof when === 'function' ? when() : document.querySelector(when);

  const run = (entry) => {
    try {
      if (entry.when && !passes(entry.when)) return;
      entry.fn();
    } catch (err) {
      // 한 페이지 스크립트가 죽어도 나머지는 계속 돌게 한다
      console.error(`[FRONT.page${typeof entry.when === 'string' ? ' ' + entry.when : ''}]`, err);
    }
  };

  // FRONT.page(fn) / FRONT.page('.selector', fn) / FRONT.page(() => 조건, fn)
  //
  // 두 번째 인자 유무로 구분한다. when의 타입으로 구분하면
  // 함수 조건을 준 경우와 인자 하나짜리 호출을 구별할 수 없다
  const register = (when, fn) => {
    const entry = fn ? { when, fn } : { when: null, fn: when };

    if (typeof entry.fn !== 'function') {
      console.error('[FRONT.page] 실행할 함수를 넘겨야 합니다.', when, fn);
      return;
    }

    if (isReady()) run(entry);
    else pending.push(entry);
  };

  // 스텁이 받아둔 것들을 넘겨받는다
  const queued = FRONT._q || [];
  FRONT.page = register;
  delete FRONT._q;
  queued.forEach((args) => register(args[0], args[1]));

  // 이미 준비된 상태면 이 리스너는 발화하지 않는다.
  // 그 경우 register가 즉시 실행했으므로 pending도 비어 있다
  document.addEventListener('DOMContentLoaded', () => {
    while (pending.length) run(pending.shift());
  });
})();
