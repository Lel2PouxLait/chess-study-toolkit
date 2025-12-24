"""
FastAPI backend for chess training application.
Provides endpoints for game import, retrieval, analysis, and opening exploration.
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime, timedelta
import uuid
import asyncio
import chess
import chess.pgn
import io

from storage import DatabaseManager, DatabaseMetadata, Game
from fetchers import ChessComFetcher, LichessFetcher
from stockfish_engine import stockfish
import logger
from pathlib import Path
import json

# FastAPI app
app = FastAPI(title="Chess Training API", version="1.0.0")

# Load openings database
OPENINGS_DB = {}
try:
    openings_path = Path(__file__).parent / "openings.json"
    with open(openings_path, 'r') as f:
        OPENINGS_DB = json.load(f)
    logger.logger.info(f"Loaded openings database with {len(OPENINGS_DB)} root openings")
except Exception as e:
    logger.logger.warning(f"Could not load openings database: {e}")


def detect_opening(moves: List[str]) -> Dict[str, str]:
    """
    Detect opening name and ECO code from a list of moves.

    Args:
        moves: List of moves in SAN format (e.g., ['e4', 'e5', 'Nf3']) or UCI format

    Returns:
        Dict with 'name' and 'eco' keys, or {'name': 'Unknown Opening', 'eco': ''}
    """
    if not moves or not OPENINGS_DB:
        return {'name': 'Unknown Opening', 'eco': ''}

    # Convert SAN moves to UCI format for matching against the opening tree
    uci_moves = []
    try:
        board = chess.Board()
        for san_move in moves:
            # Try to parse as SAN first
            try:
                move = board.parse_san(san_move)
                uci_moves.append(move.uci())
                board.push(move)
            except:
                # If SAN parsing fails, assume it's already UCI
                uci_moves.append(san_move)
                try:
                    board.push_uci(san_move)
                except:
                    # Invalid move, stop here
                    break
    except Exception as e:
        logger.logger.warning(f"Error converting moves for opening detection: {e}")
        return {'name': 'Unknown Opening', 'eco': ''}

    # Now match against opening tree using UCI moves
    current = OPENINGS_DB
    last_known = {'name': 'Unknown Opening', 'eco': ''}

    for move in uci_moves:
        if move in current:
            node = current[move]
            # Update last known opening
            if 'name' in node:
                last_known = {'name': node['name'], 'eco': node.get('eco', '')}
            # Move deeper in the tree
            current = node.get('moves', {})
        else:
            # No more matches in the tree
            break

    return last_known

# Global database manager (initialized on startup)
db_manager: DatabaseManager = None

# CORS middleware (allow frontend to access API)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_migration():
    """
    Migrate from old single-file system to multi-database system.
    Archives old games.json if it exists.
    """
    global db_manager

    data_dir = Path(__file__).parent / "data"
    old_games_file = data_dir / "games.json"

    if old_games_file.exists():
        logger.info("Found old games.json - running migration")
        backup_file = data_dir / "games_backup.json"

        # Rename to backup
        old_games_file.rename(backup_file)
        logger.info(f"Backed up games.json to {backup_file}")
        logger.info("Migration complete. Users can create new databases via the UI.")

    # Initialize database manager
    db_manager = DatabaseManager()
    logger.info(f"Database manager initialized with {len(db_manager.metadata)} databases")


# Background task tracking
import_tasks: Dict[str, Dict] = {}
puzzle_tasks: Dict[str, Dict] = {}


# Pydantic models for request/response
class ImportRequest(BaseModel):
    chesscom_username: Optional[str] = None
    lichess_username: Optional[str] = None


class ImportResponse(BaseModel):
    task_id: str
    message: str


class ImportStatus(BaseModel):
    task_id: str
    status: str  # "running", "completed", "failed"
    progress: int  # 0-100
    total_fetched: int
    new_games_added: int
    duplicates_skipped: int
    error: Optional[str] = None


class AnalyzePositionRequest(BaseModel):
    fen: str
    depth: int = 20


class ExplorerQueryRequest(BaseModel):
    fen: str
    color: str  # "white" or "black"
    moves: Optional[List[str]] = None  # Move history in SAN format (e.g., ["e4", "e5", "Nf3"])
    from_date: Optional[str] = None
    to_date: Optional[str] = None
    time_control: Optional[List[str]] = None  # Time control filters (e.g., ["bullet", "blitz"])
    usernames: Optional[List[str]] = None  # List of usernames to identify which color user played


class CreateDatabaseRequest(BaseModel):
    name: str


class RenameDatabaseRequest(BaseModel):
    name: str


class PuzzleCandidate(BaseModel):
    """Represents a potential puzzle position"""
    puzzle_id: str  # UUID
    game_id: str
    fen: str
    move_number: int  # Which move number (1-based)
    ply: int  # Which ply (0-based, move_number*2 - (1 or 2))
    best_move: str  # Stockfish's best move in UCI format
    best_move_san: str  # Stockfish's best move in SAN format
    principal_variation: List[str]  # Full solution sequence in UCI format (first 5 moves)
    played_move: Optional[str] = None  # What was actually played (if Type A puzzle)
    played_move_san: Optional[str] = None
    position_eval_cp: int  # Position eval before the move (centipawns)
    best_move_eval_cp: int  # Eval after best move (centipawns)
    played_move_eval_cp: Optional[int] = None  # Eval after played move (if Type A)
    eval_loss_cp: int  # Centipawn loss (0 for Type B puzzles, actual loss for Type A)
    difficulty: str  # "easy", "medium", "hard"
    puzzle_type: str  # "mistake" or "tactical"
    opening_name: str
    opening_eco: str
    player_color: str  # "white" or "black"
    opponent: str
    date: str
    platform: str
    pgn: str  # Full PGN of the game


class GeneratePuzzlesRequest(BaseModel):
    username: str
    max_puzzles: Optional[int] = 50  # Limit number of puzzles generated
    difficulty: Optional[List[str]] = None  # Filter: ["easy", "medium", "hard"]
    min_ply: Optional[int] = 0  # Only puzzles from ply >= min_ply (default 0 = start of game)
    max_ply: Optional[int] = 20  # Only puzzles from ply <= max_ply (default 20 = 10 moves)


class PuzzleResponse(BaseModel):
    puzzles: List[PuzzleCandidate]
    total_games_analyzed: int
    puzzles_found: int


class PuzzleGenerationResponse(BaseModel):
    task_id: str
    message: str


class PuzzleGenerationStatus(BaseModel):
    task_id: str
    status: str  # "running", "completed", "failed"
    progress: int  # 0-100
    current_game: int
    total_games: int
    puzzles_found: int
    error: Optional[str] = None
    puzzles: Optional[List[PuzzleCandidate]] = None  # Only when completed


@app.get("/")
async def root():
    """Health check endpoint."""
    logger.debug("Health check endpoint accessed")
    total_databases = len(db_manager.metadata) if db_manager else 0
    logger.info(f"Health check: {total_databases} databases available")
    return {
        "status": "ok",
        "message": "Chess Training API is running",
        "total_databases": total_databases
    }


# ===========================
# Database Management Endpoints
# ===========================

@app.get("/api/databases")
async def list_databases():
    """Get list of all databases."""
    logger.debug("Listing all databases")
    databases = db_manager.list_databases()
    logger.info(f"Returning {len(databases)} databases")
    return databases


@app.post("/api/databases")
async def create_database(request: CreateDatabaseRequest):
    """Create a new database."""
    logger.info(f"Creating new database: {request.name}")
    try:
        metadata = db_manager.create_database(request.name)
        logger.info(f"Database created successfully: {metadata.id}")
        return metadata
    except Exception as e:
        logger.error(f"Error creating database: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/databases/{db_id}")
async def delete_database(db_id: str):
    """Delete a database."""
    logger.info(f"Deleting database: {db_id}")
    try:
        db_manager.delete_database(db_id)
        logger.info(f"Database deleted successfully: {db_id}")
        return {"success": True, "message": f"Database {db_id} deleted"}
    except ValueError as e:
        logger.warning(f"Database not found: {db_id}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting database: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/databases/{db_id}")
async def rename_database(db_id: str, request: RenameDatabaseRequest):
    """Rename a database."""
    logger.info(f"Renaming database {db_id} to: {request.name}")
    try:
        metadata = db_manager.rename_database(db_id, request.name)
        logger.info(f"Database renamed successfully: {db_id}")
        return metadata
    except ValueError as e:
        logger.warning(f"Database not found: {db_id}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error renaming database: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===========================
# Game Import Endpoints
# ===========================

@app.post("/api/import", response_model=ImportResponse)
async def import_games(request: ImportRequest, background_tasks: BackgroundTasks, db_id: str):
    """
    Start background task to import games from chess.com and/or lichess.
    Returns a task_id for tracking progress.

    Args:
        db_id: Database ID to import games into
    """
    logger.info(f"Import request received for database {db_id} - chess.com: {request.chesscom_username}, lichess: {request.lichess_username}")

    # Validate database exists
    if db_id not in db_manager.metadata:
        logger.warning(f"Import request rejected: database {db_id} not found")
        raise HTTPException(status_code=400, detail=f"Database {db_id} not found")

    if not request.chesscom_username and not request.lichess_username:
        logger.warning("Import request rejected: no username provided")
        raise HTTPException(status_code=400, detail="At least one username required")

    task_id = str(uuid.uuid4())
    logger.info(f"Created import task {task_id} for database {db_id}")

    # Initialize task status
    import_tasks[task_id] = {
        "status": "running",
        "progress": 0,
        "total_fetched": 0,
        "new_games_added": 0,
        "duplicates_skipped": 0,
        "error": None
    }

    # Start background task
    background_tasks.add_task(
        run_import_task,
        task_id,
        db_id,
        request.chesscom_username,
        request.lichess_username
    )

    logger.debug(f"Background task started for import {task_id}")
    return ImportResponse(
        task_id=task_id,
        message="Import started"
    )


@app.get("/api/import/status/{task_id}", response_model=ImportStatus)
async def get_import_status(task_id: str):
    """Get the status of an import task."""
    if task_id not in import_tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = import_tasks[task_id]
    return ImportStatus(
        task_id=task_id,
        status=task["status"],
        progress=task["progress"],
        total_fetched=task["total_fetched"],
        new_games_added=task["new_games_added"],
        duplicates_skipped=task["duplicates_skipped"],
        error=task.get("error")
    )


async def run_import_task(
    task_id: str,
    db_id: str,
    chesscom_username: Optional[str],
    lichess_username: Optional[str]
):
    """Background task to fetch and import games."""
    logger.info(f"Starting import task {task_id} for database {db_id}")
    try:
        # Get database storage
        storage = db_manager.get_database(db_id)

        total_fetched = 0
        new_games_added = 0
        duplicates_skipped = 0

        tasks_to_run = []
        if chesscom_username:
            tasks_to_run.append(("chess.com", chesscom_username))
            logger.debug(f"Task {task_id}: Added chess.com import for {chesscom_username}")
        if lichess_username:
            tasks_to_run.append(("lichess", lichess_username))
            logger.debug(f"Task {task_id}: Added lichess import for {lichess_username}")

        total_tasks = len(tasks_to_run)

        for idx, (platform, username) in enumerate(tasks_to_run):
            logger.info(f"Task {task_id}: Fetching games from {platform} for {username}")
            platform_progress_offset = (idx / total_tasks) * 100
            platform_progress_range = 100 / total_tasks

            def progress_callback(platform_progress):
                """Update task progress."""
                overall_progress = int(platform_progress_offset + (platform_progress / 100) * platform_progress_range)
                import_tasks[task_id]["progress"] = min(overall_progress, 99)

            # Fetch games
            if platform == "chess.com":
                fetcher = ChessComFetcher()
                games = await fetcher.fetch_games(username, progress_callback)
            else:
                fetcher = LichessFetcher()
                games = await fetcher.fetch_games(username, progress_callback)

            logger.info(f"Task {task_id}: Fetched {len(games)} games from {platform}")

            # Add games to storage (with deduplication)
            for game in games:
                total_fetched += 1

                # Check for duplicates
                if storage.game_exists(
                    game.platform,
                    game.date,
                    game.white_player,
                    game.black_player
                ):
                    duplicates_skipped += 1
                else:
                    storage.add_game(game)
                    new_games_added += 1

            logger.debug(f"Task {task_id}: Processed {platform} - New: {new_games_added}, Duplicates: {duplicates_skipped}")

        # Save to file
        storage.save()
        logger.info(f"Task {task_id}: Saved games to storage")

        # Update game count in metadata
        db_manager.update_game_count(db_id)
        logger.debug(f"Task {task_id}: Updated game count for database {db_id}")

        # Mark complete
        import_tasks[task_id].update({
            "status": "completed",
            "progress": 100,
            "total_fetched": total_fetched,
            "new_games_added": new_games_added,
            "duplicates_skipped": duplicates_skipped
        })
        logger.info(f"Task {task_id} completed successfully - Total: {total_fetched}, New: {new_games_added}, Duplicates: {duplicates_skipped}")

    except Exception as e:
        import_tasks[task_id].update({
            "status": "failed",
            "error": str(e),
            "progress": 0
        })
        logger.error(f"Import task {task_id} failed: {e}")
        logger.exception(f"Full traceback for task {task_id}")


@app.get("/api/games")
async def get_games(
    db_id: str,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    color: Optional[str] = None,
    username: Optional[str] = None
):
    """
    Get games with optional filters.
    Default: last 90 days.

    Args:
        db_id: Database ID to query
    """
    logger.debug(f"Get games request for database {db_id} - from: {from_date}, to: {to_date}, color: {color}, username: {username}")

    # Validate database exists
    if db_id not in db_manager.metadata:
        raise HTTPException(status_code=400, detail=f"Database {db_id} not found")

    # Get database storage
    storage = db_manager.get_database(db_id)

    # Default date range: last 90 days
    if not from_date:
        from_date = (datetime.now() - timedelta(days=90)).isoformat()
    if not to_date:
        to_date = datetime.now().isoformat()

    games = storage.filter_games(from_date, to_date, color, username)
    logger.info(f"Retrieved {len(games)} games from database {db_id} matching filters")

    # Return simplified game summaries
    return [
        {
            "game_id": g.game_id,
            "platform": g.platform,
            "date": g.date,
            "white_player": g.white_player,
            "black_player": g.black_player,
            "result": g.result,
            "time_control": g.time_control,
            "rated": g.rated
        }
        for g in sorted(games, key=lambda x: x.date, reverse=True)
    ]


@app.get("/api/games/{game_id}")
async def get_game(game_id: str, db_id: str):
    """
    Get full game details including PGN and moves.

    Args:
        db_id: Database ID to query
    """
    logger.debug(f"Get game request for game_id: {game_id} in database {db_id}")

    # Validate database exists
    if db_id not in db_manager.metadata:
        raise HTTPException(status_code=400, detail=f"Database {db_id} not found")

    # Get database storage
    storage = db_manager.get_database(db_id)

    game = storage.get_game(game_id)
    if not game:
        logger.warning(f"Game not found: {game_id} in database {db_id}")
        raise HTTPException(status_code=404, detail="Game not found")

    logger.debug(f"Retrieved game {game_id} with {len(game.moves)} moves")

    # Detect opening from the game moves
    opening_info = detect_opening(game.moves)

    return {
        "game_id": game.game_id,
        "platform": game.platform,
        "date": game.date,
        "white_player": game.white_player,
        "black_player": game.black_player,
        "result": game.result,
        "time_control": game.time_control,
        "rated": game.rated,
        "pgn": game.pgn,
        "moves": game.moves,
        "opening_name": opening_info['name'],
        "opening_eco": opening_info['eco']
    }


@app.post("/api/analyze/position")
async def analyze_position(request: AnalyzePositionRequest):
    """Analyze a position with Stockfish."""
    logger.debug(f"Analyze position request - FEN: {request.fen[:50]}..., depth: {request.depth}")
    try:
        # Ensure Stockfish is started
        if not stockfish.engine:
            logger.info("Starting Stockfish engine for analysis")
            stockfish.start()

        analysis = stockfish.analyze_position(request.fen, request.depth)
        logger.info(f"Analysis completed - Score: {analysis.get('score', 'N/A')}, Best move: {analysis.get('best_move', 'N/A')}")
        return analysis

    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        logger.exception("Analysis exception traceback")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.post("/api/explorer/query")
async def explorer_query(request: ExplorerQueryRequest, db_id: str):
    """
    Query the opening explorer.
    Returns all continuations from the database for a given position,
    plus Stockfish analysis.

    Args:
        db_id: Database ID to query
    """
    logger.info(f"Explorer query for database {db_id} - Color: {request.color}, Usernames: {request.usernames}, Time control: {request.time_control}")
    logger.debug(f"Explorer query FEN: {request.fen}")

    try:
        # Validate database exists
        if db_id not in db_manager.metadata:
            raise HTTPException(status_code=400, detail=f"Database {db_id} not found")

        # Get database storage
        storage = db_manager.get_database(db_id)

        # Parse the position
        board = chess.Board(request.fen)

        # Find all games that reached this position
        continuations = find_continuations(
            storage,
            board,
            request.color,
            request.from_date,
            request.to_date,
            request.time_control,
            request.usernames
        )
        logger.debug(f"Found {len(continuations)} continuations in database {db_id}")

        # Get Stockfish evaluation for current position
        if not stockfish.engine:
            logger.info("Starting Stockfish engine for explorer")
            stockfish.start()

        position_eval = stockfish.analyze_position(request.fen, depth=18)

        # Get Stockfish best move
        best_move_uci = position_eval.get("best_move")
        best_move_san = None
        if best_move_uci:
            try:
                move = chess.Move.from_uci(best_move_uci)
                best_move_san = board.san(move)
            except:
                pass

        # Detect opening from the move history
        # Use moves from request if provided, otherwise try to get from board.move_stack
        if request.moves:
            opening_info = detect_opening(request.moves)
        else:
            move_history = [move.uci() for move in board.move_stack]
            opening_info = detect_opening(move_history)

        return {
            "fen": request.fen,
            "opening_name": opening_info['name'],
            "opening_eco": opening_info['eco'],
            "position_eval": position_eval,
            "best_move_stockfish": best_move_san,
            "best_move_uci": best_move_uci,
            "continuations": continuations,
            "total_games": sum(c["count"] for c in continuations)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Explorer query failed: {str(e)}")


@app.post("/api/puzzles/generate", response_model=PuzzleGenerationResponse)
async def generate_puzzles_endpoint(request: GeneratePuzzlesRequest, background_tasks: BackgroundTasks, db_id: str):
    """
    Start puzzle generation as a background task.

    This endpoint starts a background task that scans games where the user played
    and identifies positions where they made mistakes or where tactical opportunities existed.

    Args:
        request: GeneratePuzzlesRequest with username and filters
        background_tasks: FastAPI BackgroundTasks
        db_id: Database ID to search in

    Returns:
        PuzzleGenerationResponse with task_id for tracking progress
    """
    # Validate database exists
    if db_id not in db_manager.metadata:
        raise HTTPException(status_code=400, detail=f"Database {db_id} not found")

    # Generate unique task ID
    task_id = str(uuid.uuid4())

    # Initialize task status
    puzzle_tasks[task_id] = {
        "task_id": task_id,
        "status": "running",
        "progress": 0,
        "current_game": 0,
        "total_games": 0,
        "puzzles_found": 0,
        "error": None,
        "puzzles": None
    }

    # Start background task
    background_tasks.add_task(
        run_puzzle_generation_task,
        task_id=task_id,
        db_id=db_id,
        username=request.username,
        max_puzzles=request.max_puzzles or 50,
        difficulty_filter=request.difficulty,
        min_ply=request.min_ply or 0,
        max_ply=request.max_ply or 20
    )

    logger.logger.info(f"Started puzzle generation task {task_id} for user '{request.username}' in database {db_id}")

    return PuzzleGenerationResponse(
        task_id=task_id,
        message="Puzzle generation started"
    )


@app.get("/api/puzzles/status/{task_id}", response_model=PuzzleGenerationStatus)
async def get_puzzle_generation_status(task_id: str):
    """Get the status of a puzzle generation task."""
    if task_id not in puzzle_tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = puzzle_tasks[task_id]

    return PuzzleGenerationStatus(
        task_id=task["task_id"],
        status=task["status"],
        progress=task["progress"],
        current_game=task["current_game"],
        total_games=task["total_games"],
        puzzles_found=task["puzzles_found"],
        error=task.get("error"),
        puzzles=task.get("puzzles")
    )


def classify_time_control(time_control_str: str) -> str:
    """
    Classify a time control string into bullet/blitz/rapid/classical/correspondence.

    Time control formats:
    - "180+0" (lichess format: seconds+increment)
    - "3+0" (minutes+increment)
    - "600" (just seconds)
    - "correspondence"
    """
    tc = time_control_str.lower()

    if "correspondence" in tc or "daily" in tc:
        return "correspondence"

    # Extract base time in seconds
    try:
        # Handle formats like "180+0", "600", "10+5", etc.
        if "+" in tc:
            base_time = tc.split("+")[0]
        else:
            base_time = tc

        # Convert to integer seconds
        seconds = int(base_time)

        # If it's a small number, it might be in minutes
        if seconds < 60:
            seconds = seconds * 60

        # Classify based on total time
        if seconds < 180:  # < 3 minutes
            return "bullet"
        elif seconds < 600:  # < 10 minutes
            return "blitz"
        elif seconds < 1800:  # < 30 minutes
            return "rapid"
        else:
            return "classical"

    except (ValueError, AttributeError):
        # If we can't parse it, default to blitz
        return "blitz"


def find_continuations(
    storage,
    board: chess.Board,
    color: str,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    time_control: Optional[List[str]] = None,
    usernames: Optional[List[str]] = None
) -> List[Dict]:
    """
    Find all continuations from database games.
    Returns list of moves with W/D/L statistics.
    Only includes games where the user played the specified color.

    Args:
        storage: GameStorage instance for the database
    """
    continuations = {}

    # Get all games (optionally filtered by date)
    if from_date or to_date:
        all_games = storage.filter_games(from_date, to_date)
    else:
        all_games = storage.get_all_games()

    # Filter by color (only include games where user played the specified color)
    if usernames:
        # Normalize usernames to lowercase for case-insensitive matching
        usernames_lower = [u.lower() for u in usernames]
        filtered_games = []
        for g in all_games:
            if color.lower() == "white":
                # User played white - check if white_player matches any username
                if g.white_player.lower() in usernames_lower:
                    filtered_games.append(g)
            else:
                # User played black - check if black_player matches any username
                if g.black_player.lower() in usernames_lower:
                    filtered_games.append(g)
        all_games = filtered_games

    # Filter by time control (classify based on time in seconds)
    if time_control and len(time_control) > 0:
        # Normalize time controls to lowercase
        time_controls_lower = [tc.lower() for tc in time_control]
        filtered_games = []
        for g in all_games:
            if classify_time_control(g.time_control) in time_controls_lower:
                filtered_games.append(g)
        all_games = filtered_games

    for game in all_games:
        try:
            # Parse game PGN
            pgn_io = io.StringIO(game.pgn)
            pgn_game = chess.pgn.read_game(pgn_io)
            if not pgn_game:
                continue

            # Replay moves to find this position
            temp_board = chess.Board()
            found_position = False
            next_move = None

            for move in pgn_game.mainline_moves():
                if temp_board.fen().split()[0] == board.fen().split()[0]:  # Compare position only (not turn, etc.)
                    found_position = True
                    next_move = move
                    break
                temp_board.push(move)

            if found_position and next_move:
                move_san = board.san(next_move)

                if move_san not in continuations:
                    continuations[move_san] = {
                        "move": move_san,
                        "count": 0,
                        "wins": 0,
                        "draws": 0,
                        "losses": 0
                    }

                continuations[move_san]["count"] += 1

                # Determine result from player's perspective
                player_color = color.lower()
                if player_color == "white":
                    if game.result == "1-0":
                        continuations[move_san]["wins"] += 1
                    elif game.result == "0-1":
                        continuations[move_san]["losses"] += 1
                    else:
                        continuations[move_san]["draws"] += 1
                else:  # black
                    if game.result == "0-1":
                        continuations[move_san]["wins"] += 1
                    elif game.result == "1-0":
                        continuations[move_san]["losses"] += 1
                    else:
                        continuations[move_san]["draws"] += 1

        except Exception as e:
            continue

    # Convert to list and add percentages
    result = []
    for move_data in continuations.values():
        total = move_data["count"]
        move_data["win_pct"] = round((move_data["wins"] / total) * 100, 1) if total > 0 else 0
        move_data["draw_pct"] = round((move_data["draws"] / total) * 100, 1) if total > 0 else 0
        move_data["loss_pct"] = round((move_data["losses"] / total) * 100, 1) if total > 0 else 0

        # Add Stockfish eval for this move
        try:
            temp_board = board.copy()
            move = temp_board.parse_san(move_data["move"])
            temp_board.push(move)
            move_eval = stockfish.analyze_position(temp_board.fen(), depth=15)
            move_data["stockfish_eval"] = move_eval.get("score", "0.00")
            move_data["stockfish_eval_cp"] = move_eval.get("score_cp", 0)
        except:
            move_data["stockfish_eval"] = "N/A"
            move_data["stockfish_eval_cp"] = 0

        result.append(move_data)

    # Sort by count (most played first)
    result.sort(key=lambda x: x["count"], reverse=True)

    return result


def generate_puzzles_from_games(
    storage,
    username: str,
    max_puzzles: int = 50,
    difficulty_filter: Optional[List[str]] = None,
    min_ply: int = 0,
    max_ply: int = 20,
    progress_callback = None
) -> List[PuzzleCandidate]:
    """
    Scan games and identify puzzle candidates.

    Algorithm:
    1. Filter games where username played
    2. For each game, replay moves between min_ply and max_ply
    3. At each position:
       - Analyze with Stockfish to get best move and eval
       - Compare with played move
       - If eval loss > 100cp OR position has tactical opportunity, create puzzle
    4. Classify difficulty and randomize order before returning

    Args:
        storage: GameStorage instance
        username: Username to find puzzles for
        max_puzzles: Maximum number of puzzles to generate
        difficulty_filter: List of difficulties to include (["easy", "medium", "hard"])
        min_ply: Only analyze positions from ply >= min_ply (default 0)
        max_ply: Only analyze positions up to ply <= max_ply (default 20)

    Returns:
        List of PuzzleCandidate objects (randomized order)
    """
    import random

    puzzles = []
    all_games = storage.get_all_games()
    games_analyzed = 0

    # Randomize game order to get variety across different games
    random.shuffle(all_games)

    # Normalize username for case-insensitive matching
    username_lower = username.lower()

    # Filter games where user played
    user_games = [
        g for g in all_games
        if g.white_player.lower() == username_lower or g.black_player.lower() == username_lower
    ]
    total_user_games = len(user_games)

    # Limit puzzles per game for better variety
    MAX_PUZZLES_PER_GAME = 2

    logger.logger.info(f"Generating puzzles for {username} from {total_user_games} games")

    for game_idx, game in enumerate(user_games):
        # Determine player color and opponent
        if game.white_player.lower() == username_lower:
            player_color = "white"
            opponent = game.black_player
        else:
            player_color = "black"
            opponent = game.white_player

        games_analyzed += 1

        # Report progress
        if progress_callback and total_user_games > 0:
            progress_pct = int((game_idx / total_user_games) * 100)
            progress_callback(progress_pct, game_idx, total_user_games, len(puzzles))

        # Parse PGN and replay game
        try:
            pgn_io = io.StringIO(game.pgn)
            chess_game = chess.pgn.read_game(pgn_io)
            if not chess_game:
                continue

            board = chess_game.board()

            # Get opening info from the game's moves
            opening_info = detect_opening(game.moves)

            # Collect all moves and identify which ones are user's turn within ply range
            all_moves = list(chess_game.mainline_moves())
            user_positions = []  # List of (ply, move) tuples where it's user's turn

            temp_board = chess_game.board()
            for ply, move in enumerate(all_moves):
                # Check if within ply range
                if min_ply <= ply < max_ply:
                    # Check if it's user's turn
                    is_user_turn = (temp_board.turn == chess.WHITE and player_color == "white") or \
                                  (temp_board.turn == chess.BLACK and player_color == "black")
                    if is_user_turn:
                        user_positions.append((ply, move))
                temp_board.push(move)

            # Randomly sample positions to analyze (max 5 per game to avoid analyzing every position)
            if len(user_positions) > 5:
                sampled_positions = random.sample(user_positions, 5)
            else:
                sampled_positions = user_positions

            # Track puzzles found in this game
            puzzles_this_game = 0

            # Analyze sampled positions
            for ply, move in sampled_positions:
                # Stop if we've found enough puzzles in this game
                if puzzles_this_game >= MAX_PUZZLES_PER_GAME:
                    break

                # Replay game up to this position
                board = chess_game.board()
                for i, m in enumerate(all_moves):
                    if i >= ply:
                        break
                    board.push(m)

                # Analyze position BEFORE the move
                fen = board.fen()
                position_analysis = stockfish.analyze_position(fen, depth=18)

                if not position_analysis or position_analysis['best_move'] == 'none':
                    continue

                best_move_uci = position_analysis['best_move']
                position_eval_cp = position_analysis['score_cp']

                # Analyze position AFTER best move
                temp_board = board.copy()
                try:
                    best_move_obj = chess.Move.from_uci(best_move_uci)
                    temp_board.push(best_move_obj)
                    best_move_analysis = stockfish.analyze_position(temp_board.fen(), depth=15)
                    best_move_eval_cp = -best_move_analysis['score_cp']  # Flip perspective
                except:
                    continue

                # Analyze position AFTER played move
                played_move_uci = move.uci()
                temp_board2 = board.copy()
                temp_board2.push(move)
                played_move_analysis = stockfish.analyze_position(temp_board2.fen(), depth=15)
                played_move_eval_cp = -played_move_analysis['score_cp']  # Flip perspective

                # Calculate eval loss (from player's perspective)
                eval_loss = position_eval_cp - played_move_eval_cp

                # Determine if this is a puzzle candidate
                puzzle_type = None

                # Type A: Mistake (played move significantly worse than best move)
                if played_move_uci != best_move_uci and eval_loss >= 100:
                    puzzle_type = "mistake"

                # Type B: Tactical opportunity (best move gives significant advantage)
                # Only if the best move improves position by at least 100cp
                elif (position_eval_cp - best_move_eval_cp) >= 100:
                    puzzle_type = "tactical"
                    eval_loss = 0  # No loss, it's a tactical opportunity

                if puzzle_type:
                    # Classify difficulty
                    if eval_loss < 100:
                        difficulty = "easy"  # Tactical opportunities
                    elif eval_loss < 300:
                        difficulty = "easy"
                    elif eval_loss < 600:
                        difficulty = "medium"
                    else:
                        difficulty = "hard"

                    # Apply difficulty filter
                    if difficulty_filter and difficulty not in difficulty_filter:
                        continue

                    # Convert UCI to SAN
                    try:
                        best_move_san = board.san(best_move_obj)
                        played_move_san = board.san(move) if puzzle_type == "mistake" else None
                    except:
                        continue

                    # Create puzzle
                    puzzle = PuzzleCandidate(
                        puzzle_id=str(uuid.uuid4()),
                        game_id=game.game_id,
                        fen=fen,
                        move_number=(ply // 2) + 1,
                        ply=ply,
                        best_move=best_move_uci,
                        best_move_san=best_move_san,
                        principal_variation=position_analysis.get('principal_variation', [best_move_uci]),
                        played_move=played_move_uci if puzzle_type == "mistake" else None,
                        played_move_san=played_move_san,
                        position_eval_cp=position_eval_cp,
                        best_move_eval_cp=best_move_eval_cp,
                        played_move_eval_cp=played_move_eval_cp if puzzle_type == "mistake" else None,
                        eval_loss_cp=eval_loss,
                        difficulty=difficulty,
                        puzzle_type=puzzle_type,
                        opening_name=opening_info['name'],
                        opening_eco=opening_info['eco'],
                        player_color=player_color,
                        opponent=opponent,
                        date=game.date,
                        platform=game.platform,
                        pgn=game.pgn
                    )

                    puzzles.append(puzzle)
                    puzzles_this_game += 1

                    logger.logger.debug(
                        f"Found {puzzle_type} puzzle: {opening_info['name']} "
                        f"move {puzzle.move_number}, eval loss: {eval_loss}cp, difficulty: {difficulty}"
                    )

                    # Stop if we've found enough puzzles overall
                    if len(puzzles) >= max_puzzles:
                        break

            # Stop scanning games if we have enough puzzles
            if len(puzzles) >= max_puzzles:
                break

        except Exception as e:
            logger.logger.error(f"Error analyzing game {game.game_id}: {e}")
            continue

    logger.logger.info(
        f"Puzzle generation complete: {len(puzzles)} puzzles found from {games_analyzed} games"
    )

    # Final shuffle to ensure maximum randomness
    random.shuffle(puzzles)

    return puzzles


async def run_puzzle_generation_task(
    task_id: str,
    db_id: str,
    username: str,
    max_puzzles: int,
    difficulty_filter: Optional[List[str]],
    min_ply: int,
    max_ply: int
):
    """Background task to generate puzzles with progress tracking."""
    logger.logger.info(f"Starting puzzle generation task {task_id} for user {username} in database {db_id}")

    try:
        # Get database storage
        storage = db_manager.get_database(db_id)

        def progress_callback(progress_pct, current_game, total_games, puzzles_found):
            """Update task progress."""
            puzzle_tasks[task_id].update({
                "progress": min(progress_pct, 99),
                "current_game": current_game,
                "total_games": total_games,
                "puzzles_found": puzzles_found
            })

        # Generate puzzles
        puzzles = generate_puzzles_from_games(
            storage=storage,
            username=username,
            max_puzzles=max_puzzles,
            difficulty_filter=difficulty_filter,
            min_ply=min_ply,
            max_ply=max_ply,
            progress_callback=progress_callback
        )

        # Mark complete
        puzzle_tasks[task_id].update({
            "status": "completed",
            "progress": 100,
            "puzzles": puzzles
        })

        logger.logger.info(f"Puzzle generation task {task_id} completed: {len(puzzles)} puzzles found")

    except Exception as e:
        logger.logger.error(f"Puzzle generation task {task_id} failed: {e}")
        puzzle_tasks[task_id].update({
            "status": "failed",
            "error": str(e)
        })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
