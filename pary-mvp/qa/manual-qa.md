# Manual QA – navbar, theme persistence, logo navigation

Date: 2025-11-30
Tester: ChatGPT
Environment: PHP dev server (`php -S 0.0.0.0:8000`) with guard bypassed via init script for token `qa123`.

## Test coverage
- Home page (`/index.html?token=qa123`)
- Static game (`/pytania-dla-par.html?token=qa123`)
- Room-based game (`/room.html?room_key=XC6NNV&pid=1&name=QA&token=qa123` with room seeded via `api/request_room.php` and `api/create_or_join.php`)
- Responsive check on home (desktop 1280×720, mobile 375×667)

## Results
1. **Theme toggle and persistence (localStorage)**
   - Home loaded in light mode; toggle button had `aria-label="Przełącz motyw"`. Switching to dark updated `data-theme` to `dark` and persisted after reload via `pary.theme` entry; topbar logo href preserved token (`index.html?token=qa123`).
   - Static game opened with dark theme carried over from home. Toggling back to light persisted through reload and across navigation (logo href retained token, returned to home with `token=qa123`).
   - Room page initially reflected stored light theme; toggling to dark persisted after reload. Hero logo link included tokenized homepage URL.

2. **Logo navigation and token propagation**
   - Topbar brand links on home and static game, plus hero logo on room page, all pointed to `index.html` with `token=qa123`, confirming token propagation for return navigation.

3. **Responsiveness & accessibility**
   - Mobile viewport still displayed logo and theme toggle; controls remained accessible on both viewports.
   - Theme toggle exposes `aria-label="Przełącz motyw"` and defines hover/focus-visible styles for keyboard users (outline + elevated state).

## Playwright interaction log
Home aria-label: Przełącz motyw
Home theme before toggle: light
Home theme after toggle: dark
Home theme after reload: dark
Home logo href: http://127.0.0.1:8000/index.html?token=qa123
Static page theme initial: dark
Static page theme after toggle: light
Static page theme after reload: light
Static logo href: http://127.0.0.1:8000/index.html?token=qa123
Room theme initial: light
Room theme after toggle: dark
Room theme after reload: dark
Room logo href: http://127.0.0.1:8000/index.html?token=qa123
Mobile home logo visible: True, toggle visible: True
