'use strict';

// Adaptación greedy best-first en un grafo de necesidades: la raíz conecta con
// áreas; cada área con sus necesidades; estas con cursos candidatos. h(n) es
// la puntuación ponderada de compatibilidad (0–100). La frontera es una cola
// de prioridad; se extrae primero el nodo candidato con menor h-coste (=100-score).
window.FLORECE_RECOMMENDER = (() => {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function recommend(answers, catalog = window.FLORECE_CATALOG) {
    const candidates = catalog.filter(item => {
      if (answers.budget === 'free' && item.free === false) return false;
      if (answers.modality === 'online' && /presencial/i.test(item.modality)) return false;
      if (answers.modality === 'in-person' && /en linea/i.test(item.modality)) return false;
      return true;
    }).map(item => {
      const area = normalize(answers.area), need = normalize(answers.need), tags = item.tags.map(normalize);
      const category = normalize(item.category);
      const areaMatch = category.includes(area) || tags.some(tag => tag.includes(area) || area.includes(tag));
      const needWords = need.split(/\s+/).filter(word => word.length > 3);
      const needHits = needWords.filter(word => normalize(item.name+' '+item.description+' '+tags.join(' ')).includes(word)).length;
      const needMatch = needHits / Math.max(1, needWords.length);
      const businessMatch = tags.some(tag => tag.includes(normalize(answers.business)));
      const modalityMatch = answers.modality === 'any' || /en linea/i.test(item.modality) && answers.modality === 'online' || /presencial/i.test(item.modality) && answers.modality === 'in-person';
      const budgetMatch = answers.budget === 'any' || answers.budget === 'low' || item.free === true;
      const availabilityMatch = item.status === 'Verificado' ? 5 : item.status === 'Recurso informativo' ? 3 : 0;
      const score = Math.round((areaMatch?35:0) + needMatch*30 + (businessMatch?10:0) + (modalityMatch?10:0) + (budgetMatch?10:0) + availabilityMatch);
      const uncertainty = item.free !== true && answers.budget === 'free' || answers.modality === 'in-person' && /consultar/i.test(item.modality);
      if (!areaMatch && needHits === 0) return null;
      return {...item, score, reason:`Se relaciona con ${answers.area.toLowerCase()} y puede ayudarte a ${answers.need.toLowerCase()}.${uncertainty?' La modalidad o el costo no están confirmados; consulta la fuente antes de considerarla compatible.':''}`};
    }).filter(Boolean);
    // Best-first: ordenar la frontera por h=100-score y expandir candidatos
    // hasta reunir tres útiles. Recurso/no confirmado también se etiqueta.
    const frontier = candidates.sort((a,b) => b.score-a.score);
    const selected = [];
    while (frontier.length && selected.length < 3) {
      const next = frontier.shift();
      if (next.score >= 25) selected.push(next);
    }
    return selected;
  }
  return {recommend};
})();
