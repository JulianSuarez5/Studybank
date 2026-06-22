import { getDb } from '../database';

interface SM2Card {
  id: number;
  user_id: number;
  flashcard_id: number;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review: string;
  last_quality: number;
}

export async function initSpacedRepetition(userId: number, flashcardId: number): Promise<void> {
  const db = getDb();
  const existing = await db.prepare(
    'SELECT id FROM spaced_repetition WHERE user_id = $1 AND flashcard_id = $2'
  ).get(userId, flashcardId);
  if (!existing) {
    await db.prepare(
      'INSERT INTO spaced_repetition (user_id, flashcard_id) VALUES ($1, $2)'
    ).run(userId, flashcardId);
  }
}

export async function updateSpacedRepetition(userId: number, flashcardId: number, quality: number): Promise<SM2Card> {
  const db = getDb();
  let card = await db.prepare(
    'SELECT * FROM spaced_repetition WHERE user_id = $1 AND flashcard_id = $2'
  ).get(userId, flashcardId) as SM2Card | undefined;

  if (!card) {
    await initSpacedRepetition(userId, flashcardId);
    card = await db.prepare(
      'SELECT * FROM spaced_repetition WHERE user_id = $1 AND flashcard_id = $2'
    ).get(userId, flashcardId) as SM2Card;
  }

  const q = Math.max(0, Math.min(5, quality));
  let { ease_factor, interval_days, repetitions } = card;

  if (q < 3) {
    repetitions = 0;
    interval_days = 1;
  } else {
    if (repetitions === 0) interval_days = 1;
    else if (repetitions === 1) interval_days = 6;
    else interval_days = Math.round(interval_days * ease_factor);
    repetitions += 1;
  }

  ease_factor = ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ease_factor < 1.3) ease_factor = 1.3;

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval_days);

  await db.prepare(`
    UPDATE spaced_repetition SET ease_factor = $1, interval_days = $2, repetitions = $3,
      next_review = $4, last_quality = $5 WHERE id = $6
  `).run(ease_factor, interval_days, repetitions, nextReview.toISOString(), q, card.id);

  return { ...card, ease_factor, interval_days, repetitions, next_review: nextReview.toISOString(), last_quality: q };
}

export async function getCardsDueForReview(userId: number, limit: number = 20): Promise<any[]> {
  const db = getDb();
  const now = new Date().toISOString();

  const cards = await db.prepare(`
    SELECT sr.*, f.front, f.back, f.topic FROM spaced_repetition sr
    JOIN flashcards f ON f.id = sr.flashcard_id
    WHERE sr.user_id = $1 AND sr.next_review <= $2::timestamp
    ORDER BY sr.next_review ASC LIMIT $3
  `).all(userId, now, limit);

  return cards;
}

export async function getCardStats(userId: number): Promise<{ total: number; dueToday: number; mature: number; young: number }> {
  const db = getDb();
  const now = new Date().toISOString();

  const total = (await db.prepare('SELECT COUNT(*)::int as c FROM spaced_repetition WHERE user_id = $1').get(userId)).c;
  const dueToday = (await db.prepare(
    'SELECT COUNT(*)::int as c FROM spaced_repetition WHERE user_id = $1 AND next_review <= $2::timestamp'
  ).get(userId, now)).c;
  const mature = (await db.prepare(
    'SELECT COUNT(*)::int as c FROM spaced_repetition WHERE user_id = $1 AND interval_days >= 21'
  ).get(userId)).c;
  const young = total - mature;

  return { total, dueToday, mature, young };
}

export async function getForgottenProbability(userId: number, topic: string): Promise<number> {
  const db = getDb();
  const cards = await db.prepare(`
    SELECT sr.* FROM spaced_repetition sr
    JOIN flashcards f ON f.id = sr.flashcard_id
    WHERE sr.user_id = $1 AND f.topic = $2
  `).all(userId, topic) as SM2Card[];

  if (cards.length === 0) return 0.5;

  const now = Date.now();
  const probabilities = cards.map(c => {
    const nextReview = new Date(c.next_review).getTime();
    const daysOverdue = (now - nextReview) / (1000 * 60 * 60 * 24);
    if (daysOverdue <= 0) return 0.2;
    const ef = c.ease_factor;
    return Math.min(0.95, 0.2 + (daysOverdue / (c.interval_days || 1)) * (1 / ef));
  });

  return probabilities.reduce((a, b) => a + b, 0) / probabilities.length;
}
