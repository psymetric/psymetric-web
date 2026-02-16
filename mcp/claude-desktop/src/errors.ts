export interface MCPError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export class MCPServerError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'MCPServerError';
  }

  toJSON(): { error: MCPError } {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details
      }
    };
  }
}

export function createProjectNotFoundError(projectId?: string): MCPServerError {
  return new MCPServerError(
    'PROJECT_NOT_FOUND',
    'Invalid or inaccessible projectId',
    projectId ? { projectId } : undefined
  );
}

export function createEntityNotFoundError(entityId?: string): MCPServerError {
  return new MCPServerError(
    'ENTITY_NOT_FOUND',
    'Requested entity does not exist',
    entityId ? { entityId } : undefined
  );
}

export function createValidationError(field: string, reason: string): MCPServerError {
  return new MCPServerError(
    'VALIDATION_ERROR',
    'Invalid input parameters',
    { field, reason }
  );
}

export function createInternalError(message: string): MCPServerError {
  return new MCPServerError(
    'INTERNAL_ERROR',
    message
  );
}
