const APP_CONFIG = {
  SHEETS: {
    ALUNOS: 'Alunos',
    TURMAS: 'Turmas',
    PRESENCAS: 'Presenças',
    RESERVAS: 'Reservas',
    RANKING: 'Ranking',
    PARTIDAS: 'Partidas',
    AULAS: 'AulasHistorico'
  },
  ADMIN_USER: 'admin',
  ADMIN_PASSWORD: 'grandslam123'
};

const HEADERS = {
  Alunos: ['id', 'nome', 'telefone', 'nivel', 'idade', 'observacoes', 'status', 'createdAt'],
  Turmas: ['id', 'nome', 'professor', 'horario', 'diasSemana', 'limiteAlunos', 'alunosIds', 'ativo', 'createdAt'],
  Presenças: ['id', 'turmaId', 'aulaData', 'alunoId', 'presente', 'observacao', 'createdAt'],
  Reservas: ['id', 'quadra', 'jogador', 'inicio', 'fim', 'tipo', 'status', 'observacao', 'createdAt'],
  Ranking: ['id', 'alunoId', 'posicao', 'vitorias', 'derrotas', 'aproveitamento', 'updatedAt'],
  Partidas: ['id', 'desafianteId', 'desafiadoId', 'vencedorId', 'placar', 'dataPartida', 'createdAt'],
  AulasHistorico: ['id', 'alunoId', 'turmaId', 'dataAula', 'resumo', 'createdAt']
};

function doGet() {
  ensureSheetsStructure();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Gram Slam - Gestão de Tênis')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function ping() {
  return { ok: true, timestamp: new Date().toISOString() };
}

function login(payload) {
  const username = sanitize(payload.username);
  const password = sanitize(payload.password);

  if (username === APP_CONFIG.ADMIN_USER && password === APP_CONFIG.ADMIN_PASSWORD) {
    const token = Utilities.getUuid();
    CacheService.getScriptCache().put(token, username, 60 * 60 * 6);
    return { ok: true, token, username };
  }

  return { ok: false, message: 'Usuário ou senha inválidos.' };
}

function getInitialData(token) {
  validateToken(token);
  ensureSheetsStructure();
  recalculateRanking();

  return {
    alunos: getRows(APP_CONFIG.SHEETS.ALUNOS),
    turmas: getRows(APP_CONFIG.SHEETS.TURMAS),
    presencas: getRows(APP_CONFIG.SHEETS.PRESENCAS),
    reservas: getRows(APP_CONFIG.SHEETS.RESERVAS),
    ranking: getRows(APP_CONFIG.SHEETS.RANKING)
      .sort((a, b) => Number(a.posicao || 999) - Number(b.posicao || 999)),
    partidas: getRows(APP_CONFIG.SHEETS.PARTIDAS)
      .sort((a, b) => new Date(b.dataPartida || 0) - new Date(a.dataPartida || 0)),
    aulasHistorico: getRows(APP_CONFIG.SHEETS.AULAS)
  };
}

function saveAluno(token, aluno) {
  validateToken(token);
  const data = {
    id: aluno.id || Utilities.getUuid(),
    nome: sanitize(aluno.nome),
    telefone: sanitize(aluno.telefone),
    nivel: sanitize(aluno.nivel),
    idade: Number(aluno.idade || 0),
    observacoes: sanitize(aluno.observacoes),
    status: sanitize(aluno.status || 'ativo'),
    createdAt: aluno.createdAt || new Date().toISOString()
  };
  upsertRow(APP_CONFIG.SHEETS.ALUNOS, data);
  ensureRankingEntry(data.id);
  recalculateRanking();
  return { ok: true, aluno: data };
}

