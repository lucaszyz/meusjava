# Gram Slam - Sistema Web (Google Apps Script + Google Sheets)

Sistema completo para gestão de projeto de tênis com:

- Gestão de alunos
- Gestão de turmas
- Barragem/ranking interno
- Reserva de quadras
- Dashboard com métricas
- Login admin, tema escuro, filtros e exportação JSON

## Estrutura

- `Code.gs`: backend (API + regras de negócio + criação de abas)
- `Index.html`: layout principal SPA
- `Styles.html`: estilo visual dashboard moderno
- `App.html`: lógica do frontend (sem reload)
- `appsscript.json`: manifesto do Apps Script

## Abas criadas automaticamente

- Alunos
- Turmas
- Presenças
- Reservas
- Ranking
- Partidas
- AulasHistorico

## Como publicar

1. Crie um projeto Google Apps Script vinculado a uma planilha Google Sheets.
2. Suba os arquivos com `clasp push`.
3. Faça deploy como Web App (`Executar como você`, acesso conforme sua necessidade).
4. Abra a URL do Web App.

## Login padrão

- Usuário: `admin`
- Senha: `grandslam123`

> Altere em `APP_CONFIG` no arquivo `Code.gs` para produção.

## Observações

- O ranking atualiza automaticamente ao registrar partidas.
- Conflito de horário em reservas é validado no backend.
- O desafiante só pode desafiar jogador acima no ranking.
