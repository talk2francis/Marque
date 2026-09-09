# Marque film — V0 review

This is the new production, separate from Claude's existing film. **It is not the finished demo.**

- [Watch the 2:40 silent storyboard](marque-animatic-v0.mp4)
- [Read the revised script](SCRIPT.md)
- [Evidence, critique and handoff](PRODUCTION.md)
- [Frozen facts and source hashes](FACTS.json)

## Choose a narrator by listening

All three read the same new passage, at natural speed, using ElevenLabs Multilingual v2. These are audition assets, not approved final narration.

| Voice | Listen |
|---|---|
| Daniel | [MP3](auditions/daniel-e71dfdaa7cdb.mp3) |
| George | [MP3](auditions/george-bd2d579f09e7.mp3) |
| Bill | [MP3](auditions/bill-6daff94503ff.mp3) |

The supplied key accessed the same free account as the existing production. The three auditions used 849 of its remaining 919 characters. Full narration needs more funded capacity. No paid charge or subscription change was made. No key is committed. Voice choice awaits Francis, not an automatic default.

## Choose a musical direction by listening

These are 30-second licensed excerpts, normalized to a common audition level. They are not yet a score cut to narration. All three are by Kevin MacLeod, available under CC BY 4.0 with attribution; exact source, excerpt and credit information is beside each MP3.

| Candidate | Direction | Listen |
|---|---|---|
| Dreams Become Real | Piano and synths; quiet, reflective | [MP3](music/dreams-become-real-audition.mp3) |
| Lightless Dawn | A darker investigative pulse | [MP3](music/lightless-dawn-audition.mp3) |
| Long Road Ahead | Strings, brass and percussion; greater scale for the payoff | [MP3](music/long-road-ahead-audition.mp3) |

Music selection awaits Francis. The final arrangement must leave the zero-pass pause completely silent and support intelligible narration.

## What has been reviewed

Source code and public evidence read; actual stills inspected. No human listening test or full-motion viewing is claimed. The storyboard has deliberate still holds and the complete VO text in a bottom band; these are planning devices, not the final film's pacing or caption treatment.

## Rebuild

From the repo root, `node demo-video/astra/recon.mjs` scouts the live product (read-only). This produces **new** stills, so use a new folder for a subsequent freeze; preserve this generation's evidence. `node demo-video/astra/render-animatic.mjs` builds the board frames and MP4. It requires the installed Playwright browser, FFmpeg and the local scouting PNGs. Narration and final capture are gated on the selected voice.

Read [PRODUCTION.md](PRODUCTION.md) before resuming. It records authorization, decisions, corrections, and outstanding work.
