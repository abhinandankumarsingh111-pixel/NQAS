// ---------------------------------------------------------------------------
// CLASS OBSERVATION RUBRICS
//
// Two rubrics that must never be confused with each other. In-Campus judges an
// EXISTING teacher during a real lesson; Demo judges a CANDIDATE we are
// deciding whether to hire. Different purposes, different criteria, different
// records, different reports.
//
// WHAT MAKES AN OPTION GOOD.
// Every option must name something you can SEE from the back of the room, at
// the moment it happens. "Good questioning" fails that test: two principals
// will read it differently, and a teacher told they scored low on it learns
// nothing. "Answers own questions" and "Wait time after asking" pass it — they
// are observable, they are unambiguous, and each one implies its own remedy.
//
// That is why every concern carries an `action`: a specific thing to do next.
// An observation that ends in "improve questioning" has wasted the period.
//
// Each criterion also carries a `growth` pool — further actions offered
// whenever that criterion lost marks, whether or not one particular concern was
// ticked. The plan is the principal's to compose, so they need more to choose
// from than the handful of concerns they happened to tap.
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
   * For concerns only: ONE CONCRETE THING TO DO NEXT.
   *
   * Imperative, specific, and small enough to actually happen. "Improve
   * questioning" is not an action; "count five seconds silently after asking
   * before taking any answer" is.
   *
   * In-Campus actions are written for the TEACHER, and land in their
   * development plan. Demo actions are written for the PANEL — what to probe at
   * interview, what to require, what induction an appointment would need.
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
  /**
   * Further candidate actions for this criterion, offered whenever it lost
   * marks — not only when one specific concern was ticked.
   *
   * The point is choice. A principal composing a plan should be picking from a
   * shelf, not accepting whatever four items the arithmetic produced.
   */
  growth: string[];
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
// ("Mostly engaged" -> 12/15). Rounded, so it works for any max down to 5.
// Below 5 the rounding collides and a scale stops being five distinct levels,
// which the calibration test enforces.
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
      growth: [
        "write the objective on the board before the bell and return to it at the close",
        "keep a one-page plan for each period and have it open on the desk",
        "open every lesson by asking what the class remembers from the last one",
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
      growth: [
        "read the chapter's exemplar and previous-year questions before teaching it",
        "sit in on a colleague who teaches this chapter well",
        "keep a note of the questions you could not answer and take them to the subject meeting",
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
      growth: [
        "plan one activity into each lesson where the students produce something",
        "cut the explanation to ten minutes and give the rest of the period to practice",
        "model one worked example in full before setting the exercise",
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
      growth: [
        "check the back row can hear you before you begin",
        "explain each new idea twice, the second time in different words",
        "use an example from the students' own lives for every new concept",
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
      growth: [
        "open the lesson with a question rather than an announcement",
        "break the period into three parts with a change of activity between them",
        "give the class something to do within the first five minutes",
      ],
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
      growth: [
        "plan three 'why' or 'how do you know' questions into every lesson",
        "count five seconds silently after asking before taking any answer",
        "keep a class list and tick off who you have asked this week",
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
      growth: [
        "agree one silent attention signal with the class and use only that",
        "stand at the door and greet the class in, so they enter already settled",
        "keep a short extension task ready for the last five minutes",
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
      growth: [
        "prepare one easier and one harder version of the main task",
        "spend five minutes of every lesson with the three weakest students",
        "seat the weakest learners where you pass them most often",
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
      growth: [
        "replace 'any doubts?' with a question only a student who understood could answer",
        "look at four notebooks in every lesson while the class works",
        "end each period with a one-question written check on the day's idea",
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
      growth: [
        "keep one corner of the board for key terms and leave it until the close",
        "plan the board layout before the lesson rather than during it",
        "bring one concrete object or visual to every new topic",
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
      growth: [
        "reserve the last four minutes for students to say what they have learned",
        "set homework with five minutes to go, while you still have their attention",
        "close by asking two students to state the day's main idea in their own words",
      ],
    },
  ],
};

// ===========================================================================
// B. DEMO CLASS OBSERVATION — 100 marks, 11 criteria
//
// A separate rubric for a separate purpose: this decides whether to HIRE
// someone, not how an employee is performing.
//
// WHAT AN EXPERIENCED PANEL ACTUALLY KNOWS.
//
// 1. A demo lesson is a REHEARSED PERFORMANCE. The candidate chose the topic,
//    practised it, and may have taught the same forty minutes at three other
//    schools this month. So the criteria that carry weight here are the ones a
//    candidate CANNOT rehearse: what they do with a wrong answer, a question
//    off the plan, a class that will not respond, a room that goes quiet.
//    That is why "Handling the Unscripted" is the second-heaviest criterion at
//    12 marks — it is the only part of the period that is not a script.
//
// 2. Subject command is the thing least likely to improve on its own. Method,
//    board work and pacing can be inducted in a term. A shallow grasp of the
//    subject cannot. It stays the heaviest at 15.
//
// 3. The class is a STRANGER TO THEM. Low engagement in a demo is weaker
//    evidence than low engagement from an employee, and a panel that forgets
//    this rejects good teachers. So engagement is 10, not 15 as in-campus, and
//    two separate criteria — Rapport and Presence — ask specifically how the
//    candidate handled being unknown to the room.
//
// 4. For an English-medium CBSE school, spoken and written English is a GATE,
//    not a nice-to-have — and board spelling reveals it faster than an
//    interview does. Language & Voice is scored on its own at 10, and errors on
//    the board are their own tick.
//
// 5. Lesson structure is worth LITTLE (5) here, precisely because it is the
//    most rehearsable thing on the list. It is scored, but it is not evidence.
//
// 6. There is no "overall potential" criterion any more. It scored the other
//    ten a second time, and the panel's overall call already has its own field:
//    the Recommendation.
//
// The `action` on every concern is written for the PANEL: what to probe at
// interview, what to require in writing, what induction an appointment implies.
// ===========================================================================
export const DEMO: Rubric = {
  id: "demo",
  title: "Demo Class Observation",
  blurb: "Assessing a candidate from one demonstration lesson with a class they have never met.",
  criteria: [
    {
      // The heaviest criterion, deliberately. For a hire, what they know is the
      // thing least likely to improve on its own.
      id: "subject",
      name: "Subject Command",
      prompt: "How well do they actually know this subject?",
      max: 15,
      mode: "checklist",
      options: [
        ev("accurate", "Accurate throughout", 2, "the content was accurate throughout"),
        ev("beyond_text", "Went beyond the textbook", 2, "the teaching went beyond the textbook"),
        ev("right_depth", "Depth right for the class", 1, "the depth was right for the class level"),
        ev("terminology", "Correct terminology", 1, "subject terminology was used correctly"),
        ev("placed_in_syllabus", "Placed topic in the syllabus", 1, "the topic was placed in the wider syllabus"),
        ev("factual_error", "Factual error", -8, "a factual error was taught",
           "check the subject paper before shortlisting, and do not place on board classes on this evidence"),
        ev("shallow", "Textbook-deep only", -5, "the treatment did not go past the textbook",
           "ask two questions from the senior syllabus at interview"),
        ev("wrong_level", "Pitched at the wrong level", -4, "the content was pitched at the wrong class level",
           "confirm which classes and which board they have actually taught, and for how long"),
      ],
      growth: [
        "ask two questions from the senior syllabus at interview",
        "check the subject paper score before shortlisting",
        "confirm which classes and which board they have actually taught, and for how long",
      ],
    },
    {
      // The part of a demo that is NOT a script. A candidate can rehearse a
      // lesson; they cannot rehearse a child's wrong answer.
      id: "unscripted",
      name: "Handling the Unscripted",
      prompt: "What happened when the lesson left the plan?",
      max: 12,
      mode: "checklist",
      options: [
        ev("used_wrong_answer", "Used a wrong answer well", 2, "a wrong answer was used rather than passed over"),
        ev("answered_off_plan", "Answered a question off the plan", 2, "a question off the lesson plan was answered on the spot"),
        ev("adapted", "Changed course when it was not landing", 1, "the lesson was adjusted when the class did not follow"),
        ev("composed", "Composed when the room went quiet", 1, "composure held when the room went quiet"),
        ev("recited", "Recited rather than taught", -5, "the lesson was recited rather than taught",
           "ask them to teach five minutes of a topic given to them on the spot"),
        ev("ignored_wrong", "Passed over a wrong answer", -4, "a wrong answer was passed over without correction",
           "ask at interview what they do when a child answers wrongly in front of the class"),
        ev("rattled", "Thrown off by the unexpected", -4, "the candidate was thrown when the plan did not hold",
           "run a second demo with a class and a topic they do not choose"),
        ev("ploughed_on", "Carried on regardless", -3, "the lesson continued although the class had lost it",
           "ask how they would know the class had stopped following"),
      ],
      growth: [
        "ask them to teach five minutes of a topic given to them on the spot",
        "run a second demo with a class and a topic they do not choose",
        "ask at interview what they do when a child answers wrongly in front of the class",
      ],
    },
    {
      id: "explanation",
      name: "Explanation & Clarity",
      prompt: "Could a child who did not already know this follow it?",
      max: 10,
      mode: "checklist",
      options: [
        ev("example_first", "Example before the rule", 2, "an example came before the rule"),
        ev("one_idea", "One idea at a time", 1, "ideas were taken one at a time"),
        ev("checked_each_step", "Checked at each step", 1, "understanding was checked at each step"),
        ev("made_concrete", "Made it concrete", 1, "an analogy or visual made the idea concrete"),
        ev("read_out", "Read from book or slides", -5, "the lesson was largely read from the book or the slides",
           "require a demonstration without notes before appointing"),
        ev("textbook_language", "Stayed in textbook language", -4, "the explanation stayed in textbook language",
           "at interview, ask them to explain the same idea again for a weaker child"),
        ev("outran_class", "Outran the class", -3, "the delivery outran the class",
           "note for induction and pair with a strong mentor for the first term"),
      ],
      growth: [
        "at interview, ask them to explain the same idea again for a weaker child",
        "require a demonstration without notes before appointing",
        "pair with a strong mentor for the first term if appointed",
      ],
    },
    {
      // For an English-medium CBSE school this is a gate, not a preference.
      id: "communication",
      name: "Language & Voice",
      prompt: "Spoken and written English, and whether the voice carries?",
      max: 10,
      mode: "checklist",
      options: [
        ev("fluent", "Fluent, accurate English", 2, "spoken English was fluent and accurate"),
        ev("carries", "Voice carries to the back", 1, "the voice carried to the back of the room"),
        ev("varied", "Pace and tone varied", 1, "pace and tone varied rather than droned"),
        ev("board_english", "Board English correct", 1, "written English on the board was correct"),
        ev("grammar_errors", "Repeated errors in speech", -5, "there were repeated errors in spoken English",
           "not suitable for English-medium senior classes without a written language commitment"),
        ev("board_errors", "Spelling errors on the board", -4, "there were spelling or grammar errors on the board",
           "ask for a handwritten lesson plan at interview and read it before deciding"),
        ev("inaudible", "Did not carry past the front", -4, "the voice did not carry beyond the front rows",
           "re-test audibility in a full-size classroom before confirming"),
        ev("monotone", "Flat throughout", -3, "delivery was flat throughout",
           "note for induction — a flat delivery loses a class inside ten minutes"),
      ],
      growth: [
        "re-test audibility in a full-size classroom before confirming",
        "ask for a handwritten lesson plan at interview and read it before deciding",
        "set a short written English check before confirming",
      ],
    },
    {
      // Weighted BELOW the in-campus equivalent on purpose: the class does not
      // know this person, and a panel that forgets that rejects good teachers.
      id: "engagement",
      name: "Student Engagement",
      prompt: "Did a class that had never met them stay with them?",
      max: 10,
      mode: "scale",
      options: scale(10, [
        ["With them throughout", "the class stayed with the candidate throughout"],
        ["Mostly engaged", "the class was mostly engaged"],
        ["Engaged in patches", "the class was engaged only in patches",
         "weigh this against the fact that the class was unfamiliar to them"],
        ["Drifted", "the class drifted for much of the lesson",
         "ask how they would open this lesson with a class they had never met"],
        ["Lost the room", "the candidate lost the room",
         "a second demonstration before deciding, or no appointment"],
      ]),
      growth: [
        "ask how they would open this lesson with a class they had never met",
        "weigh this against the fact that the class was unfamiliar to them",
        "run a second demonstration with a class of a different age",
      ],
    },
    {
      id: "questioning",
      name: "Questioning & Thinking",
      prompt: "What was asked, and of whom?",
      max: 9,
      mode: "checklist",
      options: [
        ev("wait_time", "Wait time after asking", 1, "wait time was given after each question"),
        ev("named_students", "Asked named students", 1, "questions went to named students, not only to volunteers"),
        ev("why_how", "Asked why / how do you know", 1, "students were asked to justify their answers"),
        ev("built_on", "Built on the answers", 1, "answers were built on rather than just accepted"),
        ev("no_questioning", "Almost no questioning", -5, "there was almost no questioning",
           "a serious gap against competency-based teaching — do not place on board classes"),
        ev("recall_only", "Recall only", -4, "questioning stayed at recall level",
           "induct on competency-based questioning in the first term"),
        ev("answers_own", "Answered own questions", -4, "the candidate answered their own questions",
           "ask at interview how long they wait after asking a question"),
        ev("chorus", "Chorus answers accepted", -3, "questions were answered by the class in chorus",
           "ask how they would know which individual child had understood"),
      ],
      growth: [
        "induct on competency-based questioning in the first term",
        "ask how they would know which individual child had understood",
        "ask what a higher-order question looks like in their subject",
      ],
    },
    {
      // Two criteria ask about being a stranger to the room. This one is about
      // whether they closed that distance; Presence below is about whether they
      // held the room despite it.
      id: "rapport",
      name: "Reading an Unfamiliar Class",
      prompt: "Did they close the distance with a class they had never met?",
      max: 8,
      mode: "checklist",
      options: [
        ev("used_names", "Learned and used names", 2, "the candidate learned and used students' names"),
        ev("reached_back", "Reached the back rows", 1, "the back of the room was reached as much as the front"),
        ev("at_ease", "Students at ease", 1, "students were at ease with the candidate"),
        ev("front_only", "Stayed at the front", -4, "the candidate stayed at the front throughout",
           "note for induction — the back of a forty-child room cannot be managed from the board"),
        ev("no_names", "No student addressed by name", -3, "no student was addressed by name",
           "ask how they go about learning forty names in the first week"),
        ev("talked_at", "Talked at the class", -3, "the class was talked at rather than talked with",
           "run a second demonstration with a junior class before deciding"),
      ],
      growth: [
        "ask how they go about learning forty names in the first week",
        "start them on middle classes rather than senior",
        "run a second demonstration with a junior class before deciding",
      ],
    },
    {
      id: "presence",
      name: "Presence & Control",
      prompt: "Did they hold a room that did not know them?",
      max: 8,
      mode: "checklist",
      options: [
        ev("settled_calmly", "Settled the class calmly", 1, "the class was settled without the voice being raised"),
        ev("moved_through", "Moved through the room", 1, "the candidate moved through the room"),
        ev("noticed_offtask", "Noticed and handled off-task", 1, "off-task behaviour was noticed and dealt with quietly"),
        ev("used_time", "Used the full time given", 1, "the time given was used fully"),
        ev("lost_control", "Class not under control", -5, "the class was not under control",
           "not suitable for a full class unsupervised at this stage"),
        ev("shouted", "Raised the voice for attention", -4, "the voice was raised to get attention",
           "ask at interview what they do instead of raising their voice"),
        ev("rooted", "Did not move from the board", -3, "the candidate did not move from the desk or the board",
           "start them on middle classes rather than senior"),
        ev("ran_short", "Ran well short of the time", -3, "the lesson ran well short of the time given",
           "ask what they would have done with the remaining ten minutes"),
      ],
      growth: [
        "ask at interview what they do instead of raising their voice",
        "confirm they can hold a full section of forty before placing them alone",
        "ask what they would have done with the remaining ten minutes",
      ],
    },
    {
      id: "pedagogy",
      name: "Method & Activity",
      prompt: "Did the children do anything, or only listen?",
      max: 8,
      mode: "checklist",
      options: [
        ev("students_did", "Students did something", 2, "students did something rather than only listening"),
        ev("served_objective", "Activity served the objective", 1, "the activity served the objective rather than filling time"),
        ev("real_life", "Linked to real life", 1, "the topic was linked to something students recognise"),
        ev("lecture_only", "Talked the whole period", -4, "the candidate talked for the whole period",
           "induct on activity-based and competency-based methods in the first term"),
        ev("activity_decor", "Activity was decoration", -3, "the activity was decoration rather than learning",
           "ask what the children were meant to learn from that activity"),
        ev("copying", "Lesson was copying from the board", -3, "the lesson was copying from the board",
           "ask to see one activity-based lesson plan at interview"),
      ],
      growth: [
        "induct on activity-based and competency-based methods in the first term",
        "ask to see one activity-based lesson plan at interview",
        "ask what the children were meant to learn from that activity",
      ],
    },
    {
      // 5 marks: the single most rehearsable thing on the list, and therefore
      // the weakest evidence. Scored, but never decisive.
      id: "planning",
      name: "Preparation & Board Work",
      prompt: "What did they walk in with?",
      max: 5,
      mode: "scale",
      options: scale(5, [
        ["Fully prepared, board planned", "the candidate walked in fully prepared, with the board planned"],
        ["Well prepared", "the candidate was well prepared"],
        ["Adequate", "preparation was adequate",
         "ask to see a week of lesson plans before confirming"],
        ["Thin for a demo", "preparation was thin for a demonstration lesson",
         "ask to see a week of lesson plans before confirming"],
        ["Arrived unprepared", "the candidate arrived unprepared",
         "a candidate unprepared for a demonstration will not be prepared on a Tuesday"],
      ]),
      growth: [
        "ask to see a week of lesson plans before confirming",
        "give a topic one day in advance next time and see what changes",
        "ask what teaching aids they would have brought with more notice",
      ],
    },
    {
      id: "closure",
      name: "Checking Understanding & Close",
      prompt: "How did they find out who had understood?",
      max: 5,
      mode: "scale",
      options: scale(5, [
        ["Checked and closed properly", "understanding was checked and the lesson was closed properly"],
        ["Closed adequately", "the lesson was closed adequately"],
        ["Rushed close", "the close was rushed",
         "induct on assessment-for-learning practice"],
        ["Only asked for doubts", "understanding was checked only by asking if there were doubts",
         "ask how they would know who had understood without asking the class"],
        ["No close at all", "the lesson simply stopped",
         "ask how they would know who had understood without asking the class"],
      ]),
      growth: [
        "induct on assessment-for-learning practice",
        "ask how they would know who had understood without asking the class",
        "ask what they would set as homework after this lesson, and why",
      ],
    },
  ],
};

export const RUBRICS: Record<RubricId, Rubric> = { in_campus: IN_CAMPUS, demo: DEMO };

// ---------------------------------------------------------------------------
// RETIRED CRITERIA.
//
// A rubric is editable data, so criteria will be dropped as it improves. The
// records already filed must not quietly lose rows when that happens — a
// hiring file or a personnel record has to keep meaning what it meant on the
// day, including the parts of it we no longer ask about.
//
// These are never offered in the runner. They exist only so that an old record
// still renders every criterion it was actually scored on, with the real option
// labels rather than raw ids.
// ---------------------------------------------------------------------------
export const RETIRED: Record<RubricId, Criterion[]> = {
  in_campus: [],
  demo: [
    {
      id: "resources",
      name: "Resources",
      prompt: "How were teaching resources used?",
      max: 5,
      mode: "scale",
      growth: [],
      options: scale(5, [
        ["Excellent use", "resources were used excellently"],
        ["Effective", "resources were used effectively"],
        ["Adequate", "resource use was adequate"],
        ["Limited", "resource use was limited"],
        ["Not used", "no teaching resources were used"],
      ]),
    },
    {
      id: "potential",
      name: "Teaching Potential",
      prompt: "Overall, how do they read?",
      max: 5,
      mode: "scale",
      growth: [],
      options: scale(5, [
        ["Exceptional", "the candidate shows exceptional teaching potential"],
        ["Highly suitable", "the candidate is highly suitable for the role"],
        ["Suitable", "the candidate is suitable for the role"],
        ["Consider", "the candidate is worth further consideration"],
        ["Not suitable", "the candidate is not suitable for this role"],
      ]),
    },
  ],
};

/** Total marks available. Computed, never hardcoded — retune by editing a `max`. */
export function rubricTotal(r: Rubric): number {
  return r.criteria.reduce((n, c) => n + c.max, 0);
}

// ---------------------------------------------------------------------------
// What the plan is CALLED.
//
// The same machinery serves two different readers. In-Campus produces a
// development plan for the teacher; Demo produces the panel's own list of what
// to do before deciding. Calling both "development plan" would have a hiring
// panel handing a candidate a list of things to probe them about.
// ---------------------------------------------------------------------------
export const PLAN_LABEL: Record<RubricId, string> = {
  in_campus: "Development plan",
  demo: "Before the panel decides",
};

export const PLAN_LEAD: Record<RubricId, string> = {
  in_campus: "What this teacher should work on before the next observation.",
  demo: "What to probe, require or check before this appointment is made.",
};

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
