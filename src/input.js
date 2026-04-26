/**
 * Keyboard Input Handler
 *
 * Enables raw terminal mode to capture individual keypresses
 * (without waiting for Enter), then calls a handler function for each key.
 */

const readline = require('readline');

/**
 * Start listening for keyboard input in raw mode.
 *
 * @param {function} handler - Function called on each keypress: (str, key) => void
 *                             str: printable character (if any)
 *                             key: { name: string, ctrl: boolean, ... }
 * @throws Error if stdin is not a TTY
 */
function startInput(handler) {
  readline.emitKeypressEvents(process.stdin);

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true); // Single character input, no buffering
  } else {
    throw new Error('stdin is not a TTY — run this game directly from a terminal.');
  }

  process.stdin.resume();

  process.stdin.on('keypress', (str, key) => {
    // Ctrl+C always exits
    if (key && key.ctrl && key.name === 'c') {
      restoreTerminal();
      process.exit(0);
    }

    try {
      handler(str, key);
    } catch (err) {
      restoreTerminal();
      console.error(err);
      process.exit(1);
    }
  });
}

/**
 * Restore terminal to normal (non-raw) mode.
 * - Show cursor (hidden during raw mode)
 * - Reset all formatting
 * - Return to buffered input mode
 */
function restoreTerminal() {
  process.stdout.write('\x1b[?25h\x1b[0m\n'); // Show cursor, reset colors
  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false);
    } catch (_) {
      // Silently ignore errors
    }
  }
}

module.exports = { startInput, restoreTerminal };
