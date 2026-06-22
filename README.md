# PitchTrack

A lightweight baseball pitch chart for recording pitch location, type, velocity, result, count, and game context.

## Run it

Open `index.html` in a browser. No installation or server is required.

The current game saves automatically in the browser. Use **Export CSV** to download the game log for analysis in Excel, Numbers, or Google Sheets.

## Install on iPad for offline use

Host this folder on an HTTPS website once, open it in Safari, and choose **Share → Add to Home Screen**. After installation, the service worker caches the entire app so it can launch without internet. Lineups and games remain in local device storage.

## Included in this MVP

- Clickable pitch-location chart with numbered pitch sequence
- Pitch type, velocity, result, pitcher, batter, count, inning, and outs
- Saved nine-player batting order and six-player pitching staff
- Quick player selection, automatic batter handedness, and next-batter control
- True pitcher/batter dropdowns with quick-fill placeholders and in-game renaming
- Expandable lineups with no fixed player limit and removable roster rows
- Separate Home and Away batting orders and pitching staffs
- Jersey numbers for all batters and pitchers
- 30–110 MPH velocity dropdown that remembers the previous selection
- Installable Home Screen app with full offline caching
- Automatic ball-strike count updates
- Automatic strikeout/in-play outs and half-inning advancement after three outs
- Pitch history and game summary
- Undo, reset, local autosave, and CSV export
- Responsive layout for laptops and tablets
