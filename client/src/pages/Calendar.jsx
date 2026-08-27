import React, { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { colorVars } from "../lib/colors";
import EventModal from "../components/EventModal";
import DayPanel from "../components/DayPanel";
import Spinner from "../components/Spinner";

const INTL_LOCALE = { en: "en-US", zh: "zh-CN", ja: "ja-JP" };
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MOBILE_BREAKPOINT = "(max-width: 640px)";

// Session-only cache so clicking prev/next back to a month you've already
// seen doesn't refetch it — cleared on full page reload, which is fine
// since a fresh load should show fresh data anyway.
const monthCache = new Map();
const MONTH_CACHE_TTL_MS = 15_000;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_BREAKPOINT).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_BREAKPOINT);
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}
// Monday-first weekday index (0=Mon..6=Sun) for the 1st of the month
function firstWeekdayIndex(year, month) {
  const jsDay = new Date(year, month - 1, 1).getDay(); // 0=Sun..6=Sat
  return (jsDay + 6) % 7;
}

export default function Calendar() {
  const { t, pickLang, locale } = useI18n();
  const isMobile = useIsMobile();
  const today = new Date();
  const [calendars, setCalendars] = useState([]);
  const [calendarId, setCalendarId] = useState(1);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    api
      .getCalendars()
      .then((data) => setCalendars(data.length > 0 ? data : [{ id: 1, name_en: "Main Calendar", name_zh: "", name_ja: "" }]))
      .catch(() => setCalendars([{ id: 1, name_en: "Main Calendar", name_zh: "", name_ja: "" }]));
  }, []);

  function selectCalendar(id) {
    if (id === calendarId) return;
    setCalendarId(id);
    setSelectedDay(null);
    setSelectedEvent(null);
  }

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `${calendarId}-${year}-${month}`;
    const cached = monthCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < MONTH_CACHE_TTL_MS) {
      setEvents(cached.data);
      setLoadError(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    setEvents([]); // clear stale month's events immediately so they don't render mismatched against the new date grid while loading

    function attempt(isRetry) {
      return api
        .getEvents(year, month, calendarId)
        .then((data) => {
          if (cancelled) return;
          monthCache.set(cacheKey, { data, fetchedAt: Date.now() });
          setEvents(data);
          setLoadError(false);
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          // The most common real-world cause of a failed request here is
          // Render's free tier waking up from sleep (30-60s cold start) —
          // one silent automatic retry after a short delay resolves most of
          // those without the person needing to notice or do anything.
          if (!isRetry) {
            setTimeout(() => !cancelled && attempt(true), 4000);
            return;
          }
          setLoadError(true);
          setLoading(false);
        });
    }
    attempt(false);

    return () => {
      cancelled = true;
    };
  }, [year, month, calendarId, retryTick]);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(INTL_LOCALE[locale] || "en-US", { month: "long" }).format(
        new Date(year, month - 1, 1)
      ),
    [year, month, locale]
  );

  const eventsByDay = useMemo(() => {
    const map = {};
    events.forEach((e) => {
      (map[e.day] = map[e.day] || []).push(e);
    });
    return map;
  }, [events]);

  function goPrev() {
    setSelectedDay(null);
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }
  function goNext() {
    setSelectedDay(null);
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  const total = daysInMonth(year, month);
  const leadBlanks = firstWeekdayIndex(year, month);
  const cells = [];
  for (let i = 0; i < leadBlanks; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 60, maxWidth: selectedDay && !isMobile ? 1240 : 1040 }}>
      {calendars.length > 1 && (
        <div style={styles.calendarTabs}>
          {calendars.map((c) => (
            <button
              key={c.id}
              onClick={() => selectCalendar(c.id)}
              style={{
                ...styles.calendarTab,
                ...(c.id === calendarId ? styles.calendarTabActive : {}),
              }}
            >
              {pickLang(c, "name")}
            </button>
          ))}
        </div>
      )}

      <div className="month-bar" style={styles.monthBar}>
        <button className="btn-ghost btn" onClick={goPrev} aria-label={t("calendar.prevMonth")}>
          ←
        </button>
        <h1 className="month-title" style={styles.monthTitle}>
          {monthLabel} <span style={styles.year}>{year}</span>
        </h1>
        <button className="btn-ghost btn" onClick={goNext} aria-label={t("calendar.nextMonth")}>
          →
        </button>
      </div>

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <Spinner label={t("common.loading")} />
        </div>
      )}

      {loadError && !loading && (
        <div style={styles.errorBlock}>
          <p style={styles.errorText}>{t("calendar.loadError")}</p>
          <button className="btn btn-gold" onClick={() => setRetryTick((n) => n + 1)}>
            {t("calendar.retry")}
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        {selectedDay && !isMobile && (
          <DayPanel
            year={year}
            month={month}
            day={selectedDay}
            calendarId={calendarId}
            onClose={() => setSelectedDay(null)}
            onSelectEvent={setSelectedEvent}
            pickLang={pickLang}
            locale={locale}
            t={t}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {!loadError && isMobile ? (
            <AgendaList
              total={total}
              eventsByDay={eventsByDay}
              onSelect={setSelectedEvent}
              pickLang={pickLang}
              t={t}
              locale={locale}
              year={year}
              month={month}
              calendarId={calendarId}
              loading={loading}
            />
          ) : !loadError ? (
            <>
              <div style={styles.weekHeader}>
                {WEEKDAY_KEYS.map((k) => (
                  <div key={k} style={styles.weekHeaderCell}>
                    {t(`calendar.${k}`)}
                  </div>
                ))}
              </div>

              <div style={styles.grid}>
                {cells.map((d, i) =>
                  d === null ? (
                    <div key={i} style={styles.emptyCell} />
                  ) : (
                    <DayCell
                      key={i}
                      day={d}
                      events={eventsByDay[d] || []}
                      onSelect={setSelectedEvent}
                      onSelectDay={setSelectedDay}
                      isSelected={selectedDay === d}
                      pickLang={pickLang}
                      t={t}
                    />
                  )
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {!loading && !loadError && !isMobile && events.length === 0 && (
        <p style={{ color: "var(--text-dim)", textAlign: "center", marginTop: 40 }}>
          {t("calendar.noEvents")}
        </p>
      )}

      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          monthLabel={monthLabel}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

function DayCell({ day, events, onSelect, onSelectDay, isSelected, pickLang, t }) {
  return (
    <div
      onClick={() => onSelectDay(day)}
      style={{
        ...styles.dayCell,
        ...(isSelected ? styles.dayCellSelected : {}),
        cursor: "pointer",
      }}
      title={t("dayPanel.viewDay")}
    >
      <span
        style={{ ...styles.dayNum, ...(isSelected ? styles.dayNumSelected : {}) }}
      >
        {day}
      </span>
      <div style={styles.dayEvents}>
        {events.map((e) => {
          const colors = colorVars(e.color);
          return (
            <button
              key={e.id}
              onClick={(ev) => {
                ev.stopPropagation(); // open the sign-up modal, not the day panel
                onSelect(e);
              }}
              style={{
                ...styles.eventChip,
                background: colors.bg,
                borderColor: colors.line,
              }}
              title={pickLang(e, "name")}
            >
              <span style={styles.eventTime}>{e.time}</span>
              <span style={styles.eventName}>{pickLang(e, "name")}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Mobile: a 7-column grid becomes unusably narrow on a phone (each column
// only ~50px wide), so instead show a scrollable vertical list of days that
// actually have events — full-width rows mean event names don't need
// truncating or a hover tooltip (which doesn't exist on touch anyway); the
// full name is always visible, and tapping a row opens the same detail modal.
function AgendaList({ total, eventsByDay, onSelect, pickLang, t, locale, year, month, calendarId, loading }) {
  const [rosterCache, setRosterCache] = useState({}); // { [day]: eventsWithNames[] }
  const [rosterLoadingDay, setRosterLoadingDay] = useState(null);
  const [expandedEventId, setExpandedEventId] = useState(null);

  const days = [];
  for (let d = 1; d <= total; d++) {
    if (eventsByDay[d] && eventsByDay[d].length > 0) days.push(d);
  }

  if (days.length === 0) {
    if (loading) return null;
    return <p style={{ color: "var(--text-dim)", textAlign: "center", marginTop: 40 }}>{t("calendar.noEvents")}</p>;
  }

  async function toggleRoster(day, eventId) {
    if (expandedEventId === eventId) {
      setExpandedEventId(null);
      return;
    }
    setExpandedEventId(eventId);
    if (!rosterCache[day]) {
      setRosterLoadingDay(day);
      try {
        const data = await api.getEventsForDay(year, month, day, calendarId);
        setRosterCache((prev) => ({ ...prev, [day]: data }));
      } catch {
        // silently fail — the toggle just won't show names; the person can still tap the chip to sign up
      } finally {
        setRosterLoadingDay(null);
      }
    }
  }

  return (
    <div style={styles.agendaList}>
      {days.map((d) => {
        const weekday = new Intl.DateTimeFormat(INTL_LOCALE[locale] || "en-US", { weekday: "short" }).format(
          new Date(year, month - 1, d)
        );
        return (
          <div key={d} style={styles.agendaDay}>
            <div style={styles.agendaDateCol}>
              <div style={styles.agendaDayNum}>{d}</div>
              <div style={styles.agendaWeekday}>{weekday}</div>
            </div>
            <div style={styles.agendaEvents}>
              {eventsByDay[d].map((e) => {
                const colors = colorVars(e.color);
                const isExpanded = expandedEventId === e.id;
                const rosterEvent = rosterCache[d]?.find((re) => re.id === e.id);
                return (
                  <div key={e.id} style={{ width: "100%" }}>
                    <button
                      onClick={() => onSelect(e)}
                      style={{
                        ...styles.agendaChip,
                        background: colors.bg,
                        borderColor: colors.line,
                      }}
                    >
                      <span style={styles.eventTime}>{e.time}</span>
                      <span style={styles.agendaEventName}>{pickLang(e, "name")}</span>
                    </button>

                    {e.needs_signup && (
                      <button
                        onClick={() => toggleRoster(d, e.id)}
                        style={styles.rosterToggle}
                      >
                        {isExpanded ? t("dayPanel.hideSignups") : t("dayPanel.viewSignups")}
                      </button>
                    )}

                    {isExpanded && (
                      <div style={styles.rosterBox}>
                        {rosterLoadingDay === d && !rosterEvent ? (
                          <Spinner label={t("common.loading")} size={14} />
                        ) : rosterEvent ? (
                          rosterEvent.roles.length === 0 ? (
                            <div style={styles.noSignupsSmall}>{t("event.noRoles")}</div>
                          ) : (
                            rosterEvent.roles.map((r) => (
                              <div key={r.id} style={styles.rosterRole}>
                                <div style={styles.rosterRoleHeader}>
                                  <span>{pickLang(r, "name")}</span>
                                  <span style={styles.rosterCount}>
                                    {r.signup_count}/{r.limit_count}
                                  </span>
                                </div>
                                {r.signups.length > 0 ? (
                                  <div style={styles.nameChipsSmall}>
                                    {r.signups.map((s, i) => (
                                      <span key={i} style={styles.nameChipSmall}>
                                        {s.name}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={styles.noSignupsSmall}>{t("dayPanel.noSignupsYet")}</div>
                                )}
                              </div>
                            ))
                          )
                        ) : (
                          <div style={styles.noSignupsSmall}>{t("dayPanel.error")}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  calendarTabs: {
    display: "flex",
    justifyContent: "center",
    gap: 4,
    marginBottom: 20,
    background: "var(--paper-dim)",
    borderRadius: 999,
    padding: 3,
    width: "fit-content",
    marginLeft: "auto",
    marginRight: "auto",
  },
  calendarTab: {
    border: "none",
    background: "transparent",
    color: "var(--text-dim)",
    padding: "8px 18px",
    borderRadius: 999,
    fontWeight: 600,
    fontSize: "0.85rem",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  calendarTabActive: {
    background: "var(--ink)",
    color: "var(--paper)",
  },
  errorBlock: {
    textAlign: "center",
    padding: "32px 20px",
    background: "#fdf2f0",
    border: "1px solid #f0d4cf",
    borderRadius: "var(--radius-m)",
    marginBottom: 20,
  },
  errorText: {
    color: "#8a4a3f",
    fontSize: "0.92rem",
    marginBottom: 14,
  },
  monthBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    marginBottom: 24,
  },
  monthTitle: {
    fontFamily: "var(--font-display)",
    fontSize: "1.7rem",
    fontWeight: 600,
    color: "var(--ink)",
    minWidth: 220,
    textAlign: "center",
    margin: 0,
  },
  year: {
    color: "var(--gold)",
    fontWeight: 500,
  },
  weekHeader: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 6,
    marginBottom: 6,
  },
  weekHeaderCell: {
    textAlign: "center",
    fontSize: "0.78rem",
    fontWeight: 700,
    color: "var(--text-dim)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "4px 0",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 6,
  },
  emptyCell: {
    minHeight: 92,
    minWidth: 0,
  },
  dayCell: {
    minHeight: 92,
    minWidth: 0, // stop long event text from forcing this grid column wider than its 1fr share
    border: "1px solid var(--line)",
    borderRadius: "var(--radius-s)",
    background: "#fff",
    padding: "6px 6px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    overflow: "hidden",
  },
  dayCellSelected: {
    borderColor: "var(--gold)",
    boxShadow: "0 0 0 1px var(--gold)",
  },
  dayNum: {
    fontSize: "0.78rem",
    color: "var(--text-dim)",
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    padding: "1px 5px",
    borderRadius: 4,
    alignSelf: "flex-start",
    marginLeft: -5,
  },
  dayNumSelected: {
    background: "var(--gold)",
    color: "#fff",
  },
  dayEvents: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    overflow: "hidden",
  },
  eventChip: {
    border: "1px solid",
    borderRadius: 5,
    padding: "3px 6px",
    textAlign: "left",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    lineHeight: 1.2,
    minWidth: 0,
    width: "100%",
    overflow: "hidden",
  },
  eventTime: {
    fontSize: "0.64rem",
    fontFamily: "var(--font-mono)",
    fontWeight: 700,
    color: "rgba(35,43,69,0.7)",
  },
  eventName: {
    fontSize: "0.7rem",
    fontWeight: 600,
    color: "var(--ink)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  agendaList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  agendaDay: {
    display: "flex",
    gap: 12,
    border: "1px solid var(--line)",
    borderRadius: "var(--radius-s)",
    background: "#fff",
    padding: "10px 12px",
  },
  agendaDateCol: {
    flexShrink: 0,
    width: 40,
    textAlign: "center",
    paddingTop: 2,
  },
  agendaDayNum: {
    fontFamily: "var(--font-mono)",
    fontWeight: 700,
    fontSize: "1.1rem",
    color: "var(--ink)",
    lineHeight: 1.1,
  },
  agendaWeekday: {
    fontSize: "0.68rem",
    color: "var(--text-dim)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  agendaEvents: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  },
  agendaChip: {
    border: "1px solid",
    borderRadius: 6,
    padding: "6px 10px",
    textAlign: "left",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    lineHeight: 1.3,
    width: "100%",
  },
  agendaEventName: {
    fontSize: "0.82rem",
    fontWeight: 600,
    color: "var(--ink)",
  },
  rosterToggle: {
    border: "none",
    background: "transparent",
    color: "var(--gold)",
    fontSize: "0.74rem",
    fontWeight: 600,
    cursor: "pointer",
    padding: "3px 2px 6px",
    display: "block",
  },
  rosterBox: {
    background: "var(--paper-dim)",
    borderRadius: 8,
    padding: "8px 10px",
    marginBottom: 6,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  rosterRole: {},
  rosterRoleHeader: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.78rem",
    fontWeight: 600,
    color: "var(--ink)",
    marginBottom: 3,
  },
  rosterCount: {
    fontFamily: "var(--font-mono)",
    fontWeight: 400,
    color: "var(--text-dim)",
  },
  nameChipsSmall: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
  },
  nameChipSmall: {
    fontSize: "0.72rem",
    background: "#fff",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "2px 8px",
    color: "var(--text)",
  },
  noSignupsSmall: {
    fontSize: "0.74rem",
    color: "var(--text-dim)",
    fontStyle: "italic",
  },
};
