import type { RequestHandler } from 'express';
import { notFound } from '../lib/errors.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`Ruta no encontrada: ${req.method} ${req.path}`));
};
