-- Cleanup bad flashcards and concepts generated from question fragments
-- Run this in Supabase SQL Editor once

-- 1. Delete flashcards that contain question fragments or are too short
DELETE FROM flashcards
WHERE front ILIKE '%¿Cuál%'
   OR front ILIKE '%¿Qué%'
   OR front ILIKE '%¿Cómo%'
   OR back ILIKE '%la interpretación más adecuada%'
   OR back ILIKE '%la localización más probable%'
   OR back ILIKE '%el diagnóstico más probable%'
   OR front ILIKE '%paciente%¿%'
   OR LENGTH(front) < 10
   OR LENGTH(back) < 5
   OR front ILIKE '%¿Qué es ¿%'
   OR front ~ '^\¿Qué\ses\s\¿';

-- 2. Delete concepts that are question fragments
DELETE FROM key_concepts
WHERE concept ILIKE '%¿Cuál%'
   OR concept ILIKE '%¿Qué%'
   OR concept ILIKE '%¿Cómo%'
   OR definition ILIKE '%la interpretación más adecuada%'
   OR definition ILIKE '%la localización más probable%'
   OR concept ILIKE '%paciente%'
   OR LENGTH(concept) < 5
   OR LENGTH(definition) < 5
   OR concept ~ '^\¿';

-- 3. Reset SM-2 stats for remaining flashcards
UPDATE flashcards SET ease_factor = 2.5, interval_days = 0, repetitions_count = 0, accuracy_rate = 0, last_studied = NULL, next_review = NULL;

-- 4. Verify remaining counts
SELECT 'flashcards_remaining' as label, COUNT(*) FROM flashcards
UNION ALL
SELECT 'concepts_remaining', COUNT(*) FROM key_concepts;
