import { AppError } from '../utils/AppError.js';

/**
 * Creates a middleware that validates req.body against a schema object.
 *
 * Schema format:
 *   { fieldName: { required: boolean, type: string, maxLength?: number } }
 */
export function validateRequest(schema) {
  return (req, res, next) => {
    const errors = [];
    // Express 5 deixa req.body undefined quando a requisição não traz JSON.
    const body = req.body ?? {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = body[field];

      if (value === undefined || value === null || value === '') {
        if (rules.required) {
          errors.push(`Field '${field}' is required.`);
        }
        continue;
      }

      if (rules.type && typeof value !== rules.type) {
        errors.push(`Field '${field}' must be of type ${rules.type}.`);
      }

      if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
        errors.push(`Field '${field}' must be ${rules.maxLength} characters or fewer.`);
      }
    }

    if (errors.length > 0) {
      return next(new AppError(errors.join(' '), 400, 'VALIDATION_ERROR'));
    }

    next();
  };
}
