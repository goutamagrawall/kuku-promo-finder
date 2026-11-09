# Kuku Promo Finder

A browser-based tool for finding 20-60 second microdrama promos in timestamped English screenplays.

## Use the app

- Browse 250 saved editorial cuts across 50 episodes.
- Filter by episode or search the cut notes.
- Choose **Analyze a script** to upload `.txt` files, paste a script, or try the fictional demo.
- Use one episode per file or paste. The format guide appears beside the input.
- V2 is the default ranker. Editorial, original rules and the cross-genre experiment remain available.
- Inspect timed evidence and export CSV or JSON.

## Privacy

The engine and model weights run in the visitor's browser. Uploaded and pasted screenplay text is processed in memory, without a backend or browser storage. The page's security policy blocks outgoing script connections.

This repository contains only the public frontend, model weights, fictional demo, and saved editorial cut timecodes and paraphrases. Original Kuku screenplays, footage, private review packets and training source material are excluded.

Exporting a private review packet deliberately creates a local download containing excerpts from the visitor's input. Keep that downloaded packet private.

## Run locally

Open `index.html` in a browser. Alternatively, serve this folder with any static web server. There is no build step or package installation.

## GitHub Pages

Publish the repository's `main` branch, root folder. `.nojekyll` keeps the files unchanged. All application assets use relative paths, so a GitHub Pages project URL works without code changes.

## Verification and limits

The source passed 19 offline functional checks covering library pagination and filtering, file and paste handlers, rankers, evidence, review import, error states and generated CSV/JSON contents. All 250 library cuts have valid 20-60 second durations. Real-browser visual and native-input verification remained blocked by the original environment's browser access policy.

The app suggests screenplay-based edit points. Check the cut points against footage. Scores estimate editorial fit and do not establish advertising performance.
