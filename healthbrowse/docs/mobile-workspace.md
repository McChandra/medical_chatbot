# HealthBrowse mobile research workspace

## Implemented

The shared web application retains its six medical decks, authenticated account flow and source-grounded model pipeline. A new H-and-pulse SVG replaces the plus/asterisk mark; matching installed-app icons use the same design.

At widths up to 760px, the actual search form moves into a sticky header without duplicating its input, autocomplete or submission handlers. Four bottom-navigation actions change with the selected reading mode. The existing menu retains appearance controls and sign-out. First mobile visits default to dark mode; an explicit saved preference wins.

| Reading mode | Bottom actions | Workspace |
| --- | --- | --- |
| General (including legacy Patient preference) | Search, Saved, History, Account | Plain-language answers, guided Buddy prompts and a pinned medical disclaimer |
| Clinicians | Search, Evidence, Sources, History | Expanded quick-reference decks and horizontal Risk, Symptoms, Tests, Treatment and Outlook shortcuts |

These are presentation styles, not verified professional credentials or access permissions. Clinical stored identifiers are unchanged. Student has been removed. Existing Student preferences and saved chats open in General mode.

Source taps open the available supporting passage and its original publisher link. Modified clicks retain ordinary browser link behavior. This does not embed complete licensed textbooks, fetch missing chapters or certify the generated text. Deck labels describe actual evidence state—cited AI summary, source excerpt or evidence gap—not a numerical probability of clinical correctness.

The Student workspace, study-card controls and notebook are no longer presented. Existing session notes are not deleted by this role change; normal sign-out cleanup still clears them.

## Buddy, voice and feedback

Buddy remains user-opened. The mobile launcher sits above navigation; tap opens the conversation and hold opens the voice-input consent flow. The composer remains separate from the scrolling conversation and adjusts to the browser visual viewport when the software keyboard opens. Guided questions are collapsed under “Explore this topic.”

Voice typing uses SpeechRecognition where supported, only after explicit consent. Browser speech services may process audio remotely; the UI explains this before activation. Listening stops after 30 seconds, cancellation, closing Buddy, backgrounding or leaving the page. Only final text is placed in the input. Nothing is automatically submitted. Typing remains available when browser support or permission is absent.

Read-aloud uses an available on-device English voice only. Tapping the screen, closing the sheet or leaving the page cancels it. Four highlighted terms—etiology, prognosis, biopsy and biomarker—open short NCI-based explanations, pronunciation text, an optional local voice and an original-source link. This is a limited glossary, not arbitrary medical-term translation.

Detected safety blocks can request a short device vibration when supported and reduced-motion is not enabled. A static outline/status accompanies the existing response; no flashing warning is used. A missing vibration or audio capability never blocks the textual response.

## Not connected

Camera/QR scanning, automatic document capture/OCR, medical image uploads, a patient health vault, Qdrant retrieval, cine-loop playback and clinical image interpretation are not connected. No controls imply these services are operational. The current retrieval schema remains text-only and six-deck; eight internal evidence decks have not been supplied. Native iOS/Android packaging is separate work.

## Verification

Automated regression tests cover role routing and persistence, source passage click events, source-preserving study cards, bounded/private notes and logout cleanup, dictation cancellation and unsupported devices, local-only speech voices, and long-press behavior. Existing search, safety, account and citation suites remain applicable.

The managed preview service cannot launch this existing Worker configuration because it has neither a preview dev script nor a static-directory manifest. Browser visual QA, real-device keyboard behavior, screen-reader interaction, microphone permission, speech quality and haptics remain unverified. Tests use mocked browser APIs and do not validate medical accuracy or clinical performance.

## Reference documentation

- [MDN: SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- [MDN: VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)
- [MDN: Navigator.vibrate](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate)
- NCI Dictionary: [etiology](https://www.cancer.gov/publications/dictionaries/cancer-terms/def/etiology), [prognosis](https://www.cancer.gov/publications/dictionaries/cancer-terms/def/prognosis), [biopsy](https://www.cancer.gov/publications/dictionaries/cancer-terms/def/biopsy), [biomarker](https://www.cancer.gov/publications/dictionaries/cancer-terms/def/biomarker). Dictionary explanations checked 2026-11-13.
