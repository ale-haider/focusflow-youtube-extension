// FocusFlow — YouTube Study Mode Content Script

(function () {
  'use strict';

  let settings = {};
  let timerState = {
    running: false,
    phase: 'focus', // 'focus' | 'break'
    remaining: 25 * 60,
    total: 25 * 60,
    sessions: 0,
    interval: null,
  };
  let studyStartTime = null;
  let totalStudySeconds = 0;
  let timerWidget = null;
  let notesPanel = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  // ─── Load settings & apply ───────────────────────────────────────
  function loadAndApply() {
    chrome.storage.sync.get(
      {
        focusModeEnabled: false,
        hideRecommendations: true,
        hideComments: true,
        blockShorts: true,
        showTimer: true,
        focusDuration: 25,
        breakDuration: 5,
        apiKey: '',
      },
      (s) => {
        settings = s;
        applySettings();
      }
    );
  }

  function applySettings() {
    const body = document.body;
    if (!body) return;

    const active = settings.focusModeEnabled;

    body.classList.toggle('focusflow-active', active);
    body.classList.toggle('focusflow-hide-recommendations', active && settings.hideRecommendations);
    body.classList.toggle('focusflow-hide-comments', active && settings.hideComments);
    body.classList.toggle('focusflow-block-shorts', active && settings.blockShorts);

    if (active && settings.blockShorts && isOnShorts()) {
      showShortsBlockedOverlay();
    } else {
      removeShortsBlockedOverlay();
    }

    if (active && settings.showTimer) {
      renderTimerWidget();
    } else {
      removeTimerWidget();
    }

    // Update study tracking
    if (active && !studyStartTime) {
      studyStartTime = Date.now();
    } else if (!active && studyStartTime) {
      totalStudySeconds += Math.floor((Date.now() - studyStartTime) / 1000);
      studyStartTime = null;
      saveAnalytics();
    }
  }

  function isOnShorts() {
    return window.location.pathname.startsWith('/shorts');
  }

  // ─── Shorts blocker ──────────────────────────────────────────────
  function showShortsBlockedOverlay() {
    if (document.getElementById('focusflow-shorts-overlay')) return;
    const el = document.createElement('div');
    el.id = 'focusflow-shorts-overlay';
    el.className = 'focusflow-shorts-blocked';
    el.innerHTML = `
      <h2>🎓 Shorts Blocked</h2>
      <p>FocusFlow has blocked YouTube Shorts to keep you on track.</p>
      <button id="ff-go-back">← Go Back to Study</button>
      <button id="ff-allow-once" style="background:#2a2a4a;color:#888;font-size:12px;padding:6px 14px;margin-top:0">Allow just this once</button>
    `;
    document.documentElement.appendChild(el);
    document.getElementById('ff-go-back').onclick = () => history.back();
    document.getElementById('ff-allow-once').onclick = () => el.remove();
  }

  function removeShortsBlockedOverlay() {
    const el = document.getElementById('focusflow-shorts-overlay');
    if (el) el.remove();
  }

  // ─── Timer Widget ────────────────────────────────────────────────
  function renderTimerWidget() {
    if (timerWidget) {
      updateTimerDisplay();
      return;
    }

    timerWidget = document.createElement('div');
    timerWidget.id = 'focusflow-timer-widget';
    timerWidget.innerHTML = `
      <div class="ff-header">
        <span class="ff-logo">⬡ FocusFlow</span>
        <button class="ff-minimize" title="Minimize">−</button>
      </div>
      <div class="ff-body">
        <div class="ff-time">25:00</div>
        <div class="ff-phase">Focus Session</div>
        <div class="ff-progress"><div class="ff-progress-bar" style="width:100%"></div></div>
        <div class="ff-controls">
          <button class="ff-btn primary" id="ff-start-stop">Start</button>
          <button class="ff-btn" id="ff-reset">Reset</button>
          <button class="ff-btn" id="ff-notes-toggle">Notes</button>
        </div>
        <div class="ff-stats">
          <span><strong id="ff-sessions">0</strong> Sessions</span>
          <span><strong id="ff-study-time">0m</strong> Today</span>
        </div>
      </div>
    `;
    document.documentElement.appendChild(timerWidget);

    // Events
    timerWidget.querySelector('.ff-minimize').onclick = () => {
      timerWidget.classList.toggle('minimized');
      timerWidget.querySelector('.ff-minimize').textContent =
        timerWidget.classList.contains('minimized') ? '+' : '−';
    };

    document.getElementById('ff-start-stop').onclick = toggleTimer;
    document.getElementById('ff-reset').onclick = resetTimer;
    document.getElementById('ff-notes-toggle').onclick = toggleNotesPanel;

    // Draggable
    timerWidget.addEventListener('mousedown', startDrag);

    renderNotesPanel();
    loadAnalytics();
    updateTimerDisplay();
  }

  function removeTimerWidget() {
    if (timerWidget) { timerWidget.remove(); timerWidget = null; }
    if (notesPanel) { notesPanel.remove(); notesPanel = null; }
    stopTimer();
  }

  function toggleTimer() {
    if (timerState.running) {
      stopTimer();
    } else {
      startTimer();
    }
  }

  function startTimer() {
    if (timerState.running) return;
    timerState.running = true;
    document.getElementById('ff-start-stop').textContent = 'Pause';
    document.getElementById('ff-start-stop').classList.add('primary');

    timerState.interval = setInterval(() => {
      timerState.remaining--;
      if (timerState.remaining <= 0) {
        handlePhaseEnd();
      }
      updateTimerDisplay();
    }, 1000);
  }

  function stopTimer() {
    timerState.running = false;
    clearInterval(timerState.interval);
    const btn = document.getElementById('ff-start-stop');
    if (btn) { btn.textContent = 'Start'; }
  }

  function resetTimer() {
    stopTimer();
    timerState.phase = 'focus';
    timerState.remaining = (settings.focusDuration || 25) * 60;
    timerState.total = timerState.remaining;
    updateTimerDisplay();
  }

  function handlePhaseEnd() {
    stopTimer();
    if (timerState.phase === 'focus') {
      timerState.sessions++;
      totalStudySeconds += (settings.focusDuration || 25) * 60;
      saveAnalytics();
      timerState.phase = 'break';
      timerState.remaining = (settings.breakDuration || 5) * 60;
      timerState.total = timerState.remaining;
      chrome.runtime.sendMessage({ type: 'NOTIFY', title: '✅ Focus session complete!', body: `Take a ${settings.breakDuration || 5} minute break.` });
    } else {
      timerState.phase = 'focus';
      timerState.remaining = (settings.focusDuration || 25) * 60;
      timerState.total = timerState.remaining;
      chrome.runtime.sendMessage({ type: 'NOTIFY', title: '🎓 Break over!', body: 'Ready for another focus session?' });
    }
    updateTimerDisplay();
  }

  function updateTimerDisplay() {
    if (!timerWidget) return;
    const m = Math.floor(timerState.remaining / 60);
    const s = timerState.remaining % 60;
    const timeStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    const timeEl = timerWidget.querySelector('.ff-time');
    const phaseEl = timerWidget.querySelector('.ff-phase');
    const barEl = timerWidget.querySelector('.ff-progress-bar');
    const sessEl = document.getElementById('ff-sessions');
    const studyEl = document.getElementById('ff-study-time');

    if (timeEl) timeEl.textContent = timeStr;
    if (phaseEl) phaseEl.textContent = timerState.phase === 'focus' ? 'Focus Session' : '☕ Break Time';
    if (barEl) {
      const pct = (timerState.remaining / timerState.total) * 100;
      barEl.style.width = pct + '%';
      barEl.style.background = timerState.phase === 'focus'
        ? 'linear-gradient(90deg, #7c5cfc, #a78bfa)'
        : 'linear-gradient(90deg, #22c55e, #4ade80)';
    }
    if (sessEl) sessEl.textContent = timerState.sessions;

    // Today study time
    let todaySeconds = totalStudySeconds;
    if (studyStartTime) todaySeconds += Math.floor((Date.now() - studyStartTime) / 1000);
    if (studyEl) {
      if (todaySeconds < 3600) studyEl.textContent = Math.floor(todaySeconds / 60) + 'm';
      else studyEl.textContent = (todaySeconds / 3600).toFixed(1) + 'h';
    }
  }

  // ─── Dragging ────────────────────────────────────────────────────
  function startDrag(e) {
    if (e.target.tagName === 'BUTTON') return;
    isDragging = true;
    const rect = timerWidget.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
  }

  function onDrag(e) {
    if (!isDragging || !timerWidget) return;
    timerWidget.style.right = 'auto';
    timerWidget.style.bottom = 'auto';
    timerWidget.style.left = (e.clientX - dragOffset.x) + 'px';
    timerWidget.style.top = (e.clientY - dragOffset.y) + 'px';
  }

  function stopDrag() {
    isDragging = false;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
  }

  // ─── Notes Panel ─────────────────────────────────────────────────
  function renderNotesPanel() {
    notesPanel = document.createElement('div');
    notesPanel.id = 'focusflow-notes-panel';
    notesPanel.innerHTML = `
      <div class="ff-notes-header">
        <span>⬡ AI Video Notes</span>
        <button class="ff-minimize" id="ff-close-notes">×</button>
      </div>
      <div class="ff-notes-content" id="ff-notes-content">
        <span style="color:#555;font-size:12px">Generate AI notes from the current video transcript.</span>
      </div>
      <button class="ff-notes-generate" id="ff-gen-notes">✦ Generate Notes</button>
    `;
    document.documentElement.appendChild(notesPanel);

    document.getElementById('ff-close-notes').onclick = () => notesPanel.classList.remove('visible');
    document.getElementById('ff-gen-notes').onclick = generateNotes;
  }

  function toggleNotesPanel() {
    if (!notesPanel) return;
    notesPanel.classList.toggle('visible');
  }

  async function generateNotes() {
    const btn = document.getElementById('ff-gen-notes');
    const content = document.getElementById('ff-notes-content');
    if (!settings.apiKey) {
      content.innerHTML = '<span style="color:#f87171;font-size:12px">⚠ Add your Anthropic API key in FocusFlow settings to use AI notes.</span>';
      return;
    }

    // Try to get video title & description from page
    const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent
      || document.title || 'this video';
    const description = document.querySelector('#description-inner')?.textContent?.slice(0, 800) || '';
    const chapters = [...document.querySelectorAll('.macro-markers-list-item__title')]
      .map(e => e.textContent.trim()).join(', ');

    btn.disabled = true;
    btn.textContent = 'Generating…';
    content.innerHTML = '<div class="ff-notes-loading">✦ Thinking…</div>';

    const prompt = `You are a study assistant. Based on the following YouTube video information, generate clear and concise study notes in bullet points. Include key concepts, main takeaways, and any important terms.

Video Title: ${title}
${description ? `Description: ${description}` : ''}
${chapters ? `Chapters/Topics: ${chapters}` : ''}

Format: Use short bullet points with emoji for categories. Group by topic. Max 300 words.`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 600,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await res.json();
      const text = data.content?.[0]?.text || 'Could not generate notes.';
      content.textContent = text;
    } catch (err) {
      content.innerHTML = `<span style="color:#f87171;font-size:12px">Error: ${err.message}</span>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '✦ Regenerate Notes';
    }
  }

  // ─── Analytics ───────────────────────────────────────────────────
  function saveAnalytics() {
    const today = new Date().toISOString().split('T')[0];
    chrome.storage.local.set({
      [`analytics_${today}`]: {
        sessions: timerState.sessions,
        studySeconds: totalStudySeconds
      }
    });
  }

  function loadAnalytics() {
    const today = new Date().toISOString().split('T')[0];
    chrome.storage.local.get([`analytics_${today}`], (res) => {
      const data = res[`analytics_${today}`];
      if (data) {
        timerState.sessions = data.sessions || 0;
        totalStudySeconds = data.studySeconds || 0;
      }
      updateTimerDisplay();
    });
  }

  // ─── Navigation observer (SPA) ───────────────────────────────────
  const observer = new MutationObserver(() => {
    applySettings();
    if (isOnShorts() && settings.focusModeEnabled && settings.blockShorts) {
      showShortsBlockedOverlay();
    }
  });

  // ─── Message listener ────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SETTINGS_UPDATED') {
      chrome.storage.sync.get(null, (s) => {
        settings = s;
        // Update timer durations if changed
        if (!timerState.running) {
          timerState.remaining = (s.focusDuration || 25) * 60;
          timerState.total = timerState.remaining;
        }
        applySettings();
      });
    }
  });

  // ─── Init ────────────────────────────────────────────────────────
  function init() {
    loadAndApply();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Handle YouTube SPA navigation
  window.addEventListener('yt-navigate-finish', () => {
    loadAndApply();
  });

})();
