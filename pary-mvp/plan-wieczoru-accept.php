<?php

declare(strict_types=1);

define('BOOTSTRAP_EMIT_JSON', false);

require __DIR__ . '/api/bootstrap.php';
require __DIR__ . '/api/mail_helpers.php';

$token = trim((string)($_GET['token'] ?? ''));
$status = 'invalid';
$headline = 'Ups!';
$message = 'Link jest niepoprawny lub wygasł.';

if ($token !== '') {
    $invite = getPlanInviteByToken($token);
    if ($invite) {
        $alreadyAccepted = isset($invite['accepted_at']) && $invite['accepted_at'] !== '';
        if (!$alreadyAccepted) {
            markPlanInviteAccepted((int)$invite['id']);

            $senderName = trim((string)($invite['sender_name'] ?? ''));
            $partnerEmail = trim((string)($invite['partner_email'] ?? ''));
            $senderEmail = trim((string)($invite['sender_email'] ?? ''));
            $planLink = trim((string)($invite['plan_link'] ?? ''));
            if ($planLink === '') {
                $planLink = 'https://momenty.pl/';
            }

            $extras = [];
            if (isset($invite['extras_json'])) {
                $decoded = json_decode((string)$invite['extras_json'], true);
                if (is_array($decoded)) {
                    $extras = array_values(array_filter(array_map('trim', $decoded), static fn ($item) => $item !== ''));
                }
            }

            $summaryLines = [
                '– nastrój: ' . formatValue($invite['mood'] ?? ''),
                '– bliskość: ' . formatValue($invite['closeness'] ?? ''),
                '– klimat: ' . ($extras !== [] ? implode(', ', $extras) : 'Brak dodatków'),
                '– energia: ' . formatValue($invite['energy'] ?? ''),
            ];

            $acceptSubject = 'Plan Wieczoru został zaakceptowany 💛';
            $acceptLines = [
                'Cześć' . ($senderName !== '' ? ' ' . $senderName : '') . '!',
                ($partnerEmail !== '' ? 'Partner (' . $partnerEmail . ') potwierdził Wasz plan wieczoru.' : 'Partner potwierdził Wasz plan wieczoru.'),
                '',
                'Podsumowanie planu:',
            ];
            $acceptLines = array_merge($acceptLines, $summaryLines);

            $energyContext = trim((string)($invite['energy_context'] ?? ''));
            if ($energyContext !== '') {
                $acceptLines[] = '';
                $acceptLines[] = $energyContext;
            }

            $acceptLines[] = '';
            $acceptLines[] = 'Możesz wrócić do zabawy Plan Wieczoru:';
            $acceptLines[] = $planLink;
            $acceptLines[] = '';
            $acceptLines[] = 'Miłego wieczoru! 💛';

            $acceptBody = implode("\n", $acceptLines);
            if ($senderEmail !== '' && filter_var($senderEmail, FILTER_VALIDATE_EMAIL)) {
                sendEmailMessage($senderEmail, $acceptSubject, $acceptBody, $partnerEmail !== '' ? $partnerEmail : null);
            }

            $status = 'accepted';
            $headline = 'Zgoda zapisana!';
            $message = 'Dziękujemy za potwierdzenie. Twój partner otrzymał wiadomość z informacją, że się zgadzasz.';
        } else {
            $status = 'already';
            $headline = 'Plan już potwierdzony';
            $message = 'Wygląda na to, że ten plan został już zaakceptowany wcześniej.';
        }
    }
}

function formatValue(mixed $value): string
{
    $text = trim((string)($value ?? ''));
    return $text !== '' ? $text : '—';
}
?>
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Plan Wieczoru – Potwierdzenie</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="stylesheet" href="assets/css/style.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;700&display=swap" rel="stylesheet">
</head>
<body class="page page--game" data-theme="light">
  <main class="container">
    <header class="hero">
      <div class="hero__branding">
        <img
          class="hero__logo"
          src="https://sklep.allemedia.pl/momenty/logo.png"
          alt="Momenty"
        />
        <div class="hero__text">
          <h1><?= htmlspecialchars($headline, ENT_QUOTES, 'UTF-8') ?></h1>
          <p><?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?></p>
        </div>
      </div>
    </header>

    <section class="card card--game">
      <header class="card__header">
        <h2>Co dalej?</h2>
      </header>
      <p>
        <a class="btn btn--primary" href="plan-wieczoru.html">Wróć do zabawy Plan Wieczoru</a>
      </p>
    </section>
  </main>
</body>
</html>
