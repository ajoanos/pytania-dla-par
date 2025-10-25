<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$roomKey = strtoupper(trim((string)($_GET['room_key'] ?? '')));
if ($roomKey === '') {
    respond(['ok' => false, 'error' => 'Brak kodu pokoju.']);
}

purgeExpiredRooms();

$room = getRoomByKeyOrFail($roomKey);

$participants = getRoomParticipants((int)$room['id']);

$stmt = db()->prepare('SELECT r.question_id, r.action, r.created_at, p.display_name FROM reactions r
    JOIN participants p ON p.id = r.participant_id
    WHERE r.room_id = :room_id
    ORDER BY r.created_at DESC LIMIT 50');
$stmt->execute(['room_id' => $room['id']]);
$reactions = $stmt->fetchAll();

$currentQuestion = getLatestQuestion((int)$room['id']);

respond([
    'ok' => true,
    'participants' => $participants,
    'current_question' => $currentQuestion,
    'reactions' => $reactions,
]);
