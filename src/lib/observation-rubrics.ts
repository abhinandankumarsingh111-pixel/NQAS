// ---------------------------------------------------------------------------
// CLASS OBSERVATION RUBRICS
//
// Two rubrics that must never be confused with each other. In-Campus judges an
// EXISTING teacher during a real lesson; Demo judges a CANDIDATE's potential.
// Different purposes, different criteria, different records, different reports.
//
// WHAT MAKES AN OPTION GOOD.
// Every option must name something you can SEE from the back of the room, at
// the moment it happens. "Good questioning" fails that test: two principals
// will read it differently, and a teacher told they scored low on it learns
// nothing. "Answers own questions" and "Wait time after asking" pass it — they
// are observable, they are unambiguous, and each one implies its own remedy.
//
// That is why every concern carries an `action`: a specific thing the teacher
// can do in their next lesson. An observation that ends in "improve
// questioning" has wasted the principal's period.
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
 *              things can each be true (wait time AND cold-calling AND building
 *              on answers are three separate observations).
 */
export type CriterionMode = "scale" | "checklist";

export interface RubricOption {
  id: string;
  /** What the principal taps. Short, and observable. Never a sentence. */
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
   * For concerns only: ONE CONCRETE THING TO DO NEXT LESSON.
   *
   * Imperative, specific, and small enough to actually happen. "Improve
   * questioning" is not an action; "count five seconds silently after asking
   * before taking any answer" is. This is what appears in the teacher's
   * development plan, ranked by how many marks the criterion lost.
   */
  action?: string;
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
  levels: [string, string, string?][],   // [label, phrase, action]
): RubricOption[] {
  return levels.map(([label, phrase, action], i) => ({
    id: `l${i + 1}`,
    label,
    points: Math.round(max * SCALE_FRACTIONS[i]),
    tone: i <= 1 ? ("positive" as const) : ("negative" as const),
    phrase,
    ...(action ? { action } : {}),
  }));
}

/** Checklist option shorthand. Negative points = concern, which must carry an action. */
function ev(id: string, label: string, points: number, phrase: string, action?: string): RubricOption {
  return { id, label, points, tone: points >= 0 ? "positive" : "negative", phrase, ...(action ? { action } : {}) };
}

