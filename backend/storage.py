"""
Data models and JSON-based storage layer.
No SQL, no ORM - just Python dataclasses and file persistence.
"""

import json
import os
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Dict, List, Optional
from pathlib import Path
import uuid
import logger


@dataclass
class Game:
    """Normalized chess game model."""
    game_id: str
    platform: str  # "chess.com" or "lichess"
    date: str  # ISO format datetime string
    white_player: str
    black_player: str
    result: str  # "1-0", "0-1", "1/2-1/2"
    time_control: str
    rated: bool
    pgn: str  # Full PGN notation
    moves: List[str]  # List of moves in SAN notation


class GameStorage:
    """Simple file-based storage for chess games using JSON."""

    def __init__(self, data_dir: str = None):
        if data_dir is None:
            # Use path relative to this file (storage.py)
            base_dir = Path(__file__).parent
            data_dir = base_dir / "data"
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.games_file = self.data_dir / "games.json"
        self.games: Dict[str, Game] = {}
        logger.info(f"Initializing GameStorage with data directory: {self.data_dir}")
        self.load()

    def load(self):
        """Load games from JSON file into memory."""
        if self.games_file.exists():
            try:
                logger.debug(f"Loading games from {self.games_file}")
                with open(self.games_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.games = {
                        game_id: Game(**game_data)
                        for game_id, game_data in data.items()
                    }
                logger.info(f"Loaded {len(self.games)} games from storage")
            except Exception as e:
                logger.error(f"Error loading games: {e}")
                logger.exception("Load games exception traceback")
                self.games = {}
        else:
            logger.info("No existing games file found, starting with empty database")
            self.games = {}

    def save(self):
        """Persist games to JSON file."""
        try:
            logger.debug(f"Saving {len(self.games)} games to {self.games_file}")
            data = {
                game_id: asdict(game)
                for game_id, game in self.games.items()
            }
            with open(self.games_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            logger.info(f"Successfully saved {len(self.games)} games to storage")
        except Exception as e:
            logger.error(f"Error saving games: {e}")
            logger.exception("Save games exception traceback")

    def add_game(self, game: Game) -> str:
        """Add a game to storage. Returns game_id."""
        self.games[game.game_id] = game
        return game.game_id

    def get_game(self, game_id: str) -> Optional[Game]:
        """Get a game by ID."""
        return self.games.get(game_id)

    def get_all_games(self) -> List[Game]:
        """Get all games as a list."""
        return list(self.games.values())

    def game_exists(self, platform: str, date: str, white_player: str, black_player: str) -> bool:
        """Check if a game already exists (for deduplication)."""
        for game in self.games.values():
            if (game.platform == platform and
                game.date == date and
                game.white_player == white_player and
                game.black_player == black_player):
                return True
        return False

    def filter_games(
        self,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        color: Optional[str] = None,
        username: Optional[str] = None
    ) -> List[Game]:
        """Filter games by date range and/or color played."""
        filtered = self.games.values()

        if from_date:
            filtered = [g for g in filtered if g.date >= from_date]

        if to_date:
            filtered = [g for g in filtered if g.date <= to_date]

        if color and username:
            if color.lower() == "white":
                filtered = [g for g in filtered if g.white_player.lower() == username.lower()]
            elif color.lower() == "black":
                filtered = [g for g in filtered if g.black_player.lower() == username.lower()]

        return list(filtered)

    def get_position_continuations(self, fen: str, color: str) -> Dict:
        """
        Find all games that reached a given position and return continuations.
        Returns dict with move continuations and their statistics.
        """
        # This will be implemented using python-chess to match positions
        # For MVP, we'll use a simplified approach based on move sequences
        continuations = {}

        # TODO: Implement position matching using FEN
        # For now, return empty dict as placeholder

        return continuations

    def clear_all(self):
        """Clear all games (useful for testing)."""
        self.games = {}
        self.save()


# Singleton instance
storage = GameStorage()
