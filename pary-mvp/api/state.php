<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$roomKey = strtoupper(trim((string)($_GET['room_key'] ?? '')));
if ($roomKey === '') {
    respond(['ok' => false, 'error' => 'Brak kodu pokoju.']);
}

purgeExpiredRooms();

$room = getRoomByKeyOrFail($roomKey);

$participantId = (int)($_GET['participant_id'] ?? 0);
$participant = null;
if ($participantId > 0) {
    $participant = getParticipantById($participantId, (int)$room['id']);
}

$isHost = $participant && (int)($participant['is_host'] ?? 0) === 1;
$hasFullAccess = $isHost || (($participant['status'] ?? '') === 'active');

$participants = $hasFullAccess ? getRoomParticipants((int)$room['id']) : [];

$pendingRaw = [];
if ($isHost) {
    $pendingRaw = getPendingParticipants((int)$room['id']);
}
$pendingRequests = array_map(static function (array $item): array {
    return [
        'id' => (int)($item['id'] ?? 0),
        'display_name' => (string)($item['display_name'] ?? ''),
    ];
}, $pendingRaw);

$reactions = [];
if ($hasFullAccess) {
    $stmt = db()->prepare('SELECT r.question_id, r.action, r.created_at, p.display_name FROM reactions r
        JOIN participants p ON p.id = r.participant_id
        WHERE r.room_id = :room_id
        ORDER BY r.created_at DESC LIMIT 50');
    $stmt->execute(['room_id' => $room['id']]);
    $reactions = $stmt->fetchAll();
}

$currentQuestion = $hasFullAccess ? getLatestQuestion((int)$room['id']) : null;

$self = null;
if ($participant) {
    $self = [
        'id' => (int)$participant['id'],
        'display_name' => (string)$participant['display_name'],
        'status' => (string)($participant['status'] ?? 'pending'),
        'is_host' => (bool)($participant['is_host'] ?? 0),
    ];
}

respond([
    'ok' => true,
    'participants' => $participants,
    'current_question' => $currentQuestion,
    'reactions' => $reactions,
    'pending_requests' => $pendingRequests,
    'self' => $self,
]);
