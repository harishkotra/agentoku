export const BOARD_SIZE = 9;

export function cloneBoard(board) {
  return board.map((row) => [...row]);
}

export function isBoardShapeValid(board) {
  if (!Array.isArray(board) || board.length !== BOARD_SIZE) return false;
  return board.every(
    (row) =>
      Array.isArray(row) &&
      row.length === BOARD_SIZE &&
      row.every((cell) => Number.isInteger(cell) && cell >= 0 && cell <= 9),
  );
}

function hasNoDuplicates(values) {
  const seen = new Set();
  for (const value of values) {
    if (value === 0) continue;
    if (seen.has(value)) return false;
    seen.add(value);
  }
  return true;
}

export function isBoardValid(board) {
  if (!isBoardShapeValid(board)) return false;

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    if (!hasNoDuplicates(board[row])) return false;
  }

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    const column = [];
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      column.push(board[row][col]);
    }
    if (!hasNoDuplicates(column)) return false;
  }

  for (let startRow = 0; startRow < BOARD_SIZE; startRow += 3) {
    for (let startCol = 0; startCol < BOARD_SIZE; startCol += 3) {
      const box = [];
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          box.push(board[startRow + row][startCol + col]);
        }
      }
      if (!hasNoDuplicates(box)) return false;
    }
  }

  return true;
}

export function isValidMove(board, row, col, value) {
  if (!isBoardShapeValid(board)) return false;
  if (!Number.isInteger(row) || row < 0 || row > 8) return false;
  if (!Number.isInteger(col) || col < 0 || col > 8) return false;
  if (!Number.isInteger(value) || value < 1 || value > 9) return false;
  if (board[row][col] !== 0) return false;

  for (let i = 0; i < BOARD_SIZE; i += 1) {
    if (board[row][i] === value) return false;
    if (board[i][col] === value) return false;
  }

  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r += 1) {
    for (let c = boxCol; c < boxCol + 3; c += 1) {
      if (board[r][c] === value) return false;
    }
  }

  return true;
}

export function isSolved(board) {
  if (!isBoardValid(board)) return false;
  return board.every((row) => row.every((cell) => cell >= 1 && cell <= 9));
}

export function applyMove(board, row, col, value) {
  if (!isValidMove(board, row, col, value)) return false;
  board[row][col] = value;
  return true;
}

export function preserveClues(basePuzzle, candidateBoard) {
  if (!isBoardShapeValid(basePuzzle) || !isBoardShapeValid(candidateBoard)) return false;

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (basePuzzle[row][col] !== 0 && basePuzzle[row][col] !== candidateBoard[row][col]) {
        return false;
      }
    }
  }

  return true;
}
