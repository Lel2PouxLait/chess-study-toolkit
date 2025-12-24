import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { useDatabase } from './DatabaseContext'

const API_BASE = '/api'

function PuzzlesView() {
  const { currentDbId } = useDatabase()

  // Puzzle generation settings
  const [username, setUsername] = useState('')
  const [minPly, setMinPly] = useState(0)
  const [maxPly, setMaxPly] = useState(20)
  const [selectedDifficulties, setSelectedDifficulties] = useState(['easy', 'medium', 'hard'])

  // Puzzle state
  const [puzzles, setPuzzles] = useState([])
  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')

  // Board state
  const [game, setGame] = useState(new Chess())
  const [position, setPosition] = useState('start')
  const [moveAttempts, setMoveAttempts] = useState([])
  const [puzzleSolved, setPuzzleSolved] = useState(false)
  const [showSolution, setShowSolution] = useState(false)
  const [pvIndex, setPvIndex] = useState(0) // Track progress through principal variation

  // Statistics
  const [stats, setStats] = useState({
    totalAttempted: 0,
    totalSolved: 0,
    byDifficulty: { easy: 0, medium: 0, hard: 0 }
  })

  // Load solved puzzles from localStorage
  useEffect(() => {
    if (currentDbId) {
      const saved = localStorage.getItem(`puzzles_solved_${currentDbId}`)
      if (saved) {
        try {
          const data = JSON.parse(saved)
          // data = { puzzle_ids: [], stats: {...} }
          setStats(data.stats || stats)
        } catch (e) {
          console.error('Error loading saved puzzle data:', e)
        }
      }
    }
  }, [currentDbId])

  // Load puzzle position when current puzzle changes
  useEffect(() => {
    if (puzzles.length > 0 && currentPuzzleIndex < puzzles.length) {
      const puzzle = puzzles[currentPuzzleIndex]
      const newGame = new Chess(puzzle.fen)
      setGame(newGame)
      setPosition(puzzle.fen)
      setMoveAttempts([])
      setPuzzleSolved(false)
      setShowSolution(false)
      setPvIndex(0) // Reset principal variation index
    }
  }, [currentPuzzleIndex, puzzles])

  const pollPuzzleStatus = async (taskId) => {
    try {
      const response = await axios.get(`${API_BASE}/puzzles/status/${taskId}`)
      const status = response.data

      setProgress(status.progress)
      setProgressMessage(`Analyzing game ${status.current_game}/${status.total_games} - ${status.puzzles_found} puzzles found`)

      if (status.status === 'running') {
        // Continue polling
        setTimeout(() => pollPuzzleStatus(taskId), 1000)
      } else if (status.status === 'completed') {
        // Puzzle generation completed
        setLoading(false)
        setProgress(100)

        const newPuzzles = status.puzzles || []

        // Filter out already solved puzzles
        const solvedPuzzleIds = getSolvedPuzzleIds()
        const unsolvedPuzzles = newPuzzles.filter(p => !solvedPuzzleIds.includes(p.puzzle_id))

        if (unsolvedPuzzles.length === 0) {
          setError(`All ${newPuzzles.length} puzzles have been solved! Try different filters or reset progress.`)
          setPuzzles([])
        } else {
          setPuzzles(unsolvedPuzzles)
          setCurrentPuzzleIndex(0)

          if (unsolvedPuzzles.length < newPuzzles.length) {
            console.log(`Filtered out ${newPuzzles.length - unsolvedPuzzles.length} already-solved puzzles`)
          }
        }
      } else if (status.status === 'failed') {
        // Failed
        setLoading(false)
        setError(status.error || 'Puzzle generation failed')
      }
    } catch (err) {
      setLoading(false)
      setError(err.message)
    }
  }

  const generatePuzzles = async () => {
    if (!username.trim()) {
      setError('Please enter a username')
      return
    }

    if (!currentDbId) {
      setError('Please select a database first')
      return
    }

    setLoading(true)
    setError(null)
    setProgress(0)
    setProgressMessage('Starting puzzle generation...')

    try {
      // Start puzzle generation task
      const response = await axios.post(
        `${API_BASE}/puzzles/generate?db_id=${currentDbId}`,
        {
          username: username.trim(),
          max_puzzles: 50,
          difficulty: selectedDifficulties.length > 0 ? selectedDifficulties : null,
          min_ply: minPly,
          max_ply: maxPly
        }
      )

      const taskId = response.data.task_id

      // Start polling for status
      pollPuzzleStatus(taskId)

    } catch (err) {
      setLoading(false)
      setError(err.response?.data?.detail || err.message)
    }
  }

  const getSolvedPuzzleIds = () => {
    if (!currentDbId) return []
    const saved = localStorage.getItem(`puzzles_solved_${currentDbId}`)
    if (saved) {
      try {
        const data = JSON.parse(saved)
        return data.puzzle_ids || []
      } catch (e) {
        return []
      }
    }
    return []
  }

  const markPuzzleSolved = (puzzleId, difficulty) => {
    const solvedIds = getSolvedPuzzleIds()
    if (!solvedIds.includes(puzzleId)) {
      solvedIds.push(puzzleId)

      // Update stats
      const newStats = {
        totalAttempted: stats.totalAttempted + 1,
        totalSolved: stats.totalSolved + 1,
        byDifficulty: {
          ...stats.byDifficulty,
          [difficulty]: (stats.byDifficulty[difficulty] || 0) + 1
        }
      }

      setStats(newStats)

      // Save to localStorage
      localStorage.setItem(`puzzles_solved_${currentDbId}`, JSON.stringify({
        puzzle_ids: solvedIds,
        stats: newStats
      }))
    }
  }

  const onDrop = (sourceSquare, targetSquare) => {
    if (puzzleSolved) return false

    const puzzle = puzzles[currentPuzzleIndex]
    if (!puzzle) return false

    try {
      // Make the move
      const move = game.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q'
      })

      if (move === null) return false

      const moveUci = move.from + move.to + (move.promotion || '')
      setMoveAttempts([...moveAttempts, move.san])

      // Get principal variation (default to [best_move] if not available)
      const pv = puzzle.principal_variation || [puzzle.best_move]

      // Check if this matches the current move in the principal variation
      if (moveUci === pv[pvIndex]) {
        setPosition(game.fen())
        setError(null)

        // Check if there are more moves to play
        const nextPvIndex = pvIndex + 1

        if (nextPvIndex >= pv.length) {
          // No more moves - puzzle solved!
          setPuzzleSolved(true)
          markPuzzleSolved(puzzle.puzzle_id, puzzle.difficulty)
        } else {
          // Auto-play opponent's response after a short delay
          setTimeout(() => {
            try {
              const opponentMoveUci = pv[nextPvIndex]
              const opponentMove = game.move({
                from: opponentMoveUci.substring(0, 2),
                to: opponentMoveUci.substring(2, 4),
                promotion: opponentMoveUci.length > 4 ? opponentMoveUci[4] : undefined
              })

              if (opponentMove) {
                setPosition(game.fen())

                // Check if that was the last move
                if (nextPvIndex + 1 >= pv.length) {
                  setPuzzleSolved(true)
                  markPuzzleSolved(puzzle.puzzle_id, puzzle.difficulty)
                }
              }
            } catch (err) {
              console.error('Error playing opponent move:', err)
            }
          }, 500) // 500ms delay for opponent response

          setPvIndex(nextPvIndex + 1) // Update pvIndex to point to next player move
        }

        return true
      } else {
        // Wrong move - undo it
        game.undo()
        setError(`Incorrect! Try again. (You played: ${move.san})`)
        return false
      }

    } catch (error) {
      return false
    }
  }

  const nextPuzzle = () => {
    if (currentPuzzleIndex < puzzles.length - 1) {
      setCurrentPuzzleIndex(currentPuzzleIndex + 1)
      setError(null)
    }
  }

  const previousPuzzle = () => {
    if (currentPuzzleIndex > 0) {
      setCurrentPuzzleIndex(currentPuzzleIndex - 1)
      setError(null)
    }
  }

  const toggleDifficulty = (diff) => {
    if (selectedDifficulties.includes(diff)) {
      setSelectedDifficulties(selectedDifficulties.filter(d => d !== diff))
    } else {
      setSelectedDifficulties([...selectedDifficulties, diff])
    }
  }

  const resetProgress = () => {
    if (confirm('Reset all puzzle progress? This cannot be undone.')) {
      localStorage.removeItem(`puzzles_solved_${currentDbId}`)
      setStats({
        totalAttempted: 0,
        totalSolved: 0,
        byDifficulty: { easy: 0, medium: 0, hard: 0 }
      })
      setPuzzles([])
      setCurrentPuzzleIndex(0)
    }
  }

  // Empty state: no database selected
  if (!currentDbId) {
    return (
      <div style={styles.emptyState}>
        <h3>No Database Selected</h3>
        <p>Please select or create a database to use the Puzzles feature.</p>
      </div>
    )
  }

  const currentPuzzle = puzzles[currentPuzzleIndex]

  return (
    <div style={styles.container}>
      <h2>Chess Puzzles</h2>
      <p style={styles.subtitle}>
        Train by solving puzzles from your games - find the best move!
      </p>

      {/* Configuration section */}
      <div style={styles.configSection}>
        <div style={styles.filterGroup}>
          <label style={styles.label}>Your Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            style={styles.input}
            disabled={loading}
          />
        </div>

        <div style={styles.filterGroup}>
          <label style={styles.label}>Ply Range (half-moves)</label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={styles.hint}>Min</span>
              <input
                type="number"
                value={minPly}
                onChange={(e) => setMinPly(parseInt(e.target.value) || 0)}
                min="0"
                max="100"
                style={styles.inputSmall}
                disabled={loading}
              />
            </div>
            <span style={{ fontSize: '20px', marginTop: '20px' }}>-</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={styles.hint}>Max</span>
              <input
                type="number"
                value={maxPly}
                onChange={(e) => setMaxPly(parseInt(e.target.value) || 20)}
                min="1"
                max="100"
                style={styles.inputSmall}
                disabled={loading}
              />
            </div>
          </div>
          <span style={styles.hint}>Puzzles from ply {minPly} to {maxPly}</span>
        </div>

        <div style={styles.filterGroup}>
          <label style={styles.label}>Difficulty</label>
          <div style={styles.checkboxGroup}>
            {['easy', 'medium', 'hard'].map(diff => (
              <label key={diff} style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={selectedDifficulties.includes(diff)}
                  onChange={() => toggleDifficulty(diff)}
                  disabled={loading}
                />
                <span style={styles.checkboxText}>
                  {diff.charAt(0).toUpperCase() + diff.slice(1)}
                </span>
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={generatePuzzles}
          disabled={loading}
          style={styles.generateButton}
        >
          {loading ? 'Generating Puzzles...' : 'Generate Puzzles'}
        </button>
      </div>

      {/* Progress indicator */}
      {loading && (
        <div style={styles.progressContainer}>
          <div style={styles.progressBar}>
            <div style={{...styles.progressFill, width: `${progress}%`}} />
          </div>
          <p style={styles.progressText}>{progressMessage}</p>
        </div>
      )}

      {/* Error display */}
      {error && !puzzleSolved && (
        <div style={styles.error}>
          {error}
        </div>
      )}

      {/* Stats display */}
      <div style={styles.statsSection}>
        <div style={styles.statBox}>
          <div style={styles.statValue}>{stats.totalSolved}</div>
          <div style={styles.statLabel}>Solved</div>
        </div>
        <div style={styles.statBox}>
          <div style={styles.statValue}>{stats.byDifficulty.easy}</div>
          <div style={styles.statLabel}>Easy</div>
        </div>
        <div style={styles.statBox}>
          <div style={styles.statValue}>{stats.byDifficulty.medium}</div>
          <div style={styles.statLabel}>Medium</div>
        </div>
        <div style={styles.statBox}>
          <div style={styles.statValue}>{stats.byDifficulty.hard}</div>
          <div style={styles.statLabel}>Hard</div>
        </div>
        <button onClick={resetProgress} style={styles.resetButton}>
          Reset Progress
        </button>
      </div>

      {/* Puzzle display */}
      {currentPuzzle && (
        <div style={styles.puzzleSection}>
          <div style={styles.puzzleHeader}>
            <h3>
              Puzzle {currentPuzzleIndex + 1} of {puzzles.length}
            </h3>
            <div style={styles.puzzleMeta}>
              <span style={{...styles.badge, ...styles[`badge_${currentPuzzle.difficulty}`]}}>
                {currentPuzzle.difficulty.toUpperCase()}
              </span>
              <span style={styles.badge}>
                {currentPuzzle.puzzle_type === 'mistake' ? 'Find Your Mistake' : 'Tactical Opportunity'}
              </span>
              <span style={styles.metaText}>
                {currentPuzzle.opening_name} ({currentPuzzle.opening_eco})
              </span>
              <span style={styles.metaText}>
                Move {currentPuzzle.move_number} • Playing as {currentPuzzle.player_color}
              </span>
            </div>
          </div>

          <div style={styles.puzzleContent}>
            <div style={styles.boardContainer}>
              <Chessboard
                position={position}
                onPieceDrop={onDrop}
                boardOrientation={currentPuzzle.player_color}
                arePiecesDraggable={!puzzleSolved}
              />
            </div>

            <div style={styles.sidePanel}>
              <div style={styles.instructions}>
                <h4>Find the best move for {currentPuzzle.player_color}</h4>
                {currentPuzzle.puzzle_type === 'mistake' && (
                  <p>In this position, you played {currentPuzzle.played_move_san}. What should you have played?</p>
                )}
                {currentPuzzle.puzzle_type === 'tactical' && (
                  <p>There's a strong tactical move available. Can you find it?</p>
                )}
              </div>

              {puzzleSolved && (
                <div style={styles.success}>
                  <h3>Correct!</h3>
                  <p>The best move was: <strong>{currentPuzzle.best_move_san}</strong></p>
                  {currentPuzzle.puzzle_type === 'mistake' && (
                    <p>This saves approximately {currentPuzzle.eval_loss_cp} centipawns!</p>
                  )}
                </div>
              )}

              {showSolution && !puzzleSolved && (
                <div style={styles.solution}>
                  <h4>Solution</h4>
                  <p><strong>{(() => {
                    // Get the principal variation
                    const pv = currentPuzzle.principal_variation || [currentPuzzle.best_move]

                    // Get the current move to show based on pvIndex
                    if (pvIndex < pv.length) {
                      const moveUci = pv[pvIndex]

                      // Convert UCI to SAN for display
                      try {
                        const tempGame = new Chess(game.fen())
                        const move = tempGame.move({
                          from: moveUci.substring(0, 2),
                          to: moveUci.substring(2, 4),
                          promotion: moveUci.length > 4 ? moveUci[4] : undefined
                        })
                        return move ? move.san : currentPuzzle.best_move_san
                      } catch (err) {
                        return currentPuzzle.best_move_san
                      }
                    }
                    return currentPuzzle.best_move_san
                  })()}</strong></p>
                  <p style={styles.solutionExplanation}>
                    Position evaluation: {(currentPuzzle.position_eval_cp / 100).toFixed(2)}
                  </p>
                </div>
              )}

              <div style={styles.buttonGroup}>
                {!puzzleSolved && !showSolution && (
                  <button
                    onClick={() => setShowSolution(true)}
                    style={styles.secondaryButton}
                  >
                    Show Solution
                  </button>
                )}

                <button
                  onClick={previousPuzzle}
                  disabled={currentPuzzleIndex === 0}
                  style={styles.secondaryButton}
                >
                  Previous
                </button>

                <button
                  onClick={nextPuzzle}
                  disabled={currentPuzzleIndex >= puzzles.length - 1}
                  style={styles.primaryButton}
                >
                  Next Puzzle
                </button>
              </div>

              <div style={styles.gameInfo}>
                <h4>Game Information</h4>
                <p><strong>Opponent:</strong> {currentPuzzle.opponent}</p>
                <p><strong>Date:</strong> {new Date(currentPuzzle.date).toLocaleDateString()}</p>
                <p><strong>Platform:</strong> {currentPuzzle.platform}</p>
              </div>

              <div style={styles.gameInfo}>
                <h4>Position Details</h4>
                <p><strong>FEN:</strong></p>
                <p style={styles.fenText}>{currentPuzzle.fen}</p>
                {currentPuzzle.pgn && (
                  <>
                    <p style={{marginTop: '15px'}}><strong>Full Game PGN:</strong></p>
                    <p style={styles.pgnText}>{currentPuzzle.pgn}</p>
                  </>
                )}
              </div>
            </div>
          </div>
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
  subtitle: {
    color: '#666',
    marginBottom: '30px'
  },
  configSection: {
    display: 'flex',
    gap: '20px',
    alignItems: 'flex-end',
    marginBottom: '30px',
    padding: '20px',
    background: '#f9f9f9',
    borderRadius: '8px'
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
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    minWidth: '200px'
  },
  inputSmall: {
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    width: '80px'
  },
  hint: {
    fontSize: '12px',
    color: '#666'
  },
  checkboxGroup: {
    display: 'flex',
    gap: '15px'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    cursor: 'pointer'
  },
  checkboxText: {
    fontSize: '14px'
  },
  generateButton: {
    background: '#4CAF50',
    color: 'white',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 'bold',
    borderRadius: '4px',
    cursor: 'pointer',
    border: 'none'
  },
  progressContainer: {
    marginTop: '20px',
    marginBottom: '20px'
  },
  progressBar: {
    width: '100%',
    height: '24px',
    background: '#eee',
    borderRadius: '12px',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    background: '#4CAF50',
    transition: 'width 0.3s'
  },
  progressText: {
    marginTop: '10px',
    textAlign: 'center',
    fontWeight: 'bold',
    color: '#666'
  },
  error: {
    padding: '15px',
    background: '#f8d7da',
    color: '#721c24',
    borderRadius: '4px',
    marginBottom: '20px'
  },
  statsSection: {
    display: 'flex',
    gap: '20px',
    marginBottom: '30px',
    padding: '20px',
    background: '#f9f9f9',
    borderRadius: '8px',
    alignItems: 'center'
  },
  statBox: {
    textAlign: 'center'
  },
  statValue: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#4CAF50'
  },
  statLabel: {
    fontSize: '14px',
    color: '#666'
  },
  resetButton: {
    marginLeft: 'auto',
    padding: '8px 16px',
    background: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  puzzleSection: {
    marginTop: '20px'
  },
  puzzleHeader: {
    marginBottom: '20px'
  },
  puzzleMeta: {
    display: 'flex',
    gap: '15px',
    alignItems: 'center',
    marginTop: '10px',
    flexWrap: 'wrap'
  },
  badge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 'bold',
    background: '#2196F3',
    color: 'white'
  },
  badge_easy: {
    background: '#4CAF50',
    color: 'white'
  },
  badge_medium: {
    background: '#FF9800',
    color: 'white'
  },
  badge_hard: {
    background: '#f44336',
    color: 'white'
  },
  metaText: {
    fontSize: '14px',
    color: '#666'
  },
  puzzleContent: {
    display: 'grid',
    gridTemplateColumns: '565px 1fr',
    gap: '30px'
  },
  boardContainer: {
    width: '565px'
  },
  sidePanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  instructions: {
    padding: '20px',
    background: '#e3f2fd',
    borderRadius: '8px'
  },
  success: {
    padding: '20px',
    background: '#d4edda',
    borderRadius: '8px',
    color: '#155724'
  },
  solution: {
    padding: '20px',
    background: '#fff3cd',
    borderRadius: '8px',
    color: '#856404'
  },
  solutionExplanation: {
    fontSize: '14px',
    marginTop: '10px'
  },
  buttonGroup: {
    display: 'flex',
    gap: '10px'
  },
  primaryButton: {
    background: '#4CAF50',
    color: 'white',
    padding: '12px 24px',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 'bold',
    flex: 1
  },
  secondaryButton: {
    background: '#f5f5f5',
    color: '#333',
    padding: '12px 24px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    cursor: 'pointer',
    flex: 1
  },
  gameInfo: {
    padding: '20px',
    background: '#f9f9f9',
    borderRadius: '8px'
  },
  fenText: {
    fontFamily: 'monospace',
    fontSize: '12px',
    background: '#fff',
    padding: '10px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    wordBreak: 'break-all'
  },
  pgnText: {
    fontFamily: 'monospace',
    fontSize: '12px',
    background: '#fff',
    padding: '10px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    maxHeight: '150px',
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },
  emptyState: {
    padding: '60px 20px',
    textAlign: 'center',
    background: '#f9f9f9',
    borderRadius: '8px',
    marginTop: '30px'
  }
}

export default PuzzlesView
