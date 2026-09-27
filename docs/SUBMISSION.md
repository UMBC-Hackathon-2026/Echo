# The Inverse Tutor: HackUMBC 2026 Submission

## Project Description

The Inverse Tutor flips the traditional education model: students play the role of the teacher. You explain a core computing concept (Recursion) to a simulated learner. The system then evaluates your explanation and the learner takes a test based *only* on what you taught it. You inspect its mistakes, reteach the concept to clear up misunderstandings, and see the learner's score improve. The system provides a tangible metric for the clarity of your explanation.

**Video Demo:** [VIDEO_LINK]

## Inspiration

We realized that simply answering multiple-choice questions or writing isolated code snippets doesn't guarantee true conceptual understanding. The "Feynman Technique" states that if you truly understand something, you should be able to teach it simply. We wanted to create an environment where students could safely practice teaching, see the direct consequences of their omissions or poor explanations, and refine their mental models by correcting a simulated student.

## How it was built

The Inverse Tutor is a **rubric-driven simulation** built as a Next.js App Router application.
- **Evaluation:** We use the Gemini API purely as an evaluator. It extracts the presence of rubric criteria from the student's text.
- **Simulation:** Based on the verified evidence from Gemini, our deterministic code decides every answer the simulated learner gives. The learner never uses an LLM to generate answers.
- **Voice:** We integrated ElevenLabs Text-to-Speech (TTS) to give the simulated learner a voice, making the interaction feel more engaging.
- **Persistence:** All session data and immutable snapshots are stored in PostgreSQL hosted on Tiger Data.
- **Hosting:** The production app is deployed on DigitalOcean App Platform.

## Challenges we ran into

- Building a deterministic evaluation pipeline required an exhaustive testing suite (we generated over 7,700 combinations to test rubric permutations).
- Ensuring that the LLM only acted as an evidence extractor rather than a generative student was tricky. We had to enforce strict boundaries.
- Integrating ElevenLabs voice while maintaining low latency and managing audio state purely from the client side required careful orchestration.

## Accomplishments that we're proud of

- **Verified Determinism:** Our robust testing guarantees that the simulated learner's behavior strictly correlates with the student's teaching, providing an objective feedback loop.
- **Clean Architecture:** We separated the LLM integration from the core deterministic state machine, ensuring our simulation was testable and predictable.
- **Seamless Integrations:** Combining Gemini for semantic evaluation and ElevenLabs for voice output successfully created a novel and immersive "teacher-student" experience.

## What's next for The Inverse Tutor

- **Expanding Content:** Implementing support for more concepts like Pointers, Object-Oriented Programming, and Data Structures.
- **UMBC Pilot:** We are proposing a pilot study at UMBC where introductory programming students answer separate pre- and post-questions, alongside a comparison group, to formally evaluate learning gains.
- **Voice Interactions:** We plan to implement Speech-to-Text (STT) for the teaching input to create a fully conversational teaching experience.

## Built With

- Next.js
- React
- TypeScript
- Tailwind CSS
- Gemini API (`@google/genai`)
- ElevenLabs API
- PostgreSQL / Tiger Data
- DigitalOcean App Platform

## Tracks Claimed

- **Best Use of Gemini API:** Verified and working. Used strictly as an evidence extraction engine against a rigorous rubric.
- **Best Use of ElevenLabs:** Verified and working. Integrated TTS to voice the simulated learner's responses automatically throughout the session.
- **Community Impact and Social Innovation:** Flipping the educational model to reinforce student mastery.
- **Most Engaging Demo:** A live interactive simulation of a confused student that adapts strictly to the user's input.
- **Best Entrepreneurial Idea:** A scalable educational tool designed to test deep conceptual understanding beyond multiple choice.
