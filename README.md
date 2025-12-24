# Mastermind

Reference
- Mastermind (board game): https://en.wikipedia.org/wiki/Mastermind_(board_game)

Play the live site
- https://mastermind.soh.re

Quick overview
- Server: binds to port 8080 by default (http://localhost:8080)
- Frontend: served from the `static/` directory; root (`/`) serves `static/index.html`

Defaults
- `codeLength`: 4
- `colors`: 6
- `attempts`: 10


Notes for users
- Colors are represented as integers in the range `[0, colors-1]`.
- `exact` counts correct color in the correct position.
- `partial` counts correct color in the wrong position (no double-counting).
- When attempts run out and the player loses, the API returns the secret in the `secret` field.
- The frontend at `/` implements the game UI; you can also use the API directly to build bots or alternate clients.

Files of interest
- `main.go`: Go server and API implementation
- `static/`: frontend assets (`index.html`, `app.js`)

Contributing
- Patches, issues and improvements welcome. See the `LICENSE` for project license.
