const KEY = "kltc_signup_names";
const MAX_REMEMBERED = 5;

export function rememberName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return;
  try {
    const names = getRememberedNames().filter((n) => n.toLowerCase() !== trimmed.toLowerCase());
    names.unshift(trimmed);
    localStorage.setItem(KEY, JSON.stringify(names.slice(0, MAX_REMEMBERED)));
  } catch {
    /* localStorage unavailable (private browsing, etc.) — not critical */
  }
}

export function getRememberedNames() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getLastUsedName() {
  return getRememberedNames()[0] || "";
}
