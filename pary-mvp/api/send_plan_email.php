<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/mail_helpers.php';

$data = requireJsonInput();

$partnerEmail = filter_var($data['partner_email'] ?? $data['email'] ?? '', FILTER_VALIDATE_EMAIL);
if ($partnerEmail === false) {
    respond([
        'ok' => false,
        'error' => 'Podaj poprawny adres e-mail partnera.',
    ]);
}

$senderEmail = filter_var($data['sender_email'] ?? '', FILTER_VALIDATE_EMAIL);
if ($senderEmail === false) {
    respond([
        'ok' => false,
        'error' => 'Podaj poprawny adres e-mail, na który mamy wysyłać odpowiedzi partnera.',
    ]);
}

$roomKey = strtoupper(trim((string)($data['room_key'] ?? '')));
$participantId = (int)($data['participant_id'] ?? 0);
if ($roomKey === '' || $participantId <= 0) {
    respond([
        'ok' => false,
        'error' => 'Nie udało się zidentyfikować pokoju.',
    ]);
}

$room = getRoomByKey($roomKey);
if ($room === null) {
    respond([
        'ok' => false,
        'error' => 'Pokój wygasł lub nie istnieje. Wróć do ekranu startowego.',
    ]);
}

$participant = getParticipantById($participantId, (int)$room['id']);
if (!$participant || ($participant['status'] ?? '') !== 'active') {
    respond([
        'ok' => false,
        'error' => 'Twoje połączenie z pokojem wygasło. Spróbuj ponownie.',
    ]);
}

$senderName = sanitizeLine($data['sender_name'] ?? '');
$mood = sanitizeLine($data['mood'] ?? '');
$closeness = sanitizeLine($data['closeness'] ?? '');
$energy = sanitizeLine($data['energy'] ?? '');
$energyContext = sanitizeParagraph($data['energyContext'] ?? '');
$subject = sanitizeLine($data['subject'] ?? 'Wieczór we dwoje – krótki plan 💛');
if ($subject === '') {
    $subject = 'Wieczór we dwoje – krótki plan 💛';
}

$extras = $data['extras'] ?? [];
if (!is_array($extras)) {
    $extras = [];
}
$extras = array_values(array_filter(array_map('sanitizeLine', $extras), static fn (string $value): bool => $value !== ''));
$extrasText = $extras ? implode(', ', $extras) : 'Brak dodatków';
$extrasJson = json_encode($extras, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if (!is_string($extrasJson)) {
    $extrasJson = '[]';
}

$originUrl = trim((string)($data['origin'] ?? ''));
if ($originUrl !== '' && filter_var($originUrl, FILTER_VALIDATE_URL) === false) {
    $originUrl = '';
}
$baseUrl = trim((string)($data['base_url'] ?? ''));
if ($baseUrl !== '' && filter_var($baseUrl, FILTER_VALIDATE_URL) === false) {
    $baseUrl = '';
}
if ($baseUrl !== '' && substr($baseUrl, -1) !== '/') {
    $baseUrl .= '/';
}

$link = trim((string)($data['link'] ?? ''));
if ($link !== '' && filter_var($link, FILTER_VALIDATE_URL) === false) {
    $link = '';
}

$proposalLink = trim((string)($data['proposal_link'] ?? ''));
if ($proposalLink !== '' && filter_var($proposalLink, FILTER_VALIDATE_URL) === false) {
    $proposalLink = '';
}

if ($link === '') {
    if ($baseUrl !== '') {
        $link = $baseUrl . 'plan-wieczoru-play.html';
    } elseif ($originUrl !== '') {
        $link = rtrim($originUrl, '/') . '/pary-mvp/plan-wieczoru-play.html';
    } else {
        $link = 'https://momenty.pl/pary-mvp/plan-wieczoru-play.html';
    }
}

if ($proposalLink === '') {
    if ($baseUrl !== '') {
        $proposalLink = $baseUrl . 'plan-wieczoru-room.html';
    } elseif ($originUrl !== '') {
        $proposalLink = rtrim($originUrl, '/') . '/pary-mvp/plan-wieczoru-room.html';
    } else {
        $proposalLink = 'https://momenty.pl/pary-mvp/plan-wieczoru-room.html';
    }
}

$token = generateUniqueToken();

$acceptBase = $baseUrl !== '' ? $baseUrl : ($originUrl !== '' ? rtrim($originUrl, '/') . '/pary-mvp/' : 'https://momenty.pl/pary-mvp/');
$acceptUrl = $acceptBase . 'plan-wieczoru-accept.php?token=' . urlencode($token);
$declineUrl = $acceptUrl . '&decision=decline';

createPlanInvite(
    (int)$room['id'],
    (int)$participant['id'],
    $token,
    $senderEmail,
    $partnerEmail,
    $senderName,
    $mood,
    $closeness,
    $extrasJson,
    $energy,
    $energyContext,
    $link,
    $proposalLink
);

$bodyLines = [
    'Twoja druga połówka zaprasza Cię dziś na wieczór pełen bliskości.',
    'Wybrała:',
    '– nastrój: ' . ($mood !== '' ? $mood : '—'),
    '– bliskość: ' . ($closeness !== '' ? $closeness : '—'),
    '– klimat: ' . $extrasText,
    '– energia: ' . ($energy !== '' ? $energy : '—'),
];

if ($energyContext !== '') {
    $bodyLines[] = '';
    $bodyLines[] = $energyContext;
}

$bodyLines[] = '';
$bodyLines[] = 'Kliknij, aby zobaczyć szczegóły planu:';
$bodyLines[] = $link;
$bodyLines[] = '';
$bodyLines[] = 'Zgadzam się: ' . $acceptUrl;
$bodyLines[] = 'Nie zgadzam się: ' . $declineUrl;
$bodyLines[] = '';
$bodyLines[] = 'Masz pomysł na własny wieczór? Uruchom zabawę Plan Wieczoru:';
$bodyLines[] = $proposalLink;

$body = implode("\n", $bodyLines);

if (!sendEmailMessage($partnerEmail, $subject, $body, $senderEmail)) {
    respond([
        'ok' => false,
        'error' => 'Nie udało się wysłać wiadomości. Spróbuj ponownie później.',
    ]);
}

respond(['ok' => true]);

function sanitizeLine(mixed $value): string
{
    $text = trim((string)($value ?? ''));
    return preg_replace('/\s+/', ' ', $text) ?? '';
}

function sanitizeParagraph(mixed $value): string
{
    $text = trim((string)($value ?? ''));
    $text = preg_replace('/\s+/', ' ', $text) ?? '';
    return $text;
}

function generateUniqueToken(): string
{
    do {
        $token = bin2hex(random_bytes(16));
    } while (getPlanInviteByToken($token) !== null);

    return $token;
}
