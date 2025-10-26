<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

define('DB_FILE', __DIR__ . '/../db/data.sqlite');
const ROOM_LIFETIME_SECONDS = 6 * 60 * 60;

if (!function_exists('array_is_list')) {
    function array_is_list(array $array): bool
    {
        if ($array === []) {
            return true;
        }
        $nextKey = 0;
        foreach ($array as $key => $_) {
            if ($key !== $nextKey) {
                return false;
            }
            $nextKey++;
        }
        return true;
    }
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $pdo = new PDO('sqlite:' . DB_FILE, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $pdo->exec('PRAGMA foreign_keys = ON');

    initializeDatabase($pdo);

    return $pdo;
}

function initializeDatabase(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_key TEXT UNIQUE NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL,
        display_name TEXT NOT NULL,
        last_seen DATETIME NOT NULL,
        status TEXT NOT NULL DEFAULT \'pending\',
        is_host INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS session_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL,
        question_id TEXT NOT NULL,
        shown_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(room_id, question_id),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL,
        participant_id INTEGER NOT NULL,
        question_id TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(room_id, participant_id, question_id),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS video_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL,
        sender_id INTEGER NOT NULL,
        target_id INTEGER,
        type TEXT NOT NULL,
        payload TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES participants(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES participants(id) ON DELETE CASCADE
    )');

    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_video_signals_room_target ON video_signals (room_id, target_id, id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_video_signals_room_created ON video_signals (room_id, created_at)');

    $statusAdded = addColumnIfMissing($pdo, 'participants', 'status', "TEXT NOT NULL DEFAULT 'pending'");
    $isHostAdded = addColumnIfMissing($pdo, 'participants', 'is_host', 'INTEGER NOT NULL DEFAULT 0');

    if ($statusAdded) {
        $pdo->exec("UPDATE participants SET status = 'active'");
    } else {
        $pdo->exec("UPDATE participants SET status = 'active' WHERE status IS NULL OR status = ''");
    }

    if ($isHostAdded) {
        $pdo->exec('UPDATE participants SET is_host = 0 WHERE is_host IS NULL');
    }
}

function addColumnIfMissing(PDO $pdo, string $table, string $column, string $definition): bool
{
    if (!preg_match('/^[A-Za-z0-9_]+$/', $table) || !preg_match('/^[A-Za-z0-9_]+$/', $column)) {
        return false;
    }

    $stmt = $pdo->query('PRAGMA table_info(' . $table . ')');
    while ($info = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if (($info['name'] ?? '') === $column) {
            return false;
        }
    }

    $pdo->exec(sprintf('ALTER TABLE %s ADD COLUMN %s %s', $table, $column, $definition));
    return true;
}

function respond(array $data): void
{
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fetchQuestions(): array
{
    $file = __DIR__ . '/../data/questions.json';
    if (!file_exists($file)) {
        return [];
    }
    $content = file_get_contents($file);
    if ($content === false) {
        return [];
    }
    $decoded = json_decode($content, true);
    return is_array($decoded) ? $decoded : [];
}

function purgeExpiredRooms(): void
{
    $stmt = db()->query('SELECT id, room_key, created_at FROM rooms');
    $idsToDelete = [];
    while ($room = $stmt->fetch()) {
        if (isRoomExpired($room)) {
            $idsToDelete[] = (int)$room['id'];
        }
    }
    if (empty($idsToDelete)) {
        return;
    }
    $deleteStmt = db()->prepare('DELETE FROM rooms WHERE id = :id');
    foreach ($idsToDelete as $id) {
        $deleteStmt->execute(['id' => $id]);
    }
}

function isRoomExpired(array $room): bool
{
    $createdAtRaw = $room['created_at'] ?? '';
    if ($createdAtRaw === '') {
        return false;
    }
    try {
        $createdAt = new DateTimeImmutable($createdAtRaw, new DateTimeZone('UTC'));
    } catch (Exception $exception) {
        return false;
    }
    $expiresAt = $createdAt->modify('+' . ROOM_LIFETIME_SECONDS . ' seconds');
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    return $expiresAt < $now;
}

function getRoomByKey(string $roomKey): ?array
{
    $roomKey = strtoupper($roomKey);
    $stmt = db()->prepare('SELECT * FROM rooms WHERE room_key = :room_key');
    $stmt->execute(['room_key' => $roomKey]);
    $room = $stmt->fetch();
    if (!$room) {
        return null;
    }
    if (isRoomExpired($room)) {
        $deleteStmt = db()->prepare('DELETE FROM rooms WHERE id = :id');
        $deleteStmt->execute(['id' => $room['id']]);
        return null;
    }
    return $room;
}

function createRoom(string $roomKey): ?array
{
    $roomKey = strtoupper($roomKey);
    if (getRoomByKey($roomKey)) {
        return null;
    }
    $stmt = db()->prepare('INSERT INTO rooms (room_key, created_at) VALUES (:room_key, :created_at)');
    $stmt->execute([
        'room_key' => $roomKey,
        'created_at' => gmdate('Y-m-d H:i:s'),
    ]);
    return getRoomByKey($roomKey);
}

function ensureParticipant(int $roomId, string $displayName, bool $isHost = false, bool $forceActive = false): array
{
    $stmt = db()->prepare('SELECT * FROM participants WHERE room_id = :room_id AND display_name = :display_name');
    $stmt->execute([
        'room_id' => $roomId,
        'display_name' => $displayName,
    ]);
    $participant = $stmt->fetch();
    if ($participant) {
        $participantId = (int)$participant['id'];
        $needsRefresh = false;

        if ($isHost && (int)($participant['is_host'] ?? 0) !== 1) {
            $update = db()->prepare('UPDATE participants SET is_host = 1, status = :status WHERE id = :id');
            $update->execute([
                'status' => 'active',
                'id' => $participantId,
            ]);
            $needsRefresh = true;
        }

        if ($forceActive && ($participant['status'] ?? '') !== 'active') {
            $update = db()->prepare('UPDATE participants SET status = :status WHERE id = :id');
            $update->execute([
                'status' => 'active',
                'id' => $participantId,
            ]);
            $needsRefresh = true;
        } elseif (!$isHost && !$forceActive && ($participant['status'] ?? '') === 'rejected') {
            $update = db()->prepare('UPDATE participants SET status = :status WHERE id = :id');
            $update->execute([
                'status' => 'pending',
                'id' => $participantId,
            ]);
            $needsRefresh = true;
        }

        if ($needsRefresh) {
            $participant = getParticipantById($participantId, $roomId) ?: $participant;
        }

        return $participant;
    }
    $stmt = db()->prepare('INSERT INTO participants (room_id, display_name, last_seen, status, is_host) VALUES (:room_id, :display_name, :last_seen, :status, :is_host)');
    $stmt->execute([
        'room_id' => $roomId,
        'display_name' => $displayName,
        'last_seen' => gmdate('c'),
        'status' => ($isHost || $forceActive) ? 'active' : 'pending',
        'is_host' => $isHost ? 1 : 0,
    ]);
    $participantId = (int)db()->lastInsertId();
    $stmt = db()->prepare('SELECT * FROM participants WHERE id = :id');
    $stmt->execute(['id' => $participantId]);
    return $stmt->fetch();
}

function requireJsonInput(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond([
            'ok' => false,
            'error' => 'Niepoprawny JSON',
        ]);
    }
    return $data;
}

function getRoomParticipants(int $roomId): array
{
    $stmt = db()->prepare('SELECT id, display_name, last_seen FROM participants WHERE room_id = :room_id AND status = :status ORDER BY display_name');
    $stmt->execute([
        'room_id' => $roomId,
        'status' => 'active',
    ]);
    return $stmt->fetchAll();
}

function getPendingParticipants(int $roomId): array
{
    $stmt = db()->prepare('SELECT id, display_name, last_seen FROM participants WHERE room_id = :room_id AND status = :status ORDER BY id');
    $stmt->execute([
        'room_id' => $roomId,
        'status' => 'pending',
    ]);
    return $stmt->fetchAll();
}

function getParticipantById(int $participantId, int $roomId): ?array
{
    $stmt = db()->prepare('SELECT * FROM participants WHERE id = :id AND room_id = :room_id');
    $stmt->execute([
        'id' => $participantId,
        'room_id' => $roomId,
    ]);
    $participant = $stmt->fetch();
    return $participant ?: null;
}

function updateParticipantStatus(int $participantId, int $roomId, string $status): void
{
    $stmt = db()->prepare('UPDATE participants SET status = :status WHERE id = :id AND room_id = :room_id');
    $stmt->execute([
        'status' => $status,
        'id' => $participantId,
        'room_id' => $roomId,
    ]);
}

function getLatestQuestion(int $roomId): ?array
{
    $stmt = db()->prepare('SELECT question_id FROM session_questions WHERE room_id = :room_id ORDER BY shown_at DESC LIMIT 1');
    $stmt->execute(['room_id' => $roomId]);
    $last = $stmt->fetchColumn();
    if (!$last) {
        return null;
    }
    foreach (fetchQuestions() as $question) {
        if (($question['id'] ?? null) === $last) {
            return $question;
        }
    }
    return null;
}

function getRoomByKeyOrFail(string $roomKey): array
{
    $room = getRoomByKey($roomKey);
    if (!$room) {
        respond(['ok' => false, 'error' => 'Pokój nie istnieje lub wygasł.']);
    }
    return $room;
}
