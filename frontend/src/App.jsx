import React, { useState } from 'react'
import axios from 'axios'
import HistoryView from './HistoryView'
import ExplorerView from './ExplorerView'
import PuzzlesView from './PuzzlesView'
import DatabaseSelector from './DatabaseSelector'
import { useDatabase } from './DatabaseContext'

const API_BASE = '/api'

function App() {
  const { currentDbId } = useDatabase()
  const [activeTab, setActiveTab] = useState('import')
  const [chesscomUsername, setChesscomUsername] = useState('')
  const [lichessUsername, setLichessUsername] = useState('')
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState(null)
  const [importError, setImportError] = useState(null)

  const startImport = async () => {
    if (!currentDbId) {
      alert('Please select or create a database first')
      return
    }

    if (!chesscomUsername && !lichessUsername) {
      alert('Please enter at least one username')
      return
    }

    setImporting(true)
    setImportError(null)
    setImportStatus(null)

    try {
      // Start import
      const response = await axios.post(`${API_BASE}/import?db_id=${currentDbId}`, {
        chesscom_username: chesscomUsername || null,
        lichess_username: lichessUsername || null
      })

      const taskId = response.data.task_id

      // Poll for status
      pollImportStatus(taskId)

    } catch (error) {
      setImportError(error.response?.data?.detail || error.message)
      setImporting(false)
    }
  }

  const pollImportStatus = async (taskId) => {
    try {
      const response = await axios.get(`${API_BASE}/import/status/${taskId}`)
      const status = response.data

      setImportStatus(status)

      if (status.status === 'running') {
        // Continue polling
        setTimeout(() => pollImportStatus(taskId), 1000)
      } else {
        // Completed or failed
        setImporting(false)
        if (status.status === 'failed') {
          setImportError(status.error)
        }
      }
    } catch (error) {
      setImportError(error.message)
      setImporting(false)
    }
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Chess study toolkit</h1>
        <p style={styles.subtitle}>A free game aggregator, chess database manager, game reviewer and opening explorator</p>
      </header>

      <nav style={styles.nav}>
        <button
          style={activeTab === 'import' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('import')}
        >
          Import Games
        </button>
        <button
          style={activeTab === 'history' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('history')}
        >
          Data base content
        </button>
        <button
          style={activeTab === 'explorer' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('explorer')}
        >
          Opening Explorer
        </button>
        <button
          style={activeTab === 'puzzles' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('puzzles')}
        >
          Puzzles
        </button>
      </nav>

      <main style={styles.main}>
        {activeTab === 'import' && (
          <div style={styles.section}>
            <h2>Import Games</h2>
            <p style={styles.sectionDesc}>
              Import games from chess.com and lichess.org into the selected database
            </p>

            <DatabaseSelector />

            <div style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Chess.com Username</label>
                <input
                  type="text"
                  value={chesscomUsername}
                  onChange={(e) => setChesscomUsername(e.target.value)}
                  placeholder="Enter username"
                  style={styles.input}
                  disabled={importing}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Lichess Username</label>
                <input
                  type="text"
                  value={lichessUsername}
                  onChange={(e) => setLichessUsername(e.target.value)}
                  placeholder="Enter username"
                  style={styles.input}
                  disabled={importing}
                />
              </div>

              <button
                onClick={startImport}
                disabled={importing}
                style={styles.importButton}
              >
                {importing ? 'Importing...' : 'Import Games'}
              </button>
            </div>

            {importing && importStatus && (
              <div style={styles.progress}>
                <div style={styles.progressBar}>
                  <div style={{...styles.progressFill, width: `${importStatus.progress}%`}} />
                </div>
                <p style={styles.progressText}>
                  Progress: {importStatus.progress}%
                </p>
              </div>
            )}

            {importStatus && importStatus.status === 'completed' && (
              <div style={styles.success}>
                <h3>Import Complete!</h3>
                <p>Total fetched: {importStatus.total_fetched}</p>
                <p>New games added: {importStatus.new_games_added}</p>
                <p>Duplicates skipped: {importStatus.duplicates_skipped}</p>
              </div>
            )}

            {importError && (
              <div style={styles.error}>
                <h3>Error</h3>
                <p>{importError}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && <HistoryView />}
        {activeTab === 'explorer' && <ExplorerView />}
        {activeTab === 'puzzles' && <PuzzlesView />}
      </main>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    background: '#2c3e50',
    color: 'white',
    padding: '30px 20px',
    textAlign: 'center'
  },
  title: {
    fontSize: '32px',
    marginBottom: '10px'
  },
  subtitle: {
    fontSize: '16px',
    opacity: 0.9
  },
  nav: {
    background: 'white',
    borderBottom: '2px solid #eee',
    display: 'flex',
    padding: '0 20px'
  },
  tab: {
    background: 'transparent',
    padding: '15px 25px',
    marginRight: '5px',
    borderBottom: '3px solid transparent'
  },
  tabActive: {
    background: 'transparent',
    padding: '15px 25px',
    marginRight: '5px',
    borderBottom: '3px solid #4CAF50',
    fontWeight: 'bold'
  },
  main: {
    flex: 1,
    padding: '30px 20px',
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%'
  },
  section: {
    background: 'white',
    borderRadius: '8px',
    padding: '30px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  sectionDesc: {
    color: '#666',
    marginBottom: '30px'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    maxWidth: '400px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  label: {
    fontWeight: 'bold',
    fontSize: '14px'
  },
  input: {
    width: '100%'
  },
  importButton: {
    background: '#4CAF50',
    color: 'white',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 'bold',
    marginTop: '10px'
  },
  progress: {
    marginTop: '30px'
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
    fontWeight: 'bold'
  },
  success: {
    marginTop: '30px',
    padding: '20px',
    background: '#d4edda',
    borderRadius: '4px',
    color: '#155724'
  },
  error: {
    marginTop: '30px',
    padding: '20px',
    background: '#f8d7da',
    borderRadius: '4px',
    color: '#721c24'
  }
}

export default App
