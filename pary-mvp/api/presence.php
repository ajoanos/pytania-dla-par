<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();

$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$participantId = (int)($data['participant_id'] ?? 0);

if ($roomKey === '' || $participantId <= 0) {
    respond(['ok' => false, 'error' => 'Brak danych obecności.']);
}

purgeExpiredRooms();

$room = getRoomByKeyOrFail($roomKey);

$stmt = db()->prepare('UPDATE participants SET last_seen = :last_seen WHERE id = :id AND room_id = :room_id');
$stmt->execute([
    'last_seen' => gmdate('c'),
    'id' => $participantId,
    'room_id' => $room['id'],
]);

respond(['ok' => true]);
