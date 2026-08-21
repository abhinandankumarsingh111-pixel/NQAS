// ---------------------------------------------------------------------------
// CLASS OBSERVATION RUBRICS
//
// Two rubrics that must never be confused with each other. In-Campus judges an
// EXISTING teacher during a real lesson; Demo judges a CANDIDATE's potential.
// Different purposes, different criteria, different records, different reports.
//
// Everything a principal taps is defined here. The rule for every label is the
// spec's golden rule: if you have to read a paragraph to know what to pick, the
// criterion is too complicated. Labels are 1-4 words. The interpretation lives
// in `phrase`, which is used only to compose the written report afterwards.
//
// TOTALS ARE COMPUTED FROM THIS FILE, never hardcoded, and both rubrics come to
// exactly 100. Change any `max` and the totals, the review screen and the report
// all follow automatically — but a CHECKLIST criterion also needs its weights
// retuned, because positives are set to sum to (max - half), so that the full
// evidence earns full marks. Scales need nothing: they derive from max.
// ---------------------------------------------------------------------------

/**
 * How a criterion is answered.
 *
 *  scale     — one tap from five levels, best to worst. Used where the judgement
 *              is a single dimension (how engaged were they?).
 *  checklist — tick every piece of evidence seen. Used where several independent
 *              things can each be true (clear board work AND SmartBoard used).
 *
 * Both exist because the spec asks for both: a five-level Engagement question
 * and a tick-what-you-saw Classroom Management question.
 */
export type CriterionMode = "scale" | "checklist";

export interface RubricOption {
  id: string;
  /** What the principal taps. Short. Never a sentence. */
  label: string;
  /**
   * scale: the score this level awards outright.
   * checklist: what this evidence adds to (or takes off) the criterion score.
   */
  points: number;
  tone: "positive" | "negative";
  /**
   * What was OBSERVED, as a clause that joins with "and". Lower case, no full
   * stop. Every phrase in this file is a clause with a verb, so that any set of
   * them composes into one readable sentence.
   */
  phrase: string;
  /**
   * For concerns only: what to DO about it, as a clause. "Areas for
   * improvement" that merely restate the fault are useless to the teacher
   * reading them, so a concern carries its own remedy.
   */
  fix?: string;
}

export interface Criterion {
  id: string;
  /** Heading on the observation screen. Short. */
  name: string;
  /** The question under the heading. Short. */
  prompt: string;
  max: number;
  mode: CriterionMode;
  options: RubricOption[];
}

export interface Rubric {
  id: RubricId;
  title: string;
  /** Shown once before the first criterion, never during. */
  blurb: string;
  criteria: Criterion[];
}

export type RubricId = "in_campus" | "demo";

// ---------------------------------------------------------------------------
// Scale helper.
//
// Five levels always pay max, 80%, 60%, 40%, 20% — so Engagement out of 15
// gives 15 / 12 / 9 / 6 / 3, which is exactly the worked example in the spec
// ("Mostly engaged" -> 12/15). Rounded, so it works for any max including 5.
// ---------------------------------------------------------------------------
const SCALE_FRACTIONS = [1, 0.8, 0.6, 0.4, 0.2];

/**
 * The top two levels are strengths; everything from the middle down is an area
 * for improvement. A middling result is not a disaster, but it is the thing to
 * work on, and a report that called it a strength would be flattering the
 * teacher rather than helping them.
 */
function scale(
  max: number,
  levels: [string, string, string?][],   // [label, phrase, fix]
): RubricOption[] {
  return levels.map(([label, phrase, fix], i) => ({
    id: `l${i + 1}`,
    label,
    points: Math.round(max * SCALE_FRACTIONS[i]),
    tone: i <= 1 ? ("positive" as const) : ("negative" as const),
    phrase,
    ...(fix ? { fix } : {}),
  }));
}

