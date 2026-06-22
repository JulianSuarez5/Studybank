interface Classification {
  topic: string;
  subtopic: string;
  specialty: string;
}

const KEYWORDS: Record<string, { pattern: RegExp; specialty: string; topic: string; subtopic: string; weight: number }[]> = {
  medicina: [
    { pattern: /anatomía|anatomy|hueso|músculo|órgano|tejido|sistema nervioso|corazón|pulmón/i, specialty: 'Medicina', topic: 'Anatomía', subtopic: 'General', weight: 10 },
    { pattern: /fisiología|physiology|homeostasis|metabolismo|enzima|hormona|neurotransmisor/i, specialty: 'Medicina', topic: 'Fisiología', subtopic: 'General', weight: 10 },
    { pattern: /patología|pathology|enfermedad|síndrome|trastorno|inflamación|neoplasia/i, specialty: 'Medicina', topic: 'Patología', subtopic: 'General', weight: 10 },
    { pattern: /farmacología|fármaco|medicamento|dosis|efecto adverso|indicación|contraindicación/i, specialty: 'Medicina', topic: 'Farmacología', subtopic: 'General', weight: 10 },
    { pattern: /diagnóstico|prueba|examen|laboratorio|imagen|rayos|ecografía|resonancia/i, specialty: 'Medicina', topic: 'Diagnóstico', subtopic: 'General', weight: 10 },
    { pattern: /cirugía|quirúrgico|operación|incisión|resección|anastomosis/i, specialty: 'Medicina', topic: 'Cirugía', subtopic: 'General', weight: 10 },
    { pattern: /pediatría|niño|infantil|neonato|lactante|adolescente/i, specialty: 'Medicina', topic: 'Pediatría', subtopic: 'General', weight: 10 },
    { pattern: /cardiología|corazón|cardíaco|arritmia|infarto|insuficiencia cardíaca|hipertensión/i, specialty: 'Medicina', topic: 'Cardiología', subtopic: 'General', weight: 10 },
    { pattern: /neurología|neurológico|cerebro|neurona|accidente cerebrovascular|epilepsia|demencia/i, specialty: 'Medicina', topic: 'Neurología', subtopic: 'General', weight: 10 },
    { pattern: /respiratorio|pulmón|neumonía|asma|epoc|ventilación|oxígeno/i, specialty: 'Medicina', topic: 'Neumología', subtopic: 'General', weight: 10 },
    { pattern: /digestivo|gastrointestinal|estómago|intestino|hígado|páncreas|colon/i, specialty: 'Medicina', topic: 'Gastroenterología', subtopic: 'General', weight: 10 },
    { pattern: /renal|riñón|nefrología|orina|diálisis|insuficiencia renal|glomérulo/i, specialty: 'Medicina', topic: 'Nefrología', subtopic: 'General', weight: 10 },
    { pattern: /infección|infeccioso|bacteria|virus|hongo|parásito|antibiótico|antiviral/i, specialty: 'Medicina', topic: 'Infectología', subtopic: 'General', weight: 10 },
    { pattern: /embarazo|obstetricia|parto|gestación|fetal|materno|ginecología|útero|ovario/i, specialty: 'Medicina', topic: 'Ginecología y Obstetricia', subtopic: 'General', weight: 10 },
    { pattern: /traumatología|fractura|hueso|articulación|esguince|luxación|ortopedia/i, specialty: 'Medicina', topic: 'Traumatología', subtopic: 'General', weight: 10 },
    { pattern: /dermatología|piel|dermatitis|eccema|psoriasis|melanoma|acné/i, specialty: 'Medicina', topic: 'Dermatología', subtopic: 'General', weight: 10 },
    { pattern: /oftalmología|ojo|visión|córnea|retina|catarata|glaucoma|conjuntivitis/i, specialty: 'Medicina', topic: 'Oftalmología', subtopic: 'General', weight: 10 },
    { pattern: /psiquiatría|psicológico|depresión|ansiedad|esquizofrenia|bipolar|trastorno mental/i, specialty: 'Medicina', topic: 'Psiquiatría', subtopic: 'General', weight: 10 },
    { pattern: /endocrinología|hormona|tiroides|diabetes|glándula|suprarrenal|hipófisis/i, specialty: 'Medicina', topic: 'Endocrinología', subtopic: 'General', weight: 10 },
    { pattern: /hematología|sangre|glóbulo|anemia|leucemia|coagulación|hemoglobina/i, specialty: 'Medicina', topic: 'Hematología', subtopic: 'General', weight: 10 },
    { pattern: /oncología|cáncer|tumor|maligno|benigno|metástasis|quimioterapia|radiación/i, specialty: 'Medicina', topic: 'Oncología', subtopic: 'General', weight: 10 },
    { pattern: /reumatología|autoinmune|artritis|lupus|vasculitis|reumático|colágeno/i, specialty: 'Medicina', topic: 'Reumatología', subtopic: 'General', weight: 10 },
    { pattern: /emergencia|urgencia|trauma|reanimación|svb|sva|triaje|paro cardíaco/i, specialty: 'Medicina', topic: 'Emergencias', subtopic: 'General', weight: 10 },
    { pattern: /bioquímica|biología molecular|adn|arn|proteína|gen|genética|cromosoma/i, specialty: 'Medicina', topic: 'Bioquímica', subtopic: 'General', weight: 10 },
    { pattern: /microbiología|microorganismo|cultivo|tinción|gram|esterilización|asepsia/i, specialty: 'Medicina', topic: 'Microbiología', subtopic: 'General', weight: 10 },
    { pattern: /epidemiología|población|prevalencia|incidencia|brote|pandemia|transmisión/i, specialty: 'Medicina', topic: 'Epidemiología', subtopic: 'General', weight: 10 },
    { pattern: /escala|score|puntuación|clasificación|grado|estadio|fase/i, specialty: 'Medicina', topic: 'Escalas y Clasificaciones', subtopic: 'Clínico', weight: 8 },
    { pattern: /ecg|electrocardiograma|onda|complejo qrs|segmento st|intervalo pr/i, specialty: 'Medicina', topic: 'Cardiología', subtopic: 'ECG', weight: 10 },
    { pattern: /ventilador|vm|respirador|modo ventilatorio|presión|volumen|peep/i, specialty: 'Medicina', topic: 'Ventilación Mecánica', subtopic: 'Cuidados Intensivos', weight: 10 },
    { pattern: /carbunco|ántrax|bacillus anthracis/i, specialty: 'Medicina', topic: 'Infectología', subtopic: 'Enfermedades Bacterianas', weight: 15 },
    { pattern: /rabia|virus rábico|lysavirus/i, specialty: 'Medicina', topic: 'Infectología', subtopic: 'Enfermedades Virales', weight: 15 },
    { pattern: /babesiosis|babesia|imidocarb/i, specialty: 'Medicina', topic: 'Infectología', subtopic: 'Parasitosis', weight: 15 },
    { pattern: /tratamiento|terapia|manejo|indicación/i, specialty: 'Medicina', topic: 'Terapéutica', subtopic: 'General', weight: 7 },
    { pattern: /síntoma|clínica|cuadro clínico|manifestación/i, specialty: 'Medicina', topic: 'Semiología', subtopic: 'General', weight: 7 },
    { pattern: /medicamento|fármaco|droga|principio activo/i, specialty: 'Medicina', topic: 'Farmacología', subtopic: 'Medicamentos', weight: 10 },
    { pattern: /enfermedad|padecimiento|patología|afección/i, specialty: 'Medicina', topic: 'Patología', subtopic: 'Enfermedades', weight: 8 },
    { pattern: /procedimiento|técnica|intervención|maniobra/i, specialty: 'Medicina', topic: 'Procedimientos', subtopic: 'General', weight: 8 },
  ],
  enfermeria: [
    { pattern: /enfermería|cuidado de enfermería|proceso de enfermería|nanda|nic|noc/i, specialty: 'Enfermería', topic: 'Proceso de Enfermería', subtopic: 'General', weight: 10 },
    { pattern: /signos vitales|temperatura|pulso|respiración|presión arterial|saturación/i, specialty: 'Enfermería', topic: 'Signos Vitales', subtopic: 'General', weight: 10 },
    { pattern: /curas|herida|vendaje|drenaje|sutura|apósito|úlcera/i, specialty: 'Enfermería', topic: 'Cuidados de Heridas', subtopic: 'General', weight: 10 },
    { pattern: /medicación|administración|vía|parenteral|oral|intramuscular|intravenosa|subcutánea/i, specialty: 'Enfermería', topic: 'Administración de Medicamentos', subtopic: 'General', weight: 10 },
    { pattern: /sonda|catéter|sondaje|vesical|nasogástrico|rectal/i, specialty: 'Enfermería', topic: 'Sondajes', subtopic: 'General', weight: 10 },
  ],
  derecho: [
    { pattern: /constitución|constitucional|derecho constitucional|carta magna/i, specialty: 'Derecho', topic: 'Derecho Constitucional', subtopic: 'General', weight: 10 },
    { pattern: /penal|delito|culpa|dolo|imputabilidad|pena|cárcel|reclusión/i, specialty: 'Derecho', topic: 'Derecho Penal', subtopic: 'General', weight: 10 },
    { pattern: /civil|contrato|obligación|responsabilidad|propiedad|sucesión|herencia|testamento/i, specialty: 'Derecho', topic: 'Derecho Civil', subtopic: 'General', weight: 10 },
    { pattern: /laboral|trabajo|empleado|empleador|despido|salario|jornada|sindicato/i, specialty: 'Derecho', topic: 'Derecho Laboral', subtopic: 'General', weight: 10 },
    { pattern: /administrativo|administración pública|función pública|acto administrativo|procedimiento/i, specialty: 'Derecho', topic: 'Derecho Administrativo', subtopic: 'General', weight: 10 },
    { pattern: /tributario|impuesto|tributo|iva|renta|contribuyente|declaración/i, specialty: 'Derecho', topic: 'Derecho Tributario', subtopic: 'General', weight: 10 },
    { pattern: /mercantil|comercial|sociedad|empresa|quiebra|concurso|título valor/i, specialty: 'Derecho', topic: 'Derecho Mercantil', subtopic: 'General', weight: 10 },
    { pattern: /procesal|juicio|procedimiento|demanda|recurso|prueba|sentencia|apelación/i, specialty: 'Derecho', topic: 'Derecho Procesal', subtopic: 'General', weight: 10 },
    { pattern: /internacional|tratado|derecho internacional|organismo internacional|onu/i, specialty: 'Derecho', topic: 'Derecho Internacional', subtopic: 'General', weight: 10 },
    { pattern: /familia|matrimonio|divorcio|patria potestad|filiación|adopción|alimentos/i, specialty: 'Derecho', topic: 'Derecho de Familia', subtopic: 'General', weight: 10 },
  ],
};

export function classifyContent(text: string): Classification {
  let best: { specialty: string; topic: string; subtopic: string; weight: number } | null = null;

  for (const [, entries] of Object.entries(KEYWORDS)) {
    for (const entry of entries) {
      const matches = text.match(entry.pattern);
      if (matches) {
        const matchWeight = entry.weight * matches.length;
        if (!best || matchWeight > best.weight) {
          best = { specialty: entry.specialty, topic: entry.topic, subtopic: entry.subtopic, weight: matchWeight };
        }
      }
    }
  }

  if (best) {
    return { specialty: best.specialty, topic: best.topic, subtopic: best.subtopic };
  }

  if (/\b(qué|cuál|cómo|cuándo|dónde|por qué|explique|defina|mencione|describa)\b/i.test(text)) {
    return { specialty: 'General', topic: 'Preguntas Generales', subtopic: 'Conceptos' };
  }

  if (/(?:estudio|estudiar|aprender|concepto|definición|tema|materia|lección)/i.test(text)) {
    return { specialty: 'General', topic: 'Estudio General', subtopic: 'Conceptos' };
  }

  return { specialty: 'General', topic: 'Material de Estudio', subtopic: 'General' };
}
