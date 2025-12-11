# Bit Flipper

Tiny Python web app showing numbers as binary bits grouped into 8-bit bytes with neon styling and animations.

Modes
- Bits and bytes (default): interpret the input as a number of bits and convert to bytes (floor(bits / 8)). Example: "1024" (bits) becomes 128 bytes — 128 byte-grids all fully lit.
- Binary: interpret the input as a regular integer and render its canonical binary grouped into 8-bit bytes. Example: "1024" (value) becomes two bytes: 0x04 0x00.

E2E tests (Playwright)
--------------------------------
We include Playwright tests to validate large renders and UI features. To run them locally:

1. Install Node.js (if not installed) and project dev dependencies:

```bash
npm install
npx playwright install
```

2. Start the dev server (if not already started). The Playwright config will attempt to start one automatically, but you can run it yourself first:

```bash
python app.py
```

3. Run tests:

```bash
npm run test:e2e
```

Tests will run the server at http://localhost:5000 and assert rendering behaviors, including chunked incremental rendering and keyboard shortcuts.

Quick start

1. Create a virtual environment and install deps:

```bash
python -m venv .venv
source .venv/Scripts/activate   # on bash for Windows the script is under Scripts
pip install -r requirements.txt
```

2. Run the server:

```bash
python app.py
```

3. Open http://localhost:5000

Notes
- Type any integer into the input to see the bits laid out in 8-bit byte blocks.
- The UI scales as the number grows so many byte blocks stay visible.
