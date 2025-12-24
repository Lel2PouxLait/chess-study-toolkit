import React, { useState } from 'react'
import { useDatabase } from './DatabaseContext'

function DatabaseSelector() {
  const {
    databases,
    currentDbId,
    setCurrentDbId,
    createDatabase,
    deleteDatabase,
    getCurrentDatabase
  } = useDatabase()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newDbName, setNewDbName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  const handleCreate = async () => {
    if (!newDbName.trim()) {
      setError('Please enter a database name')
      return
    }

    setCreating(true)
    setError(null)

    try {
      await createDatabase(newDbName.trim())
      setNewDbName('')
      setShowCreateModal(false)
    } catch (err) {
      setError('Error creating database: ' + err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (dbId, dbName) => {
    if (!confirm(`Delete database "${dbName}"? This cannot be undone and all games will be permanently deleted.`)) {
      return
    }

    try {
      await deleteDatabase(dbId)
    } catch (err) {
      alert('Error deleting database: ' + err.message)
    }
  }

  const currentDb = getCurrentDatabase()

  // If no databases exist, show create prompt
  if (databases.length === 0) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>📊</div>
        <h3 style={styles.emptyTitle}>No Databases Found</h3>
        <p style={styles.emptyText}>
          Get started by creating your first database to organize your chess games.
        </p>
        <button
          onClick={() => setShowCreateModal(true)}
          style={styles.createFirstButton}
        >
          + Create First Database
        </button>

        {showCreateModal && (
          <div style={styles.modal}>
            <div style={styles.modalContent}>
              <h3>Create New Database</h3>
              <input
                type="text"
                value={newDbName}
                onChange={(e) => setNewDbName(e.target.value)}
                placeholder="Database name (e.g., Blitz Games, Tournament Prep)"
                style={styles.input}
                autoFocus
                onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
              />
              {error && <div style={styles.errorText}>{error}</div>}
              <div style={styles.modalButtons}>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  style={styles.primaryBtn}
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
                <button
                  onClick={() => {
                    setShowCreateModal(false)
                    setError(null)
                    setNewDbName('')
                  }}
                  style={styles.secondaryBtn}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <label style={styles.label}>Current Database:</label>
        <select
          value={currentDbId || ''}
          onChange={(e) => setCurrentDbId(e.target.value)}
          style={styles.select}
        >
          <option value="" disabled>Select a database...</option>
          {databases.map(db => (
            <option key={db.id} value={db.id}>
              {db.name} ({db.game_count} games)
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowCreateModal(true)}
          style={styles.createBtn}
        >
          + New Database
        </button>
      </div>

      {currentDb && (
        <div style={styles.dbInfo}>
          <span>Created: {new Date(currentDb.created_at).toLocaleDateString()}</span>
          <span style={styles.separator}>•</span>
          <span>{currentDb.game_count} games</span>
          <span style={styles.separator}>•</span>
          <button
            onClick={() => handleDelete(currentDb.id, currentDb.name)}
            style={styles.deleteBtn}
          >
            Delete
          </button>
        </div>
      )}

      {showCreateModal && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3>Create New Database</h3>
            <input
              type="text"
              value={newDbName}
              onChange={(e) => setNewDbName(e.target.value)}
              placeholder="Database name (e.g., Blitz Games, Tournament Prep)"
              style={styles.input}
              autoFocus
              onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
            />
            {error && <div style={styles.errorText}>{error}</div>}
            <div style={styles.modalButtons}>
              <button
                onClick={handleCreate}
                disabled={creating}
                style={styles.primaryBtn}
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setError(null)
                  setNewDbName('')
                }}
                style={styles.secondaryBtn}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    background: '#f5f5f5',
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '30px'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    flexWrap: 'wrap'
  },
  label: {
    fontWeight: 'bold',
    fontSize: '14px'
  },
  select: {
    flex: 1,
    minWidth: '250px',
    padding: '10px',
    fontSize: '14px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    background: 'white'
  },
  createBtn: {
    padding: '10px 20px',
    background: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '14px'
  },
  dbInfo: {
    marginTop: '15px',
    padding: '10px',
    background: 'white',
    borderRadius: '4px',
    fontSize: '13px',
    color: '#666',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  separator: {
    color: '#ccc'
  },
  deleteBtn: {
    marginLeft: 'auto',
    padding: '5px 15px',
    background: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    background: 'white',
    padding: '30px',
    borderRadius: '8px',
    minWidth: '400px',
    maxWidth: '90%'
  },
  input: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    marginTop: '15px',
    marginBottom: '15px',
    boxSizing: 'border-box'
  },
  modalButtons: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end'
  },
  primaryBtn: {
    padding: '10px 20px',
    background: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  secondaryBtn: {
    padding: '10px 20px',
    background: '#f5f5f5',
    color: '#333',
    border: '1px solid #ccc',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  errorText: {
    color: '#f44336',
    fontSize: '13px',
    marginBottom: '10px'
  },
  // Empty state styles
  emptyState: {
    background: '#f9f9f9',
    border: '2px dashed #ddd',
    borderRadius: '8px',
    padding: '60px 40px',
    textAlign: 'center',
    marginBottom: '30px'
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '20px'
  },
  emptyTitle: {
    fontSize: '24px',
    color: '#333',
    marginBottom: '10px'
  },
  emptyText: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '30px',
    maxWidth: '500px',
    margin: '0 auto 30px'
  },
  createFirstButton: {
    padding: '15px 30px',
    background: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '16px'
  }
}

export default DatabaseSelector
