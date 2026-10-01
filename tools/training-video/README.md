# SalonOS training video generator

Makes `guides/training_en.mp4` and `guides/training_hi.mp4` from the real app screens.

Needs Python with `pip install playwright edge-tts imageio-ffmpeg pillow numpy`, Microsoft Edge,
and the local server on http://localhost:8765 (`tools/serve-local.ps1`).

1. Copy `demo.html` and `demo-data.js` into `local-test/` (the real app, offline, with an example outlet).
2. In a work folder holding the `.py` files:
   - `python tts.py` — narration per line (en-IN Neerja, hi-IN Swara voices)
   - `python overlays.py` — caption strips and title cards
   - build `scenes_cap.json` from `script.full_scenes()` (see `batch.py` usage) and run
     `python batch.py scenes_cap.json cap 1.5` — screenshots + highlight positions
   - `python compose.py en` and `python compose.py hi` — writes `out/salonos_training_<lang>.mp4`
     and `out/chapters_<lang>.json`
3. Copy the MP4s to `guides/training_<lang>.mp4`, paste the chapters into `TRAINING_CHAPTERS`
   in `js/13d-guides.js` and bump `TRAINING_VIDEO_REV`.

Edit the narration and the highlighted controls in `script.py`.
