// FocusFlow Popup Script

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Tabs ────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// ─── Toast ───────────────────────────────────────────────────────
function showToast(msg = 'Saved!') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// ─── Load settings ───────────────────────────────────────────────
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
  (settings) => {
    document.getElementById('toggle-main').checked = settings.focusModeEnabled;
    document.getElementById('toggle-recs').checked = settings.hideRecommendations;
    document.getElementById('toggle-comments').checked = settings.hideComments;
    document.getElementById('toggle-shorts').checked = settings.blockShorts;
    document.getElementById('toggle-timer-widget').checked = settings.showTimer;
    document.getElementById('focus-dur').value = settings.focusDuration;
    document.getElementById('break-dur').value = settings.breakDuration;
    document.getElementById('api-key-input').value = settings.apiKey;
    updateStatusSub(settings.focusModeEnabled);
  }
);

function updateStatusSub(enabled) {
  const el = document.getElementById('status-sub');
  el.textContent = enabled ? '🟢 Active on YouTube' : '⚪ Disabled';
}

document.getElementById('toggle-main').addEventListener('change', function () {
  updateStatusSub(this.checked);
});

// ─── Save filters ────────────────────────────────────────────────
document.getElementById('save-filters').addEventListener('click', () => {
  const settings = {
    focusModeEnabled: document.getElementById('toggle-main').checked,
    hideRecommendations: document.getElementById('toggle-recs').checked,
    hideComments: document.getElementById('toggle-comments').checked,
    blockShorts: document.getElementById('toggle-shorts').checked,
    showTimer: document.getElementById('toggle-timer-widget').checked,
  };
  chrome.storage.sync.set(settings, () => {
    notifyContentScripts();
    showToast('Settings saved!');
  });
});

// ─── Save timer ──────────────────────────────────────────────────
document.getElementById('save-timer').addEventListener('click', () => {
  chrome.storage.sync.set({
    focusDuration: parseInt(document.getElementById('focus-dur').value) || 25,
    breakDuration: parseInt(document.getElementById('break-dur').value) || 5,
  }, () => {
    notifyContentScripts();
    showToast('Timer updated!');
  });
});

// ─── Save API key ────────────────────────────────────────────────
document.getElementById('save-api').addEventListener('click', () => {
  chrome.storage.sync.set({ apiKey: document.getElementById('api-key-input').value.trim() }, () => {
    notifyContentScripts();
    showToast('API key saved!');
  });
});

// ─── Notify content scripts ──────────────────────────────────────
function notifyContentScripts() {
  chrome.tabs.query({ url: 'https://www.youtube.com/*' }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED' }).catch(() => {});
    });
  });
}

// ─── Analytics ───────────────────────────────────────────────────
function loadAnalytics() {
  const today = new Date().toISOString().split('T')[0];
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    last7.push(d.toISOString().split('T')[0]);
  }

  const keys = last7.map(d => `analytics_${d}`);
  chrome.storage.local.get(keys, (res) => {
    // Today
    const todayData = res[`analytics_${today}`] || {};
    const sessions = todayData.sessions || 0;
    const studySeconds = todayData.studySeconds || 0;

    document.getElementById('stat-sessions').textContent = sessions;
    if (studySeconds < 3600) {
      document.getElementById('stat-time').textContent = Math.floor(studySeconds / 60) + 'm';
    } else {
      document.getElementById('stat-time').textContent = (studySeconds / 3600).toFixed(1) + 'h';
    }

    // Week data
    const weekData = last7.map(d => res[`analytics_${d}`]?.studySeconds || 0);
    const maxVal = Math.max(...weekData, 1);

    // Streak
    let streak = 0;
    for (let i = last7.length - 1; i >= 0; i--) {
      if ((res[`analytics_${last7[i]}`]?.studySeconds || 0) > 0) streak++;
      else break;
    }
    document.getElementById('stat-streak').textContent = streak;

    // Total this week
    const totalSec = weekData.reduce((a, b) => a + b, 0);
    document.getElementById('stat-total').textContent = (totalSec / 3600).toFixed(1) + 'h';

    // Week chart
    const chart = document.getElementById('week-chart');
    chart.innerHTML = '';
    last7.forEach((date, i) => {
      const sec = weekData[i];
      const pct = (sec / maxVal) * 100;
      const dayName = DAYS[new Date(date).getDay()];
      const isToday = date === today;
      const wrapper = document.createElement('div');
      wrapper.className = 'week-day';
      wrapper.innerHTML = `
        <div class="week-dot">
          <div class="week-dot-fill" style="height:${pct}%;${isToday ? 'background:linear-gradient(0deg,#22c55e,#4ade80)' : ''}"></div>
        </div>
        <div class="week-dot-label" style="${isToday ? 'color:#a78bfa' : ''}">${dayName}</div>
      `;
      chart.appendChild(wrapper);
    });
  });
}

loadAnalytics();

document.getElementById('clear-analytics').addEventListener('click', () => {
  if (!confirm('Clear all FocusFlow analytics data?')) return;
  const last30 = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    last30.push(`analytics_${d.toISOString().split('T')[0]}`);
  }
  chrome.storage.local.remove(last30, () => {
    loadAnalytics();
    showToast('Analytics cleared');
  });
});
