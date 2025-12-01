import { postJson } from './utils.js';

export function initShareSheet({
    shareLayer,
    shareCard,
    shareOpen,
    shareClose,
    shareBackdrop,
    shareCopy,
    shareFeedback,
    getShareUrl
}) {
    if (!shareLayer || !shareCard || !shareOpen || !shareClose) {
        return;
    }
    shareLayer.hidden = false;
    shareLayer.dataset.open = 'false';
    shareLayer.setAttribute('aria-hidden', 'true');
    shareOpen.disabled = false;
    shareOpen.setAttribute('aria-expanded', 'false');

    const closeSheet = () => {
        shareLayer.dataset.open = 'false';
        shareLayer.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('share-layer-open');
        shareOpen.setAttribute('aria-expanded', 'false');
    };

    const openSheet = () => {
        if (shareLayer.dataset.open === 'true') {
            closeSheet();
            return;
        }
        shareLayer.dataset.open = 'true';
        shareLayer.setAttribute('aria-hidden', 'false');
        document.body.classList.add('share-layer-open');
        shareOpen.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(() => {
            shareCard.focus({ preventScroll: true });
        });
    };

    shareOpen.addEventListener('click', () => {
        openSheet();
    });

    shareClose.addEventListener('click', () => {
        closeSheet();
    });

    if (shareBackdrop) {
        shareBackdrop.addEventListener('click', () => closeSheet());
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && shareLayer.dataset.open === 'true') {
            event.preventDefault();
            closeSheet();
        }
    });

    shareCopy?.addEventListener('click', async () => {
        const url = getShareUrl();
        if (!url || !shareFeedback) {
            return;
        }
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = url;
                textarea.style.position = 'fixed';
                textarea.style.top = '-1000px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            shareFeedback.textContent = 'Skopiowano link do schowka.';
            shareFeedback.hidden = false;
            shareFeedback.dataset.tone = 'success';
            setTimeout(() => {
                shareFeedback.hidden = true;
            }, 4000);
        } catch (error) {
            console.error(error);
            shareFeedback.textContent = 'Nie udało się skopiować linku. Spróbuj ręcznie.';
            shareFeedback.hidden = false;
            shareFeedback.dataset.tone = 'error';
        }
    });
}

export function initShareQrModal({
    shareQrButton,
    shareQrModal,
    shareQrImage,
    shareQrUrl,
    shareQrClose,
    getShareUrl
}) {
    if (!shareQrButton || !shareQrModal) {
        return;
    }

    const closeModal = () => {
        shareQrModal.hidden = true;
        shareQrModal.setAttribute('aria-hidden', 'true');
    };

    const openModal = () => {
        const url = shareQrButton.dataset.shareUrl || getShareUrl();
        if (!url) {
            return;
        }
        const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`;
        if (shareQrImage) {
            shareQrImage.src = qrSrc;
        }
        if (shareQrUrl) {
            shareQrUrl.href = url;
        }
        shareQrModal.hidden = false;
        shareQrModal.setAttribute('aria-hidden', 'false');
    };

    shareQrButton.addEventListener('click', () => {
        openModal();
    });

    shareQrClose?.addEventListener('click', () => {
        closeModal();
    });

    shareQrModal.addEventListener('click', (event) => {
        if (event.target === shareQrModal) {
            closeModal();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !shareQrModal.hidden) {
            closeModal();
        }
    });
}

export function initShareEmailForm({
    shareEmailForm,
    shareEmailInput,
    shareEmailFeedback,
    getShareUrl,
    getShareMessage,
    emailEndpoint,
    subject,
    senderName
}) {
    if (!shareEmailForm || !shareEmailInput) {
        return;
    }

    const submitButton = shareEmailForm.querySelector('button[type="submit"]');

    shareEmailForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!shareEmailInput.checkValidity()) {
            shareEmailInput.reportValidity();
            return;
        }

        const email = shareEmailInput.value.trim();
        const url = shareEmailForm.dataset.shareUrl || getShareUrl();
        const message = shareEmailForm.dataset.shareMessage || getShareMessage(url);

        if (!email || !url) {
            return;
        }

        if (shareEmailFeedback) {
            shareEmailFeedback.hidden = false;
            shareEmailFeedback.textContent = 'Wysyłamy wiadomość…';
            shareEmailFeedback.removeAttribute('data-tone');
        }

        if (submitButton) {
            submitButton.disabled = true;
        }

        try {
            const payload = await postJson(emailEndpoint, {
                partner_email: email,
                share_url: url,
                message,
                subject,
                sender_name: senderName,
                like_count: 0,
            });

            if (!payload?.ok) {
                throw new Error(payload?.error || 'Nie udało się wysłać wiadomości.');
            }

            if (shareEmailFeedback) {
                shareEmailFeedback.hidden = false;
                shareEmailFeedback.dataset.tone = 'success';
                shareEmailFeedback.textContent = 'Wiadomość wysłana! Daj partnerowi znać, żeby sprawdził skrzynkę.';
            }
            shareEmailInput.value = '';
        } catch (error) {
            console.error(error);
            if (shareEmailFeedback) {
                shareEmailFeedback.hidden = false;
                shareEmailFeedback.dataset.tone = 'error';
                shareEmailFeedback.textContent = error instanceof Error && error.message
                    ? error.message
                    : 'Nie udało się wysłać wiadomości.';
            }
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
            }
        }
    });
}

export function updateShareLinks({
    shareOpen,
    shareCopy,
    shareLinks,
    shareQrButton,
    shareEmailForm,
    getShareUrl,
    getShareMessage
}) {
    if (!shareOpen || !shareCopy || !shareLinks) {
        return;
    }
    const url = getShareUrl();
    if (!url) {
        shareOpen.disabled = true;
        shareCopy.disabled = true;
        shareLinks.querySelectorAll('a').forEach((anchor) => {
            anchor.setAttribute('aria-disabled', 'true');
            anchor.setAttribute('tabindex', '-1');
            anchor.removeAttribute('href');
        });
        if (shareQrButton) {
            shareQrButton.disabled = true;
            shareQrButton.removeAttribute('data-share-url');
        }
        if (shareEmailForm) {
            shareEmailForm.dataset.shareUrl = '';
            shareEmailForm.dataset.shareMessage = '';
        }
        return;
    }
    shareOpen.disabled = false;
    const message = getShareMessage(url);
    shareCopy.disabled = false;
    shareLinks.querySelectorAll('a').forEach((anchor) => {
        const channel = anchor.dataset.shareChannel;
        let target = '';
        if (channel === 'messenger') {
            target = `https://m.me/?text=${encodeURIComponent(message)}`;
        } else if (channel === 'whatsapp') {
            target = `https://wa.me/?text=${encodeURIComponent(message)}`;
        } else if (channel === 'sms') {
            target = `sms:&body=${encodeURIComponent(message)}`;
        }
        if (target) {
            anchor.href = target;
            anchor.removeAttribute('aria-disabled');
            anchor.removeAttribute('tabindex');
        }
    });
    if (shareQrButton) {
        shareQrButton.disabled = false;
        shareQrButton.dataset.shareUrl = url;
    }
    if (shareEmailForm) {
        shareEmailForm.dataset.shareUrl = url;
        shareEmailForm.dataset.shareMessage = message;
    }
}
