import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'studybank-secret-key-change-in-production';

export interface AuthRequest extends Request {
  userId?: number;
  userName?: string;
}

export function generateToken(userId: number, email: string): string {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; email: string };
    req.userId = decoded.userId;
    req.userName = decoded.email;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
