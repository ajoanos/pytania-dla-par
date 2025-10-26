<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'POST') {
    handleSendSignal();
    return;
}

handleFetchSignals();

function handleSendSignal(): void
{
    $input = requireJsonInput();

    $roomKey = strtoupper(trim((string)($input['room_key'] ?? '')));
    $participantId = (int)($input['participant_id'] ?? 0);
    $type = trim((string)($input['type'] ?? ''));

    if ($roomKey === '' || $participantId <= 0 || $type === '') {
        respond([
            'ok' => false,
            'error' => 'Niepoprawne dane sygnalizacji.',
        ]);
    }

    purgeExpiredRooms();

    $room = getRoomByKeyOrFail($roomKey);
    $roomId = (int)$room['id'];

    $participant = getParticipantById($participantId, $roomId);
    if (!$participant) {
        respond([
            'ok' => false,
            'error' => 'Nie znaleziono uczestnika.',
        ]);
    }

    $targetId = null;
    if (array_key_exists('target_id', $input)) {
        $rawTarget = (int)$input['target_id'];
        if ($rawTarget > 0) {
            $target = getParticipantById($rawTarget, $roomId);
            if ($target) {
                $targetId = $rawTarget;
            }
        }
    }

    $payloadRaw = $input['data'] ?? null;
    $payloadJson = $payloadRaw === null ? null : json_encode($payloadRaw, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($payloadJson === false) {
        respond([
            'ok' => false,
            'error' => 'Nie udało się zakodować danych sygnalizacji.',
        ]);
    }

    cleanupOldSignals($roomId);

    $stmt = db()->prepare('INSERT INTO video_signals (room_id, sender_id, target_id, type, payload, created_at)
        VALUES (:room_id, :sender_id, :target_id, :type, :payload, :created_at)');
    $stmt->execute([
        'room_id' => $roomId,
        'sender_id' => $participantId,
        'target_id' => $targetId,
        'type' => $type,
        'payload' => $payloadJson,
        'created_at' => gmdate('Y-m-d H:i:s'),
    ]);

    respond([
        'ok' => true,
    ]);
}

function handleFetchSignals(): void
{
    $roomKey = strtoupper(trim((string)($_GET['room_key'] ?? '')));
    $participantId = (int)($_GET['participant_id'] ?? 0);
    $afterId = (int)($_GET['after_id'] ?? 0);
    $peerFilter = (int)($_GET['peer_id'] ?? 0);

    if ($roomKey === '' || $participantId <= 0) {
        respond([
            'ok' => false,
            'error' => 'Brak danych do pobrania sygnałów.',
        ]);
    }

    purgeExpiredRooms();

    $room = getRoomByKeyOrFail($roomKey);
    $roomId = (int)$room['id'];

    $participant = getParticipantById($participantId, $roomId);
    if (!$participant) {
        respond([
            'ok' => false,
            'error' => 'Nie znaleziono uczestnika.',
        ]);
    }

    cleanupOldSignals($roomId);

    $cutoff = gmdate('Y-m-d H:i:s', time() - 300);

    $stmt = db()->prepare('SELECT id, sender_id, target_id, type, payload, created_at FROM video_signals
        WHERE room_id = :room_id
          AND created_at >= :cutoff
          AND id > :after_id
          AND sender_id <> :self
          AND (target_id IS NULL OR target_id = :self)
        ORDER BY id ASC
        LIMIT 100');
    $stmt->execute([
        'room_id' => $roomId,
        'cutoff' => $cutoff,
        'after_id' => $afterId,
        'self' => $participantId,
    ]);

    $signals = [];
    $lastId = $afterId;
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $id = (int)($row['id'] ?? 0);
        $senderId = (int)($row['sender_id'] ?? 0);
        if ($peerFilter > 0 && $senderId !== $peerFilter) {
            if ($id > $lastId) {
                $lastId = $id;
            }
            continue;
        }
        $dataRaw = $row['payload'] ?? null;
        $decoded = null;
        if ($dataRaw !== null && $dataRaw !== '') {
            $decoded = json_decode($dataRaw, true);
            if ($decoded === null && json_last_error() !== JSON_ERROR_NONE) {
                $decoded = $dataRaw;
            }
        }
        $signals[] = [
            'id' => $id,
            'sender_id' => $senderId,
            'target_id' => isset($row['target_id']) ? (int)$row['target_id'] : null,
            'type' => (string)($row['type'] ?? ''),
            'data' => $decoded,
            'created_at' => (string)($row['created_at'] ?? ''),
        ];
        if ($id > $lastId) {
            $lastId = $id;
        }
    }

    respond([
        'ok' => true,
        'signals' => $signals,
        'last_id' => $lastId,
    ]);
}

function cleanupOldSignals(int $roomId): void
{
    $threshold = gmdate('Y-m-d H:i:s', time() - 600);
    $stmt = db()->prepare('DELETE FROM video_signals WHERE room_id = :room_id AND created_at < :threshold');
    $stmt->execute([
        'room_id' => $roomId,
        'threshold' => $threshold,
    ]);
}
