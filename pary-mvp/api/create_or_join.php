<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();

purgeExpiredRooms();

$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$displayName = trim((string)($data['display_name'] ?? ''));
$mode = strtolower(trim((string)($data['mode'] ?? 'join')));

if ($roomKey === '' || $displayName === '') {
    respond(['ok' => false, 'error' => 'Wymagany kod pokoju i imię.']);
}

$isCreating = $mode === 'create';

if ($isCreating) {
    $room = createRoom($roomKey);
    if ($room === null) {
        respond(['ok' => false, 'error' => 'Pokój o tym kodzie już istnieje. Wybierz inną nazwę.']);
    }
} else {
    $room = getRoomByKey($roomKey);
    if ($room === null) {
        respond(['ok' => false, 'error' => 'Pokój nie istnieje lub wygasł.']);
    }
}

$participant = ensureParticipant((int)$room['id'], $displayName, $isCreating);

$stmt = db()->prepare('UPDATE participants SET last_seen = :last_seen WHERE id = :id');
$stmt->execute([
    'last_seen' => gmdate('c'),
    'id' => $participant['id'],
]);

$participants = getRoomParticipants((int)$room['id']);
$currentQuestion = getLatestQuestion((int)$room['id']);

respond([
    'ok' => true,
    'room_key' => $room['room_key'],
    'participant_id' => $participant['id'],
    'participant_status' => $participant['status'] ?? 'pending',
    'is_host' => (bool)($participant['is_host'] ?? 0),
    'requires_approval' => ($participant['status'] ?? '') !== 'active',
    'participants' => $participants,
    'current_question' => $currentQuestion,
]);
