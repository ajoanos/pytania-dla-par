<?php

declare(strict_types=1);

// Konfiguracja aplikacji

// Poświadczenia bazy – można je nadpisać zmiennymi środowiskowymi
define('DB_DSN', getenv('DB_DSN') ?: 'mysql:host=mariadb118.server537967.nazwa.pl;port=3306;dbname=server537967_momenty;charset=utf8mb4');
define('DB_USER', getenv('DB_USER') ?: 'server537967_momenty');
define('DB_PASSWORD', getenv('DB_PASSWORD') ?: '090787Az44!?');

// Hasło dostępu - można ustawić przez zmienną środowiskową
define('ACCESS_PASSWORD', getenv('ACCESS_PASSWORD') ?: 'wedwoje25');

// Czas życia pokoju (w sekundach)
define('ROOM_LIFETIME_SECONDS', 6 * 60 * 60); // 6 godzin

// Czas życia sesji autoryzacji (w sekundach)
define('SESSION_LIFETIME_SECONDS', 24 * 60 * 60); // 24 godziny

// Rate limiting - domyślne wartości
define('RATE_LIMIT_DEFAULT_MAX', 30); // domyślna liczba żądań
define('RATE_LIMIT_DEFAULT_WINDOW', 60); // domyślne okno czasowe (sekundy)

// Rate limiting dla konkretnych endpointów
define('RATE_LIMIT_IMPORT_MAX', 5); // import pytań
define('RATE_LIMIT_IMPORT_WINDOW', 300); // 5 minut

define('RATE_LIMIT_CREATE_JOIN_MAX', 20); // tworzenie/dołączanie do pokoju
define('RATE_LIMIT_CREATE_JOIN_WINDOW', 60); // 1 minuta

define('RATE_LIMIT_CHAT_MAX', 30); // wiadomości czatu
define('RATE_LIMIT_CHAT_WINDOW', 60); // 1 minuta

define('RATE_LIMIT_REACT_MAX', 50); // reakcje
define('RATE_LIMIT_REACT_WINDOW', 60); // 1 minuta

define('RATE_LIMIT_QUESTION_MAX', 30); // losowanie pytań
define('RATE_LIMIT_QUESTION_WINDOW', 60); // 1 minuta

// Maksymalna długość wiadomości czatu
define('CHAT_MESSAGE_MAX_LENGTH', 1000);

// Maksymalna długość nazwy uczestnika
define('DISPLAY_NAME_MAX_LENGTH', 50);

// Częstotliwość czyszczenia wygasłych pokoi (sekundy)
define('PURGE_EXPIRED_ROOMS_INTERVAL', 300); // 5 minut


