#!/usr/bin/env python3
"""
Parses a KLTC monthly schedule PDF and extracts highlighted events.

Usage: python3 parse_pdf.py <path-to-pdf>
Outputs JSON to stdout:
{
  "month": "August", "year": 2026,
  "events": [
    {"date": 2, "time": "10:00", "color": "yellow",
     "name_en": "General Divisional Meeting ( Daijo Above)",
     "name_zh": "[线上直播] 总部会 (大乘以上）", "name_ja": ""}
  ]
}

Layout notes (poppler/pdfplumber coordinates, top-down):
  columns (left to right): date | day-of-week | time | description EN・ZH |
  zoom/sesshin/robe/shakujo icon columns.

  IMPORTANT: column x-positions are NOT hardcoded. Earlier versions of this
  parser used fixed pixel ranges based on one sample PDF, which broke
  silently (extracting zero events, no error) the moment Shinnyo-en's
  template shifted by even ~10px between months (confirmed: the Sept 2026
  schedule's whole table sits ~11-13px further right than Aug 2026's,
  apparently because the header title wraps to two lines that month). Every
  column boundary here is instead detected per-document from distinctive,
  layout-independent content: day-of-week words (Mon/Tue/...) anchor the
  whole scheme, since they're unambiguous regardless of exact positioning.

  Each day is a table row that can span multiple physical text lines when an
  event's name wraps (English on one line, Chinese continuation on the next,
  prefixed with "・"). The date number/day-of-week are only printed once,
  roughly vertically centered in that day's row block, so they do NOT
  reliably align with the first physical line of the block. Because of this
  we match every text line to its nearest date marker and nearest time
  marker (by vertical distance) rather than assuming same-row alignment.
"""
import sys
import json
import re
import pdfplumber

COLOR_NAMES = {
    (1.0, 1.0, 0.0): "yellow",                 # event in KLTC
    (1.0, 0.8, 1.0): "pink",                   # event in Singapore temple
    (0.992157, 0.913725, 0.85098): "peach",    # propagation
    (0.854902, 0.933333, 0.952941): "closed",  # closed day
    (0.572549, 0.815686, 0.313726): "green",   # e.g. early morning cleaning
}

EVENT_COLORS = {"yellow", "pink", "peach", "green"}
DOW_WORDS = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}


def classify_color(rgb):
    if rgb is None:
        return None
    for known, name in COLOR_NAMES.items():
        if all(abs(a - b) < 0.01 for a, b in zip(rgb, known)):
            return name
    return None


def group_lines(words, tol=3):
    words = sorted(words, key=lambda w: w["top"])
    lines = []
    for w in words:
        placed = False
        for line in lines:
            if abs(line["top"] - w["top"]) <= tol:
                line["words"].append(w)
                line["top"] = min(line["top"], w["top"])
                placed = True
                break
        if not placed:
            lines.append({"top": w["top"], "words": [w]})
    for line in lines:
        line["words"].sort(key=lambda w: w["x0"])
        line["text"] = " ".join(x["text"] for x in line["words"])
    return lines


def nearest_marker(markers, y):
    best_i, best_d = None, None
    for i, (top, _val) in enumerate(markers):
        d = abs(top - y)
        if best_d is None or d < best_d:
            best_d, best_i = d, i
    return best_i


def cascade_marker(markers, y, buffer=6):
    """Return the index of the last marker whose top (minus a small jitter
    buffer) is at-or-before y. Date/time labels in this layout are
    approximately top-aligned with their cell's first content line, with a
    few px of jitter, so a small negative buffer handles that jitter while
    still correctly separating adjacent cells (which are normally >= 11px
    apart)."""
    best_i = None
    for i, (top, _val) in enumerate(markers):
        if top - buffer <= y:
            best_i = i
        else:
            break
    return best_i


def detect_columns(page, words):
    """Detects the x-ranges of the date / day-of-week / time / description
    columns from the document's own content, so this doesn't break when
    Shinnyo-en's template shifts. Anchored on day-of-week words first since
    they're unambiguous ("Mon", "Tue", ...) regardless of exact layout."""
    dow_words = [w for w in words if w["text"] in DOW_WORDS]
    if not dow_words:
        raise ValueError("Could not find any day-of-week labels (Mon/Tue/...) in this PDF — layout may have changed too much to parse automatically.")
    dow_x0 = min(w["x0"] for w in dow_words)
    dow_x1 = max(w["x1"] for w in dow_words)

    # date column: bare 1-2 digit numbers immediately left of the dow column
    date_words = [
        w for w in words
        if w["x0"] < dow_x0 and re.match(r"^\d{1,2}$", w["text"])
    ]
    date_x0 = min((w["x0"] for w in date_words), default=dow_x0 - 20) - 4

    # time column: time-pattern words immediately right of the dow column
    time_words_all = [
        w for w in words
        if w["x0"] > dow_x1 and (re.match(r"^\d{1,2}:\d{2}$", w["text"]) or w["text"] == "~")
    ]
    if not time_words_all:
        raise ValueError("Could not find any time values (e.g. 10:00) in this PDF — layout may have changed too much to parse automatically.")
    time_x0 = min(w["x0"] for w in time_words_all) - 3
    time_x1 = max(w["x1"] for w in time_words_all) + 3

    # description column: right after the time column, up to the ZOOM/icon
    # columns (detected via "ZOOM" cells; falls back to a generous default
    # if a month happens to have zero zoom events)
    zoom_words = [w for w in words if w["text"] == "ZOOM" and w["x0"] > time_x1]
    if zoom_words:
        desc_x1 = min(w["x0"] for w in zoom_words) - 3
    else:
        desc_x1 = page.width * 0.7

    return {
        "date_x0": date_x0,
        "date_x1": dow_x0 - 1,
        "dow_x0": dow_x0 - 1,
        "dow_x1": time_x0,
        "time_x0": time_x0,
        "time_x1": time_x1,
        "desc_x0": time_x1,
        "desc_x1": desc_x1,
        "fill_x_threshold": time_x1 + 15,  # background-fill rects start at/before the date column
    }


