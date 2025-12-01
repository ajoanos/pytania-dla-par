<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$roomKey = strtoupper(trim((string)($_GET['room_key'] ?? '')));
if ($roomKey === '') {
    respond(['ok' => false, 'error' => 'Brak kodu pokoju.']);
}

purgeExpiredRooms();

$room = getRoomByKeyOrFail($roomKey);
$roomDeck = normalizeDeck($room['deck'] ?? 'default');

$sinceMessageId = (int)($_GET['since_message_id'] ?? 0);
$sinceReactionId = (int)($_GET['since_reaction_id'] ?? 0);

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
    $stmt = db()->prepare('SELECT r.id, r.question_id, r.action, r.created_at, p.display_name FROM reactions r
        JOIN participants p ON p.id = r.participant_id
        WHERE r.room_id = :room_id AND r.id > :since_id
        ORDER BY r.created_at DESC LIMIT 50');
    $stmt->execute([
        'room_id' => $room['id'],
        'since_id' => $sinceReactionId,
    ]);
    $reactionsRaw = $stmt->fetchAll();

    $questions = fetchQuestions($roomDeck);
    $questionMap = [];
    foreach ($questions as $question) {
        $id = (string)($question['id'] ?? '');
        if ($id === '') {
            continue;
        }
        $questionMap[$id] = [
            'text' => (string)($question['text'] ?? ''),
        ];
    }

    $reactions = array_map(static function (array $reaction) use ($questionMap): array {
        $questionId = (string)($reaction['question_id'] ?? '');
        $question = $questionMap[$questionId] ?? ['text' => ''];
        return [
            'id' => (int)($reaction['id'] ?? 0),
            'question_id' => $questionId,
            'action' => (string)($reaction['action'] ?? ''),
            'created_at' => (string)($reaction['created_at'] ?? ''),
            'display_name' => (string)($reaction['display_name'] ?? ''),
            'question_text' => (string)($question['text'] ?? ''),
        ];
    }, $reactionsRaw);
}

$currentQuestion = $hasFullAccess ? getLatestQuestion((int)$room['id'], $roomDeck) : null;
$messages = $hasFullAccess ? fetchChatMessages((int)$room['id'], $roomKey, 60, $sinceMessageId) : [];

$self = null;
if ($participant) {
    $self = [
        'id' => (int)$participant['id'],
        'display_name' => (string)$participant['display_name'],
        'status' => (string)($participant['status'] ?? 'pending'),
        'is_host' => (bool)($participant['is_host'] ?? 0),
    ];
}

$response = [
    'ok' => true,
    'participants' => $participants,
    'current_question' => $currentQuestion,
    'reactions' => $reactions,
    'pending_requests' => $pendingRequests,
    'messages' => $messages,
    'self' => $self,
    'deck' => $roomDeck,
];

// ETag generation
$hashData = json_encode([
    'p' => $participants,
    'q' => $currentQuestion,
    'r' => $reactions,
    'pr' => $pendingRequests,
    'm' => $messages,
    's' => $self,
]);
$etag = '"' . md5($hashData) . '"';

if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
    header('HTTP/1.1 304 Not Modified');
    exit;
}

header('ETag: ' . $etag);
respond($response);
