# Qwirkle Scorer

A browser-based scoring app for the tile game Qwirkle. Open `index.html` (or `npm start` and visit http://localhost:8000). Game state is saved in your browser.

## How it works
Place tiles on the board for each turn; the app validates the play and scores it automatically.

Rules enforced / scored:
- Lines hold at most 6 tiles, all one color (distinct shapes) or all one shape (distinct colors); no duplicates.
- A turn's tiles must be in one row or column, with no gaps, and touch the existing board (the first play is just a line).
- Each line formed or extended scores 1 point per tile in it; a tile in both a row and a column counts in both. A lone first tile scores 1.
- Completing a line of 6 is a **Qwirkle**: +6 bonus (12 total).
- Only 3 copies of each of the 36 tiles exist (108 total); 6 tiles per hand, with the bag tracked.
- Exchange tiles (requires enough tiles in the bag) or pass for 0 points.
- First player to empty their hand once the bag is empty gets +6 and ends the game; highest score wins.

Undo reverses the last turn. Run rule tests with `npm test`.
