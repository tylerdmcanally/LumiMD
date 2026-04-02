# Feature: Provider Intro Clip ("Lumi Introduction")

## Overview

Before a visit recording begins, give the patient the option to play a short audio clip that introduces LumiMD to their healthcare provider. This removes the burden of the patient having to explain the app and preemptively addresses physician concerns about being recorded.

## Why This Exists

Physician resistance to patient recording is the #1 barrier to adoption. The core fears are:
1. Verbatim audio/transcript being shared, going viral, or used against them
2. Being recorded changing how they communicate (becoming guarded, overly technical)
3. Recordings creating discoverability risk for billing practices

This intro clip addresses fears #1 and #2 in under 10 seconds by clearly stating: no audio is saved, no word-for-word transcript is created, only a plain-language summary.

## The Audio Clip Script

```
"Hi, I'm Lumi — your patient's visit companion. I'll create a plain-language
summary of today's visit to help them remember what was discussed. No audio
recording is saved, and no word-for-word transcript is created. Thank you!"
```

- Target duration: 7-10 seconds
- Voice: Warm, professional female voice (think medical assistant, not robot)
- Tone: Friendly, clear, unhurried — NOT a legal disclaimer
- For now, use a placeholder TTS-generated clip. We will replace with a professional ElevenLabs or equivalent voice later.

## User Flow

```
Patient taps "Record Visit" button
        │
        ▼
┌─────────────────────────────────────┐
│   Modal/Bottom Sheet appears:       │
│                                     │
│   "Would you like to introduce      │
│    Lumi to your provider?"          │
│                                     │
│   [ ▶ Play Introduction ]           │  ← Primary action, prominent
│                                     │
│   [ Skip - they already know ]      │  ← Secondary, subdued but easy
│                                     │
└─────────────────────────────────────┘
        │                    │
   Play tapped          Skip tapped
        │                    │
        ▼                    │
┌──────────────────┐         │
│ Audio clip plays  │         │
│ via device speaker│         │
│ (NOT recorded)    │         │
│                   │         │
│ [Tap to stop]     │         │
│ visible during    │         │
│ playback          │         │
└───────┬──────────┘         │
        │ Clip ends or       │
        │ user taps stop     │
        ▼                    ▼
┌─────────────────────────────────────┐
│  Recording begins automatically     │
│  (existing record-visit flow)       │
└─────────────────────────────────────┘
```

## Technical Requirements

### Audio Playback (Intro Clip)
- Store the intro clip as a static asset bundled with the app (e.g., `mobile/assets/audio/lumi-intro.mp3`)
- Play through the device SPEAKER (not earpiece) — this needs to be audible in the exam room
- Use `expo-av` Audio.Sound for playback (same library already used for recording)
- CRITICAL: The intro clip must play BEFORE recording starts. The intro audio must NOT be captured in the visit recording sent to AssemblyAI. These are two completely separate audio operations.
- Allow user to tap to stop playback early (physician says "yeah I know, it's fine")
- When clip finishes or is stopped, automatically transition to recording state

### Pre-Recording Modal/Bottom Sheet
- Appears when user taps the existing "Record" button on `mobile/app/record-visit.tsx`
- Two clear options:
  - **"Play Introduction"** — primary action, visually prominent
  - **"Skip — my provider already knows"** — secondary, less prominent but easily tappable
- Should feel lightweight and quick — not a heavy modal that slows the user down
- Use existing design system / component patterns from the app

### Recording Flow Integration
- The existing recording flow in `record-visit.tsx` should be minimally modified
- Insert the intro modal as a pre-step before `Audio.Recording.createAsync()` is called
- After intro plays (or is skipped), proceed with the existing recording flow exactly as it works today
- No changes to the backend, transcription pipeline, or summary generation

### Placeholder Audio Generation
- For development/testing, generate a placeholder clip using expo-speech or any available TTS
- Alternatively, create a simple script that generates an mp3 using a free TTS API
- The placeholder just needs to be functional — professional voice will come later
- Include a TODO comment noting that this will be replaced with professional ElevenLabs audio

## Files to Modify

- `mobile/app/record-visit.tsx` — Add pre-recording modal and intro playback logic
- `mobile/assets/audio/` — New directory for the intro clip audio file (create if doesn't exist)
- Potentially a new component: `mobile/components/ProviderIntroModal.tsx` or similar

## Files NOT to Modify

- No backend changes (`functions/` directory)
- No web portal changes (`web-portal/` directory)
- No changes to transcription or summarization pipeline
- No changes to the post-recording flow

## Design Notes

- The modal should match the existing app's visual style (brand cyan #40C9D0, existing typography)
- Keep it simple — two buttons, maybe a small Lumi logo or icon, brief explanatory text
- During playback, show a simple animation or waveform to indicate audio is playing, with a clear "tap to stop" affordance
- After playback ends, a brief transition (maybe 1 second) before recording begins, so the physician knows the intro is done and the conversation is starting

## Edge Cases

- Phone is on silent/vibrate: The clip should still play through the speaker. Check and handle audio mode appropriately with expo-av (set audio mode to play through speaker even in silent mode if possible, or show a warning to the user to turn up volume)
- Bluetooth connected: Ensure audio plays through device speaker, not Bluetooth earbuds the patient might be wearing
- User backgrounds app during playback: Stop playback, return to pre-recording state when app returns to foreground
- Accessibility: Ensure the modal and buttons are accessible via VoiceOver/TalkBack

## Testing Checklist

- [ ] Tapping "Record Visit" shows the intro modal before recording starts
- [ ] "Play Introduction" plays audio through device speaker at audible volume
- [ ] Audio clip does NOT get captured in the visit recording
- [ ] Tapping during playback stops the clip early
- [ ] After clip finishes, recording begins automatically
- [ ] "Skip" bypasses the clip and goes straight to recording
- [ ] Recording flow after intro works identically to current flow (upload, transcription, summary all unaffected)
- [ ] Silent mode handling works correctly
- [ ] App backgrounding during playback is handled gracefully
