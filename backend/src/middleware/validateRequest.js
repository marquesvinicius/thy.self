import { AppError } from '../utils/AppError.js';

/**
 * Creates a middleware that validates req.body against a schema object.
 *
 * Schema format:
 *   { fieldName: { required: boolean, type: string, maxLength?: number } }
 */
const isMissing = value => value === undefined || value === null || value === '';

/** Erros de um campo segundo suas regras (lista vazia = válido). */
function validateField(field, value, rules) {
  if (isMissing(value)) {
    return rules.required ? [`Field '${field}' is required.`] : [];
  }

  const errors = [];
  if (rules.type && typeof value !== rules.type) {
    errors.push(`Field '${field}' must be of type ${rules.type}.`);
  }
  if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
    errors.push(`Field '${field}' must be ${rules.maxLength} characters or fewer.`);
  }
  return errors;
}

export function validateRequest(schema) {
  return (req, res, next) => {
    // Express 5 deixa req.body undefined quando a requisição não traz JSON.
    const body = req.body ?? {};
    const errors = Object.entries(schema)
      .flatMap(([field, rules]) => validateField(field, body[field], rules));

    if (errors.length > 0) {
      return next(new AppError(errors.join(' '), 400, 'VALIDATION_ERROR'));
    }

    next();
  };
}
