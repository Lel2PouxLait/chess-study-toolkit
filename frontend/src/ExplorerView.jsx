import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import EvaluationBar from './EvaluationBar'
import { useDatabase } from './DatabaseContext'

const API_BASE = '/api'

function ExplorerView() {
  const { currentDbId } = useDatabase()
  const [game, setGame] = useState(new Chess())
  const [position, setPosition] = useState('start')
  const [color, setColor] = useState('white')
  const [explorerData, setExplorerData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [moveHistory, setMoveHistory] = useState([])
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [selectedTimeControls, setSelectedTimeControls] = useState([])
  const [chesscomUsername, setChesscomUsername] = useState('')
  const [lichessUsername, setLichessUsername] = useState('')

  // Add CSS keyframes for spinner animation
  useEffect(() => {
    const style = document.createElement('style')
    style.innerHTML = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  // Set default date range (last 90 days)
  useEffect(() => {
    const today = new Date()
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(today.getDate() - 90)

    setToDate(today.toISOString().split('T')[0])
    setFromDate(ninetyDaysAgo.toISOString().split('T')[0])
  }, [])

  useEffect(() => {
    // Query explorer when position, color, dates, time control, usernames, or database change
    if (fromDate && toDate && currentDbId) {
      queryExplorer()
    } else if (!currentDbId) {
      setExplorerData(null)
    }
  }, [position, color, fromDate, toDate, selectedTimeControls, chesscomUsername, lichessUsername, currentDbId])

  const queryExplorer = async () => {
    if (!currentDbId) {
      setExplorerData(null)
      return
    }

    setLoading(true)
    try {
      // Set to_date to end of day to include all games from that day
      const toDateTime = new Date(toDate)
      toDateTime.setHours(23, 59, 59, 999)

      // Build usernames array (only include non-empty usernames)
      const usernames = []
      if (chesscomUsername.trim()) usernames.push(chesscomUsername.trim())
      if (lichessUsername.trim()) usernames.push(lichessUsername.trim())

      const response = await axios.post(`${API_BASE}/explorer/query?db_id=${currentDbId}`, {
        fen: game.fen(),
        color: color,
        from_date: new Date(fromDate).toISOString(),
        to_date: toDateTime.toISOString(),
        time_control: selectedTimeControls.length > 0 ? selectedTimeControls : null,
        usernames: usernames.length > 0 ? usernames : null
      })
      setExplorerData(response.data)
    } catch (error) {
      console.error('Error querying explorer:', error)
    }
    setLoading(false)
  }

  const onDrop = (sourceSquare, targetSquare) => {
    try {
      const move = game.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q' // Always promote to queen for simplicity
      })

      if (move === null) return false

      setPosition(game.fen())
      setMoveHistory([...moveHistory, move.san])
      return true
    } catch (error) {
      return false
    }
  }

  const makeMove = (moveString) => {
    try {
      const move = game.move(moveString)
      if (move) {
        setPosition(game.fen())
        setMoveHistory([...moveHistory, move.san])
      }
    } catch (error) {
      console.error('Error making move:', error)
    }
  }

  const resetBoard = () => {
    const newGame = new Chess()
    setGame(newGame)
    setPosition('start')
    setMoveHistory([])
  }

  const undoMove = () => {
    game.undo()
    setPosition(game.fen())
    setMoveHistory(moveHistory.slice(0, -1))
  }

  // Show empty state if no database is selected
  if (!currentDbId) {
    return (
      <div style={styles.container}>
        <h2>Opening Explorer</h2>
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>
            Please select or create a database from the Import tab to use the opening explorer.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <h2>Opening Explorer</h2>
      <p style={styles.description}>
        Play moves on the board to explore openings played in the selected database and see Stockfish analysis
      </p>

      <div style={styles.content}>
        <div style={styles.leftPanel}>
          <div style={styles.colorSelector}>
            <label style={styles.label}>Playing as:</label>
            <select
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={styles.select}
            >
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </div>

          <div style={styles.dateFilters}>
            <div style={styles.dateGroup}>
              <label style={styles.label}>From Date:</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={styles.dateInput}
              />
            </div>
            <div style={styles.dateGroup}>
              <label style={styles.label}>To Date:</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={styles.dateInput}
              />
            </div>
          </div>

          <div style={styles.additionalFilters}>
            <div style={styles.usernameSection}>
              <label style={styles.label}>Your Usernames (required for color filtering):</label>
              <span style={styles.helpText}>
                This option can be used to see the openings played by a given player for a given color (and for a specific time control)
              </span>
              <div style={styles.usernameInputs}>
                <div style={styles.filterGroup}>
                  <label style={styles.smallLabel}>Chess.com:</label>
                  <input
                    type="text"
                    value={chesscomUsername}
                    onChange={(e) => setChesscomUsername(e.target.value)}
                    placeholder="chess.com username"
                    style={styles.input}
                  />
                </div>
                <div style={styles.filterGroup}>
                  <label style={styles.smallLabel}>Lichess:</label>
                  <input
                    type="text"
                    value={lichessUsername}
                    onChange={(e) => setLichessUsername(e.target.value)}
                    placeholder="lichess username"
                    style={styles.input}
                  />
                </div>
              </div>
            </div>
            <div style={styles.filterGroup}>
              <label style={styles.label}>Time Controls:</label>
              <div style={styles.checkboxGroup}>
                {['bullet', 'blitz', 'rapid', 'classical', 'correspondence'].map(tc => (
                  <label key={tc} style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={selectedTimeControls.includes(tc)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTimeControls([...selectedTimeControls, tc])
                        } else {
                          setSelectedTimeControls(selectedTimeControls.filter(t => t !== tc))
                        }
                      }}
                      style={styles.checkbox}
                    />
                    <span style={styles.checkboxText}>{tc.charAt(0).toUpperCase() + tc.slice(1)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div style={styles.boardWithEval}>
            {explorerData && (
              <div style={styles.evalBarContainer}>
                <EvaluationBar
                  evaluation={explorerData.position_eval?.score}
                  orientation={color}
                />
              </div>
            )}
            <div style={styles.boardContainer}>
              <Chessboard
                position={position}
                onPieceDrop={onDrop}
                boardOrientation={color}
                customArrows={explorerData?.best_move_uci ? [
                  [
                    explorerData.best_move_uci.substring(0, 2),
                    explorerData.best_move_uci.substring(2, 4),
                    'rgba(76, 175, 80, 0.5)'
                  ]
                ] : []}
              />
            </div>
          </div>

          <div style={styles.controls}>
            <button onClick={undoMove} style={styles.controlButton} disabled={moveHistory.length === 0}>
              ← Undo
            </button>
            <button onClick={resetBoard} style={styles.resetButton}>
              Reset Board
            </button>
          </div>

          <div style={styles.moveHistory}>
            <strong>Moves:</strong> {moveHistory.join(' ')}
          </div>
        </div>

        <div style={styles.rightPanel}>
          {loading && <div style={styles.loadingIndicator}>
            <div style={styles.spinner}></div>
            <span>Analyzing position...</span>
          </div>}
          {explorerData ? (
            <div style={{opacity: loading ? 0.6 : 1, transition: 'opacity 0.3s'}}>
              <div style={styles.positionEval}>
                <h3>Position Evaluation</h3>
                {explorerData.opening_name && explorerData.opening_name !== 'Unknown Opening' && (
                  <div style={styles.openingName}>
                    <strong>{explorerData.opening_name}</strong>
                    {explorerData.opening_eco && <span style={styles.ecoCode}> ({explorerData.opening_eco})</span>}
                  </div>
                )}
                <div style={styles.evalBox}>
                  <div style={styles.evalRow}>
                    <strong>Score:</strong> {explorerData.position_eval?.score || 'N/A'}
                  </div>
                  <div style={styles.evalRow}>
                    <strong>Best Move (Stockfish):</strong>{' '}
                    <span style={styles.bestMove}>
                      {explorerData.best_move_stockfish || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              <div style={styles.continuations}>
                <h3>Variants played from here:</h3>
                {explorerData.total_games === 0 ? (
                  <p style={styles.noGames}>
                    No games found for this position. The Stockfish evaluation above shows the best move.
                  </p>
                ) : (
                  <>
                    <p style={styles.totalGames}>
                      Found in {explorerData.total_games} game(s)
                    </p>
                    <div style={styles.movesList}>
                      {explorerData.continuations.map((cont, idx) => (
                        <div
                          key={idx}
                          style={styles.moveCard}
                          onClick={() => makeMove(cont.move)}
                        >
                          <div style={styles.moveHeader}>
                            <span style={styles.moveName}>{cont.move}</span>
                            <span style={styles.moveCount}>
                              {cont.count} {cont.count === 1 ? 'game' : 'games'} ({((cont.count / explorerData.total_games) * 100).toFixed(1)}%)
                            </span>
                          </div>

                          <div style={styles.winDrawLoss}>
                            <div style={{...styles.resultBar, ...styles.winBar, width: `${cont.win_pct}%`}}>
                              {cont.win_pct > 10 && `${cont.win_pct}%`}
                            </div>
                            <div style={{...styles.resultBar, ...styles.drawBar, width: `${cont.draw_pct}%`}}>
                              {cont.draw_pct > 10 && `${cont.draw_pct}%`}
                            </div>
                            <div style={{...styles.resultBar, ...styles.lossBar, width: `${cont.loss_pct}%`}}>
                              {cont.loss_pct > 10 && `${cont.loss_pct}%`}
                            </div>
                          </div>

                          <div style={styles.statsRow}>
                            <span style={styles.statWin}>W: {cont.wins}</span>
                            <span style={styles.statDraw}>D: {cont.draws}</span>
                            <span style={styles.statLoss}>L: {cont.losses}</span>
                            <span style={styles.statEval}>
                              Eval: {cont.stockfish_eval}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p>Loading explorer data...</p>
          )}
        </div>
      </div>
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
  description: {
    color: '#666',
    marginTop: '10px',
    marginBottom: '30px'
  },
  content: {
    display: 'grid',
    gridTemplateColumns: '565px 1fr',
    gap: '30px'
  },
  leftPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  colorSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  dateFilters: {
    display: 'flex',
    gap: '15px',
    padding: '15px',
    background: '#f5f5f5',
    borderRadius: '8px'
  },
  dateGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    flex: 1
  },
  dateInput: {
    padding: '8px 12px',
    borderRadius: '4px',
    border: '1px solid #ddd'
  },
  additionalFilters: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
    padding: '15px',
    background: '#f9f9f9',
    borderRadius: '8px',
    border: '1px solid #e0e0e0'
  },
  usernameSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  usernameInputs: {
    display: 'flex',
    gap: '10px'
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    flex: 1
  },
  input: {
    padding: '8px 12px',
    borderRadius: '4px',
    border: '1px solid #ddd'
  },
  helpText: {
    fontSize: '12px',
    color: '#666',
    fontStyle: 'italic'
  },
  label: {
    fontWeight: 'bold'
  },
  smallLabel: {
    fontSize: '13px',
    fontWeight: '500'
  },
  select: {
    padding: '8px 12px',
    borderRadius: '4px',
    border: '1px solid #ddd'
  },
  checkboxGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    padding: '8px 0'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  checkbox: {
    cursor: 'pointer',
    width: '16px',
    height: '16px'
  },
  checkboxText: {
    userSelect: 'none'
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
    gap: '10px'
  },
  controlButton: {
    background: '#2196F3',
    color: 'white',
    padding: '10px 20px'
  },
  resetButton: {
    background: '#757575',
    color: 'white',
    padding: '10px 20px'
  },
  moveHistory: {
    padding: '15px',
    background: '#f5f5f5',
    borderRadius: '4px',
    minHeight: '60px'
  },
  rightPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '30px',
    position: 'relative'
  },
  loadingIndicator: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 16px',
    background: 'rgba(33, 150, 243, 0.9)',
    color: 'white',
    borderRadius: '20px',
    fontSize: '14px',
    fontWeight: 'bold',
    zIndex: 10,
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '3px solid rgba(255,255,255,0.3)',
    borderTop: '3px solid white',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  positionEval: {
    padding: '20px',
    background: '#e3f2fd',
    borderRadius: '8px'
  },
  openingName: {
    fontSize: '18px',
    color: '#1976d2',
    marginBottom: '15px',
    padding: '10px',
    background: 'white',
    borderRadius: '4px',
    textAlign: 'center'
  },
  ecoCode: {
    fontSize: '14px',
    color: '#666',
    fontWeight: 'normal'
  },
  evalBox: {
    marginTop: '15px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  evalRow: {
    padding: '10px',
    background: 'white',
    borderRadius: '4px'
  },
  bestMove: {
    color: '#4CAF50',
    fontWeight: 'bold',
    fontSize: '16px'
  },
  continuations: {},
  noGames: {
    padding: '20px',
    background: '#fff3cd',
    borderRadius: '4px',
    color: '#856404',
    marginTop: '15px'
  },
  totalGames: {
    color: '#666',
    marginTop: '10px',
    marginBottom: '15px'
  },
  movesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px'
  },
  moveCard: {
    padding: '15px',
    border: '2px solid #eee',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  moveHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px'
  },
  moveName: {
    fontSize: '18px',
    fontWeight: 'bold'
  },
  moveCount: {
    color: '#666',
    fontSize: '14px'
  },
  winDrawLoss: {
    display: 'flex',
    height: '30px',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '10px'
  },
  resultBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontSize: '12px',
    fontWeight: 'bold'
  },
  winBar: {
    background: '#4CAF50'
  },
  drawBar: {
    background: '#9E9E9E'
  },
  lossBar: {
    background: '#F44336'
  },
  statsRow: {
    display: 'flex',
    gap: '15px',
    fontSize: '14px'
  },
  statWin: {
    color: '#4CAF50'
  },
  statDraw: {
    color: '#9E9E9E'
  },
  statLoss: {
    color: '#F44336'
  },
  statEval: {
    color: '#2196F3',
    marginLeft: 'auto'
  },
  emptyState: {
    padding: '60px 20px',
    textAlign: 'center',
    background: '#f9f9f9',
    borderRadius: '8px',
    marginTop: '30px'
  },
  emptyText: {
    fontSize: '16px',
    color: '#666'
  }
}

export default ExplorerView