/** Checklist option shorthand. Negative points = concern, which must carry a fix. */
function ev(id: string, label: string, points: number, phrase: string, fix?: string): RubricOption {
  return { id, label, points, tone: points >= 0 ? "positive" : "negative", phrase, ...(fix ? { fix } : {}) };
}

// ===========================================================================
// A. IN-CAMPUS CLASS OBSERVATION — 100 marks
// ===========================================================================
export const IN_CAMPUS: Rubric = {
  id: "in_campus",
  title: "In-Campus Class Observation",
  blurb: "Observing a teacher already on this campus, during a regular lesson.",
  criteria: [
    {
      // 5 rather than 10: preparation is the thing a visitor can least directly
      // observe. You infer it from how the lesson unfolds, which the other
      // criteria already measure head-on.
      id: "prep",
      name: "Preparation",
      prompt: "How prepared was the lesson?",
      max: 5,
      mode: "checklist",
      options: [
        ev("well_prepared", "Well prepared", 1, "the lesson was well prepared"),
        ev("objective_clear", "Objective clear", 1, "the lesson objective was clear"),
        ev("resources_ready", "Resources ready", 1, "resources were ready at hand"),
        ev("structured", "Lesson structured", 1, "the lesson followed a clear structure"),
        ev("needs_improvement", "Preparation weak", -3, "lesson preparation needs strengthening",
           "planning the lesson and its resources before the period"),
      ],
    },
    {
      id: "subject",
      name: "Subject Knowledge",
      prompt: "What did you see of their command of the subject?",
      max: 15,
      mode: "checklist",
      options: [
        ev("excellent_command", "Excellent command", 2, "an excellent command of the subject was evident"),
        ev("concepts_clear", "Concepts clear", 2, "concepts were put across clearly"),
        ev("accurate", "Accurate explanation", 1, "explanations were accurate"),
        ev("examples", "Good examples", 1, "well-chosen examples were used"),
        ev("handles_questions", "Handles questions well", 1, "student questions were handled confidently"),
        ev("gaps", "Conceptual gaps", -8, "conceptual gaps were observed",
           "revisiting the underlying concepts before teaching this topic again"),
      ],
    },
    {
      // 10 rather than 15: "Good questioning" is one of its options, and
      // questioning has its own 10-mark criterion below. At 15 the same
      // evidence was being paid for twice.
      id: "method",
      name: "Teaching Methodology",
      prompt: "How was the lesson taught?",
      max: 10,
      mode: "checklist",
      options: [
        ev("student_centred", "Student-centred", 2, "the approach was student-centred"),
        ev("questioning", "Good questioning", 1, "questioning was used well"),
        ev("real_life", "Real-life links", 1, "the topic was linked to real life"),
        ev("thinking", "Encourages thinking", 1, "students were pushed to think"),
        ev("appropriate", "Appropriate method", 1, "the method suited the topic"),
        ev("lecture_only", "Mostly lecture", -5, "the lesson was largely lecture-based",
           "building in more student-led activity"),
      ],
    },
    {
      id: "engagement",
      name: "Student Engagement",
      prompt: "How was participation?",
      max: 15,
      mode: "scale",
      options: scale(15, [
        ["Highly engaged", "students were highly engaged"],
        ["Mostly engaged", "students were mostly engaged"],
        ["Moderate", "student engagement was moderate", "drawing more of the class into the lesson"],
        ["Low", "student engagement was low", "drawing more of the class into the lesson"],
        ["Very low", "students were largely disengaged", "re-engaging the class with participatory activity"],
      ]),
    },
    {
      id: "hots",
      name: "Questioning & HOTS",
      prompt: "What kind of questions were asked?",
      max: 10,
      mode: "checklist",
      options: [
        ev("probing", "Probing questions", 2, "probing questions were asked"),
        ev("hots", "HOTS used", 1, "higher-order thinking questions were used"),
        ev("competency", "Competency questions", 1, "competency-based questions were posed"),
        ev("follow_up", "Follow-up questions", 1, "follow-up questions extended student answers"),
        ev("recall_only", "Mostly recall", -5, "questioning stayed mostly at recall level",
           "asking more open and higher-order questions"),
      ],
    },
    {
      id: "management",
      name: "Classroom Management",
      prompt: "What did you observe?",
      max: 10,
      mode: "checklist",
      options: [
        ev("excellent_control", "Excellent control", 2, "the class was very well managed"),
        ev("orderly", "Orderly class", 1, "the class remained orderly"),
        ev("transitions", "Smooth transitions", 1, "transitions were smooth"),
        ev("time", "Good time management", 1, "time was managed well"),
        ev("minor_disruption", "Minor disruption", -2, "there was minor disruption",
           "tightening routines at transitions"),
        ev("frequent_disruption", "Frequent disruption", -5, "disruption was frequent",
           "establishing firmer classroom routines"),
      ],
    },
    {
      id: "differentiation",
      name: "Differentiation",
      prompt: "Were different learners catered for?",
      max: 10,
      mode: "checklist",
      options: [
        ev("weaker", "Supports weaker learners", 2, "weaker learners were supported"),
        ev("advanced", "Challenges advanced", 1, "advanced learners were challenged"),
        ev("inclusive", "Inclusive participation", 1, "participation was inclusive"),
        ev("individual", "Checks individuals", 1, "individual understanding was checked"),
        ev("same_for_all", "Same approach for all", -5, "the same approach was used for every learner",
           "greater differentiation for learners at different levels"),
      ],
    },
    {
      id: "assessment",
      name: "Assessment for Learning",
      prompt: "How was understanding checked?",
      max: 10,
      mode: "checklist",
      options: [
        ev("checks", "Checks understanding", 2, "understanding was checked during the lesson"),
        ev("oral", "Oral assessment", 1, "oral assessment was used"),
        ev("feedback", "Immediate feedback", 1, "feedback was immediate"),
        ev("misconceptions", "Corrects misconceptions", 1, "misconceptions were corrected"),
        ev("limited", "Assessment limited", -5, "in-lesson assessment was limited",
           "more frequent checks for understanding during the lesson"),
      ],
    },
    {
      id: "resources",
      name: "Board & Resources",
      prompt: "How were the board and resources used?",
      max: 5,
      mode: "checklist",
      options: [
        ev("board", "Clear board work", 1, "board work was clear"),
        ev("smartboard", "SmartBoard used well", 1, "the SmartBoard was used effectively"),
        ev("appropriate_res", "Appropriate resources", 1, "resources were appropriate"),
        ev("supports", "Resources aid learning", 1, "resources supported the learning"),
        ev("underused", "Resources underused", -3, "available resources were underused",
           "fuller use of the board and available teaching aids"),
      ],
    },
    {
      id: "closure",
      name: "Closure",
      prompt: "How did the lesson end?",
      max: 10,
      mode: "checklist",
      options: [
        ev("recap", "Recap conducted", 2, "the lesson was recapped"),
        ev("objective_revisited", "Objective revisited", 1, "the objective was revisited"),
        ev("understanding_checked", "Understanding checked", 1, "understanding was checked at the close"),
        ev("good_closure", "Good closure", 1, "the lesson closed well"),
        ev("no_consolidation", "No consolidation", -5, "there was no clear consolidation",
           "closing with a recap that checks the objective was met"),
      ],
    },
  ],
};

