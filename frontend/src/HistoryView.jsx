import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import EvaluationBar from './EvaluationBar'

const API_BASE = '/api'

function HistoryView() {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [selectedGame, setSelectedGame] = useState(null)
  const [gameDetails, setGameDetails] = useState(null)
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0)
  const [boardPosition, setBoardPosition] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState(null)

  // Set default date range (last 90 days)
  useEffect(() => {
    const today = new Date()
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(today.getDate() - 90)

    setToDate(today.toISOString().split('T')[0])
    setFromDate(ninetyDaysAgo.toISOString().split('T')[0])
  }, [])

  // Load games when date range changes
  useEffect(() => {
    if (fromDate && toDate) {
      loadGames()
    }
  }, [fromDate, toDate])

  // Auto-analyze position when it changes
  useEffect(() => {
    if (boardPosition && selectedGame) {
      analyzePosition()
    }
  }, [boardPosition])

  const loadGames = async () => {
    setLoading(true)
    try {
      // Set to_date to end of day to include all games from that day
      const toDateTime = new Date(toDate)
      toDateTime.setHours(23, 59, 59, 999)

      const response = await axios.get(`${API_BASE}/games`, {
        params: {
          from_date: new Date(fromDate).toISOString(),
          to_date: toDateTime.toISOString()
        }
      })
      setGames(response.data)
    } catch (error) {
      console.error('Error loading games:', error)
    }
    setLoading(false)
  }

  const selectGame = async (gameId) => {
    try {
      const response = await axios.get(`${API_BASE}/games/${gameId}`)
      const details = response.data
      console.log('Game details loaded:', details)
      console.log('Moves array:', details.moves)
      console.log('Number of moves:', details.moves?.length)

      setGameDetails(details)
      setSelectedGame(gameId)
      setCurrentMoveIndex(-1)  // Start before first move
      setAnalysis(null)

      // Initialize chess board at starting position
      const chess = new Chess()
      const startPos = chess.fen()
      console.log('Setting initial position:', startPos)
      setBoardPosition(startPos)
    } catch (error) {
      console.error('Error loading game details:', error)
    }
  }

  const goToMove = (moveIndex) => {
    if (!gameDetails) {
      console.log('goToMove: gameDetails is null')
      return
    }

    console.log(`goToMove called with moveIndex: ${moveIndex}`)
    console.log(`Total moves available: ${gameDetails.moves?.length}`)

    try {
      const chess = new Chess()
      for (let i = 0; i <= moveIndex && i < gameDetails.moves.length; i++) {
        console.log(`Playing move ${i}: ${gameDetails.moves[i]}`)
        const move = chess.move(gameDetails.moves[i])
        if (!move) {
          console.error(`Failed to play move ${i}: ${gameDetails.moves[i]}`)
          return
        }
        console.log(`Move ${i} played successfully, new position: ${chess.fen()}`)
      }
      const newPos = chess.fen()
      console.log(`Setting board position to: ${newPos}`)
      setBoardPosition(newPos)
      setCurrentMoveIndex(moveIndex)
    } catch (error) {
      console.error('Error in goToMove:', error, error.stack)
    }
  }

  const nextMove = () => {
    console.log('nextMove clicked')
    console.log(`currentMoveIndex: ${currentMoveIndex}`)
    console.log(`gameDetails exists: ${!!gameDetails}`)
    console.log(`moves length: ${gameDetails?.moves?.length}`)

    if (!gameDetails) {
      console.log('nextMove: gameDetails is null')
      return
    }
    if (currentMoveIndex < gameDetails.moves.length - 1) {
      console.log(`Calling goToMove(${currentMoveIndex + 1})`)
      goToMove(currentMoveIndex + 1)
    } else {
      console.log('Already at last move')
    }
  }

  const prevMove = () => {
    console.log('prevMove clicked')
    console.log(`currentMoveIndex: ${currentMoveIndex}`)

    if (!gameDetails) {
      console.log('prevMove: gameDetails is null')
      return
    }
    if (currentMoveIndex >= 0) {
      if (currentMoveIndex === 0) {
        // Go to starting position
        console.log('Going to starting position')
        const chess = new Chess()
        setBoardPosition(chess.fen())
        setCurrentMoveIndex(-1)
      } else {
        console.log(`Calling goToMove(${currentMoveIndex - 1})`)
        goToMove(currentMoveIndex - 1)
      }
    } else {
      console.log('Already at starting position')
    }
  }

  const analyzePosition = async () => {
    if (!boardPosition) return

    setAnalyzing(true)
    try {
      const response = await axios.post(`${API_BASE}/analyze/position`, {
        fen: boardPosition,
        depth: 20
      })
      setAnalysis(response.data)
    } catch (error) {
      console.error('Error analyzing position:', error)
    }
    setAnalyzing(false)
  }

  return (
    <div style={styles.container}>
      <h2>Game data base</h2>

      <div style={styles.filters}>
        <div style={styles.filterGroup}>
          <label style={styles.label}>From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={styles.input}
          />
        </div>
        <div style={styles.filterGroup}>
          <label style={styles.label}>To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={styles.input}
          />
        </div>
        <button onClick={loadGames} style={styles.filterButton}>
          Apply Filters
        </button>
      </div>

      {loading ? (
        <p>Loading games...</p>
      ) : selectedGame ? (
        <div style={styles.gameView}>
          <button onClick={() => setSelectedGame(null)} style={styles.backButton}>
            ← Back to List
          </button>

          <div style={styles.gameContent}>
            <div style={styles.boardSection}>
              <div style={styles.boardWithEval}>
                {analysis && (
                  <div style={styles.evalBarContainer}>
                    <EvaluationBar
                      evaluation={analysis.score}
                      orientation="white"
                    />
                  </div>
                )}
                <div style={styles.boardContainer}>
                  <Chessboard
                    position={boardPosition || 'start'}
                    arePiecesDraggable={false}
                    key={boardPosition}
                    customArrows={analysis?.best_move ? [
                      [
                        analysis.best_move.substring(0, 2),
                        analysis.best_move.substring(2, 4),
                        'rgba(76, 175, 80, 0.5)'
                      ]
                    ] : []}
                  />
                </div>
              </div>
              <div style={styles.controls}>
                <button onClick={prevMove} style={styles.controlButton}>
                  ← Previous
                </button>
                <span style={styles.moveCounter}>
                  {currentMoveIndex === -1 ? 'Start' : `Move ${currentMoveIndex + 1}`} / {gameDetails?.moves.length || 0}
                </span>
                <button onClick={nextMove} style={styles.controlButton}>
                  Next →
                </button>
              </div>

              {/* Game notation */}
              <div style={styles.notationContainer}>
                <h4 style={styles.notationTitle}>Game Notation</h4>
                <div style={styles.notation}>
                  {gameDetails?.moves.map((move, idx) => {
                    const moveNum = Math.floor(idx / 2) + 1
                    const isWhiteMove = idx % 2 === 0
                    const isCurrent = idx === currentMoveIndex

                    return (
                      <span key={idx} style={styles.moveItem}>
                        {isWhiteMove && <span style={styles.moveNumber}>{moveNum}.</span>}
                        <span
                          style={{
                            ...styles.moveText,
                            ...(isCurrent ? styles.currentMove : {})
                          }}
                          onClick={() => goToMove(idx)}
                        >
                          {move}
                        </span>
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>

            <div style={styles.infoSection}>
              <h3>Game Info</h3>
              <div style={styles.infoGrid}>
                <div style={styles.infoRow}>
                  <strong>Platform:</strong> {gameDetails?.platform}
                </div>
                <div style={styles.infoRow}>
                  <strong>Date:</strong> {gameDetails?.date ? new Date(gameDetails.date).toLocaleDateString() : 'N/A'}
                </div>
                <div style={styles.infoRow}>
                  <strong>White:</strong> {gameDetails?.white_player}
                </div>
                <div style={styles.infoRow}>
                  <strong>Black:</strong> {gameDetails?.black_player}
                </div>
                <div style={styles.infoRow}>
                  <strong>Result:</strong> {gameDetails?.result}
                </div>
                <div style={styles.infoRow}>
                  <strong>Time Control:</strong> {gameDetails?.time_control}
                </div>
              </div>

              {analysis && (
                <div style={styles.analysis}>
                  <h3>Position Analysis</h3>
                  <div style={styles.analysisContent}>
                    <div style={styles.analysisRow}>
                      <strong>Evaluation:</strong> {analysis.score}
                    </div>
                    <div style={styles.analysisRow}>
                      <strong>Best Move:</strong> {analysis.best_move || 'N/A'}
                    </div>
                    <div style={styles.analysisRow}>
                      <strong>Depth:</strong> {analysis.depth}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={styles.gamesList}>
          <h3>{games.length} games found</h3>
          {games.length === 0 ? (
            <p>No games found. Try importing games or adjusting the date range.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>White</th>
                  <th style={styles.th}>Black</th>
                  <th style={styles.th}>Result</th>
                  <th style={styles.th}>Platform</th>
                  <th style={styles.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {games.map((game) => (
                  <tr key={game.game_id} style={styles.tr}>
                    <td style={styles.td}>{new Date(game.date).toLocaleDateString()}</td>
                    <td style={styles.td}>{game.white_player}</td>
                    <td style={styles.td}>{game.black_player}</td>
                    <td style={styles.td}>{game.result}</td>
                    <td style={styles.td}>{game.platform}</td>
                    <td style={styles.td}>
                      <button
                        onClick={() => selectGame(game.game_id)}
                        style={styles.viewButton}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    background: 'white',
    borderRadius: '8px',
    padding: '30px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  filters: {
    display: 'flex',
    gap: '20px',
    marginTop: '20px',
    marginBottom: '30px',
    alignItems: 'flex-end'
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  label: {
    fontWeight: 'bold',
    fontSize: '14px'
  },
  input: {
    padding: '8px 12px'
  },
  filterButton: {
    background: '#4CAF50',
    color: 'white',
    padding: '10px 20px'
  },
  gamesList: {
    marginTop: '20px'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '20px'
  },
  th: {
    textAlign: 'left',
    padding: '12px',
    borderBottom: '2px solid #ddd',
    background: '#f5f5f5',
    fontWeight: 'bold'
  },
  tr: {
    borderBottom: '1px solid #eee'
  },
  td: {
    padding: '12px'
  },
  viewButton: {
    background: '#2196F3',
    color: 'white',
    padding: '6px 12px',
    fontSize: '12px'
  },
  gameView: {
    marginTop: '20px'
  },
  backButton: {
    background: '#757575',
    color: 'white',
    marginBottom: '20px'
  },
  gameContent: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '30px'
  },
  boardSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px'
  },
  boardWithEval: {
    display: 'flex',
    gap: '15px',
    alignItems: 'stretch'
  },
  boardContainer: {
    maxWidth: '500px',
    width: '100%'
  },
  evalBarContainer: {
    width: '50px',
    minHeight: '500px'
  },
  controls: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  controlButton: {
    background: '#2196F3',
    color: 'white',
    padding: '8px 16px'
  },
  moveCounter: {
    fontWeight: 'bold'
  },
  notationContainer: {
    marginTop: '10px',
    padding: '15px',
    background: '#f9f9f9',
    borderRadius: '8px',
    border: '1px solid #e0e0e0'
  },
  notationTitle: {
    margin: '0 0 10px 0',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#333'
  },
  notation: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    lineHeight: '1.8'
  },
  moveItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px'
  },
  moveNumber: {
    color: '#666',
    fontSize: '13px',
    fontWeight: 'bold',
    marginRight: '2px'
  },
  moveText: {
    padding: '2px 6px',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'background 0.2s',
    background: 'transparent'
  },
  currentMove: {
    background: '#4CAF50',
    color: 'white',
    fontWeight: 'bold'
  },
  infoSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  infoGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  infoRow: {
    padding: '8px',
    background: '#f5f5f5',
    borderRadius: '4px'
  },
  analysis: {
    marginTop: '20px',
    padding: '20px',
    background: '#e3f2fd',
    borderRadius: '4px'
  },
  analysisContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginTop: '10px'
  },
  analysisRow: {
    padding: '8px',
    background: 'white',
    borderRadius: '4px'
  }
}

export default HistoryView
