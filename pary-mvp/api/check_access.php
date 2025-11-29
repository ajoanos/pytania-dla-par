<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$hasAccess = isset($_SESSION['access_granted']) && $_SESSION['access_granted'] === true;
$accessTime = $_SESSION['access_time'] ?? 0;
$sessionLifetime = defined('SESSION_LIFETIME_SECONDS') ? SESSION_LIFETIME_SECONDS : (24 * 60 * 60);

if ($hasAccess && (time() - $accessTime) < $sessionLifetime) {
    respond(['ok' => true, 'has_access' => true]);
}

respond(['ok' => true, 'has_access' => false]);

