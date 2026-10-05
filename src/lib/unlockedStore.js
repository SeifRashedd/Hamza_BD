// Remembers unlocked messages for this browser tab only (cleared when the tab
// closes), so Hamza doesn't have to retype passwords after a refresh.
const KEY = 'hamza-birthday:unlocked';

export function loadUnlocked() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveUnlocked(unlocked) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(unlocked));
  } catch {
    /* storage unavailable (private mode etc.) — keep it in memory only */
  }
}
