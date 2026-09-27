# Echo Demo Script

**Duration:** 3 to 5 minutes

## Pre-Demo Checklist

- [ ] Check deployed URL health (`/api/health`).
- [ ] Open a fresh session in the browser.
- [ ] Test voice output to confirm audio works.
- [ ] Have a mobile hotspot ready in case conference Wi-Fi is slow or blocked.
- [ ] Have the backup video loaded in a background tab.

## Fallback Plan

- **If Gemini is slow/fails:** Explain that the LLM timed out, show the error state in the UI, and click **Retry**.
- **If Audio fails:** Toggle the Voice button to OFF and proceed with the typed flow.
- **If the App crashes completely:** Switch to the backup video and narrate over it.

---

## 1. Introduction (30s)

**Speaker:** "Have you ever thought you understood a concept perfectly, only to realize you couldn't explain it to someone else? Echo flips the standard model. Instead of an AI tutoring the student, the student tutors an AI. Let's see how well I can teach recursion."

## 2. The Learner's Opening Line (15s)

*(Show the fresh session screen. If voice is enabled, the learner speaks first).*
**Learner (Audio/Text):** "I don't understand recursion at all. Can you explain it to me?"

## 3. First Attempt: Teaching without the Base Case (45s)

**Speaker:** "I'm going to explain recursion, but I'll purposely leave out a critical part: the base case."
*(Type and submit into the Teach Panel)*: "Recursion is when a function calls itself to solve smaller pieces of a problem. You just keep calling the function over and over."

*(Wait for processing, then open the Concept Map)*
**Speaker:** "The system uses Gemini to evaluate my explanation against a strict rubric. Notice in the Concept Map, it correctly identified that I explained 'Self-reference' and 'Subproblems', but 'Base Case' is missing."

## 4. Assess & Inspect (45s)

**Speaker:** "Now let's see if the learner can pass a test based *only* on what I taught it."
*(Click Assess. Wait for the learner to take the test and fail).*

**Speaker:** "The learner failed the question about when recursion stops. By clicking on the failed answer, we can inspect exactly why. The system links the failure directly to the missing Base Case concept, and points back to my original words. It didn't just hallucinate a wrong answer; it deterministically failed because I didn't teach it."

## 5. Reteach & Compare (60s)

**Speaker:** "To fix this, I need to reteach. Does anyone from the judges want to tell me how to explain the base case?"
*(Take audience suggestion or type: "You also need a base case, which is a simple condition that stops the function from calling itself forever.")*

*(Click Submit, wait for processing, then click Assess to take the second test).*
*(Show the Comparison View)*

**Speaker:** "Here is the comparison view. On the left was the first test, and on the right is the new test. Because I corrected my explanation, the learner's understanding improved, and it passed the new matching question. The score went up because *my teaching* improved."

## 6. Pilot Proposal & Conclusion (30s)

**Speaker:** "This score isn't the student's grade; it's the explanation's coverage. To prove this actually helps students learn, we are proposing a pilot study at UMBC. Introductory programming students will answer separate pre- and post-questions, alongside a comparison group. We will measure if teaching this simulator improves their performance on real exams compared to the control group."

**Speaker:** "Thank you! Any questions?"
