<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$data = requireJsonInput();
$deck = normalizeDeck($data['deck'] ?? 'default');

try {
    purgeExpiredRooms();

    $attempts = 0;
    $maxAttempts = 20;
    $room = null;

    while ($attempts < $maxAttempts) {
        $attempts++;
        $roomKey = generateRoomKey();
        $room = createRoom($roomKey, $deck);
        if ($room !== null) {
            break;
        }
    }
} catch (PDOException $e) {
    error_log('[rooms] create failed: ' . safeDbErrorMessage($e));
    respondFatal('Nie udało się utworzyć pokoju: ' . safeDbErrorMessage($e));
}

if (!$room) {
    respond([
        'ok' => false,
        'error' => 'Nie udało się utworzyć pokoju. Spróbuj ponownie za chwilę.',
    ]);
}

respond([
    'ok' => true,
    'room_key' => $room['room_key'],
    'deck' => $room['deck'] ?? $deck,
]);
