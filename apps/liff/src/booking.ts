/**
 * LIFF Booking Page — Calendar-based slot booking
 *
 * Flow:
 * 1. Show calendar date picker (current month)
 * 2. Tap date → fetch available slots from API
 * 3. Tap slot → show confirm section
 * 4. Submit booking → show confirmation
 */

declare const liff: {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(opts?: { redirectUri?: string }): void;
  getProfile(): Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
  getIDToken(): string | null;
  getDecodedIDToken(): { sub: string; name?: string; email?: string; picture?: string } | null;
  isInClient(): boolean;
  closeWindow(): void;
};

const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:8787';
const CONNECTION_ID = import.meta.env?.VITE_CALENDAR_CONNECTION_ID || '';

interface Slot {
  startAt: string;
  endAt: string;
  available: boolean;
}

interface BookingField {
  name: string;
  label: string;
  required: boolean;
}

interface BookingState {
  currentYear: number;
  currentMonth: number; // 0-indexed
  selectedDate: string | null;
  slots: Slot[];
  selectedSlot: Slot | null;
  profile: { userId: string; displayName: string; pictureUrl?: string } | null;
  friendId: string | null;
  loading: boolean;
  submitting: boolean;
  bookingFields: BookingField[];
  formData: Record<string, string>;
  step: 'calendar' | 'form' | 'confirm';
}

