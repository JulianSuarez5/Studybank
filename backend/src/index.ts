import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import { initDatabase } from './database';
import authRoutes from './routes/auth';
import documentRoutes from './routes/documents';
import questionRoutes from './routes/questions';
import examRoutes from './routes/exams';
import statsRoutes from './routes/stats';
import reviewRoutes from './routes/review';
import flashcardRoutes from './routes/flashcards';
import aiRoutes from './routes/ai';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/review', reviewRoutes);
app.use('/api/flashcards', flashcardRoutes);
app.use('/api/ai', aiRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const frontendPath = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
console.log('Serving frontend from:', frontendPath);
app.use(express.static(frontendPath));

app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`StudyBank running on http://localhost:${PORT}`);
  });
}).catch(console.error);
