import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../database';
import { generateToken, AuthRequest, authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/register', async (req: AuthRequest, res: Response) => {
  try {
    const { email, name, password } = req.body;
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    const db = getDb();
    const existing = await db.prepare('SELECT id FROM users WHERE email = $1').get(email);
    if (existing) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    const hashed = bcrypt.hashSync(password, 10);
    const result = await db.prepare('INSERT INTO users (email, name, password) VALUES ($1, $2, $3)').run(email, name, hashed);
    const token = generateToken(result.lastInsertRowid as number, email);

    res.json({
      token,
      user: { id: result.lastInsertRowid, email, name },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    const db = getDb();
    const user = await db.prepare('SELECT * FROM users WHERE email = $1').get(email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = generateToken(user.id, user.email);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'No autorizado' });
    const db = getDb();
    const user = await db.prepare('SELECT id, email, name, created_at FROM users WHERE id = $1').get(req.userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
