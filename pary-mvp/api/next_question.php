<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();
$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$categoryFilter = trim((string)($data['category'] ?? ''));

if ($roomKey === '') {
    respond(['ok' => false, 'error' => 'Brak kodu pokoju.']);
}

$room = getRoomByKeyOrFail($roomKey);
$questions = fetchQuestions();

if ($categoryFilter !== '') {
    $questions = array_values(array_filter($questions, static fn($item) => ($item['category'] ?? '') === $categoryFilter));
}

$stmt = db()->prepare('SELECT question_id FROM session_questions WHERE room_id = :room_id');
$stmt->execute(['room_id' => $room['id']]);
$used = $stmt->fetchAll(PDO::FETCH_COLUMN);

$available = array_values(array_filter($questions, static fn($item) => !in_array($item['id'] ?? '', $used, true)));

if (empty($available)) {
    respond(['ok' => false, 'error' => 'Brak nowych pytań w tej kategorii.']);
}

$randomIndex = mt_rand(0, count($available) - 1);
$question = $available[$randomIndex];

$stmt = db()->prepare('INSERT INTO session_questions (room_id, question_id) VALUES (:room_id, :question_id)');
try {
    $stmt->execute([
        'room_id' => $room['id'],
        'question_id' => $question['id'],
    ]);
} catch (PDOException $e) {
    respond(['ok' => false, 'error' => 'Nie udało się zapisać pytania.']);
}

respond([
    'ok' => true,
    'current_question' => $question,
]);
