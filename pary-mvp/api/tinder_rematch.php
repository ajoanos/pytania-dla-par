<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();

$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$participantId = (int)($data['participant_id'] ?? 0);
$sessionId = (int)($data['session_id'] ?? 0);

if ($roomKey === '' || $participantId <= 0 || $sessionId <= 0) {
    respond(['ok' => false, 'error' => 'Brakuje danych pokoju.']);
}

purgeExpiredRooms();

$room = getRoomByKeyOrFail($roomKey);
$participant = getParticipantById($participantId, (int)$room['id']);
if (!$participant) {
    respond(['ok' => false, 'error' => 'Nie znaleziono uczestnika.']);
}

$session = getActiveTinderSession((int)$room['id']);
if (!$session || (int)$session['id'] !== $sessionId) {
    respond(['ok' => false, 'error' => 'Sesja wygasła. Odśwież grę.']);
}

$participants = getRoomParticipants((int)$room['id']);
if (count($participants) < 2) {
    respond(['ok' => false, 'error' => 'Potrzebujesz partnera, aby kontynuować zabawę.']);
}

$progressMap = getTinderSessionProgressMap((int)$session['id']);
$allFinished = haveParticipantsFinishedTinderSession($participants, $progressMap, (int)$session['total_count']);
if (!$allFinished) {
    respond(['ok' => false, 'error' => 'Najpierw dokończcie bieżącą rundę.']);
}

saveTinderRematchVote((int)$room['id'], (int)$session['id'], $participantId, 'rematch');

$votes = getTinderRematchVotes((int)$room['id'], (int)$session['id']);
$ready = haveParticipantsApprovedRematch($participants, $votes);

respond([
    'ok' => true,
    'votes' => $votes,
    'rematch_ready' => $ready,
]);
