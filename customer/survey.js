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
        body: JSON.stringify({ type: 'response', answers: Object.fromEntries(new FormData(form)) }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!result.ok) throw new Error('rejected');
      finish('고맙습니다', '남겨주신 이야기로 더 편안한 밤을 준비하겠습니다.');
    } catch {
      error.textContent = '전송을 확인하지 못했습니다. 연결 상태를 확인하고 다시 눌러 주세요.';
      button.disabled = false;
      button.textContent = '익명으로 보내기';
    } finally {
      window.clearTimeout(timer);
      sending = false;
    }
  });

  showStep(0);
})();
