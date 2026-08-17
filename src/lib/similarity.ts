// Name matching for the teacher picker.
//
// This is the only thing standing between the faculty list and a second
// "Archana singh". Onboarding is organic — coordinators add teachers as they
// verify them — so there is no curated list to fall back on.
//
// It must SUGGEST, never BLOCK. A coordinator standing in a classroom with a
// phone, stopped by a duplicate warning, will pick whatever nearby name clears
// the screen. A duplicate record is untidy; a verification filed against an
// innocent teacher is a false accusation in someone's permanent record.

/** Trim and collapse internal whitespace. Matches the database trigger. */
export function normaliseName(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/** The form used for equality comparison. Matches the unique index. */
export function canonical(s: string): string {
  return normaliseName(s).toLowerCase();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0..1, where 1 is identical after normalisation. */
export function similarity(a: string, b: string): number {
  const x = canonical(a), y = canonical(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const longest = Math.max(x.length, y.length);
  return 1 - levenshtein(x, y) / longest;
}

/**
 * Deliberately generous. A false suggestion costs one tap to dismiss; a missed
 * one splits a teacher's record in half, and the split is invisible — no error,
 * just a shorter history.
 */
export const SIMILAR_THRESHOLD = 0.7;

export interface NameLike { id: string; name: string; subject?: string | null }

/** Exact match after normalisation and case folding, if any. */
export function findExact<T extends NameLike>(name: string, list: T[]): T | undefined {
  const c = canonical(name);
  return list.find((f) => canonical(f.name) === c);
}

/**
 * Near matches, most similar first.
 *
 * Edit distance alone, deliberately. An earlier version boosted any shared
 * word, on the theory that a shared surname signals the same person. In a
 * school where Singh, Panda and Das recur constantly it suggested every
 * same-surname colleague — and a picker that cries wolf gets dismissed on
 * reflex, which is worse than one that stays quiet.
 *
 * Edit distance cannot separate "A. Singh" (same person, abbreviated) from
 * "Kavita Singh" (different person) — they score 0.46 and 0.58 against
 * "Archana Singh", so any threshold catching the first admits the second.
 * Abbreviations are the rarer case and the coordinator can see the filtered
 * list as they type, so this errs toward staying quiet.
 */
export function findSimilar<T extends NameLike>(name: string, list: T[], limit = 3): T[] {
  const c = canonical(name);
  if (!c) return [];
  return list
    .map((f) => ({ f, score: similarity(name, f.name) }))
    .filter((x) => x.score >= SIMILAR_THRESHOLD && canonical(x.f.name) !== c)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.f);
}
