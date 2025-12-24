import React, { createContext, useState, useEffect, useContext } from 'react'
import axios from 'axios'

const DatabaseContext = createContext()

const API_BASE = '/api'

export function DatabaseProvider({ children }) {
  const [databases, setDatabases] = useState([])
  const [currentDbId, setCurrentDbId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Load databases on mount
  useEffect(() => {
    loadDatabases()
  }, [])

  const loadDatabases = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await axios.get(`${API_BASE}/databases`)
      setDatabases(response.data)

      // Auto-select first database if available and none selected
      if (response.data.length > 0 && !currentDbId) {
        setCurrentDbId(response.data[0].id)
      }
    } catch (err) {
      console.error('Error loading databases:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const createDatabase = async (name) => {
    try {
      const response = await axios.post(`${API_BASE}/databases`, { name })
      await loadDatabases()
      setCurrentDbId(response.data.id)
      return response.data
    } catch (err) {
      console.error('Error creating database:', err)
      throw err
    }
  }

  const deleteDatabase = async (dbId) => {
    try {
      await axios.delete(`${API_BASE}/databases/${dbId}`)

      // Clear selection if we deleted the current database
      if (currentDbId === dbId) {
        setCurrentDbId(null)
      }

      await loadDatabases()
    } catch (err) {
      console.error('Error deleting database:', err)
      throw err
    }
  }

  const renameDatabase = async (dbId, newName) => {
    try {
      await axios.put(`${API_BASE}/databases/${dbId}`, { name: newName })
      await loadDatabases()
    } catch (err) {
      console.error('Error renaming database:', err)
      throw err
    }
  }

  const getCurrentDatabase = () => {
    return databases.find(db => db.id === currentDbId)
  }

  const value = {
    databases,
    currentDbId,
    setCurrentDbId,
    loading,
    error,
    loadDatabases,
    createDatabase,
    deleteDatabase,
    renameDatabase,
    getCurrentDatabase
  }

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  )
}

export function useDatabase() {
  const context = useContext(DatabaseContext)
  if (!context) {
    throw new Error('useDatabase must be used within DatabaseProvider')
  }
  return context
}
