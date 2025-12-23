"""
Game fetchers for chess.com and lichess.org.
Fetches public games and normalizes them to the unified Game model.
"""

import httpx
from typing import List, Dict, Callable
import uuid
from datetime import datetime
import chess.pgn
import io
from storage import Game


class ChessComFetcher:
    """Fetch games from chess.com public API."""

    BASE_URL = "https://api.chess.com/pub/player"

    async def fetch_games(
        self,
        username: str,
        progress_callback: Callable[[int], None] = None
    ) -> List[Game]:
        """
        Fetch all available games for a chess.com user.

        Args:
            username: Chess.com username
            progress_callback: Optional callback for progress updates (0-100)

        Returns:
            List of normalized Game objects
        """
        games = []

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get list of archives (monthly game collections)
                archives_url = f"{self.BASE_URL}/{username}/games/archives"
                response = await client.get(archives_url)
                response.raise_for_status()

                archives = response.json().get("archives", [])

                if not archives:
                    return []

                total_archives = len(archives)

                # Fetch games from each archive
                for i, archive_url in enumerate(archives):
                    try:
                        archive_response = await client.get(archive_url)
                        archive_response.raise_for_status()

                        archive_data = archive_response.json()
                        archive_games = archive_data.get("games", [])

                        for game_data in archive_games:
                            game = self._normalize_game(game_data, username)
                            if game:
                                games.append(game)

                        # Update progress
                        if progress_callback:
                            progress = int(((i + 1) / total_archives) * 100)
                            progress_callback(progress)

                    except Exception as e:
                        print(f"Error fetching archive {archive_url}: {e}")
                        continue

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                print(f"Chess.com user not found: {username}")
            else:
                print(f"HTTP error fetching chess.com games: {e}")
        except Exception as e:
            print(f"Error fetching chess.com games: {e}")

        return games

    def _normalize_game(self, game_data: Dict, username: str) -> Game:
        """Normalize chess.com game data to unified Game model."""
        try:
            white = game_data.get("white", {}).get("username", "Unknown")
            black = game_data.get("black", {}).get("username", "Unknown")

            # Extract result
            if "white" in game_data and "result" in game_data["white"]:
                white_result = game_data["white"]["result"]
                if white_result == "win":
                    result = "1-0"
                elif white_result in ["checkmated", "resigned", "timeout", "abandoned"]:
                    result = "0-1"
                else:
                    result = "1/2-1/2"
            else:
                result = "1/2-1/2"

            # Get PGN and extract moves
            pgn_text = game_data.get("pgn", "")
            moves = self._extract_moves_from_pgn(pgn_text)

            # Get timestamp
            end_time = game_data.get("end_time", 0)
            date = datetime.fromtimestamp(end_time).isoformat() if end_time else datetime.now().isoformat()

            # Time control
            time_control = game_data.get("time_control", "unknown")

            # Rated flag
            rated = game_data.get("rated", False)

            return Game(
                game_id=str(uuid.uuid4()),
                platform="chess.com",
                date=date,
                white_player=white,
                black_player=black,
                result=result,
                time_control=time_control,
                rated=rated,
                pgn=pgn_text,
                moves=moves
            )

        except Exception as e:
            print(f"Error normalizing chess.com game: {e}")
            return None

    def _extract_moves_from_pgn(self, pgn_text: str) -> List[str]:
        """Extract moves from PGN text."""
        try:
            pgn_io = io.StringIO(pgn_text)
            game = chess.pgn.read_game(pgn_io)
            if game:
                board = game.board()
                moves = []
                for move in game.mainline_moves():
                    moves.append(board.san(move))
                    board.push(move)
                return moves
            return []
        except Exception as e:
            print(f"Error extracting moves from PGN: {e}")
            return []


class LichessFetcher:
    """Fetch games from lichess.org public API."""

    BASE_URL = "https://lichess.org/api"

    async def fetch_games(
        self,
        username: str,
        progress_callback: Callable[[int], None] = None
    ) -> List[Game]:
        """
        Fetch all available games for a lichess user.

        Args:
            username: Lichess username
            progress_callback: Optional callback for progress updates (0-100)

        Returns:
            List of normalized Game objects
        """
        games = []

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Lichess returns games as NDJSON (newline-delimited JSON)
                url = f"{self.BASE_URL}/games/user/{username}"
                params = {
                    "max": 500,  # Fetch up to 500 most recent games for MVP
                    "pgnInJson": "true"
                }

                async with client.stream("GET", url, params=params) as response:
                    response.raise_for_status()

                    game_count = 0
                    async for line in response.aiter_lines():
                        if line.strip():
                            try:
                                import json
                                game_data = json.loads(line)
                                game = self._normalize_game(game_data, username)
                                if game:
                                    games.append(game)
                                    game_count += 1

                                    # Update progress (estimate based on batch size)
                                    if progress_callback and game_count % 10 == 0:
                                        # Since we don't know total, update incrementally
                                        progress = min(90, (game_count / 500) * 100)
                                        progress_callback(int(progress))

                            except Exception as e:
                                print(f"Error parsing lichess game: {e}")
                                continue

                if progress_callback:
                    progress_callback(100)

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                print(f"Lichess user not found: {username}")
            else:
                print(f"HTTP error fetching lichess games: {e}")
        except Exception as e:
            print(f"Error fetching lichess games: {e}")

        return games

    def _normalize_game(self, game_data: Dict, username: str) -> Game:
        """Normalize lichess game data to unified Game model."""
        try:
            players = game_data.get("players", {})
            white = players.get("white", {}).get("user", {}).get("name", "Unknown")
            black = players.get("black", {}).get("user", {}).get("name", "Unknown")

            # Extract result
            status = game_data.get("status")
            winner = game_data.get("winner")

            if winner == "white":
                result = "1-0"
            elif winner == "black":
                result = "0-1"
            else:
                result = "1/2-1/2"

            # Get PGN and extract moves
            pgn_text = game_data.get("pgn", "")
            moves = self._extract_moves_from_pgn(pgn_text)

            # Get timestamp
            created_at = game_data.get("createdAt", 0)
            date = datetime.fromtimestamp(created_at / 1000).isoformat() if created_at else datetime.now().isoformat()

            # Time control
            clock = game_data.get("clock", {})
            if clock:
                initial = clock.get("initial", 0)
                increment = clock.get("increment", 0)
                time_control = f"{initial}+{increment}"
            else:
                time_control = "correspondence"

            # Rated flag
            rated = game_data.get("rated", False)

            return Game(
                game_id=str(uuid.uuid4()),
                platform="lichess",
                date=date,
                white_player=white,
                black_player=black,
                result=result,
                time_control=time_control,
                rated=rated,
                pgn=pgn_text,
                moves=moves
            )

        except Exception as e:
            print(f"Error normalizing lichess game: {e}")
            return None

    def _extract_moves_from_pgn(self, pgn_text: str) -> List[str]:
        """Extract moves from PGN text."""
        try:
            pgn_io = io.StringIO(pgn_text)
            game = chess.pgn.read_game(pgn_io)
            if game:
                board = game.board()
                moves = []
                for move in game.mainline_moves():
                    moves.append(board.san(move))
                    board.push(move)
                return moves
            return []
        except Exception as e:
            print(f"Error extracting moves from PGN: {e}")
            return []
