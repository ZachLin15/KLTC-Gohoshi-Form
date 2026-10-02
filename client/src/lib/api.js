// The client and API are two separate services on different onrender.com
// subdomains — in production that's a cross-origin call. We call the API's
// own URL directly rather than routing it through a same-origin proxy: that
// would be simpler in principle, but it isn't something this client-side
// code can verify is actually wired up correctly on the hosting side, and
// admin auth no longer needs same-origin anyway (see below). An optional
// VITE_API_URL build-time override still works if you ever need one.
// In dev, Vite proxies /api to the local server (see vite.config.js).
const BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "/api" : "https://kltc-signup-api.onrender.com/api");

// Admin auth is a bearer token (not a cookie), stored here and sent as
// `Authorization: Bearer <token>`. Cookies between two different
// onrender.com subdomains are a cross-site cookie to a browser, and
// Safari/iOS blocks those by default (Intelligent Tracking Prevention) —
// that's what made admin login unreliable on iPhone. A token read from a
// plain header has no such restriction in any browser.
const TOKEN_KEY = "kltc_admin_token";
function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* localStorage unavailable (private mode etc.) — admin session just won't persist across reloads */
  }
}

// A request should fail loudly, not hang forever — a flaky connection, a
// sleeping Render free-tier service that never finishes waking, or a
// misrouted response can otherwise leave the UI stuck on a spinner with no
// way to recover short of reloading the page.
const REQUEST_TIMEOUT_MS = 20_000;

async function request(path, options = {}) {
  const token = getToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(BASE + path, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
      ...options,
    });
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error("Request timed out — check your connection and try again.");
    }
    throw new Error("Could not reach the server — check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }

  // A misrouted request (wrong host, a proxy/CDN serving something other
  // than the API) typically still comes back 200 OK with an HTML page
  // rather than JSON. Treat that as a hard failure instead of silently
  // parsing nothing and carrying on as if the call had succeeded.
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Unexpected response from server (not JSON, status ${res.status}).`);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data && data.code;
    throw err;
  }
  return data;
}

export const api = {
  // public
  getCalendars: () => request(`/calendars`),
  getEvents: (year, month, calendarId = 1) => request(`/events?year=${year}&month=${month}&calendar_id=${calendarId}`),
  getEvent: (id) => request(`/events/${id}`),
  getEventsForDay: (year, month, day, calendarId = 1) =>
    request(`/events/day?year=${year}&month=${month}&day=${day}&calendar_id=${calendarId}`),
  signUp: (eventId, role_id, name) =>
    request(`/events/${eventId}/signup`, {
      method: "POST",
      body: JSON.stringify({ role_id, name }),
    }),
  lookupSignups: (name) => request(`/signups/lookup?name=${encodeURIComponent(name)}`),

  // admin auth
  adminLogin: (password) =>
    request(`/admin/login`, { method: "POST", body: JSON.stringify({ password }) }).then((data) => {
      setToken(data.token);
      return data;
    }),
  adminLogout: () =>
    request(`/admin/logout`, { method: "POST" }).finally(() => setToken(null)),
  adminMe: () => (getToken() ? request(`/admin/me`) : Promise.resolve({ isAdmin: false })),

  // admin: calendars
  adminGetCalendars: () => request(`/admin/calendars`),
  adminCreateCalendar: (payload) =>
    request(`/admin/calendars`, { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateCalendar: (id, payload) =>
    request(`/admin/calendars/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  adminDeleteCalendar: (id) => request(`/admin/calendars/${id}`, { method: "DELETE" }),

  // admin: pdf + events
  uploadPdf: async (file) => {
    const form = new FormData();
    form.append("pdf", file);
    const token = getToken();
    const res = await fetch(BASE + "/admin/upload-pdf", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data;
  },
  adminGetEvents: (year, month, calendarId = 1) =>
    request(`/admin/events?year=${year}&month=${month}&calendar_id=${calendarId}`),
  adminGetEvent: (id) => request(`/admin/events/${id}`),
  adminBulkCreateEvents: (payload) =>
    request(`/admin/events/bulk`, { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateEvent: (id, payload) =>
    request(`/admin/events/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  adminRescheduleEvent: (id, payload) =>
    request(`/admin/events/${id}/schedule`, { method: "PUT", body: JSON.stringify(payload) }),
  adminDeleteEvent: (id) => request(`/admin/events/${id}`, { method: "DELETE" }),
  adminBulkDeleteEvents: (ids) =>
    request(`/admin/events/bulk-delete`, { method: "POST", body: JSON.stringify({ ids }) }),
  adminDeleteSignup: (id) => request(`/admin/signups/${id}`, { method: "DELETE" }),

  // admin: reports
  adminGetReport: (year, month, calendarId = 1) =>
    request(`/admin/reports/signups?year=${year}&month=${month}&calendar_id=${calendarId}`),
  // A plain <a href> download can't carry the Authorization header, so the
  // CSV is fetched as a blob and saved via a temporary object URL instead.
  adminDownloadReportCsv: async (year, month, calendarId = 1) => {
    const token = getToken();
    const res = await fetch(
      `${BASE}/admin/reports/signups.csv?year=${year}&month=${month}&calendar_id=${calendarId}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kltc-signups-${year}-${String(month).padStart(2, "0")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // admin: templates
  adminGetTemplates: () => request(`/admin/templates`),
  adminCreateTemplate: (payload) =>
    request(`/admin/templates`, { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateTemplate: (id, payload) =>
    request(`/admin/templates/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  adminDeleteTemplate: (id) => request(`/admin/templates/${id}`, { method: "DELETE" }),
};
