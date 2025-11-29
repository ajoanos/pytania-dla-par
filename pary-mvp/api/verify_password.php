<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$data = requireJsonInput();

$password = trim((string)($data['password'] ?? ''));

if ($password === '') {
    respond(['ok' => false, 'error' => 'Brak hasła.']);
}

// Hasło z konfiguracji
$correctPassword = defined('ACCESS_PASSWORD') ? ACCESS_PASSWORD : (getenv('ACCESS_PASSWORD') ?: 'wedwoje25');

if (!hash_equals($correctPassword, $password)) {
    respond(['ok' => false, 'error' => 'Niepoprawne hasło.']);
}

// Ustawiamy sesję z tokenem dostępu
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$_SESSION['access_granted'] = true;
$_SESSION['access_time'] = time();

respond(['ok' => true]);

