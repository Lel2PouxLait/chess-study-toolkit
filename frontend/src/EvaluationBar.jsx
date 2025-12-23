import React from 'react'

/**
 * EvaluationBar component displays a visual representation of the position evaluation.
 * Shows advantage for White (top) vs Black (bottom).
 *
 * @param {string} evaluation - The evaluation string (e.g., "+0.5", "-1.2", "#5", "M5")
 * @param {string} orientation - Board orientation ("white" or "black")
 */
function EvaluationBar({ evaluation, orientation = 'white' }) {
  // Parse the evaluation string
  const parseEval = (evalString) => {
    if (!evalString || evalString === 'N/A') {
      return { type: 'normal', value: 0, displayText: '0.0' }
    }

    // Handle mate scores
    if (evalString.includes('#') || evalString.toUpperCase().includes('M')) {
      const isWhiteMate = evalString.includes('+') || (!evalString.includes('-') && !evalString.startsWith('M'))
      return {
        type: 'mate',
        value: isWhiteMate ? 1000 : -1000,
        displayText: evalString
      }
    }

    // Handle numeric scores
    const numValue = parseFloat(evalString)
    if (isNaN(numValue)) {
      return { type: 'normal', value: 0, displayText: '0.0' }
    }

    return {
      type: 'normal',
      value: numValue,
      displayText: numValue.toFixed(1)
    }
  }

  const { type, value, displayText } = parseEval(evaluation)

  // Calculate bar height percentage (cap at extreme values)
  // Positive = white advantage, Negative = black advantage
  const cappedValue = Math.max(-10, Math.min(10, value))
  const whitePercentage = type === 'mate'
    ? (value > 0 ? 95 : 5)
    : 50 + (cappedValue * 4) // Each pawn is worth ~8% of bar height

  const blackPercentage = 100 - whitePercentage

  // Determine colors based on orientation
  const whiteColor = '#f0f0f0'
  const blackColor = '#303030'
  const textColor = Math.abs(value) > 2 ? 'white' : '#666'

  return (
    <div style={styles.container}>
      <div style={styles.barContainer}>
        <div
          style={{
            ...styles.whiteSection,
            height: `${whitePercentage}%`,
            background: whiteColor,
            order: orientation === 'white' ? 1 : 2
          }}
        >
          {whitePercentage > 30 && value > 0.3 && (
            <span style={{...styles.evalText, color: textColor}}>
              +{displayText}
            </span>
          )}
        </div>
        <div
          style={{
            ...styles.blackSection,
            height: `${blackPercentage}%`,
            background: blackColor,
            order: orientation === 'white' ? 2 : 1
          }}
        >
          {blackPercentage > 30 && value < -0.3 && (
            <span style={{...styles.evalText, color: 'white'}}>
              {displayText}
            </span>
          )}
        </div>
        {Math.abs(value) <= 0.3 && (
          <div style={styles.centerText}>
            <span style={{...styles.evalText, color: '#666'}}>
              {displayText}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    width: '50px',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  barContainer: {
    width: '100%',
    height: '100%',
    border: '2px solid #333',
    borderRadius: '4px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative'
  },
  whiteSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'height 0.3s ease'
  },
  blackSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'height 0.3s ease'
  },
  evalText: {
    fontSize: '14px',
    fontWeight: 'bold',
    userSelect: 'none'
  },
  centerText: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'white',
    padding: '2px 6px',
    borderRadius: '3px',
    border: '1px solid #ccc'
  }
}

export default EvaluationBar