// ===========================================================================
// B. DEMO CLASS OBSERVATION — 100 marks
//
// A separate rubric for a separate purpose: this judges whether to HIRE
// someone, not how an employee is performing. Every criterion is a five-level
// scale, because a stranger's single lesson does not give enough evidence for
// an evidence checklist, and a hiring decision wants comparability above all.
// ===========================================================================
export const DEMO: Rubric = {
  id: "demo",
  title: "Demo Class Observation",
  blurb: "Assessing a candidate's teaching potential from a demonstration lesson.",
  criteria: [
    {
      // The single heaviest criterion, deliberately. For a hire, what they know
      // is the thing least likely to improve on its own.
      id: "subject",
      name: "Subject Knowledge",
      prompt: "Command of the subject?",
      max: 20,
      mode: "scale",
      options: scale(20, [
        ["Exceptional", "subject knowledge was exceptional"],
        ["Strong", "subject knowledge was strong"],
        ["Good", "subject knowledge was sound", "deepening command of the subject"],
        ["Average", "subject knowledge was average", "deepening command of the subject"],
        ["Weak", "subject knowledge was weak", "substantial strengthening of subject knowledge"],
      ]),
    },
    {
      // 5 rather than 10: a candidate prepares one lesson specially for a demo,
      // so how well it is planned says less about them than how they teach it.
      id: "planning",
      name: "Lesson Planning",
      prompt: "How was the lesson structured?",
      max: 5,
      mode: "scale",
      options: scale(5, [
        ["Excellent structure", "the lesson was excellently structured"],
        ["Well planned", "the lesson was well planned"],
        ["Adequate", "lesson planning was adequate", "a tighter lesson structure"],
        ["Some gaps", "there were gaps in the lesson plan", "a tighter lesson structure"],
        ["Poorly structured", "the lesson was poorly structured", "planning a clear beginning, middle and close"],
      ]),
    },
    {
      id: "explanation",
      name: "Explanation",
      prompt: "How clear were the explanations?",
      max: 10,
      mode: "scale",
      options: scale(10, [
        ["Exceptionally clear", "explanation was exceptionally clear"],
        ["Clear", "explanation was clear"],
        ["Generally clear", "explanation was generally clear", "sharper, better-sequenced explanation"],
        ["Somewhat unclear", "explanation was somewhat unclear", "sharper, better-sequenced explanation"],
        ["Difficult to follow", "explanation was difficult to follow", "rebuilding explanations around simpler steps"],
      ]),
    },
    {
      id: "communication",
      name: "Communication",
      prompt: "Language, voice and clarity?",
      max: 10,
      mode: "scale",
      options: scale(10, [
        ["Excellent", "communication was excellent"],
        ["Very good", "communication was very good"],
        ["Good", "communication was good", "stronger voice projection and pace"],
        ["Average", "communication was average", "stronger voice projection and pace"],
        ["Weak", "communication was weak", "significant work on classroom communication"],
      ]),
    },
    {
      id: "pedagogy",
      name: "Pedagogy",
      prompt: "How effective was the approach?",
      max: 10,
      mode: "scale",
      options: scale(10, [
        ["Highly effective", "the teaching approach was highly effective"],
        ["Effective", "the teaching approach was effective"],
        ["Appropriate", "the teaching approach was appropriate", "a wider range of teaching strategies"],
        ["Limited", "the teaching approach was limited", "a wider range of teaching strategies"],
        ["Inappropriate", "the approach was unsuited to the class", "matching method to the age group and topic"],
      ]),
    },
    {
      id: "engagement",
      name: "Student Engagement",
      prompt: "How was participation?",
      max: 10,
      mode: "scale",
      options: scale(10, [
        ["Highly engaged", "students were highly engaged"],
        ["Mostly engaged", "students were mostly engaged"],
        ["Moderate", "student engagement was moderate", "drawing more of the class into the lesson"],
        ["Low", "student engagement was low", "drawing more of the class into the lesson"],
        ["Very low", "students were largely disengaged", "re-engaging the class with participatory activity"],
      ]),
    },
    {
      id: "questioning",
      name: "Questioning",
      prompt: "What kind of questions were asked?",
      max: 10,
      mode: "scale",
      options: scale(10, [
        ["Excellent questioning", "questioning was excellent"],
        ["Good probing", "good probing questions were asked"],
        ["Some HOTS", "there was some higher-order questioning", "more open and higher-order questions"],
        ["Mostly recall", "questioning stayed mostly at recall level", "more open and higher-order questions"],
        ["Limited questioning", "there was very little questioning", "using questioning as a core teaching tool"],
      ]),
    },
    {
      id: "presence",
      name: "Classroom Presence",
      prompt: "Presence and control?",
      max: 10,
      mode: "scale",
      options: scale(10, [
        ["Excellent presence", "classroom presence was excellent"],
        ["Strong control", "classroom control was strong"],
        ["Good control", "classroom control was good", "building a firmer classroom presence"],
        ["Average", "classroom presence was average", "building a firmer classroom presence"],
        ["Weak", "classroom presence was weak", "developing authority and command of the room"],
      ]),
    },
    {
      id: "resources",
      name: "Resources",
      prompt: "How were teaching resources used?",
      max: 5,
      mode: "scale",
      options: scale(5, [
        ["Excellent use", "resources were used excellently"],
        ["Effective", "resources were used effectively"],
        ["Adequate", "resource use was adequate", "fuller use of the board and teaching aids"],
        ["Limited", "resource use was limited", "fuller use of the board and teaching aids"],
        ["Not used", "no teaching resources were used", "preparing teaching aids for the lesson"],
      ]),
    },
    {
      id: "closure",
      name: "Assessment & Closure",
      prompt: "How was the lesson closed?",
      max: 5,
      mode: "scale",
      options: scale(5, [
        ["Excellent", "assessment and closure were excellent"],
        ["Good", "assessment and closure were good"],
        ["Adequate", "the closure was adequate", "closing with a recap and a check for understanding"],
        ["Weak", "the closure was weak", "closing with a recap and a check for understanding"],
        ["Not evident", "no assessment or closure was evident", "planning time to consolidate at the end"],
      ]),
    },
    {
      // 5 rather than 10: this summarises the other ten criteria. Weighting it
      // heavily would score the same evidence a second time.
      id: "potential",
      name: "Teaching Potential",
      prompt: "Overall, how do they read?",
      max: 5,
      mode: "scale",
      options: scale(5, [
        ["Exceptional", "the candidate shows exceptional teaching potential"],
        ["Highly suitable", "the candidate is highly suitable for the role"],
        ["Suitable", "the candidate is suitable for the role", "induction support in the first term"],
        ["Consider", "the candidate is worth further consideration", "a second demonstration lesson before deciding"],
        ["Not suitable", "the candidate is not suitable for this role", "no appointment at this stage"],
      ]),
    },
  ],
};

