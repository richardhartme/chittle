# Chittle

A web app for practising impromptu speaking: you record yourself answering a topic, and the app assesses how you did.

## Practice

**Category**:
A kind of speaking practice, such as Interview or Storytelling, that groups topics and sets the framework an answer is judged against.
_Avoid_: Type, mode

**Topic**:
A single question or prompt to speak about, belonging to one category.
_Avoid_: Prompt, question

**Recording**:
One take of a speaker answering a topic, on video and audio or audio only.
_Avoid_: Video, take, session

**Mode**:
Whether a recording captures video and audio or audio only.

**Retake**:
A new recording of a topic the speaker has already recorded, started from the previous recording's results.
_Avoid_: Retry (that means re-running a failed assessment)

**Previous attempt**:
The speaker's most recent earlier recording of the same topic that has a score, which a retake's results are compared with.

## Assessment

**Assessment**:
The app's evaluation of one recording: its score, dimension scores, feedback and coach insights.
_Avoid_: Rating, analysis, review, self-assessment

**Transcript**:
The words spoken in a recording, with when each word was said and how clearly it was heard.

**Score**:
A recording's overall result out of 1000, the sum of its dimension scores.
_Avoid_: Index, grade

**Dimension**:
One of the six areas a recording is scored on: Structure, Conciseness, Confidence, Pronunciation, Filler rate and Pace. Each has a fixed maximum.
_Avoid_: Category (that's a kind of practice), criterion

**Sub-score**:
A scored part of a dimension, such as Signposting within Structure, with its own feedback.
_Avoid_: Criterion, metric

**Measured dimension**:
A dimension calculated directly from the transcript's words and timings (Pace, Filler rate, Pronunciation), as opposed to a judged dimension.

**Judged dimension**:
A dimension scored by the language model against a rubric (Structure, Conciseness, Confidence).

**Framework**:
The answer structure a category is judged against, such as STAR for Interview or PREP for Opinion.
_Avoid_: Template, format

**Scoring version**:
The version of the scoring rules and prompts that produced an assessment.

**Re-assess**:
Re-running the assessment of a recording from its existing transcript, replacing the previous assessment.

**Retry**:
Re-running an assessment that failed or stalled.

## Feedback

**Overview**:
A short paragraph summarising a recording's strongest point and the most useful thing to change.
_Avoid_: Summary

**Strength**:
Something the speaker did well in a recording.

**Area to improve**:
One concrete change the speaker should make next time.
_Avoid_: Weakness, issue

**Focus vote**:
A speaker's thumbs up ("I want to work on this") or thumbs down ("not useful") on an area to improve.
_Avoid_: Rating, like

**Coach insights**:
The rewrite-based feedback for one recording: a summary of the one change that would help most, how it was said compared with a better order, a suggested opening, shorter ways to say long sentences, and the ideal version.
_Avoid_: Tips

**Ideal version**:
The speaker's own answer rewritten to follow the category's framework.
_Avoid_: Model answer, example answer

**Progress insight**:
A coaching observation across a speaker's recent assessments, shown on their dashboard.
On the dashboard, its card is headed "Coach's insight".
_Avoid_: Coach insights (those are about one recording), trend

**Filler word**:
A word that fills a pause without adding meaning, such as "um", "uh", or "well" and "like" when used that way.

**Hedge**:
A phrase that softens a claim, such as "I think", "sort of" or "probably".
_Avoid_: Qualifier

## Pace

**Overall WPM**:
Words spoken divided by the recording's full duration, pauses included.

**Active WPM**:
Words spoken divided by speaking time, leaving out long thinking pauses.

**Baseline WPM**:
The speaker's typical pace when speaking fluently, with the range it usually falls in.

**Rush zone**:
A stretch of speech noticeably faster than the speaker's baseline.

**Drag zone**:
A stretch of speech noticeably slower than the speaker's baseline.

**Hesitation zone**:
A long pause in the middle of a sentence, as opposed to a pause between sentences.

## Accounts

**Speaker**:
A signed-in user of the app.
_Avoid_: Customer, member

**Provider key**:
An API key a speaker supplies for a service the assessment runs on (Deepgram or Anthropic), paid for by them.
_Avoid_: Token, credentials
