# Space Typer

A ZType-inspired typing game where players control a stationary spaceship at the bottom of the screen and must type words to destroy enemy ships descending from the top.

## How to Play

1. Open `space_typer.html` in any modern web browser (Chrome, Firefox, Safari, or Edge).
2. Click the "Start Game" button to begin.
3. Type the words displayed on the enemy ships to destroy them.
4. Typing the first letter of a word "locks on" to the corresponding ship.
5. Each correct keystroke fires a laser at the targeted ship.
6. If any ship reaches the bottom of the screen, you lose a life.
7. Game ends when you lose all lives (starting with 3).

## Game Features

- **Progressive Difficulty**: The game gets harder as you advance through rounds.
  - Round 1: 2-3 letter words, slow-moving ships
  - Round 2: 3-4 letter words, slightly faster ships
  - Round 3+: Mix of shorter words plus occasional "boss" ships with longer words (6+ letters)

- **Visual Feedback**:
  - Laser beams connect your ship to the target when typing correctly
  - Explosions are proportional to ship size (larger explosions for boss ships)
  - Space-themed background with stars
  - HUD showing score, lives, and current round

- **Word Selection**:
  - No two ships on screen can have words starting with the same letter
  - Words are drawn from a database of common American English words

## Technical Details

- Single HTML file with embedded JavaScript and CSS
- Canvas-based rendering
- No external dependencies or libraries
- Responsive design that works on different screen sizes

## Development

This game was created as a single HTML file with embedded JavaScript and CSS. All game assets are generated programmatically without external images.

## License

This project is open source and available for educational purposes. 