// ===========================================================================
// A. IN-CAMPUS CLASS OBSERVATION — 100 marks, 11 criteria
// ===========================================================================
export const IN_CAMPUS: Rubric = {
  id: "in_campus",
  title: "In-Campus Class Observation",
  blurb: "Observing a teacher already on this campus, during a regular lesson.",
  criteria: [
    {
      // 5 marks: preparation is the thing a visitor can least directly observe.
      // You infer it from how the lesson unfolds, which the criteria below
      // measure head-on.
      id: "prep",
      name: "Preparation & Objective",
      prompt: "How did the lesson open?",
      max: 5,
      mode: "checklist",
      options: [
        ev("objective_shared", "Objective shared with class", 1, "the lesson objective was shared with the class"),
        ev("materials_ready", "Materials ready before bell", 1, "materials were ready before the bell"),
        ev("prior_learning", "Prior learning connected", 1, "the lesson was connected to prior learning"),
        ev("plan_evident", "Working to a plan", 1, "the lesson was clearly working to a plan"),
        ev("objective_unclear", "Objective never clear", -3, "the class was not told what they were learning",
           "write the objective on the board before the bell and return to it at the close"),
        ev("setup_time_lost", "Time lost setting up", -2, "teaching time was lost to setting up",
           "have the board and materials ready before students enter"),
      ],
    },
    {
      id: "subject",
      name: "Subject Knowledge",
      prompt: "What did their command of the subject look like?",
      max: 15,
      mode: "checklist",
      options: [
        ev("accurate", "Accurate throughout", 2, "the content was accurate throughout"),
        ev("beyond_text", "Goes beyond the textbook", 2, "the teaching went beyond the textbook"),
        ev("anticipates", "Anticipates common errors", 1, "common student errors were anticipated"),
        ev("handles_unexpected", "Handles unexpected questions", 1, "unexpected questions were handled confidently"),
        ev("terminology", "Correct terminology", 1, "subject terminology was used correctly"),
        ev("factual_error", "Factual error observed", -8, "a factual error was taught",
           "check this chapter's content with the HOD before teaching it again"),
        ev("deflected", "Question deflected", -4, "a student question was deflected rather than answered",
           "when you do not know, say when you will come back to it — and come back to it"),
      ],
    },
    {
      id: "method",
      name: "Teaching Methodology",
      prompt: "How was the lesson taught?",
      max: 10,
      mode: "checklist",
      options: [
        ev("students_working", "Students working, not just listening", 2, "students were working rather than only listening"),
        ev("real_life", "Linked to real life", 1, "the topic was linked to something students recognise"),
        ev("activity_fit", "Activity fitted the objective", 1, "the activity fitted the objective"),
        ev("modelled", "Modelled before setting work", 1, "the task was modelled before students attempted it"),
        ev("lecture_only", "Teacher talked throughout", -5, "the teacher talked for most of the period",
           "give students something to do in the first ten minutes, not the last ten"),
        ev("task_unclear", "Task instructions unclear", -4, "students were unclear what they had been asked to do",
           "give the instruction, then ask one student to repeat it back before starting"),
      ],
    },
    {
      // 5 marks: a focused check on delivery, separate from method. A lesson
      // can be well designed and still inaudible at the back.
      id: "explanation",
      name: "Explanation & Delivery",
      prompt: "Could every student follow it?",
      max: 5,
      mode: "checklist",
      options: [
        ev("audible", "Audible throughout the room", 1, "the teacher was audible throughout the room"),
        ev("pace", "Pace suited the class", 1, "the pace suited the class"),
        ev("pitched", "Language pitched right", 1, "language was pitched correctly for the age group"),
        ev("examples", "Examples students recognise", 1, "examples were ones the students recognised"),
        ev("too_fast", "Too fast to follow", -3, "the lesson moved faster than the class could follow",
           "pause after each key step and check two or three students before moving on"),
        ev("read_aloud", "Read from the textbook", -3, "the lesson was largely read aloud from the textbook",
           "teach from notes and keep the textbook for practice, not for delivery"),
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
        ["Moderate", "student engagement was moderate",
         "open with a question or a problem rather than an explanation"],
        ["Low", "student engagement was low",
         "break the period into shorter segments with something for students to do in each"],
        ["Very low", "students were largely disengaged",
         "rebuild the lesson around a task students do, and ask the HOD to observe the next one"],
      ]),
    },
    {
      id: "questioning",
      name: "Questioning & Thinking",
      prompt: "What kind of questions were asked, and of whom?",
      max: 10,
      mode: "checklist",
      options: [
        ev("wait_time", "Wait time after asking", 1, "wait time was given after each question"),
        ev("across_room", "Calls on students across the room", 1, "questions were spread across the room"),
        ev("builds_on", "Builds on student answers", 1, "student answers were built on rather than just accepted"),
        ev("why_how", "Asks why / how do you know", 1, "students were asked to justify their answers"),
        ev("application", "Application questions", 1, "questions asked students to apply, not just recall"),
        ev("volunteers_only", "Only volunteers answer", -4, "only volunteers were answering",
           "call by roll number so every student expects to be asked"),
        ev("answers_own", "Answers own questions", -4, "the teacher answered their own questions",
           "count five seconds silently after asking before taking any answer"),
        ev("recall_only", "Recall questions only", -5, "questioning stayed at recall level",
           "plan three 'why' or 'how do you know' questions into every lesson"),
      ],
    },
    {
      id: "management",
      name: "Classroom Management",
      prompt: "What did you observe?",
      max: 10,
      mode: "checklist",
      options: [
        ev("settled_fast", "Settled within a minute", 1, "the class settled within a minute of the bell"),
        ev("first_time", "Instructions followed first time", 2, "instructions were followed first time"),
        ev("moves_around", "Moves around the room", 1, "the teacher moved around the room"),
        ev("full_period", "Full period used", 1, "the full period was used"),
        ev("repeated_calls", "Repeated calls for attention", -3, "attention had to be called for repeatedly",
           "agree one silent attention signal with the class and use only that"),
        ev("ended_early", "Lesson ended early", -3, "the lesson finished before the period did",
           "keep a short extension task ready for the last five minutes"),
        ev("disruption_unaddressed", "Disruption left unaddressed", -5, "off-task behaviour went unaddressed",
           "deal with off-task behaviour quietly and immediately, before it spreads"),
      ],
    },
    {
      id: "differentiation",
      name: "Differentiation & Inclusion",
      prompt: "Were different learners catered for?",
      max: 10,
      mode: "checklist",
      options: [
        ev("weaker_individually", "Checks weaker learners individually", 2, "weaker learners were checked on individually"),
        ev("extension", "Extension for early finishers", 1, "early finishers had something further to do"),
        ev("spread", "Participation spread widely", 1, "participation was spread across the class"),
        ev("back_rows", "Back rows reached", 1, "the back of the room was reached as much as the front"),
        ev("same_for_all", "Same task, same pace for all", -4, "every learner was given the same task at the same pace",
           "prepare one easier and one harder version of the main task"),
        ev("same_few", "Same few students answering", -3, "the same few students did all the answering",
           "note who has spoken this period and deliberately bring in the others"),
      ],
    },
    {
      id: "assessment",
      name: "Assessment for Learning",
      prompt: "How did they find out who had understood?",
      max: 10,
      mode: "checklist",
      options: [
        ev("checks_midway", "Checks understanding mid-lesson", 2, "understanding was checked during the lesson, not only at the end"),
        ev("looks_at_books", "Looks at notebooks while circulating", 1, "notebooks were looked at while circulating"),
        ev("corrects_on_spot", "Corrects misconception on the spot", 1, "a misconception was corrected on the spot"),
        ev("specific_feedback", "Feedback is specific", 1, "feedback named what was right rather than only praising"),
        ev("any_doubts", "Only asked if there were doubts", -4, "understanding was checked only by asking if there were doubts",
           "replace 'any doubts?' with a question only a student who understood could answer"),
        ev("errors_uncorrected", "Errors left uncorrected", -5, "student errors were left uncorrected",
           "stop and reteach the moment the same error appears twice"),
      ],
    },
    {
      id: "resources",
      name: "Board & Resources",
      prompt: "How were the board and materials used?",
      max: 5,
      mode: "checklist",
      options: [
        ev("legible", "Board organised and legible", 1, "board work was organised and legible"),
        ev("terms_visible", "Key terms left visible", 1, "key terms were left on the board for the lesson"),
        ev("aid_purposeful", "Aid used purposefully", 1, "the teaching aid served the objective"),
        ev("students_used", "Students used the resource", 1, "students used the resource themselves"),
        ev("erased_early", "Cluttered or erased too soon", -3, "the board was cluttered or wiped before students had used it",
           "keep one corner of the board for key terms and leave it until the close"),
      ],
    },
    {
      id: "closure",
      name: "Closure & Homework",
      prompt: "How did the lesson end?",
      max: 5,
      mode: "checklist",
      options: [
        ev("students_recap", "Students did the recap", 1, "students, not the teacher, did the recap"),
        ev("objective_revisited", "Objective revisited", 1, "the objective was revisited at the close"),
        ev("hw_explained", "Homework explained, not dictated", 1, "homework was explained rather than dictated"),
        ev("next_lesson", "Linked to next lesson", 1, "the close linked forward to the next lesson"),
        ev("no_consolidation", "No consolidation", -3, "the lesson ended without consolidation",
           "reserve the last four minutes for students to say what they have learned"),
        ev("hw_after_bell", "Homework given after the bell", -2, "homework was given once students had packed up",
           "set homework with five minutes to go, while you still have their attention"),
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
//
// The actions here are written for the PANEL, not the candidate: what to probe,
// what to require, what induction would be needed on appointment.
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
        ["Good", "subject knowledge was sound",
         "probe depth at interview with two questions from the senior syllabus"],
        ["Average", "subject knowledge was average",
         "probe depth at interview with two questions from the senior syllabus"],
        ["Weak", "subject knowledge was weak",
         "do not appoint to senior classes on this evidence"],
      ]),
    },
    {
      // 5 marks: a candidate prepares one lesson specially for a demo, so how
      // well it is planned says less about them than how they teach it.
      id: "planning",
      name: "Lesson Planning",
      prompt: "How was the lesson structured?",
      max: 5,
      mode: "scale",
      options: scale(5, [
        ["Excellent structure", "the lesson was excellently structured"],
        ["Well planned", "the lesson was well planned"],
        ["Adequate", "lesson planning was adequate",
         "ask to see a week of lesson plans before confirming"],
        ["Some gaps", "there were gaps in the lesson plan",
         "ask to see a week of lesson plans before confirming"],
        ["Poorly structured", "the lesson was poorly structured",
         "require a planning-format induction in the first month"],
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
        ["Generally clear", "explanation was generally clear",
         "pair with a strong mentor for the first term"],
        ["Somewhat unclear", "explanation was somewhat unclear",
         "pair with a strong mentor for the first term"],
        ["Difficult to follow", "explanation was difficult to follow",
         "not suitable for board classes without substantial development"],
      ]),
    },
    {
      id: "communication",
      name: "Communication",
      prompt: "Language, voice and presence in speech?",
      max: 10,
      mode: "scale",
      options: scale(10, [
        ["Excellent", "communication was excellent"],
        ["Very good", "communication was very good"],
        ["Good", "communication was good",
         "check audibility in a full-size room before confirming"],
        ["Average", "communication was average",
         "check audibility in a full-size room before confirming"],
        ["Weak", "communication was weak",
         "language and delivery would need sustained support"],
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
        ["Appropriate", "the teaching approach was appropriate",
         "induct on activity-based and competency-based methods"],
        ["Limited", "the teaching approach was limited",
         "induct on activity-based and competency-based methods"],
        ["Inappropriate", "the approach was unsuited to the class",
         "would need close supervision for at least a term"],
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
        ["Moderate", "student engagement was moderate",
         "note this was an unfamiliar class, and weigh accordingly"],
        ["Low", "student engagement was low",
         "ask how they would have opened the lesson differently"],
        ["Very low", "students were largely disengaged",
         "ask how they would have opened the lesson differently"],
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
        ["Some HOTS", "there was some higher-order questioning",
         "induct on competency-based questioning in the first term"],
        ["Mostly recall", "questioning stayed mostly at recall level",
         "induct on competency-based questioning in the first term"],
        ["Limited questioning", "there was very little questioning",
         "a significant gap against CBSE competency requirements"],
      ]),
    },
    {
      id: "presence",
      name: "Classroom Presence",
      prompt: "Presence and control with a class they do not know?",
      max: 10,
      mode: "scale",
      options: scale(10, [
        ["Excellent presence", "classroom presence was excellent"],
        ["Strong control", "classroom control was strong"],
        ["Good control", "classroom control was good",
         "start with middle classes rather than senior"],
        ["Average", "classroom presence was average",
         "start with middle classes rather than senior"],
        ["Weak", "classroom presence was weak",
         "would struggle with a full class unsupported"],
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
        ["Adequate", "resource use was adequate",
         "induct on the SmartBoard and lab resources available here"],
        ["Limited", "resource use was limited",
         "induct on the SmartBoard and lab resources available here"],
        ["Not used", "no teaching resources were used",
         "ask what they would have used with a day's notice"],
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
        ["Adequate", "the closure was adequate",
         "induct on assessment-for-learning practice"],
        ["Weak", "the closure was weak",
         "induct on assessment-for-learning practice"],
        ["Not evident", "no assessment or closure was evident",
         "ask how they would know who had understood"],
      ]),
    },
    {
      // 5 marks: this summarises the other ten criteria. Weighting it heavily
      // would score the same evidence a second time.
      id: "potential",
      name: "Teaching Potential",
      prompt: "Overall, how do they read?",
      max: 5,
      mode: "scale",
      options: scale(5, [
        ["Exceptional", "the candidate shows exceptional teaching potential"],
        ["Highly suitable", "the candidate is highly suitable for the role"],
        ["Suitable", "the candidate is suitable for the role",
         "appoint with induction support in the first term"],
        ["Consider", "the candidate is worth further consideration",
         "a second demonstration lesson before deciding"],
        ["Not suitable", "the candidate is not suitable for this role",
         "no appointment at this stage"],
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