const state: BookingState = {
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth(),
  selectedDate: null,
  slots: [],
  selectedSlot: null,
  profile: null,
  friendId: null,
  loading: false,
  submitting: false,
  bookingFields: [],
  formData: {},
  step: 'calendar',
};

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function apiCall(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateJa(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${weekdays[d.getDay()]})`;
}

function getApp(): HTMLElement {
  return document.getElementById('app')!;
}

// ========== Calendar Rendering ==========

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function isToday(year: number, month: number, day: number): boolean {
  const now = new Date();
  return now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
}

function isPast(year: number, month: number, day: number): boolean {
  const now = new Date();
  const target = new Date(year, month, day);
  now.setHours(0, 0, 0, 0);
  return target < now;
}

function dateToString(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function renderCalendar(): string {
  const { currentYear, currentMonth, selectedDate } = state;
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfWeek(currentYear, currentMonth);
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

  let html = `
    <div class="booking-calendar">
      <div class="calendar-header">
        <button class="cal-nav" data-action="prev-month">&lt;</button>
        <span class="cal-title">${currentYear}年${currentMonth + 1}月</span>
        <button class="cal-nav" data-action="next-month">&gt;</button>
      </div>
      <div class="cal-weekdays">
        ${weekdays.map((d, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${d}</span>`).join('')}
      </div>
      <div class="cal-days">
  `;

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    html += '<span class="cal-day empty"></span>';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = dateToString(currentYear, currentMonth, day);
    const past = isPast(currentYear, currentMonth, day);
    const today = isToday(currentYear, currentMonth, day);
    const selected = selectedDate === dateStr;
    const classes = [
      'cal-day',
      past ? 'past' : 'active',
      today ? 'today' : '',
      selected ? 'selected' : '',
      new Date(currentYear, currentMonth, day).getDay() === 0 ? 'sun' : '',
      new Date(currentYear, currentMonth, day).getDay() === 6 ? 'sat' : '',
    ].filter(Boolean).join(' ');

    html += `<span class="${classes}" ${past ? '' : `data-date="${dateStr}"`}>${day}</span>`;
  }

  html += '</div></div>';
  return html;
}

// ========== Slots Rendering ==========

function renderSlots(): string {
  const { slots, selectedDate, selectedSlot, loading } = state;

  if (!selectedDate) return '';

  if (loading) {
    return `
      <div class="slots-section">
        <h3>${formatDateJa(selectedDate)}</h3>
        <div class="slots-loading">
          <div class="loading-spinner"></div>
          <p>空き状況を確認中...</p>
        </div>
      </div>
    `;
  }

  if (slots.length === 0) {
    return `
      <div class="slots-section">
        <h3>${formatDateJa(selectedDate)}</h3>
        <p class="no-slots">この日は予約枠がありません</p>
      </div>
    `;
  }

  const slotButtons = slots.map((slot) => {
    const isSelected = selectedSlot?.startAt === slot.startAt;
    const cls = slot.available
      ? (isSelected ? 'slot-btn selected' : 'slot-btn available')
      : 'slot-btn full';
    return `<button class="${cls}" ${slot.available ? `data-start="${slot.startAt}" data-end="${slot.endAt}"` : 'disabled'}>${formatTime(slot.startAt)} - ${formatTime(slot.endAt)}</button>`;
  }).join('');

  return `
    <div class="slots-section">
      <h3>${formatDateJa(selectedDate)}</h3>
      <div class="slots-grid">${slotButtons}</div>
    </div>
  `;
}

// ========== Form Section ==========

function renderForm(): string {
  const { selectedSlot, selectedDate, bookingFields, formData } = state;
  if (!selectedSlot || !selectedDate || state.step !== 'form') return '';

  const fields = bookingFields.map(f => `
    <div class="form-field">
      <label class="form-label">${escapeHtml(f.label)}${f.required ? ' <span style="color:#e53e3e">*</span>' : ''}</label>
      <input type="text" class="form-input" data-field="${f.name}" value="${escapeHtml(formData[f.name] || '')}" placeholder="${escapeHtml(f.label)}" ${f.required ? 'required' : ''} />
    </div>
  `).join('');

  return `
    <div class="form-section">
      <div class="confirm-card">
        <h3>お客様情報</h3>
        <p class="form-date-info">${formatDateJa(selectedDate)} ${formatTime(selectedSlot.startAt)} - ${formatTime(selectedSlot.endAt)}</p>
        ${fields}
        <div style="display:flex;gap:8px;margin-top:16px">
          <button class="back-btn" data-action="back-to-calendar">戻る</button>
          <button class="book-btn" data-action="go-to-confirm">確認画面へ</button>
        </div>
      </div>
    </div>
  `;
}

// ========== Confirm Section ==========

function renderConfirm(): string {
  const { selectedSlot, selectedDate, formData, bookingFields } = state;
  if (!selectedSlot || !selectedDate || state.step !== 'confirm') return '';

  const detailRows = [
    `<div class="confirm-row"><span class="confirm-label">日付</span><span class="confirm-value">${formatDateJa(selectedDate)}</span></div>`,
    `<div class="confirm-row"><span class="confirm-label">時間</span><span class="confirm-value">${formatTime(selectedSlot.startAt)} - ${formatTime(selectedSlot.endAt)}</span></div>`,
    ...bookingFields.filter(f => formData[f.name]).map(f =>
      `<div class="confirm-row"><span class="confirm-label">${escapeHtml(f.label)}</span><span class="confirm-value">${escapeHtml(formData[f.name])}</span></div>`
    ),
  ].join('');

  return `
    <div class="confirm-section">
      <div class="confirm-card">
        <h3>予約内容の確認</h3>
        <div class="confirm-details">${detailRows}</div>
        <div style="display:flex;gap:8px;margin-top:16px">
          <button class="back-btn" data-action="back-to-form">戻る</button>
          <button class="book-btn" data-action="confirm-booking">予約を確定する</button>
        </div>
      </div>
    </div>
  `;
}

// ========== Main Render ==========

function render(): void {
  const app = getApp();
  if (state.step === 'form') {
    app.innerHTML = `<div class="booking-page">${renderForm()}</div>`;
  } else if (state.step === 'confirm') {
    app.innerHTML = `<div class="booking-page">${renderConfirm()}</div>`;
  } else {
    app.innerHTML = `
      <div class="booking-page">
        <div class="booking-header">
          <h1>予約</h1>
          <p>ご希望の日時をお選びください</p>
        </div>
        ${renderCalendar()}
        ${renderSlots()}
      </div>
    `;
  }
  attachEvents();
}

function renderSuccess(date: string, slot: Slot): void {
  const app = getApp();
  app.innerHTML = `
    <div class="booking-page">
      <div class="success-card">
        <div class="success-icon">✓</div>
        <h2>予約が完了しました</h2>
        <div class="confirm-details">
          <div class="confirm-row">
            <span class="confirm-label">日付</span>
            <span class="confirm-value">${formatDateJa(date)}</span>
          </div>
          <div class="confirm-row">
            <span class="confirm-label">時間</span>
            <span class="confirm-value">${formatTime(slot.startAt)} - ${formatTime(slot.endAt)}</span>
          </div>
        </div>
        <p class="success-message">ご予約ありがとうございます。<br>当日のお越しをお待ちしております。</p>
        <button class="close-btn" data-action="close">閉じる</button>
      </div>
    </div>
  `;

  const closeBtn = app.querySelector('[data-action="close"]');
  closeBtn?.addEventListener('click', () => {
    if (liff.isInClient()) {
      liff.closeWindow();
    } else {
      window.close();
    }
  });
}

function renderError(message: string): void {
  const app = getApp();
  app.innerHTML = `
    <div class="booking-page">
      <div class="card">
        <h2 style="color: #e53e3e;">エラー</h2>
        <p class="error">${escapeHtml(message)}</p>
        <button class="close-btn" data-action="retry" style="margin-top:16px;">やり直す</button>
      </div>
    </div>
  `;
  app.querySelector('[data-action="retry"]')?.addEventListener('click', () => {
    state.selectedDate = null;
    state.selectedSlot = null;
    state.slots = [];
    render();
  });
}

// ========== Event Handlers ==========

function attachEvents(): void {
  const app = getApp();

  // Month navigation
  app.querySelectorAll('.cal-nav').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.action;
      if (action === 'prev-month') {
        state.currentMonth--;
        if (state.currentMonth < 0) {
          state.currentMonth = 11;
          state.currentYear--;
        }
      } else {
        state.currentMonth++;
        if (state.currentMonth > 11) {
          state.currentMonth = 0;
          state.currentYear++;
        }
      }
      state.selectedDate = null;
      state.selectedSlot = null;
      state.slots = [];
      render();
    });
  });

  // Date selection
  app.querySelectorAll('.cal-day.active').forEach((el) => {
    el.addEventListener('click', () => {
      const date = (el as HTMLElement).dataset.date;
      if (date) {
        state.selectedDate = date;
        state.selectedSlot = null;
        state.slots = [];
        state.loading = true;
        render();
        fetchSlots(date);
      }
    });
  });

  // Slot selection → go to form step
  app.querySelectorAll('.slot-btn.available').forEach((btn) => {
    btn.addEventListener('click', () => {
      const startAt = (btn as HTMLElement).dataset.start!;
      const endAt = (btn as HTMLElement).dataset.end!;
      state.selectedSlot = { startAt, endAt, available: true };
      // Pre-fill name from profile
      if (state.profile && !state.formData.name) {
        state.formData.name = state.profile.displayName;
      }
      state.step = state.bookingFields.length > 0 ? 'form' : 'confirm';
      render();
    });
  });

  // Form input tracking
  app.querySelectorAll('.form-input').forEach((input) => {
    input.addEventListener('input', () => {
      const el = input as HTMLInputElement;
      const field = el.dataset.field;
      if (field) state.formData[field] = el.value;
    });
  });

  // Form navigation
  app.querySelector('[data-action="back-to-calendar"]')?.addEventListener('click', () => {
    state.step = 'calendar';
    render();
  });
  app.querySelector('[data-action="go-to-confirm"]')?.addEventListener('click', () => {
    // Validate required fields
    for (const f of state.bookingFields) {
      if (f.required && !state.formData[f.name]?.trim()) {
        alert(`${f.label}を入力してください`);
        return;
      }
    }
    state.step = 'confirm';
    render();
  });
  app.querySelector('[data-action="back-to-form"]')?.addEventListener('click', () => {
    state.step = state.bookingFields.length > 0 ? 'form' : 'calendar';
    render();
  });

  // Confirm booking
  app.querySelector('[data-action="confirm-booking"]')?.addEventListener('click', () => submitBooking());
}