function saveTurma(token, turma) {
  validateToken(token);
  const data = {
    id: turma.id || Utilities.getUuid(),
    nome: sanitize(turma.nome),
    professor: sanitize(turma.professor),
    horario: sanitize(turma.horario),
    diasSemana: normalizeArray(turma.diasSemana).join(','),
    limiteAlunos: Number(turma.limiteAlunos || 0),
    alunosIds: normalizeArray(turma.alunosIds).join(','),
    ativo: String(turma.ativo ?? 'true'),
    createdAt: turma.createdAt || new Date().toISOString()
  };

  if (data.alunosIds) {
    const alunos = data.alunosIds.split(',').filter(Boolean);
    if (data.limiteAlunos && alunos.length > data.limiteAlunos) {
      throw new Error('A turma excede o limite de alunos.');
    }
  }

  upsertRow(APP_CONFIG.SHEETS.TURMAS, data);
  return { ok: true, turma: data };
}

function savePresenca(token, payload) {
  validateToken(token);
  const data = {
    id: payload.id || Utilities.getUuid(),
    turmaId: sanitize(payload.turmaId),
    aulaData: sanitize(payload.aulaData),
    alunoId: sanitize(payload.alunoId),
    presente: String(payload.presente),
    observacao: sanitize(payload.observacao),
    createdAt: payload.createdAt || new Date().toISOString()
  };
  upsertRow(APP_CONFIG.SHEETS.PRESENCAS, data);
  return { ok: true, presenca: data };
}

function saveAulaHistorico(token, payload) {
  validateToken(token);
  const data = {
    id: payload.id || Utilities.getUuid(),
    alunoId: sanitize(payload.alunoId),
    turmaId: sanitize(payload.turmaId),
    dataAula: sanitize(payload.dataAula),
    resumo: sanitize(payload.resumo),
    createdAt: payload.createdAt || new Date().toISOString()
  };
  upsertRow(APP_CONFIG.SHEETS.AULAS, data);
  return { ok: true, aula: data };
}

function saveReserva(token, payload) {
  validateToken(token);
  const data = {
    id: payload.id || Utilities.getUuid(),
    quadra: sanitize(payload.quadra),
    jogador: sanitize(payload.jogador),
    inicio: sanitize(payload.inicio),
    fim: sanitize(payload.fim),
    tipo: sanitize(payload.tipo),
    status: sanitize(payload.status || 'Confirmado'),
    observacao: sanitize(payload.observacao),
    createdAt: payload.createdAt || new Date().toISOString()
  };

  if (!isReservationSlotAvailable(data)) {
    return { ok: false, message: 'Conflito de horário detectado para esta quadra.' };
  }

  upsertRow(APP_CONFIG.SHEETS.RESERVAS, data);
  return { ok: true, reserva: data };
}

function savePartida(token, payload) {
  validateToken(token);

  const data = {
    id: payload.id || Utilities.getUuid(),
    desafianteId: sanitize(payload.desafianteId),
    desafiadoId: sanitize(payload.desafiadoId),
    vencedorId: sanitize(payload.vencedorId),
    placar: sanitize(payload.placar),
    dataPartida: sanitize(payload.dataPartida || new Date().toISOString().slice(0, 10)),
    createdAt: payload.createdAt || new Date().toISOString()
  };

  validateChallenge(data.desafianteId, data.desafiadoId);
  upsertRow(APP_CONFIG.SHEETS.PARTIDAS, data);
  recalculateRanking();

  return {
    ok: true,
    partida: data,
    notification: 'Partida registrada! Ranking atualizado automaticamente.'
  };
}

function exportData(token, type) {
  validateToken(token);
  const map = {
    alunos: APP_CONFIG.SHEETS.ALUNOS,
    turmas: APP_CONFIG.SHEETS.TURMAS,
    reservas: APP_CONFIG.SHEETS.RESERVAS,
    ranking: APP_CONFIG.SHEETS.RANKING,
    partidas: APP_CONFIG.SHEETS.PARTIDAS
  };
  const target = map[type];
  if (!target) throw new Error('Tipo de relatório inválido.');
  return getRows(target);
}

function ensureSheetsStructure() {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create('Gram Slam DB');

  Object.keys(HEADERS).forEach((sheetName) => {
    const headers = HEADERS[sheetName];
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    const existingHeader = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const missingHeader = headers.some((h, i) => existingHeader[i] !== h);

    if (missingHeader) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  });
}

