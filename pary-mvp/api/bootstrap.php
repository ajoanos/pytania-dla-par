<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

define('DB_FILE', __DIR__ . '/../db/data.sqlite');

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

function getRoomByKey(string $roomKey): ?array
{
    $stmt = db()->prepare('SELECT * FROM rooms WHERE room_key = :room_key');
    $stmt->execute(['room_key' => $roomKey]);
    $room = $stmt->fetch();
    return $room ?: null;
}

function ensureRoom(string $roomKey): array
{
    $roomKey = strtoupper($roomKey);
    $room = getRoomByKey($roomKey);
    if ($room) {
        return $room;
    }
    $stmt = db()->prepare('INSERT INTO rooms (room_key) VALUES (:room_key)');
    $stmt->execute(['room_key' => $roomKey]);
    return getRoomByKey($roomKey);
}

function ensureParticipant(int $roomId, string $displayName): array
{
    $stmt = db()->prepare('SELECT * FROM participants WHERE room_id = :room_id AND display_name = :display_name');
    $stmt->execute([
        'room_id' => $roomId,
        'display_name' => $displayName,
    ]);
    $participant = $stmt->fetch();
    if ($participant) {
        return $participant;
    }
    $stmt = db()->prepare('INSERT INTO participants (room_id, display_name, last_seen) VALUES (:room_id, :display_name, :last_seen)');
    $stmt->execute([
        'room_id' => $roomId,
        'display_name' => $displayName,
        'last_seen' => gmdate('c'),
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
    $stmt = db()->prepare('SELECT id, display_name, last_seen FROM participants WHERE room_id = :room_id ORDER BY display_name');
    $stmt->execute(['room_id' => $roomId]);
    return $stmt->fetchAll();
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
    $room = getRoomByKey(strtoupper($roomKey));
    if (!$room) {
        respond(['ok' => false, 'error' => 'Pokój nie istnieje']);
    }
    return $room;
}