export const RUBRICS: Record<RubricId, Rubric> = { in_campus: IN_CAMPUS, demo: DEMO };

/** Total marks available. Computed, never hardcoded — retune by editing a `max`. */
export function rubricTotal(r: Rubric): number {
  return r.criteria.reduce((n, c) => n + c.max, 0);
}

// ---------------------------------------------------------------------------
// Follow-up (In-Campus) and Recommendation (Demo).
// Kept as data so the report and the history table read the same words.
// ---------------------------------------------------------------------------
export const FOLLOW_UP = [
  { id: "none", label: "No follow-up required" },
  { id: "recommended", label: "Follow-up recommended" },
  { id: "reobserve", label: "Re-observation required" },
] as const;

export const RECOMMENDATION = [
  { id: "recommended", label: "Recommended" },
  { id: "conditions", label: "Recommended with Conditions" },
  { id: "consider", label: "Keep Under Consideration" },
  { id: "not_recommended", label: "Not Recommended" },
] as const;

export const FOLLOW_UP_LABEL: Record<string, string> =
  Object.fromEntries(FOLLOW_UP.map((f) => [f.id, f.label]));
export const RECOMMENDATION_LABEL: Record<string, string> =
  Object.fromEntries(RECOMMENDATION.map((r) => [r.id, r.label]));
