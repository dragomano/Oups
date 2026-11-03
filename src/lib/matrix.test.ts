import { describe, expect, it } from "vitest";
import type { Priority, Reminder } from "./api";
import {
  activeReminders,
  dueKind,
  groupByQuadrant,
  isImportant,
  isUrgent,
  priorityForQuadrant,
  quadrantOf,
  URGENT_WINDOW_MS,
} from "./matrix";

const NOW = new Date(2026, 9, 11, 12, 0, 0).getTime();

function make(over: Partial<Reminder> = {}): Reminder {
  return {
    id: over.id ?? "r",
    title: "t",
    note: "",
    priority: "normal",
    startAt: "2026-10-11T12:00:00",
    recurrence: { type: "once" },
    endMode: { type: "never" },
    firedCount: 0,
    nextDue: "2026-10-20T12:00:00",
    enabled: true,
    completed: false,
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

/** Local timestamp `hours` away from NOW. */
function at(hours: number): string {
  const d = new Date(NOW + hours * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");

  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

describe("isImportant", () => {
  it("covers the upper two levels", () => {
    const expected: Record<Priority, boolean> = {
      low: false,
      normal: false,
      high: true,
      critical: true,
    };

    for (const [p, want] of Object.entries(expected) as [Priority, boolean][]) {
      expect(isImportant(p)).toBe(want);
    }
  });
});

describe("quadrantOf", () => {
  it("maps every priority level onto its own quadrant", () => {
    expect(quadrantOf(make({ priority: "critical" }))).toBe("do");
    expect(quadrantOf(make({ priority: "high" }))).toBe("schedule");
    expect(quadrantOf(make({ priority: "normal" }))).toBe("delegate");
    expect(quadrantOf(make({ priority: "low" }))).toBe("drop");
  });

  it("ignores the schedule entirely", () => {
    const overdue = make({ priority: "critical", nextDue: at(-72) });
    const farFuture = make({ priority: "critical", nextDue: at(24 * 365) });
    const dateless = make({ priority: "critical", nextDue: null });

    for (const r of [overdue, farFuture, dateless]) {
      expect(quadrantOf(r)).toBe("do");
    }
  });
});

describe("priorityForQuadrant", () => {
  it("inverts quadrantOf, one level per quadrant", () => {
    for (const p of ["low", "normal", "high", "critical"] as Priority[]) {
      expect(priorityForQuadrant(quadrantOf(make({ priority: p })))).toBe(p);
    }
  });
});

describe("dueKind", () => {
  it("treats a past next_due as overdue", () => {
    expect(dueKind(at(-1), NOW)).toBe("overdue");
    expect(dueKind(at(-72), NOW)).toBe("overdue");
  });

  it("treats now as overdue, not just the past", () => {
    expect(dueKind(at(0), NOW)).toBe("overdue");
  });

  it("treats anything inside the 24h window as soon", () => {
    expect(dueKind(at(0.01), NOW)).toBe("soon");
    expect(dueKind(at(23), NOW)).toBe("soon");
  });

  it("puts the boundary on the urgent side", () => {
    expect(dueKind(at(URGENT_WINDOW_MS / 3600_000), NOW)).toBe("soon");
    expect(dueKind(at(URGENT_WINDOW_MS / 3600_000 + 0.01), NOW)).toBe("later");
  });

  it("treats missing or malformed next_due as not urgent", () => {
    expect(dueKind(null, NOW)).toBe("later");
    expect(dueKind("", NOW)).toBe("later");
    expect(dueKind("not-a-date", NOW)).toBe("later");
  });
});

describe("isUrgent", () => {
  it("is true for every kind but 'later'", () => {
    expect(isUrgent(at(-1), NOW)).toBe(true);
    expect(isUrgent(at(5), NOW)).toBe(true);
    expect(isUrgent(at(48), NOW)).toBe(false);
    expect(isUrgent(null, NOW)).toBe(false);
  });
});

describe("groupByQuadrant", () => {
  it("puts every reminder in exactly one bucket", () => {
    const list = [
      make({ id: "a", priority: "critical", nextDue: at(-2) }),
      make({ id: "b", priority: "normal", nextDue: at(2) }),
      make({ id: "c", priority: "high", nextDue: at(48) }),
      make({ id: "d", priority: "low", nextDue: at(48) }),
      make({ id: "e", priority: "low", nextDue: null }),
    ];
    const q = groupByQuadrant(list, NOW);
    const total = [...q.do, ...q.delegate, ...q.schedule, ...q.drop];
    expect(total).toHaveLength(list.length);
    expect(new Set(total.map((r) => r.id)).size).toBe(list.length);
    expect(q.do.map((r) => r.id)).toEqual(["a"]);
    expect(q.delegate.map((r) => r.id)).toEqual(["b"]);
    expect(q.schedule.map((r) => r.id)).toEqual(["c"]);
    expect(q.drop.map((r) => r.id)).toEqual(["d", "e"]);
  });

  it("orders overdue first, then by next run, dateless last", () => {
    const list = [
      make({ id: "late", priority: "high", nextDue: at(72) }),
      make({ id: "none", priority: "high", nextDue: null }),
      make({ id: "soon", priority: "high", nextDue: at(-1) }),
      make({ id: "mid", priority: "high", nextDue: at(24) }),
    ];
    const q = groupByQuadrant(list, NOW);
    expect(q.schedule.map((r) => r.id)).toEqual(["soon", "mid", "late", "none"]);
  });
});

describe("isActive", () => {
  it("matches the Active view", () => {
    expect(
      activeReminders([
        make({ id: "on" }),
        make({ id: "off", enabled: false }),
        make({ id: "done", completed: true }),
      ]).map((r) => r.id),
    ).toEqual(["on"]);
  });
});