// ========== API Calls ==========

async function fetchSlots(date: string): Promise<void> {
  try {
    const res = await apiCall(`/api/calendar/available?date=${date}`);
    if (!res.ok) throw new Error('スロット取得に失敗しました');
    const json = await res.json() as { success: boolean; data: { slots?: Slot[]; closed?: boolean } | Slot[] };
    if (!json.success) throw new Error('スロット取得に失敗しました');
    const slotsData = Array.isArray(json.data) ? json.data : (json.data as { slots?: Slot[] }).slots ?? [];
    state.slots = slotsData;
  } catch (err) {
    state.slots = [];
    console.error('fetchSlots error:', err);
  } finally {
    state.loading = false;
    render();
  }
}

async function fetchSettings(): Promise<void> {
  try {
    const res = await apiCall('/api/calendar/settings-public');
    if (res.ok) {
      const json = await res.json() as { success: boolean; data?: { bookingFields?: BookingField[] } };
      if (json.success && json.data?.bookingFields) {
        state.bookingFields = json.data.bookingFields;
      }
    }
  } catch { /* use defaults */ }
}

async function submitBooking(): Promise<void> {
  const { selectedSlot, selectedDate, profile, friendId, formData } = state;
  if (!selectedSlot || !selectedDate || state.submitting) return;
  state.submitting = true;

  const confirmBtn = getApp().querySelector('[data-action="confirm-booking"]') as HTMLButtonElement | null;
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = '送信中...';
  }

  try {
    const body: Record<string, unknown> = {
      date: selectedDate,
      startTime: selectedSlot.startAt,
      endTime: selectedSlot.endAt,
      bookingData: formData,
    };
    if (friendId) body.friendId = friendId;
    if (profile) body.bookingData = { ...formData, lineDisplayName: profile.displayName };

    const res = await apiCall('/api/calendar/book', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => null) as { error?: string } | null;
      throw new Error(errData?.error || '予約に失敗しました');
    }

    renderSuccess(selectedDate, selectedSlot);
  } catch (err) {
    state.submitting = false;
    renderError(err instanceof Error ? err.message : '予約に失敗しました');
  }
}

// ========== Init ==========

export async function initBooking(): Promise<void> {
  const profile = await liff.getProfile();
  state.profile = profile;

  // Fetch booking field settings
  await fetchSettings();

  // Try to get friendId from UUID linking
  const UUID_STORAGE_KEY = 'lh_uuid';
  try {
    state.friendId = localStorage.getItem(UUID_STORAGE_KEY);
  } catch {
    // silent
  }

  // Silent UUID linking (same as main flow)
  const rawIdToken = liff.getIDToken();
  if (rawIdToken) {
    const existingUuid = state.friendId;
    apiCall('/api/liff/link', {
      method: 'POST',
      body: JSON.stringify({
        idToken: rawIdToken,
        displayName: profile.displayName,
        existingUuid: existingUuid,
      }),
    }).then(async (res) => {
      if (res.ok) {
        const data = await res.json() as { success: boolean; data?: { userId?: string } };
        if (data?.data?.userId) {
          try {
            localStorage.setItem(UUID_STORAGE_KEY, data.data.userId);
            state.friendId = data.data.userId;
          } catch { /* silent */ }
        }
      }
    }).catch(() => { /* silent */ });
  }

  render();
}
