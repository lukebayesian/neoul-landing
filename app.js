/* global window, document, sessionStorage, FormData, IntersectionObserver, AbortController, URLSearchParams */
(function () {
  const endpoint = window.SURVEY_ENDPOINT || '';
  const $ = (selector) => document.querySelector(selector);
  const form = $('#survey-form');
  const steps = Array.from(form.querySelectorAll('.step'));
  const stepNames = ['매장 정보', '마감 업무', '우선순위와 시범 참여'];
  let current = 0;
  let started = false;
  let sending = false;

  // 이름 없는 임의 식별값: 같은 방문의 클릭과 제출을 연결해 전환율을 계산한다.
  function sessionId() {
    const make = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    try {
      let id = sessionStorage.getItem('neoul-sid');
      if (!id) {
        id = make();
        sessionStorage.setItem('neoul-sid', id);
      }
      return id;
    } catch {
      return make();
    }
  }

  const sid = sessionId();
  // 채널 구분: index.html?src=visit, ?src=referral, ?src=community
  const source = (new URLSearchParams(window.location.search).get('src') || 'direct').slice(0, 30);

  // text/plain 으로 보내면 Apps Script 에서 CORS 사전 요청 없이 받을 수 있다.
  async function post(body) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await window.fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...body, sid, source }),
        signal: controller.signal,
        keepalive: true,
      });
      const result = await response.json();
      if (!result.ok) throw new Error('rejected');
    } finally {
      window.clearTimeout(timer);
    }
  }

  function track(event) {
    if (!endpoint) return;
    post({ type: 'event', event }).catch(() => {});
  }

  function showStep(index) {
    current = index;
    steps.forEach((step, i) => { step.hidden = i !== index; });
    $('#step-label').textContent = `${index + 1} / ${steps.length} · ${stepNames[index]}`;
    $('#progress-bar').style.width = `${((index + 1) / steps.length) * 100}%`;
    $('#prev').hidden = index === 0;
    $('#next').hidden = index === steps.length - 1;
    $('#submit').hidden = index !== steps.length - 1;
    $('#form-error').textContent = '';
  }

  function openSurvey(from) {
    track(`cta_${from}`);
    $('#landing').hidden = true;
    $('#sticky').hidden = true;
    $('#survey').hidden = false;
    window.scrollTo(0, 0);
    $('#survey-title').focus({ preventScroll: true });
  }

  function validate(step) {
    let firstInvalid = null;
    step.querySelectorAll('.q[data-required]').forEach((question) => {
      const answered = question.querySelector(`input[name="${question.dataset.required}"]:checked`);
      question.classList.toggle('invalid', !answered);
      if (!answered && !firstInvalid) firstInvalid = question;
    });
    if (firstInvalid) {
      $('#form-error').textContent = '표시된 필수 문항에 답해 주세요.';
      firstInvalid.querySelector('input').focus();
      return false;
    }
    $('#form-error').textContent = '';
    return true;
  }

  function collect() {
    const data = new FormData(form);
    const answers = {};
    for (const key of new Set(data.keys())) {
      answers[key] = data.getAll(key).join(', ').trim();
    }
    // 동의하지 않은 연락처는 보내지 않는다.
    if (!answers.consent) {
      delete answers.nickname;
      delete answers.contact;
    }
    return answers;
  }

  function finish(title, copy) {
    form.hidden = true;
    $('#step-label').hidden = true;
    $('.progress').hidden = true;
    $('#done').hidden = false;
    $('#done-title').textContent = title;
    $('#done-copy').textContent = copy;
    $('#done-title').focus();
  }

  document.querySelectorAll('[data-cta]').forEach((button) => {
    button.addEventListener('click', () => openSurvey(button.dataset.cta));
  });

  $('#back-home').addEventListener('click', () => {
    $('#survey').hidden = true;
    $('#landing').hidden = false;
    $('#sticky').hidden = false;
    window.scrollTo(0, 0);
  });

  form.addEventListener('change', (event) => {
    const question = event.target.closest('.q');
    if (question) question.classList.remove('invalid');
    if (!started) {
      started = true;
      track('survey_start');
    }
  });

  $('#next').addEventListener('click', () => {
    if (!validate(steps[current])) return;
    showStep(current + 1);
    window.scrollTo(0, 0);
  });
  $('#prev').addEventListener('click', () => showStep(current - 1));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    // 중간 단계에서 Enter 를 누르면 제출 대신 다음 단계로 간다.
    if (current < steps.length - 1) {
      $('#next').click();
      return;
    }
    if (sending || !validate(steps[current])) return;

    const contactTyped = form.elements.contact.value.trim() || form.elements.nickname.value.trim();
    if (contactTyped && !form.elements.consent.checked) {
      $('#form-error').textContent = '연락처를 남기려면 동의에 체크해 주세요. 원하지 않으면 칸을 비워 주세요.';
      form.elements.consent.focus();
      return;
    }

    if (!endpoint) {
      finish('미리보기 모드입니다', '저장 주소가 설정되지 않아 응답이 전송·저장되지 않았습니다.');
      return;
    }

    sending = true;
    const button = $('#submit');
    button.disabled = true;
    button.textContent = '보내는 중…';
    try {
      await post({ type: 'response', answers: collect() });
      finish('답변해 주셔서 감사합니다', '사장님의 마감 이야기를 잘 받았습니다. 연락처를 남기셨다면 인터뷰 일정을 안내드리겠습니다.');
    } catch {
      $('#form-error').textContent = '전송을 확인하지 못했습니다. 연결 상태를 확인하고 다시 눌러 주세요.';
      button.disabled = false;
      button.textContent = '설문 제출하기';
    } finally {
      sending = false;
    }
  });

  // 설문 결과(테스트용): 서버는 선택형 답변의 합계만 보낸다. 문항과 보기 이름은 설문 화면에서 가져온다.
  const resultsToggle = $('#results-toggle');
  const resultsPanel = $('#results');

  function add(parent, tag, text, className) {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    parent.appendChild(element);
    return element;
  }

  const eventNames = {
    view: '조회',
    cta_hero: '버튼 클릭(상단)',
    cta_bottom: '버튼 클릭(하단)',
    cta_sticky: '버튼 클릭(고정)',
    survey_start: '설문 시작',
  };

  const percentOf = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : '0.0%');

  // 첫 행은 제목, 나머지는 내용인 표. 칸이 많으면 표 안에서 좌우로 넘겨 본다.
  function addTable(parent, headers, rows, className) {
    const table = add(add(parent, 'div', '', 'table-scroll'), 'table', '', className);
    const head = add(add(table, 'thead'), 'tr');
    headers.forEach((label) => { add(head, 'th', label).scope = 'col'; });
    const body = add(table, 'tbody');
    rows.forEach((cells) => {
      const row = add(body, 'tr');
      cells.forEach((cell) => add(row, 'td', String(cell)));
    });
  }

  // 전환율: 시트의 "전환율 현황" 탭과 같은 값(테스트 제외)과 테스트를 포함한 값을 나란히 보여 준다.
  function renderFunnel(result) {
    const { real, all } = result.funnel;
    const counts = [
      ['조회수 (방문 세션)', 'views'],
      ['설문 버튼 클릭', 'clicks'],
      ['설문 시작', 'starts'],
      ['설문 응답자 수', 'responses'],
      ['적격 응답자 수', 'eligible'],
    ];
    const rates = [
      ['전환율 (응답자 ÷ 조회수)', 'responses', 'views'],
      ['버튼 클릭률 (클릭 ÷ 조회수)', 'clicks', 'views'],
      ['설문 완료율 (응답자 ÷ 시작)', 'responses', 'starts'],
    ];
    add(resultsPanel, 'h3', '전환율 현황');
    addTable(resultsPanel, ['지표', '테스트 제외', '테스트 포함'], [
      ...counts.map(([label, key]) => [label, real[key], all[key]]),
      ...rates.map(([label, part, whole]) => [label, percentOf(real[part], real[whole]), percentOf(all[part], all[whole])]),
    ]);

    add(resultsPanel, 'h3', '채널별 전환율');
    addTable(resultsPanel, ['채널', '조회수', '응답자 수', '전환율'],
      result.channels.map((c) => [c.source, c.views, c.responses, percentOf(c.responses, c.views)]));
  }

  // 시트의 responses, events 탭 기록. 서버가 호칭, 연락처, sid 를 보내지 않는다.
  function renderRecords(result) {
    const keys = Object.keys(result.counts);
    add(resultsPanel, 'h3', `응답 기록 (${result.responses.length}건)`);
    add(resultsPanel, 'p', '1~7은 설문 문항 번호입니다. 표를 좌우로 넘겨 보세요. 호칭과 연락처는 공개하지 않습니다.');
    addTable(resultsPanel, ['시각', '경로', '적격', ...keys.map((_, i) => String(i + 1))],
      result.responses.map((r) => [r.time, r.source, r.eligible, ...keys.map((key) => r[key])]), 'records');

    const details = add(resultsPanel, 'details');
    add(details, 'summary', `방문·클릭 기록 (${result.events.length}건)`);
    addTable(details, ['시각', '경로', '동작'],
      result.events.map((e) => [e.time, e.source, eventNames[e.event] || e.event]), 'records');
  }

  function renderResults(result) {
    resultsPanel.textContent = '';
    add(resultsPanel, 'p', `전체 응답 ${result.total}건 · 적격 응답 ${result.eligible}건 (테스트 응답 포함)`);
    // 예전 버전의 Apps Script 는 합계만 보낸다.
    if (result.funnel) renderFunnel(result);
    if (!result.total) return;
    add(resultsPanel, 'h3', '문항별 합계');
    const table = add(resultsPanel, 'table');
    const head = add(add(table, 'thead'), 'tr');
    ['보기', '응답 수', '비율'].forEach((label) => { add(head, 'th', label).scope = 'col'; });
    Object.keys(result.counts).forEach((name) => {
      const inputs = form.querySelectorAll(`input[name="${name}"]`);
      if (!inputs.length) return;
      const group = add(table, 'tbody');
      const title = inputs[0].closest('.q').querySelector('.q-title').textContent;
      add(add(group, 'tr'), 'th', title, 'question').colSpan = 3;
      inputs.forEach((input) => {
        const count = result.counts[name][input.value] || 0;
        const row = add(group, 'tr');
        add(row, 'td', input.closest('label').textContent.trim());
        add(row, 'td', `${count}건`);
        add(row, 'td', `${Math.round((count / result.total) * 100)}%`);
      });
    });
    if (result.responses) renderRecords(result);
  }

  async function loadResults() {
    if (!endpoint) {
      resultsPanel.textContent = '미리보기 모드라 저장된 결과가 없습니다.';
      return;
    }
    resultsPanel.textContent = '결과를 불러오는 중…';
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await window.fetch(endpoint, { signal: controller.signal });
      const result = await response.json();
      if (!result.ok) throw new Error('rejected');
      renderResults(result);
    } catch {
      resultsPanel.textContent = '결과를 불러오지 못했습니다. 잠시 후 다시 눌러 주세요.';
    } finally {
      window.clearTimeout(timer);
    }
  }

  const resultsDialog = $('#results-dialog');
  resultsToggle.addEventListener('click', () => {
    resultsDialog.showModal();
    loadResults();
  });
  $('#results-close').addEventListener('click', () => resultsDialog.close());
  // 팝업 바깥(어두운 배경)을 누르면 닫는다.
  resultsDialog.addEventListener('click', (event) => {
    if (event.target === resultsDialog) resultsDialog.close();
  });

  // 첫 CTA 가 화면에서 사라지면 하단 고정 버튼을 보여 준다.
  const heroCta = $('[data-cta="hero"]');
  new IntersectionObserver(([entry]) => {
    $('#sticky').classList.toggle('show', !entry.isIntersecting && entry.boundingClientRect.top < 0);
  }).observe(heroCta);

  showStep(0);
  track('view');
})();
