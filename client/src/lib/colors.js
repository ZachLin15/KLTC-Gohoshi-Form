const MAP = {
  yellow: { bg: "var(--c-yellow)", line: "var(--c-yellow-line)" },
  pink: { bg: "var(--c-pink)", line: "var(--c-pink-line)" },
  peach: { bg: "var(--c-peach)", line: "var(--c-peach-line)" },
  green: { bg: "var(--c-green)", line: "var(--c-green-line)" },
  closed: { bg: "var(--c-closed)", line: "var(--c-closed)" },
};

export function colorVars(color) {
  return MAP[color] || MAP.yellow;
}

export const COLOR_OPTIONS = ["yellow", "pink", "peach", "green"];
