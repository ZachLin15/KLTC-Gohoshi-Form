// In dev, Vite proxies /api to the local server (see vite.config.js).
// In production the client is a static site on a different origin than the
// API, so VITE_API_URL must be set at build time to the deployed server's
// full URL, e.g. https://kltc-signup-api.onrender.com/api
const BASE = import.meta.env.VITE_API_URL || "/api";

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
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
  getEvents: (year, month) => request(`/events?year=${year}&month=${month}`),
  getEvent: (id) => request(`/events/${id}`),
  signUp: (eventId, role_id, name) =>
    request(`/events/${eventId}/signup`, {
      method: "POST",
      body: JSON.stringify({ role_id, name }),
    }),
  lookupSignups: (name) => request(`/signups/lookup?name=${encodeURIComponent(name)}`),

  // admin auth
  adminLogin: (password) =>
    request(`/admin/login`, { method: "POST", body: JSON.stringify({ password }) }),
  adminLogout: () => request(`/admin/logout`, { method: "POST" }),
  adminMe: () => request(`/admin/me`),

  // admin: pdf + events
  uploadPdf: async (file) => {
    const form = new FormData();
    form.append("pdf", file);
    const res = await fetch(BASE + "/admin/upload-pdf", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data;
  },
  adminGetEvents: (year, month) => request(`/admin/events?year=${year}&month=${month}`),
  adminGetEvent: (id) => request(`/admin/events/${id}`),
  adminBulkCreateEvents: (payload) =>
    request(`/admin/events/bulk`, { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateEvent: (id, payload) =>
    request(`/admin/events/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  adminDeleteEvent: (id) => request(`/admin/events/${id}`, { method: "DELETE" }),
  adminBulkDeleteEvents: (ids) =>
    request(`/admin/events/bulk-delete`, { method: "POST", body: JSON.stringify({ ids }) }),
  adminDeleteSignup: (id) => request(`/admin/signups/${id}`, { method: "DELETE" }),

  // admin: reports
  adminGetReport: (year, month) => request(`/admin/reports/signups?year=${year}&month=${month}`),
  adminReportCsvUrl: (year, month) => `${BASE}/admin/reports/signups.csv?year=${year}&month=${month}`,

  // admin: templates
  adminGetTemplates: () => request(`/admin/templates`),
  adminCreateTemplate: (payload) =>
    request(`/admin/templates`, { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateTemplate: (id, payload) =>
    request(`/admin/templates/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  adminDeleteTemplate: (id) => request(`/admin/templates/${id}`, { method: "DELETE" }),
};
