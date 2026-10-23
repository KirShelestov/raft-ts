# raft-ts

Пошаговая реализация алгоритма консенсуса Raft на TypeScript строго по статье Ongaro & Ousterhout «In Search of an Understandable Consensus Algorithm (Extended Version)».

## План

| Шаг | Что делаем | Статус |
|-----|------------|--------|
| 1 | Каркас + leader election + status (REST API) | ✅ готово |
| 2 | Репликация лога + add entries / show log (REST API) | — |
| 3 | Key-value поверх Raft + client API (REST API) | — |
| 4 | CAS на k-v + distributed lock + client API (REST API) | — |

## Шаг 1: каркас, выборы лидера, статус

Что сделано:

- **Состояние сервера по рис. 2 статьи.** Персистентное (`currentTerm`, `votedFor`, `log[]`) пишется на диск до ответа на любой RPC; волатильное (`commitIndex`, `lastApplied`) и состояние лидера (`nextIndex[]`, `matchIndex[]`).
- **Три роли и переходы между ними (§5.1, рис. 4):** follower → candidate → leader, откат в follower при виде большего терма.
- **Выборы лидера (§5.2):** рандомизированный election timeout (по умолчанию 150–300 мс), голосование «один голос на терм, кто первый — того и голос», победа при большинстве голосов всего кластера, heartbeat пустыми `AppendEntries` каждые 50 мс.
- **Ограничение выборов (§5.4.1):** голос отдаётся только кандидату, чей лог не отстаёт от лога голосующего.
- **RPC (§5, рис. 2):** `RequestVote` и `AppendEntries` по HTTP/JSON, повтор `RequestVote` при отсутствии ответа.
- **REST API:** `GET /status` показывает роль, терм, за кого голосовал, кто лидер и всё остальное состояние узла.

Что сознательно **не** сделано на этом шаге (по плану это шаг 2): добавление записей в лог, правила 3–5 приёмника `AppendEntries`, продвижение `commitIndex` и применение записей к машине состояний.

### Структура

```
src/
  core/        ядро Raft, не знает ни про HTTP, ни про файлы
    raft-node.ts        узел: роли, таймеры, обработчики RPC, правила рис. 2
    persistent-state.ts currentTerm / votedFor / log с записью на диск до изменения в памяти
    raft-log.ts         лог с индексацией с 1 и сравнение «up-to-date» (§5.4.1)
    leader-state.ts     nextIndex[] / matchIndex[]
    timers.ts           election timer (рандомный) и heartbeat timer
    messages.ts         аргументы и результаты RequestVote / AppendEntries
    storage.ts, transport.ts, logger.ts   порты (интерфейсы) для адаптеров
  storage/     адаптеры хранилища: файл (fsync + атомарный rename) и память
  transport/   HTTP-клиент для RPC между узлами
  api/         HTTP-сервер: RPC-эндпоинты и /status
  rpc/, codec/ маршруты и валидация входящего JSON
  config/      конфиг кластера и аргументы командной строки
  main.ts      сборка узла и запуск
scripts/       локальный кластер и сводка статусов
test/          unit- и интеграционные тесты (node:test)
```

### Запуск

Нужен Node.js 22+.

```bash
npm install
npm test                 # unit, кластер в памяти, реальный HTTP, запуск процессов
npm run cluster          # 5 узлов из cluster.json на портах 3001–3005
npm run cluster -- --storage memory  # те же 5 узлов, состояние только в памяти
npm run cluster -- cluster.two-nodes.json --storage memory  # кластер из 2 узлов
```

В консоли `npm run cluster` доступны команды:

```
status        таблица ролей и термов всех узлов
stop n3       уронить узел (например, лидера) и посмотреть перевыборы
start n3      поднять узел обратно (file: восстановить состояние; memory: начать с пустого)
exit          остановить всё
```

Статус одного узла:

```bash
curl localhost:3001/status
```

```json
{
  "id": "n1",
  "role": "follower",
  "currentTerm": 2,
  "votedFor": "n2",
  "leaderId": "n2",
  "commitIndex": 0,
  "lastApplied": 0,
  "lastLogIndex": 0,
  "lastLogTerm": 0,
  "peers": ["n2", "n3", "n4", "n5"],
  "leaderState": null
}
```

Отдельный узел: `npm run dev -- --id n1 --config cluster.json --data-dir data`, сводка по всем узлам: `npm run status`, сборка: `npm run build && npm start -- --id n1`.

Параметр `--storage file|memory` доступен для отдельного узла и `npm run cluster`.
По умолчанию используется `file`: состояние сохраняется в `--data-dir` (по умолчанию `data`).
При `--storage memory` файлы состояния не читаются и не создаются; после перезапуска
терм, голос и лог сбрасываются. Этот режим предназначен для локальных экспериментов:
гарантии Raft при перезапусках требуют сохранения терма и голоса.
Скрипт кластера передаёт выбранный режим всем узлам, в том числе при команде `start`.
Конфиг можно передать позиционно или через `--config`.

### Две ноды и кворум

Большинство считается от числа узлов **в конфиге**, а не от числа запущенных процессов:
`floor(N / 2) + 1`. Если в `cluster.json` указаны пять узлов, двум запущенным не хватит
голосов: нужен минимум третий. Повторные выборы в такой ситуации ожидаемы; в логах
таймаута выводятся полученные голоса и необходимый кворум.

Для работы вдвоём используйте `cluster.two-nodes.json` (или свой конфиг ровно с двумя
участниками). Тогда кворум равен двум, и обе ноды нужны для выборов.
Число участников и кворум выводятся при запуске; статус такого кластера:
`npm run status -- cluster.two-nodes.json`.
Не меняйте состав уже работающего кластера простым редактированием конфига:
динамическое изменение состава ещё не реализовано. Для локального запуска с другим
составом остановите старый кластер и используйте `memory` или отдельный `--data-dir`.

### REST API

| Метод | Путь | Назначение |
|-------|------|------------|
| `GET` | `/status` | состояние узла |
| `POST` | `/raft/request-vote` | RPC RequestVote (рис. 2) |
| `POST` | `/raft/append-entries` | RPC AppendEntries, на шаге 1 — только heartbeat |
