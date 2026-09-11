(() => {
  "use strict";

  const BOARD_SIZE = 4;
  const STORAGE_VERSION = 2;
  const LEGACY_STORAGE_VERSION = 1;
  const GAME_STORAGE_KEY = "classic-2048-game";
  const BEST_STORAGE_KEY = "classic-2048-best";
  const MAX_UNDO_HISTORY = 10;
  const TWO_TILE_PROBABILITY = 0.9;
  const SWIPE_THRESHOLD = 30;
  const WINNING_TILE = 2048;
  const KEY_DIRECTIONS = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right",
  };

  const elements = {
    board: document.getElementById("board"),
    score: document.getElementById("score"),
    best: document.getElementById("best"),
    newGame: document.getElementById("new-game"),
    undo: document.getElementById("undo"),
    dialog: document.getElementById("game-dialog"),
    dialogTitle: document.getElementById("dialog-title"),
    dialogDescription: document.getElementById("dialog-description"),
    keepPlaying: document.getElementById("keep-playing"),
    dialogNewGame: document.getElementById("dialog-new-game"),
    dialogUndo: document.getElementById("dialog-undo"),
    announcements: document.getElementById("announcements"),
  };

  const state = {
    board: createEmptyBoard(),
    score: 0,
    best: 0,
    hasWinShown: false,
    isGameOver: false,
    undoHistory: [],
    dialogMode: null,
    touchStart: null,
  };

  function createEmptyBoard() {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
  }

  function isValidScore(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function isValidTile(value) {
    return value === 0 || (
      Number.isSafeInteger(value) &&
      value >= 2 &&
      2 ** Math.round(Math.log2(value)) === value
    );
  }

  function hasLegalMoves(board) {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let column = 0; column < BOARD_SIZE; column += 1) {
        const value = board[row][column];
        if (value === 0) return true;
        if (column + 1 < BOARD_SIZE && value === board[row][column + 1]) return true;
        if (row + 1 < BOARD_SIZE && value === board[row + 1][column]) return true;
      }
    }
    return false;
  }

  function hasWinningTile(board) {
    return board.some((row) => row.some((value) => value >= WINNING_TILE));
  }

  function isValidBoard(board) {
    return Array.isArray(board) && board.length === BOARD_SIZE && board.every((row) => (
      Array.isArray(row) && row.length === BOARD_SIZE && row.every(isValidTile)
    ));
  }

  function isValidGameState(game) {
    if (!game || !isValidBoard(game.board)) return false;
    if (game.board.flat().filter((value) => value !== 0).length < 2) return false;
    if (!isValidScore(game.score)) return false;
    if (typeof game.hasWinShown !== "boolean" || typeof game.isGameOver !== "boolean") {
      return false;
    }
    return game.isGameOver === !hasLegalMoves(game.board) &&
      game.hasWinShown === hasWinningTile(game.board);
  }

  function isValidUndoHistory(history) {
    return Array.isArray(history) &&
      history.length <= MAX_UNDO_HISTORY &&
      history.every(isValidGameState);
  }

  function isValidSavedGame(saved) {
    if (!saved || (saved.version !== STORAGE_VERSION && saved.version !== LEGACY_STORAGE_VERSION)) {
      return false;
    }
    if (!isValidGameState(saved)) return false;
    return saved.version === LEGACY_STORAGE_VERSION || isValidUndoHistory(saved.undoHistory);
  }

  function captureGameState() {
    return {
      board: state.board.map((row) => [...row]),
      score: state.score,
      hasWinShown: state.hasWinShown,
      isGameOver: state.isGameOver,
    };
  }

  function restoreGameState(game) {
    state.board = game.board.map((row) => [...row]);
    state.score = game.score;
    state.hasWinShown = game.hasWinShown;
    state.isGameOver = game.isGameOver;
  }

  function saveUndoState() {
    state.undoHistory.push(captureGameState());
    if (state.undoHistory.length > MAX_UNDO_HISTORY) state.undoHistory.shift();
  }

  function restoreGame() {
    try {
      const storedBest = window.localStorage.getItem(BEST_STORAGE_KEY);
      if (storedBest !== null && /^\d+$/.test(storedBest)) {
        const best = Number(storedBest);
        if (isValidScore(best)) state.best = best;
      }
    } catch {
      // Storage may be unavailable in private or restricted browser contexts.
    }

    try {
      const saved = JSON.parse(window.localStorage.getItem(GAME_STORAGE_KEY));
      if (!isValidSavedGame(saved)) return false;
      restoreGameState(saved);
      state.best = Math.max(state.best, state.score);
      state.undoHistory = saved.version === STORAGE_VERSION
        ? saved.undoHistory.map((game) => ({
          ...game,
          board: game.board.map((row) => [...row]),
        }))
        : [];
      return true;
    } catch {
      return false;
    }
  }

  function saveGame() {
    try {
      window.localStorage.setItem(BEST_STORAGE_KEY, String(state.best));
    } catch {
      // Gameplay still works when the browser cannot save progress.
    }
    try {
      window.localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify({
        version: STORAGE_VERSION,
        board: state.board,
        score: state.score,
        hasWinShown: state.hasWinShown,
        isGameOver: state.isGameOver,
        undoHistory: state.undoHistory,
      }));
    } catch {
      // Keep the current game in memory if storage is full or blocked.
    }
  }

  function addRandomTile() {
    const emptyCells = [];
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let column = 0; column < BOARD_SIZE; column += 1) {
        if (state.board[row][column] === 0) emptyCells.push({ row, column });
      }
    }
    if (emptyCells.length === 0) return null;
    const cell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    state.board[cell.row][cell.column] = Math.random() < TWO_TILE_PROBABILITY ? 2 : 4;
    return cell;
  }

  function collapseLine(line) {
    const occupied = line.filter((value) => value !== 0);
    const values = [];
    const mergedIndexes = [];
    let score = 0;

    for (let index = 0; index < occupied.length; index += 1) {
      if (occupied[index] === occupied[index + 1]) {
        const mergedValue = occupied[index] * 2;
        mergedIndexes.push(values.length);
        values.push(mergedValue);
        score += mergedValue;
        index += 1;
      } else {
        values.push(occupied[index]);
      }
    }
    while (values.length < BOARD_SIZE) values.push(0);
    return { values, score, mergedIndexes };
  }

  function getLineCoordinates(direction, line) {
    return Array.from({ length: BOARD_SIZE }, (_, index) => {
      if (direction === "left") return { row: line, column: index };
      if (direction === "right") return { row: line, column: BOARD_SIZE - 1 - index };
      if (direction === "up") return { row: index, column: line };
      return { row: BOARD_SIZE - 1 - index, column: line };
    });
  }

  function calculateMove(direction) {
    const board = createEmptyBoard();
    const mergedCells = [];
    let score = 0;
    let changed = false;

    for (let line = 0; line < BOARD_SIZE; line += 1) {
      const coordinates = getLineCoordinates(direction, line);
      const result = collapseLine(coordinates.map(({ row, column }) => state.board[row][column]));
      score += result.score;
      coordinates.forEach(({ row, column }, index) => {
        board[row][column] = result.values[index];
        if (state.board[row][column] !== board[row][column]) changed = true;
      });
      result.mergedIndexes.forEach((index) => mergedCells.push(coordinates[index]));
    }
    return { board, score, changed, mergedCells };
  }

  function formatNumber(value) {
    return value.toLocaleString();
  }

  function announce(message) {
    elements.announcements.textContent = message;
  }

  function renderBoard(mergedCells = [], spawnedCell = null) {
    const fragment = document.createDocumentFragment();
    const mergedPositions = new Set(mergedCells.map(({ row, column }) => `${row},${column}`));

    state.board.forEach((values, row) => {
      const boardRow = document.createElement("div");
      boardRow.className = "board-row";
      boardRow.setAttribute("role", "row");

      values.forEach((value, column) => {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.dataset.value = String(value);
        if (value >= 8192) tile.dataset.large = "true";
        tile.setAttribute("role", "gridcell");
        tile.setAttribute("aria-label", `Row ${row + 1}, column ${column + 1}: ${value || "empty"}`);
        tile.textContent = value === 0 ? "" : String(value);
        if (mergedPositions.has(`${row},${column}`)) tile.classList.add("tile-merged");
        if (spawnedCell?.row === row && spawnedCell.column === column) tile.classList.add("tile-new");
        boardRow.append(tile);
      });
      fragment.append(boardRow);
    });

    elements.board.replaceChildren(fragment);
    elements.score.textContent = formatNumber(state.score);
    elements.best.textContent = formatNumber(state.best);
    const canUndo = state.undoHistory.length > 0;
    elements.undo.disabled = !canUndo;
    elements.dialogUndo.hidden = !canUndo;
  }

  function showDialog(mode) {
    state.dialogMode = mode;
    state.touchStart = null;
    const won = mode === "win";
    elements.dialogTitle.textContent = won ? "You win!" : "Game over";
    elements.dialogDescription.textContent = won
      ? "You made a 2048 tile! Keep playing to reach a higher tile."
      : `No moves left. You scored ${formatNumber(state.score)} points.`;
    elements.keepPlaying.hidden = !won;
    elements.dialogNewGame.textContent = won ? "New Game" : "Try Again";
    elements.dialog.showModal();
    (won ? elements.keepPlaying : elements.dialogNewGame).focus();
    announce(won
      ? `You reached 2048! Score ${formatNumber(state.score)}. Keep playing or start a new game.`
      : `Game over. No moves left. Final score ${formatNumber(state.score)}. Try again to start a new game.`);
  }

  function closeDialog() {
    if (elements.dialog.open) elements.dialog.close();
    state.dialogMode = null;
  }

  function keepPlaying() {
    if (state.dialogMode !== "win") return;
    closeDialog();
    if (state.isGameOver) {
      showDialog("over");
    } else {
      elements.board.focus({ preventScroll: true });
      announce(`Keep going! Score ${formatNumber(state.score)}.`);
    }
  }

  function move(direction) {
    if (state.isGameOver || state.dialogMode !== null) return;
    const result = calculateMove(direction);
    if (!result.changed) return;

    saveUndoState();
    state.board = result.board;
    state.score += result.score;
    state.best = Math.max(state.best, state.score);
    const spawnedCell = addRandomTile();
    const justWon = !state.hasWinShown && hasWinningTile(state.board);
    if (justWon) state.hasWinShown = true;
    state.isGameOver = !hasLegalMoves(state.board);
    saveGame();
    renderBoard(result.mergedCells, spawnedCell);

    if (justWon) {
      showDialog("win");
    } else if (state.isGameOver) {
      showDialog("over");
    } else {
      const gainMessage = result.score > 0 ? ` Gained ${formatNumber(result.score)} points.` : "";
      announce(`Moved ${direction}. Score ${formatNumber(state.score)}.${gainMessage}`);
    }
  }

  function undoMove() {
    if (state.undoHistory.length === 0) return;
    closeDialog();
    restoreGameState(state.undoHistory.pop());
    state.best = Math.max(state.best, state.score);
    state.touchStart = null;
    saveGame();
    renderBoard();
    announce(`Move undone. Score ${formatNumber(state.score)}.`);
    elements.board.focus({ preventScroll: true });
  }

  function startNewGame(focusBoard = true) {
    closeDialog();
    state.board = createEmptyBoard();
    state.score = 0;
    state.hasWinShown = false;
    state.isGameOver = false;
    state.undoHistory = [];
    state.touchStart = null;
    addRandomTile();
    addRandomTile();
    saveGame();
    renderBoard();
    announce("New game. Score 0. Use arrow keys, W A S D, or swipe to move the tiles.");
    if (focusBoard) elements.board.focus({ preventScroll: true });
  }

  function requestNewGame() {
    if (!window.confirm("Start a new game? Your current progress will be lost.")) return;
    startNewGame();
  }

  function handleDialogNewGame() {
    if (state.dialogMode === "over") {
      startNewGame();
    } else {
      requestNewGame();
    }
  }

  function handleKeydown(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const direction = KEY_DIRECTIONS[event.key] || KEY_DIRECTIONS[event.key.toLowerCase()];
    if (!direction) return;
    event.preventDefault();
    move(direction);
  }

  function handleTouchStart(event) {
    state.touchStart = null;
    if (event.touches.length !== 1 || state.isGameOver || state.dialogMode !== null) return;
    const touch = event.touches[0];
    state.touchStart = { identifier: touch.identifier, x: touch.clientX, y: touch.clientY };
  }

  function handleTouchMove(event) {
    if (event.touches.length !== 1) state.touchStart = null;
    if (state.touchStart !== null && event.cancelable) event.preventDefault();
  }

  function handleTouchEnd(event) {
    const start = state.touchStart;
    state.touchStart = null;
    if (start === null || event.touches.length !== 0) return;
    const touch = Array.from(event.changedTouches).find((item) => item.identifier === start.identifier);
    if (!touch) return;
    const horizontal = touch.clientX - start.x;
    const vertical = touch.clientY - start.y;
    if (Math.max(Math.abs(horizontal), Math.abs(vertical)) < SWIPE_THRESHOLD) return;
    if (Math.abs(horizontal) > Math.abs(vertical)) {
      move(horizontal > 0 ? "right" : "left");
    } else {
      move(vertical > 0 ? "down" : "up");
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    // A subsequent controller means a newly installed worker has taken over.
    // Reload once so an open tab immediately runs the matching app shell. Game
    // progress is already saved in localStorage after every completed move.
    const wasAlreadyControlled = navigator.serviceWorker.controller !== null;
    let hasReloadedForUpdate = false;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!wasAlreadyControlled || hasReloadedForUpdate) return;
      hasReloadedForUpdate = true;
      window.location.reload();
    });

    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js", {
        scope: "./",
        // Check the worker script itself against the server instead of an HTTP
        // cache, so a deployed worker update is discovered promptly.
        updateViaCache: "none",
      }).then((registration) => {
        // Browsers may throttle their automatic update checks. Request one on
        // every app load; failures are harmless because the active app remains.
        registration.update().catch(() => {});
      }).catch(() => {
        // The game continues normally when workers are unsupported or blocked.
      });
    }, { once: true });
  }

  document.addEventListener("keydown", handleKeydown);
  elements.newGame.addEventListener("click", requestNewGame);
  elements.undo.addEventListener("click", undoMove);
  elements.dialogNewGame.addEventListener("click", handleDialogNewGame);
  elements.dialogUndo.addEventListener("click", undoMove);
  elements.keepPlaying.addEventListener("click", keepPlaying);
  elements.dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    keepPlaying();
  });
  elements.board.addEventListener("touchstart", handleTouchStart, { passive: true });
  elements.board.addEventListener("touchmove", handleTouchMove, { passive: false });
  elements.board.addEventListener("touchend", handleTouchEnd, { passive: true });
  elements.board.addEventListener("touchcancel", () => { state.touchStart = null; }, { passive: true });

  if (restoreGame()) {
    renderBoard();
    saveGame();
    if (state.isGameOver) showDialog("over");
    else announce(`Game restored. Score ${formatNumber(state.score)}.`);
  } else {
    startNewGame(false);
  }

  registerServiceWorker();
})();
