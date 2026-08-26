import Link from "next/link";
import {
  PERIOD_KINDS, type Coverage, type Period, type PeriodKind, type PersonActivity,
} from "@/lib/activity";

/**
 * Who has been doing the checking, and which teachers nobody has reached.
 *
 * Two deliberate omissions, both load bearing:
 *
 *  - NO RANKING. Rows arrive alphabetical from rollUp() and are rendered in
 *    that order. There is no sort control, no position number, no badge and no
 *    "top performer". A sorted list of colleagues by output is a leaderboard
 *    whatever it is called, and the evidence is that it produces people
 *    clustering safely in the middle rather than doing better work.
 *  - NO RED. A zero is rendered in the same quiet grey as everything else.
 *    Zero during exam week or a holiday is normal, and styling it as a failure
 *    is what teaches people to file empty checks to keep the number up. The
 *    fact is stated plainly and the principal — who knows what week it was —
 *    decides what it means.
 *
 * The bars carry no information the numbers do not; they are aria-hidden, so
 * a screen reader gets the counts and misses nothing.
 */
export default function ActivityTracker({
  heading, people, coverage, period, periodHref, noun, subjectNoun, emptyRoster, footnote,
}: {
  heading: string;
  people: PersonActivity[];
  coverage: Coverage | null;
  period: Period;
  periodHref: (k: PeriodKind) => string;
  noun: { one: string; many: string };
  subjectNoun: string;
  emptyRoster: string;
  footnote: React.ReactNode;
}) {
  const max = Math.max(1, ...people.map((p) => p.filed));
  const totalFiled = people.reduce((n, p) => n + p.filed, 0);
  const silent = people.filter((p) => p.filed === 0).length;
  const count = (n: number) => `${n} ${n === 1 ? noun.one : noun.many}`;

  // A week is too short a window to read a name-by-name shortfall off. The
  // count is still true, so it is shown; the roll-call of who was missed is
  // held back until there is a month behind it.
  const namesMissed = period.kind !== "week";

  return (
    <div className="card">
      <div className="card-h">
        <h2>{heading}</h2>
        <div className="per-tabs no-print">
          {PERIOD_KINDS.map((k) => (
            <Link key={k} href={periodHref(k)} className={`per-tab${k === period.kind ? " on" : ""}`}>
              {k === "week" ? "Week" : k === "month" ? "Month" : "Session"}
            </Link>
          ))}
        </div>
      </div>

      <div className="per-range">
        {period.range}
        {period.partial && <span className="per-live"> · still running</span>}
      </div>

      {people.length === 0 ? (
        <div className="muted" style={{ padding: "6px 0 2px" }}>{emptyRoster}</div>
      ) : (
        <>
          {coverage && coverage.total > 0 && (
            <div className="cov">
              <div className="cov-head">
                <b>{coverage.covered} of {coverage.total}</b> {subjectNoun} checked {period.tab.toLowerCase()}
              </div>
              <div className="cov-bar" aria-hidden="true">
                <span style={{ width: `${(coverage.covered / coverage.total) * 100}%` }} />
              </div>
              {coverage.missed.length === 0 ? (
                <div className="cov-note">Everyone has been checked at least once.</div>
              ) : namesMissed ? (
                <div className="cov-note">
                  <b>Not yet checked:</b>{" "}
                  {coverage.missed.slice(0, 8).map((m) => m.name).join(", ")}
                  {coverage.missed.length > 8 && ` and ${coverage.missed.length - 8} more`}
                </div>
              ) : (
                <div className="cov-note">
                  {coverage.missed.length} not checked this week. A single week is a short
                  window — the month view names who has actually been missed.
                </div>
              )}
            </div>
          )}

          <div className="act-list">
            {people.map((p) => {
              const delta = p.filed - p.before;
              return (
                <div key={p.id} className="act-row">
                  <div className="act-name">{p.name}</div>
                  <div className="act-fig">
                    <div className="act-bar" aria-hidden="true">
                      <span style={{ width: `${(p.filed / max) * 100}%` }} />
                    </div>
                    <b className={p.filed === 0 ? "act-n act-n-zero" : "act-n"}>{p.filed}</b>
                  </div>
                  <div className="act-sub">
                    {p.filed === 0 ? (
                      <>
                        Nothing filed {period.tab.toLowerCase()}
                        {p.lastFiled ? ` · last filed ${humanDate(p.lastFiled)}` : " · has never filed"}
                      </>
                    ) : (
                      <>
                        {count(p.filed)} across {p.teachers} {p.teachers === 1 ? "teacher" : "teachers"}
                        {p.daysActive > 1 && ` · on ${p.daysActive} days`}
                        {p.before > 0 && (
                          <> · {delta === 0 ? "same as" : `${delta > 0 ? "+" : ""}${delta} vs`} {beforeLabel(period)}
                            {period.partial && " by this day"}</>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="act-foot">
            {count(totalFiled)} filed {period.tab.toLowerCase()} by {people.length}{" "}
            {people.length === 1 ? "person" : "people"}
            {silent > 0 && ` · ${silent} filed nothing`}.
            <div style={{ marginTop: 4 }}>{footnote}</div>
          </div>
        </>
      )}
    </div>
  );
}

function beforeLabel(p: Period): string {
  return p.kind === "week" ? "last week" : p.kind === "month" ? "last month" : "last session";
}

/** "14 July" — enough to place it, without a year for dates inside this one. */
function humanDate(iso: string): string {
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  const d = Number(iso.slice(8, 10)), m = months[Number(iso.slice(5, 7)) - 1], y = iso.slice(0, 4);
  const thisYear = new Date().getUTCFullYear().toString();
  return `${d} ${m}${y === thisYear ? "" : ` ${y}`}`;
}
