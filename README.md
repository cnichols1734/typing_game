# Space Typer 2

Orbital defense typing shooter. Lock a contact with its first letter. Each correct keystroke is a beam. Hold the gunline.

## Run locally

Terminal 1 — API (Flask + SQLite):

```bash
python3.14 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Use the same Python that created the venv (`python3.14` if `python` points at another version).

Terminal 2 — game (Vite + Phaser):

```bash
cd frontend
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Vite proxies `/api` to Flask on port 5000.

## Production

```bash
cd frontend && npm run build
source .venv/bin/activate
python app.py
```

Flask serves `frontend/dist` and the score/daily API.

Local scores use SQLite at `instance/aphelion.db`. Production uses Railway Postgres via `DATABASE_URL`. GitHub Pages is retired; the live game is the Flask app.

## Play

- **Arcade** — endless waves, random seed
- **Daily** — shared seed, one posted mark per callsign per UTC day (better score replaces)
- Esc pauses. Three-letter callsign posts WPM, accuracy, streak, and score
