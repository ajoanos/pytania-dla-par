<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();

$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$displayName = trim((string)($data['display_name'] ?? ''));

if ($roomKey === '' || $displayName === '') {
    respond(['ok' => false, 'error' => 'Wymagany kod pokoju i imię.']);
}

$room = ensureRoom($roomKey);
$participant = ensureParticipant((int)$room['id'], $displayName);

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
    'participants' => $participants,
    'current_question' => $currentQuestion,
]);
