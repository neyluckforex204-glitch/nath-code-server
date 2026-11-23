NATH-CODE v2.1 — UNIFIED DEPLOYMENT

FILES TO PUT IN THE ROOT OF YOUR GITHUB REPOSITORY
- server.js
- index.html
- package.json

RENDER SETTINGS
- Build Command: npm install
- Start Command: npm start
- Node: 18 or newer

ENVIRONMENT VARIABLES
- FOOTBALL_API_KEY = your API-Football key (the key you already added)
  The server also accepts NATH_FOOTBALL_KEY. Do not publish this key in HTML or GitHub.
- OPENAI_API_KEY = optional; only add if you have an OpenAI API key. The Cloud AI module remains marked optional until configured.

WHAT IS CONNECTED
- Dashboard served at /
- GET /health
- GET /api/brain/status
- POST /api/football/analyze {"homeTeam":"Arsenal","awayTeam":"Chelsea"}
- POST /api/nath/analyze {"odds":[1.2,1.5,2.0, ...]} (minimum 10 valid rounds)
- POST /api/brain/analyze with {"module":"football",...} or {"module":"aviator",...}
- POST /api/nath/history for history sync

The app automatically points to the same Render server when opened. Aviator analysis is statistical/historical and cannot predict independent future rounds. Football probabilities are estimates, not guarantees. Cloud AI is optional and is not activated unless OPENAI_API_KEY is configured and an AI endpoint is implemented.
