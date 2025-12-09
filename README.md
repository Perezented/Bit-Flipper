# Bit Viewer

Tiny Python web app showing numbers as binary bits grouped into 8-bit bytes with neon styling and animations.

Modes
- Bit count → bytes (default): interpret the input as a number of bits and convert to bytes (floor(bits / 8)). Example: "1024" (bits) becomes 128 bytes — 128 byte-grids all fully lit.
- Binary bytes: interpret the input as a regular integer and render its canonical binary grouped into 8-bit bytes. Example: "1024" (value) becomes two bytes: 0x04 0x00.

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
