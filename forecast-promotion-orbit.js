export const ORBIT_INTERVAL_MS = 120_000;
export const ORBIT_DURATION_MS = 6_000;
/** Upper semicircle with depth at its midpoint, sampled only once per transfer. */
export function orbitFrames(distance, lift, fromRight) {
    return Array.from({ length: 25 }, (_, index) => {
        const t = index / 24, depth = Math.sin(Math.PI * t);
        const progress = (1 - Math.cos(Math.PI * t)) / 2;
        const x = distance * (fromRight ? 1 - progress : progress);
        return { offset: t, transform: `perspective(1400px) translate3d(${x}px,${-lift * depth}px,${-500 * depth}px) rotateY(${(fromRight ? -1 : 1) * 20 * depth}deg) scale(${1 - .28 * depth})` };
    });
}
export function mountOrbit(host, win, doc) {
    const wide = win.matchMedia('(min-width: 1440px)');
    const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
    let timer;
    let animation;
    let right = false, stopped = false;
    const cancel = () => {
        if (timer !== undefined)
            win.clearTimeout(timer);
        timer = undefined;
        if (animation) {
            animation.onfinish = null;
            animation.cancel();
            animation = undefined;
        }
        delete host.dataset.transit;
    };
    const schedule = (delay = ORBIT_INTERVAL_MS) => {
        if (!stopped && wide.matches && !reduced.matches && doc.visibilityState === 'visible')
            timer = win.setTimeout(transfer, delay);
    };
    const transfer = () => {
        timer = undefined;
        if (stopped || !wide.matches || reduced.matches || doc.visibilityState !== 'visible')
            return;
        if (host.hidden || host.matches(':hover') || host.contains(doc.activeElement)) {
            schedule(1000);
            return;
        }
        if (typeof host.animate !== 'function')
            return;
        const css = win.getComputedStyle(host), inset = parseFloat(css.left) || 20;
        const distance = Math.max(0, win.innerWidth - 2 * inset - host.offsetWidth);
        const lift = Math.min(170, win.innerHeight * .15, Math.max(0, parseFloat(css.top) - 40));
        host.dataset.transit = 'true';
        animation = host.animate(orbitFrames(distance, lift, right), { duration: ORBIT_DURATION_MS, easing: 'linear', fill: 'forwards' });
        animation.onfinish = () => {
            right = !right;
            host.style.transform = right ? `translateX(${distance}px)` : '';
            host.dataset.side = right ? 'right' : 'left';
            delete host.dataset.transit;
            if (animation) {
                animation.onfinish = null;
                animation.cancel();
                animation = undefined;
            }
        };
        schedule();
    };
    const restart = () => { cancel(); right = false; host.style.transform = ''; host.dataset.side = 'left'; schedule(); };
    wide.addEventListener('change', restart);
    reduced.addEventListener('change', restart);
    doc.addEventListener('visibilitychange', restart);
    win.addEventListener('resize', restart);
    restart();
    return {
        dispose() { stopped = true; cancel(); wide.removeEventListener('change', restart); reduced.removeEventListener('change', restart); doc.removeEventListener('visibilitychange', restart); win.removeEventListener('resize', restart); },
    };
}
