"""
Data models and JSON-based storage layer.
No SQL, no ORM - just Python dataclasses and file persistence.
"""

import json
import os
import threading
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


@dataclass
class DatabaseMetadata:
    """Metadata for a database."""
    id: str
    name: str
    created_at: str  # ISO format
    last_modified: str  # ISO format
    game_count: int
    file_path: str


class GameStorage:
    """Simple file-based storage for chess games using JSON."""

    def __init__(self, db_file: str):
        """
        Initialize storage for a single database file.

        Args:
            db_file: Full path to the database JSON file (e.g., "backend/data/db_001.json")
        """
        self.games_file = Path(db_file)
        # Ensure parent directory exists
        self.games_file.parent.mkdir(parents=True, exist_ok=True)
        self.games: Dict[str, Game] = {}
        logger.info(f"Initializing GameStorage with file: {self.games_file}")
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


class DatabaseManager:
    """Manages multiple GameStorage instances for multi-database support."""

    def __init__(self, data_dir: str = None):
        """
        Initialize database manager.

        Args:
            data_dir: Directory containing database files. Defaults to backend/data/
        """
        if data_dir is None:
            base_dir = Path(__file__).parent
            data_dir = base_dir / "data"

        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.metadata_file = self.data_dir / "databases.json"
        self.databases: Dict[str, GameStorage] = {}  # Lazy-loaded pool
        self.metadata: Dict[str, DatabaseMetadata] = {}
        self._lock = threading.Lock()  # Thread safety
        self._next_id = 1  # Counter for auto-generating IDs

        logger.info(f"Initializing DatabaseManager with data directory: {self.data_dir}")
        self.load_metadata()

    def load_metadata(self):
        """Load database metadata from databases.json"""
        if self.metadata_file.exists():
            try:
                logger.debug(f"Loading database metadata from {self.metadata_file}")
                with open(self.metadata_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.metadata = {
                        db_id: DatabaseMetadata(**db_data)
                        for db_id, db_data in data.items()
                    }
                logger.info(f"Loaded metadata for {len(self.metadata)} databases")

                # Find max ID number for auto-increment
                if self.metadata:
                    max_id = max(int(db_id.split('_')[1]) for db_id in self.metadata.keys())
                    self._next_id = max_id + 1
            except Exception as e:
                logger.error(f"Error loading database metadata: {e}")
                logger.exception("Load metadata exception traceback")
                self.metadata = {}
        else:
            logger.info("No metadata file found, starting with empty database list")
            self.metadata = {}

    def save_metadata(self):
        """Persist database metadata to databases.json"""
        try:
            logger.debug(f"Saving metadata for {len(self.metadata)} databases")
            data = {
                db_id: asdict(db_meta)
                for db_id, db_meta in self.metadata.items()
            }
            with open(self.metadata_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            logger.info("Successfully saved database metadata")
        except Exception as e:
            logger.error(f"Error saving database metadata: {e}")
            logger.exception("Save metadata exception traceback")

    def get_database(self, db_id: str) -> GameStorage:
        """
        Lazy-load and return database instance.
        Thread-safe caching - only loads from disk once.

        Args:
            db_id: Database ID (e.g., "db_001")

        Returns:
            GameStorage instance for the database

        Raises:
            ValueError: If db_id not found in metadata
        """
        # Validate db_id exists
        if db_id not in self.metadata:
            raise ValueError(f"Database {db_id} not found")

        # Check cache first (lock-free read)
        if db_id in self.databases:
            return self.databases[db_id]

        # Not in cache - acquire lock and load
        with self._lock:
            # Double-check after acquiring lock (another thread may have loaded)
            if db_id in self.databases:
                return self.databases[db_id]

            # Load from disk
            file_path = self.data_dir / self.metadata[db_id].file_path
            storage = GameStorage(str(file_path))
            self.databases[db_id] = storage

            logger.info(f"Loaded database {db_id} ({self.metadata[db_id].name}) with {len(storage.games)} games")
            return storage

    def create_database(self, name: str) -> DatabaseMetadata:
        """
        Create a new database with auto-generated ID.

        Args:
            name: User-friendly name for the database

        Returns:
            DatabaseMetadata for the newly created database
        """
        with self._lock:
            # Generate new ID
            db_id = f"db_{self._next_id:03d}"
            self._next_id += 1

            # Create metadata
            now = datetime.now().isoformat()
            file_path = f"db_{db_id}.json"  # Relative to data_dir
            metadata = DatabaseMetadata(
                id=db_id,
                name=name,
                created_at=now,
                last_modified=now,
                game_count=0,
                file_path=file_path
            )

            # Save metadata
            self.metadata[db_id] = metadata
            self.save_metadata()

            # Create empty database file
            db_file_path = self.data_dir / file_path
            storage = GameStorage(str(db_file_path))
            storage.save()  # Create empty JSON file
            self.databases[db_id] = storage

            logger.info(f"Created new database: {db_id} ({name})")
            return metadata

    def delete_database(self, db_id: str):
        """
        Delete a database and its file.

        Args:
            db_id: Database ID to delete

        Raises:
            ValueError: If db_id not found
        """
        if db_id not in self.metadata:
            raise ValueError(f"Database {db_id} not found")

        with self._lock:
            # Remove from cache
            if db_id in self.databases:
                del self.databases[db_id]

            # Delete file
            file_path = self.data_dir / self.metadata[db_id].file_path
            if file_path.exists():
                file_path.unlink()
                logger.info(f"Deleted database file: {file_path}")

            # Remove metadata
            db_name = self.metadata[db_id].name
            del self.metadata[db_id]
            self.save_metadata()

            logger.info(f"Deleted database: {db_id} ({db_name})")

    def rename_database(self, db_id: str, new_name: str) -> DatabaseMetadata:
        """
        Rename a database.

        Args:
            db_id: Database ID to rename
            new_name: New name for the database

        Returns:
            Updated DatabaseMetadata

        Raises:
            ValueError: If db_id not found
        """
        if db_id not in self.metadata:
            raise ValueError(f"Database {db_id} not found")

        with self._lock:
            self.metadata[db_id].name = new_name
            self.metadata[db_id].last_modified = datetime.now().isoformat()
            self.save_metadata()

            logger.info(f"Renamed database {db_id} to: {new_name}")
            return self.metadata[db_id]

    def list_databases(self) -> List[DatabaseMetadata]:
        """
        Get list of all database metadata.

        Returns:
            List of DatabaseMetadata objects
        """
        return list(self.metadata.values())

    def update_game_count(self, db_id: str):
        """
        Update game count in metadata for a database.

        Args:
            db_id: Database ID to update

        Raises:
            ValueError: If db_id not found
        """
        if db_id not in self.metadata:
            raise ValueError(f"Database {db_id} not found")

        storage = self.get_database(db_id)
        self.metadata[db_id].game_count = len(storage.games)
        self.metadata[db_id].last_modified = datetime.now().isoformat()
        self.save_metadata()

        logger.debug(f"Updated game count for {db_id}: {len(storage.games)} games")
