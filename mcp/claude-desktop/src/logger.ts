import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  operation: string;
  projectId?: string;
  entityId?: string;
  duration?: number;
  error?: string;
  metadata?: Record<string, any>;
}

class Logger {
  private logFile: string;

  constructor(logDir: string = './logs') {
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    this.logFile = join(logDir, 'mcp-server.jsonl');
  }

  private writeLog(entry: LogEntry): void {
    const logLine = JSON.stringify(entry) + '\n';
    try {
      writeFileSync(this.logFile, logLine, { flag: 'a' });
    } catch (error) {
      console.error('Failed to write log:', error);
    }
  }

  info(operation: string, metadata?: Record<string, any>): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      operation,
      metadata
    });
  }

  warn(operation: string, message: string, metadata?: Record<string, any>): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'warn',
      operation,
      error: message,
      metadata
    });
  }

  error(operation: string, error: Error | string, metadata?: Record<string, any>): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'error',
      operation,
      error: error instanceof Error ? error.message : error,
      metadata
    });
  }

  logToolCall(
    toolName: string, 
    projectId?: string, 
    entityId?: string,
    duration?: number,
    metadata?: Record<string, any>
  ): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      operation: `tool_call:${toolName}`,
      projectId,
      entityId,
      duration,
      metadata
    });
  }
}

export const logger = new Logger();
