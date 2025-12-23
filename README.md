# Chess Study Toolkit

A web application for aggregating chess games from multiple platforms, analyzing them with Stockfish, and providing advanced statistical insights - all for free.

## Features

- **Game Import**: Fetch games from chess.com and lichess.org
- **History View**: Browse, filter, and replay your games with Stockfish analysis
- **Opening Explorer**: Interactive opening exploration with move statistics and engine evaluation

## Tech Stack

- **Backend**: Python + FastAPI
- **Frontend**: React + Vite
- **Chess Engine**: Stockfish (bundled)
- **Storage**: JSON file-based (no SQL)

## Project Structure

```
.
├── backend/
│   ├── main.py                 # FastAPI application
│   ├── storage.py              # Data models and JSON storage
│   ├── fetchers.py             # Chess.com and Lichess API clients
│   ├── stockfish_engine.py     # Stockfish integration
│   ├── requirements.txt        # Python dependencies
│   ├── stockfish/              # Bundled Stockfish binaries
│   │   ├── windows/stockfish.exe
│   │   ├── macos/stockfish
│   │   └── linux/stockfish
│   └── data/                   # Game storage (created at runtime)
│       └── games.json
│
└── frontend/
    ├── src/
    │   ├── App.jsx             # Main application component
    │   ├── HistoryView.jsx     # Game history view
    │   ├── ExplorerView.jsx    # Opening explorer
    │   └── main.jsx            # React entry point
    ├── index.html
    ├── package.json
    └── vite.config.js
```

## Setup and Installation

### Backend

1. Install Python dependencies:
```bash
cd backend
pip install -r requirements.txt
```

2. Start the backend server:
```bash
python main.py
```

The backend will run on `http://localhost:8000`

### Frontend

1. Install Node dependencies:
```bash
cd frontend
npm install
```

2. Start the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

## Usage

### 1. Import Games

- Navigate to the "Import Games" tab
- Enter your chess.com and/or lichess username
- Click "Import Games" and wait for completion
- The app will fetch all available public games and deduplicate existing ones

### 2. View Game History

- Go to the "History" tab
- Filter games by date range (default: last 90 days)
- Click "View" on any game to see the full game
- Use Previous/Next buttons to replay moves
- Click "Analyze Position" to get Stockfish evaluation at any point

### 3. Explore Openings

- Navigate to the "Opening Explorer" tab
- Select your color (White or Black)
- Play moves on the board or click on suggested continuations
- See statistics from your games:
  - Number of times each move was played
  - Win/Draw/Loss percentages
  - Stockfish evaluation for each continuation
- Best move according to Stockfish is highlighted

## API Endpoints

### Import
- `POST /api/import` - Start game import task
- `GET /api/import/status/{task_id}` - Get import progress

### Games
- `GET /api/games` - List games (with filters)
- `GET /api/games/{game_id}` - Get full game details

### Analysis
- `POST /api/analyze/position` - Analyze position with Stockfish
- `POST /api/explorer/query` - Query opening explorer

## Storage

Games are stored in `backend/data/games.json` as a simple JSON file. Each game includes:

- Unique ID
- Platform (chess.com or lichess)
- Players, result, date
- Time control, rated status
- Full PGN and move list

## Notes

- **No authentication required** - only public games are fetched
- **Deduplication** - Re-importing skips existing games
- **Stockfish** - Bundled binaries for Windows, macOS, and Linux
- **MVP focus** - Minimal UI styling, core functionality works

## Future Improvements (Out of Scope for MVP)

- User authentication
- Cloud deployment
- Advanced filtering
- Mobile optimization
- Repertoire building
- Spaced repetition training

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

### Third-Party Software

This project bundles [Stockfish](https://stockfishchess.org/), a free and open-source chess engine licensed under GPL v3. See [STOCKFISH-LICENSE](STOCKFISH-LICENSE) for details.

- Stockfish repository: https://github.com/official-stockfish/Stockfish
- Stockfish is Copyright (C) 2004-2024 The Stockfish developers
