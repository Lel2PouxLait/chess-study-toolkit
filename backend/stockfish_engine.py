"""
Stockfish chess engine integration.
Auto-detects platform and uses bundled Stockfish binary.
"""

import os
import platform
import subprocess
from pathlib import Path
from typing import Dict, Optional, List
import chess
import chess.engine
import logger


class StockfishEngine:
    """Wrapper for Stockfish chess engine with platform auto-detection."""

    def __init__(self):
        self.engine_path = self._get_stockfish_path()
        self.engine: Optional[chess.engine.SimpleEngine] = None

    def _get_stockfish_path(self) -> Path:
        """Detect platform and return path to appropriate Stockfish binary."""
        system = platform.system().lower()
        logger.debug(f"Detecting Stockfish binary for platform: {system}")

        base_dir = Path(__file__).parent / "stockfish"

        if system == "windows":
            stockfish_path = base_dir / "windows" / "stockfish.exe"
        elif system == "darwin":  # macOS
            stockfish_path = base_dir / "macos" / "stockfish"
        else:  # Linux and others
            stockfish_path = base_dir / "linux" / "stockfish"

        if not stockfish_path.exists():
            logger.critical(f"Stockfish binary not found at {stockfish_path}")
            raise FileNotFoundError(
                f"Stockfish binary not found at {stockfish_path}. "
                f"Platform detected: {system}"
            )

        # Make sure it's executable (important for macOS/Linux)
        if system != "windows":
            os.chmod(stockfish_path, 0o755)

        logger.info(f"Stockfish binary located at: {stockfish_path}")
        return stockfish_path

    def start(self):
        """Start the Stockfish engine."""
        if self.engine is None:
            try:
                logger.info(f"Starting Stockfish engine from {self.engine_path}")
                self.engine = chess.engine.SimpleEngine.popen_uci(str(self.engine_path))
                logger.info("Stockfish engine started successfully")
            except Exception as e:
                logger.error(f"Failed to start Stockfish: {e}")
                logger.exception("Stockfish start exception traceback")
                raise RuntimeError(f"Failed to start Stockfish: {e}")

    def stop(self):
        """Stop the Stockfish engine."""
        if self.engine:
            logger.info("Stopping Stockfish engine")
            self.engine.quit()
            self.engine = None
            logger.info("Stockfish engine stopped")

    def analyze_position(
        self,
        fen: str,
        depth: int = 20,
        multipv: int = 1
    ) -> Dict:
        """
        Analyze a position and return evaluation.

        Args:
            fen: Position in FEN notation
            depth: Search depth (default 20)
            multipv: Number of principal variations to return (default 1)

        Returns:
            Dict with score, best_move, and principal_variation
        """
        if not self.engine:
            self.start()

        try:
            board = chess.Board(fen)

            # Run analysis
            info = self.engine.analyse(
                board,
                chess.engine.Limit(depth=depth),
                multipv=multipv
            )

            # Handle multipv results (list) vs single result (dict)
            if isinstance(info, list):
                info = info[0]  # Take first variation if multiple

            # Extract score
            score_val = info.get("score")
            if score_val:
                # Convert score to centipawns from white's perspective
                if score_val.is_mate():
                    mate_in = score_val.white().mate()
                    score = f"M{mate_in}" if mate_in > 0 else f"M{-mate_in}"
                    score_cp = 10000 if mate_in > 0 else -10000
                else:
                    score_cp = score_val.white().score()
                    score = f"{score_cp / 100:.2f}"
            else:
                score = "0.00"
                score_cp = 0

            # Extract best move
            pv = info.get("pv", [])
            best_move = str(pv[0]) if pv else None

            # Extract principal variation (first 5 moves)
            principal_variation = [str(move) for move in pv[:5]] if pv else []

            return {
                "score": score,
                "score_cp": score_cp,
                "best_move": best_move,
                "principal_variation": principal_variation,
                "depth": depth,
                "fen": fen
            }

        except Exception as e:
            print(f"Error analyzing position: {e}")
            return {
                "error": str(e),
                "score": "0.00",
                "score_cp": 0,
                "best_move": None,
                "principal_variation": [],
                "fen": fen
            }

    def get_best_move(self, fen: str, time_limit: float = 1.0) -> Optional[str]:
        """
        Get the best move for a position with a time limit.

        Args:
            fen: Position in FEN notation
            time_limit: Time limit in seconds (default 1.0)

        Returns:
            Best move in UCI notation (e.g., "e2e4")
        """
        if not self.engine:
            self.start()

        try:
            board = chess.Board(fen)
            result = self.engine.play(
                board,
                chess.engine.Limit(time=time_limit)
            )
            return str(result.move) if result.move else None

        except Exception as e:
            print(f"Error getting best move: {e}")
            return None

    def __enter__(self):
        """Context manager entry."""
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.stop()


# Singleton instance
stockfish = StockfishEngine()
