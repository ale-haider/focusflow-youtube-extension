// FocusFlow Background Service Worker

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'NOTIFY') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: msg.title || 'FocusFlow',
      message: msg.body || '',
      priority: 1
    });
  }
});

// Handle alarm for timer backup
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'focusflow-timer') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '⏱ FocusFlow Reminder',
      message: 'Stay focused on your studies!',
      priority: 1
    });
  }
});