function getRows(sheetName) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0];
  return values.slice(1).filter((row) => row.join('') !== '').map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

function upsertRow(sheetName, data) {
  const sheet = getSheet(sheetName);
  const headers = HEADERS[sheetName];
  const rows = sheet.getDataRange().getValues();

  if (rows.length === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.id) {
      rowIndex = i + 1;
      break;
    }
  }

  const rowValues = headers.map((header) => data[header] ?? '');

  if (rowIndex > -1) {
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Aba não encontrada: ${name}`);
  return sheet;
}

function validateToken(token) {
  const user = CacheService.getScriptCache().get(token);
  if (!user) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  return true;
}

function sanitize(value) {
  return String(value ?? '').trim();
}

function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function ensureRankingEntry(alunoId) {
  const ranking = getRows(APP_CONFIG.SHEETS.RANKING);
  const exists = ranking.find((item) => item.alunoId === alunoId);
  if (exists) return;

  upsertRow(APP_CONFIG.SHEETS.RANKING, {
    id: Utilities.getUuid(),
    alunoId,
    posicao: ranking.length + 1,
    vitorias: 0,
    derrotas: 0,
    aproveitamento: 0,
    updatedAt: new Date().toISOString()
  });
}

function recalculateRanking() {
  const alunosAtivos = getRows(APP_CONFIG.SHEETS.ALUNOS)
    .filter((a) => String(a.status).toLowerCase() !== 'inativo');
  const partidas = getRows(APP_CONFIG.SHEETS.PARTIDAS);

  const stats = {};
  alunosAtivos.forEach((a) => {
    stats[a.id] = { alunoId: a.id, vitorias: 0, derrotas: 0, score: 1000 };
  });

  partidas.forEach((p) => {
    if (!stats[p.desafianteId] || !stats[p.desafiadoId]) return;

    const winner = p.vencedorId;
    const loser = winner === p.desafianteId ? p.desafiadoId : p.desafianteId;

    stats[winner].vitorias += 1;
    stats[loser].derrotas += 1;

    stats[winner].score += 25;
    stats[loser].score -= 15;
  });

  const sorted = Object.values(stats).sort((a, b) => b.score - a.score);
  const existing = getRows(APP_CONFIG.SHEETS.RANKING);

  sorted.forEach((item, index) => {
    const total = item.vitorias + item.derrotas;
    const aproveitamento = total ? Math.round((item.vitorias / total) * 100) : 0;
    const current = existing.find((e) => e.alunoId === item.alunoId);

    upsertRow(APP_CONFIG.SHEETS.RANKING, {
      id: current?.id || Utilities.getUuid(),
      alunoId: item.alunoId,
      posicao: index + 1,
      vitorias: item.vitorias,
      derrotas: item.derrotas,
      aproveitamento,
      updatedAt: new Date().toISOString()
    });
  });
}

function validateChallenge(desafianteId, desafiadoId) {
  const ranking = getRows(APP_CONFIG.SHEETS.RANKING);
  const desafiante = ranking.find((r) => r.alunoId === desafianteId);
  const desafiado = ranking.find((r) => r.alunoId === desafiadoId);

  if (!desafiante || !desafiado) {
    throw new Error('Jogadores não encontrados no ranking.');
  }

  if (Number(desafiante.posicao) <= Number(desafiado.posicao)) {
    throw new Error('O desafiante só pode desafiar jogadores acima no ranking.');
  }
}

function isReservationSlotAvailable(newReservation) {
  const reservas = getRows(APP_CONFIG.SHEETS.RESERVAS);

  const novoInicio = new Date(newReservation.inicio).getTime();
  const novoFim = new Date(newReservation.fim).getTime();

  return !reservas.some((r) => {
    if (r.id === newReservation.id) return false;
    if (String(r.status).toLowerCase() === 'cancelado') return false;
    if (r.quadra !== newReservation.quadra) return false;

    const inicioExistente = new Date(r.inicio).getTime();
    const fimExistente = new Date(r.fim).getTime();

    return novoInicio < fimExistente && novoFim > inicioExistente;
  });
}
