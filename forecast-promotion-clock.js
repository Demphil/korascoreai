export const PROMOTION_VISIBLE_MS = 5000;
export const PROMOTION_CYCLE_MS = 60000;
export const PROMOTION_FIRST_MS = 1800;
/** Viewport changes and hidden tabs cancel timers; no queued bursts on return. */
export function mountPromotion(setVisible, win, doc) {
    const wide = win.matchMedia('(min-width: 1440px)');
    let timer;
    let stopped = false;
    let dismissed = false;
    try {
        dismissed = win.sessionStorage.getItem('forecast-promotion-dismissed') === '1';
    }
    catch { /* Storage is optional. */ }
    const cancel = () => { if (timer !== undefined)
        win.clearTimeout(timer); timer = undefined; };
    const show = () => {
        if (stopped || dismissed || doc.visibilityState !== 'visible')
            return;
        setVisible(true);
        if (!wide.matches)
            timer = win.setTimeout(() => {
                // Keep focused controls usable for keyboard visitors until focus leaves.
                if (doc.activeElement?.closest('[data-forecast-promotion]')) {
                    timer = win.setTimeout(hide, 250);
                }
                else
                    hide();
            }, PROMOTION_VISIBLE_MS);
    };
    const hide = () => {
        if (doc.activeElement?.closest('[data-forecast-promotion]')) {
            timer = win.setTimeout(hide, 250);
            return;
        }
        setVisible(false);
        timer = win.setTimeout(show, PROMOTION_CYCLE_MS - PROMOTION_VISIBLE_MS);
    };
    const restart = () => {
        cancel();
        setVisible(false);
        if (!stopped && !dismissed && doc.visibilityState === 'visible')
            timer = win.setTimeout(show, wide.matches ? 700 : PROMOTION_FIRST_MS);
    };
    wide.addEventListener('change', restart);
    doc.addEventListener('visibilitychange', restart);
    restart();
    return {
        dismiss() { dismissed = true; cancel(); setVisible(false); try {
            win.sessionStorage.setItem('forecast-promotion-dismissed', '1');
        }
        catch { /* Optional. */ } },
        dispose() { stopped = true; cancel(); wide.removeEventListener('change', restart); doc.removeEventListener('visibilitychange', restart); },
    };
}
