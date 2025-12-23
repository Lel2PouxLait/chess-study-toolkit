"""
Centralized logging configuration for the chess training application.
Provides rotating file logging with severity levels.
"""

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

# Define log directory and file
LOG_DIR = Path(__file__).parent / "logs"
LOG_FILE = LOG_DIR / "chess_training.log"
MAX_LOG_SIZE = 5 * 1024 * 1024  # 5 MB

# Ensure log directory exists
LOG_DIR.mkdir(exist_ok=True)

# Create logger
logger = logging.getLogger("chess_training")
logger.setLevel(logging.DEBUG)

# Prevent duplicate handlers if logger is imported multiple times
if not logger.handlers:
    # File handler with rotation
    file_handler = RotatingFileHandler(
        LOG_FILE,
        maxBytes=MAX_LOG_SIZE,
        backupCount=3,  # Keep 3 backup files
        encoding='utf-8'
    )
    file_handler.setLevel(logging.DEBUG)

    # Console handler for development
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)

    # Formatter with timestamp, level, module, and message
    formatter = logging.Formatter(
        '%(asctime)s - %(levelname)-8s - %(name)s - %(module)s:%(lineno)d - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

# Convenience functions for different log levels
def debug(message, *args, **kwargs):
    """Log debug message"""
    logger.debug(message, *args, **kwargs)

def info(message, *args, **kwargs):
    """Log info message"""
    logger.info(message, *args, **kwargs)

def warning(message, *args, **kwargs):
    """Log warning message"""
    logger.warning(message, *args, **kwargs)

def error(message, *args, **kwargs):
    """Log error message"""
    logger.error(message, *args, **kwargs)

def critical(message, *args, **kwargs):
    """Log critical message"""
    logger.critical(message, *args, **kwargs)

def exception(message, *args, **kwargs):
    """Log exception with traceback"""
    logger.exception(message, *args, **kwargs)