def parse(path):
    with pdfplumber.open(path) as pdf:
        page = pdf.pages[0]
        full_text = page.extract_text() or ""

        month, year = None, None
        m = re.search(r"([A-Za-z]+)[（(](\d+)月[）)]\s*(\d{4})", full_text)
        if m:
            month, year = m.group(1), int(m.group(3))

        words = page.extract_words()
        cols = detect_columns(page, words)

        date_markers = []
        for w in words:
            if cols["date_x0"] <= w["x0"] < cols["date_x1"] and re.match(r"^\d{1,2}$", w["text"]):
                date_markers.append((w["top"], int(w["text"])))
        date_markers.sort(key=lambda t: t[0])
        seen = set()
        clean = []
        for top, d in date_markers:
            if d not in seen:
                clean.append((top, d))
                seen.add(d)
        date_markers = clean

        time_words = [w for w in words if cols["time_x0"] <= w["x0"] < cols["time_x1"]]
        time_lines = group_lines(time_words)
        time_markers_all = [(tl["top"], tl["text"].strip()) for tl in time_lines if tl["text"].strip()]
        time_markers_all.sort(key=lambda t: t[0])

        fill_rects = []
        for r in page.rects:
            if not r.get("fill"):
                continue
            w = r["x1"] - r["x0"]
            h = r["bottom"] - r["top"]
            if w > 50 and h > 2 and r["x0"] < cols["fill_x_threshold"]:
                color = classify_color(r.get("non_stroking_color"))
                if color:
                    fill_rects.append((r["top"], r["bottom"], color))

        def color_at(y):
            for top, bottom, color in fill_rects:
                if top - 0.5 <= y <= bottom + 0.5:
                    return color
            return None

        # Only use time markers whose own row is actually a highlighted
        # event when grouping colored text lines. Without this, a colored
        # header line with no time of its own (e.g. "Shinnyo KLTC Day") can
        # get mis-attributed to the nearest time slot on the page even when
        # that slot belongs to a *different, unhighlighted* event — the
        # excluded event's time marker is still physically present, just not
        # a valid attachment point for grouping.
        time_markers = [tm for tm in time_markers_all if color_at(tm[0]) in EVENT_COLORS]
        if not time_markers:
            time_markers = time_markers_all  # defensive fallback

        desc_words = [w for w in words if cols["desc_x0"] <= w["x0"] < cols["desc_x1"]]
        desc_lines = group_lines(desc_words)

        colored_lines = []
        for dl in desc_lines:
            color = color_at(dl["top"])
            if color in EVENT_COLORS:
                colored_lines.append((dl["top"], color, dl["text"].strip()))
        colored_lines.sort(key=lambda t: t[0])

        groups = {}
        for top, color, text in colored_lines:
            if not text:
                continue
            idx = nearest_marker(time_markers, top)
            if idx is None:
                continue
            g = groups.setdefault(idx, {"top": time_markers[idx][0], "texts": [], "color": color})
            g["texts"].append((top, text))

        events = []
        for idx, g in sorted(groups.items(), key=lambda kv: kv[1]["top"]):
            texts_sorted = [t for _, t in sorted(g["texts"], key=lambda x: x[0])]
            full = " ".join(texts_sorted)
            group_min_top = min(t for t, _ in g["texts"])
            date_idx = cascade_marker(date_markers, group_min_top)
            if date_idx is None:
                date_idx = nearest_marker(date_markers, group_min_top)
            date_val = date_markers[date_idx][1] if date_idx is not None else None
            time_val = time_markers[idx][1]
            parts = full.split("・")
            events.append({
                "date": date_val,
                "time": time_val,
                "color": g["color"],
                "name_en": parts[0].strip() if len(parts) > 0 else "",
                "name_zh": parts[1].strip() if len(parts) > 1 else "",
                "name_ja": "",
            })

        events.sort(key=lambda e: (e["date"] or 0, e["time"] or ""))
        return {"month": month, "year": year, "events": events}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: parse_pdf.py <file.pdf>"}))
        sys.exit(1)
    try:
        result = parse(sys.argv[1])
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
