/* global window, document, FormData, AbortController */
(function () {
  const endpoint = window.CUSTOMER_ENDPOINT || '';
  const form = document.querySelector('#survey-form');
  const error = document.querySelector('#form-error');
  const button = document.querySelector('#submit');
  const steps = Array.from(form.querySelectorAll('.step'));
  const stepLabel = document.querySelector('#step-label');
  const progress = document.querySelector('.progress');
  let current = 0;
  let sending = false;

  function showStep(index) {
    current = index;
    steps.forEach((step, i) => { step.hidden = i !== index; });
    stepLabel.textContent = `${index + 1} / ${steps.length} · ${steps[index].dataset.name}`;
    document.querySelector('#progress-bar').style.width = `${((index + 1) / steps.length) * 100}%`;
    document.querySelector('.intro').hidden = index > 0;
    document.querySelector('#prev').hidden = index === 0;
    document.querySelector('#next').hidden = index === steps.length - 1;
    button.hidden = index !== steps.length - 1;
    error.textContent = '';
  }

  function moveTo(index) {
    showStep(index);
    window.scrollTo(0, 0);
    stepLabel.focus({ preventScroll: true });
  }

  // 지금 보이는 단계의 필수 문항만 확인한다.
  function validate() {
    let firstInvalid = null;
    steps[current].querySelectorAll('.q[data-required]').forEach((question) => {
      const answered = question.querySelector(`input[name="${question.dataset.required}"]:checked`);
      question.classList.toggle('invalid', !answered);
      if (!answered && !firstInvalid) firstInvalid = question;
    });
    error.textContent = firstInvalid ? '표시된 필수 문항에 답해 주세요.' : '';
    if (firstInvalid) firstInvalid.querySelector('input').focus();
    return !firstInvalid;
  }

  // 받은 쿠폰은 화면을 닫아도 다시 볼 수 있게 이 브라우저에 보관한다. 만료되면 지운 것으로 본다.
  const COUPON_KEY = 'neoul-coupon';
  // 쿠폰 행사 종료일. 실제 발급 중단은 Apps Script 가 하고, 여기서는 안내만 바꾼다.
  const EVENT_END = '2026-12-31';
  const eventEnded = () => Date.now() > Date.parse(`${EVENT_END}T23:59:59+09:00`);

  function savedCoupon() {
    try {
      const coupon = JSON.parse(window.localStorage.getItem(COUPON_KEY));
      // 만료일의 한국 시간 자정까지 유효하다.
      return coupon && Date.now() <= Date.parse(`${coupon.expires}T23:59:59+09:00`) ? coupon : null;
    } catch {
      return null;
    }
  }

  function saveCoupon(coupon) {
    try {
      window.localStorage.setItem(COUPON_KEY, JSON.stringify(coupon));
    } catch {
      // 저장이 막힌 브라우저에서는 화면 캡처로만 보관한다.
    }
  }

  function showCoupon(coupon) {
    document.querySelector('#coupon').hidden = false;
    document.querySelector('#coupon-code').textContent = coupon.code;
    document.querySelector('#coupon-expires').textContent = `${coupon.expires}까지 사용`;
  }

  function showNoCoupon(message) {
    const none = document.querySelector('#coupon-none');
    none.hidden = false;
    none.textContent = message;
  }

  function finish(title, copy) {
    form.hidden = true;
    stepLabel.hidden = true;
    progress.hidden = true;
    document.querySelector('.intro').hidden = true;
    document.querySelector('#done').hidden = false;
    document.querySelector('#done-title').textContent = title;
    document.querySelector('#done-copy').textContent = copy;
    window.scrollTo(0, 0);
    document.querySelector('#done-title').focus({ preventScroll: true });
  }

  form.addEventListener('change', (event) => {
    const question = event.target.closest('.q');
    if (question) question.classList.remove('invalid');
  });

  document.querySelector('#next').addEventListener('click', () => {
    if (validate()) moveTo(current + 1);
  });
  document.querySelector('#prev').addEventListener('click', () => moveTo(current - 1));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    // 중간 단계에서 Enter 를 누르면 제출 대신 다음 단계로 간다.
    if (current < steps.length - 1) {
      document.querySelector('#next').click();
      return;
    }
    if (sending || !validate()) return;

    if (!endpoint) {
      finish('미리보기 모드입니다', '저장 주소가 설정되지 않아 응답이 전송·저장되지 않았습니다.');
      return;
    }

    sending = true;
    button.disabled = true;
    button.textContent = '보내는 중…';
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try {
      // text/plain 으로 보내면 Apps Script 에서 CORS 사전 요청 없이 받을 수 있다.
      const response = await window.fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'response', hasCoupon: Boolean(savedCoupon()), answers: Object.fromEntries(new FormData(form)) }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!result.ok) throw new Error('rejected');
      const earlier = savedCoupon();
      finish('고맙습니다', '남겨주신 이야기로 더 편안한 밤을 준비하겠습니다.');
      if (result.coupon) {
        saveCoupon(result.coupon);
        showCoupon(result.coupon);
      } else if (earlier) {
        showNoCoupon('이미 받으신 쿠폰입니다. 한 번만 사용할 수 있습니다.');
        showCoupon(earlier);
      } else if (result.coupon === null && eventEnded()) {
        showNoCoupon('쿠폰 행사는 12월 31일에 끝났습니다. 참여해 주셔서 감사합니다.');
      } else if (result.coupon === null) {
        // coupon 항목이 아예 없으면 예전 버전의 Apps Script 이므로 아무 말도 하지 않는다.
        showNoCoupon('오늘의 선착순 5명 쿠폰은 모두 나갔습니다. 참여해 주셔서 감사합니다.');
      }
    } catch {
      error.textContent = '전송을 확인하지 못했습니다. 연결 상태를 확인하고 다시 눌러 주세요.';
      button.disabled = false;
      button.textContent = '익명으로 보내기';
    } finally {
      window.clearTimeout(timer);
      sending = false;
    }
  });

  // 행사가 끝나면 쿠폰 안내를 숨긴다. 이미 받은 쿠폰은 사용 기한까지 다시 볼 수 있다.
  document.querySelector('#gift').hidden = eventEnded();
  const showSaved = document.querySelector('#show-coupon');
  showSaved.hidden = !savedCoupon();
  showSaved.addEventListener('click', () => {
    finish('받은 쿠폰', '직원에게 이 화면을 보여 주세요.');
    showCoupon(savedCoupon());
  });

  showStep(0);
})();
