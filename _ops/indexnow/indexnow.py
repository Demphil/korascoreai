"""Notify IndexNow only about verified public content after publication."""
import argparse
import datetime as dt
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

ORIGIN = 'https://korascoreai.com'
ENDPOINT = 'https://api.indexnow.org/indexnow'
BLOCKED = {'account', 'account-deletion.html', 'auth', 'auth-callback', 'wallet', 'coins',
           'forecast-insights-coins', 'saved-forecasts', 'analyst', 'insight', 'admin',
           'api', 'functions', 'checkout', 'payment', 'payments', 'paypal', 'paypal-return'}


def public_url(value):
    url = urllib.parse.urlsplit(value)
    if url.scheme != 'https' or url.netloc != 'korascoreai.com' or url.query or url.fragment:
        return False
    path = urllib.parse.unquote(url.path)
    parts = [p for p in path.split('/') if p]
    if any(p in {'.', '..'} or '\\' in p for p in parts):
        return False
    if parts and parts[0] in {'ar', 'en', 'fr', 'es'}:
        parts = parts[1:]
    return not parts or parts[0] not in BLOCKED and not parts[0].startswith(('paypal-', '.'))


def document_path(url):
    path = urllib.parse.unquote(urllib.parse.urlsplit(url).path).lstrip('/')
    return path + 'index.html' if not path or path.endswith('/') else path


class Content(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ignore = 0
        self.metadata = []
        self.text = []
        self.canonical = None
        self.robots = ''

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {'script', 'style'}:
            self.ignore += 1
        if tag == 'link' and attrs.get('rel', '').lower() == 'canonical':
            self.canonical = attrs.get('href')
        if tag == 'meta':
            name = attrs.get('name', attrs.get('property', '')).lower()
            if name == 'robots':
                self.robots = attrs.get('content', '').lower()
            if name in {'description', 'robots', 'og:title', 'og:description', 'og:type',
                        'og:image', 'twitter:title', 'twitter:description', 'twitter:image'}:
                self.metadata.append((name, attrs.get('content', '')))

    def handle_endtag(self, tag):
        if tag in {'script', 'style'}:
            self.ignore = max(0, self.ignore - 1)

    def handle_data(self, value):
        if not self.ignore and value.strip():
            self.text.append(' '.join(value.split()))


def fingerprint(body, url):
    parsed = Content()
    parsed.feed(body.decode('utf-8'))
    if parsed.canonical != url or 'noindex' in parsed.robots or 'none' in parsed.robots.split(','):
        raise ValueError('noncanonical_or_noindex_document')
    normalized = json.dumps([sorted(parsed.metadata), parsed.text], ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(normalized.encode()).hexdigest()


def manifest(read):
    root = ET.fromstring(read('sitemap.xml'))
    if root.tag != '{http://www.sitemaps.org/schemas/sitemap/0.9}urlset':
        raise ValueError('unsupported_sitemap_format')
    urls = sorted({node.text for node in root.findall('{*}url/{*}loc') if node.text})
    if len(urls) > 10000:
        raise ValueError('sitemap_exceeds_single_batch_limit')
    result = {}
    robots = urllib.robotparser.RobotFileParser()
    robots.parse(read('robots.txt').decode('utf-8').splitlines())
    for url in urls:
        if not public_url(url) or not robots.can_fetch('bingbot', url):
            continue
        try:
            result[url] = fingerprint(read(document_path(url)), url)
        except (ValueError, FileNotFoundError):
            continue
    return result


def plan(current, previous, state, verify_url=None, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    pages = state.get('pages', {}) if state.get('schema') == 'indexnow-ledger-v1' and state.get('host') == 'korascoreai.com' else {}
    result = {'schema': 'indexnow-ledger-v1', 'host': 'korascoreai.com', 'pages': {}}
    candidates, deferred = [], []
    if verify_url and verify_url not in current:
        raise ValueError('verification_url_is_not_an_eligible_canonical_page')
    for url in sorted(set(current) | set(previous) | set(pages)):
        if not public_url(url):
            continue
        old = pages.get(url, {})
        if not isinstance(old, dict):
            raise ValueError('invalid_ledger_entry')
        present = current.get(url)
        observed = old.get('observed_hash', previous.get(url))
        pending = bool(old.get('pending')) or present != observed
        if verify_url == url and old.get('last_sent_hash') != present:
            pending = True
        row = {**old, 'observed_hash': present, 'pending': pending}
        result['pages'][url] = row
        if not pending:
            continue
        last = old.get('last_attempt_at')
        if last and (now - dt.datetime.fromisoformat(last)).total_seconds() < 300:
            deferred.append(url)
        else:
            candidates.append(url)
    return candidates, deferred, result


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(url, payload=None):
    headers = {'Accept-Encoding': 'identity', 'User-Agent': 'KoraScoreAi-IndexNow/1.0'}
    if payload is not None:
        headers['Content-Type'] = 'application/json; charset=utf-8'
    try:
        response = urllib.request.build_opener(NoRedirect).open(urllib.request.Request(url, data=payload, headers=headers), timeout=25)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read(4 * 1024 * 1024 + 1)
        if len(body) > 4 * 1024 * 1024:
            raise ValueError('response_too_large')
        if body[:2] == b'\x1f\x8b':
            body = gzip.decompress(body)
        return response.status, body, dict(response.headers)


def notify(root, current, urls, ledger, config, send=request, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    key_file = config['keyFile']
    if not re.fullmatch(r'[a-f0-9]{32}\.txt', key_file):
        raise ValueError('invalid_key_filename')
    key = (root / key_file).read_text(encoding='utf-8').strip()
    if key_file != key + '.txt':
        raise ValueError('key_content_mismatch')
    status, body, _ = send(ORIGIN + '/' + key_file)
    if status != 200 or body.decode('utf-8').strip() != key:
        raise ValueError('published_key_not_verified')
    for url in urls:
        if not public_url(url):
            raise ValueError('private_url_rejected')
        status, body, headers = send(url)
        if url in current:
            if status != 200 or 'noindex' in next((v.lower() for k, v in headers.items() if k.lower() == 'x-robots-tag'), '') or fingerprint(body, url) != current[url]:
                raise ValueError('published_document_does_not_match_source')
        elif status not in {404, 410}:
            raise ValueError('deleted_document_is_still_available_or_redirected')
    if not 0 < len(urls) <= 10000:
        raise ValueError('invalid_batch_size')
    for url in urls:
        ledger['pages'][url]['last_attempt_at'] = now.isoformat()
    payload = json.dumps({'host': 'korascoreai.com', 'key': key, 'keyLocation': ORIGIN + '/' + key_file, 'urlList': urls}).encode()
    status, _, _ = send(ENDPOINT, payload)
    if status in {200, 202}:
        for url in urls:
            ledger['pages'][url].update(pending=False, last_sent_hash=current.get(url), last_sent_at=now.isoformat())
    return status


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path('.'))
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    parser.add_argument('--verify-url')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    root = args.root.resolve()
    git = lambda *a: subprocess.check_output(['git', '-C', str(root), *a], stderr=subprocess.DEVNULL)
    commit = git('rev-parse', 'HEAD').decode().strip()
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text()) if os.environ.get('GITHUB_EVENT_PATH') else {}
    expected = event.get('workflow_run', {}).get('head_sha', commit)
    receipt = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'commit': commit, 'endpoint': ENDPOINT, 'indexed': 'not_checked', 'post_requests': 0}
    ledger = None
    try:
        if expected != commit:
            receipt.update(status='superseded_publication_skipped')
            return
        config = json.loads((root / '_ops/indexnow/config.json').read_text())
        current = manifest(lambda f: (root / f).read_bytes())
        try:
            previous = manifest(lambda f: git('show', 'HEAD^:' + f))
        except (subprocess.CalledProcessError, ValueError):
            previous = current
        state = json.loads(args.state.read_text()) if args.state.exists() else {}
        if state and (state.get('schema') != 'indexnow-ledger-v1' or state.get('host') != 'korascoreai.com' or len(state.get('pages', {})) > 20000):
            raise ValueError('invalid_ledger')
        urls, deferred, ledger = plan(current, previous, state, args.verify_url)
        receipt.update(eligible_pages=len(current), urls=urls, deferred_urls=deferred)
        if args.dry_run:
            receipt.update(status='dry_run')
        elif not urls:
            receipt.update(status='no_content_changes' if not deferred else 'deferred_by_cooldown')
        else:
            def measured_send(url, payload=None):
                if payload is not None:
                    receipt['post_requests'] += 1
                return request(url, payload)
            status = notify(root, current, urls, ledger, config, send=measured_send)
            receipt.update(http_status=status, status='received' if status == 200 else 'received_key_validation_pending' if status == 202 else 'rejected')
            if status not in {200, 202}:
                raise ValueError('indexnow_rejected_submission')
    except Exception as error:
        receipt.update(error=type(error).__name__ + ':' + str(error), status='failed')
        raise
    finally:
        if ledger is not None and not args.dry_run:
            args.state.parent.mkdir(parents=True, exist_ok=True)
            temp = args.state.with_suffix('.tmp')
            temp.write_text(json.dumps(ledger, sort_keys=True), encoding='utf-8')
            temp.replace(args.state)
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(json.dumps(receipt, indent=2), encoding='utf-8')
        print(json.dumps({k: receipt[k] for k in ['status', 'eligible_pages', 'http_status', 'post_requests'] if k in receipt}))
        summary = os.environ.get('GITHUB_STEP_SUMMARY')
        if summary:
            with open(summary, 'a', encoding='utf-8') as stream:
                stream.write('## IndexNow receipt\n\nStatus: `' + receipt['status'] + '`. URLs: ' + str(len(receipt.get('urls', []))) + '.\n\nReceipt is not proof of indexing.\n')


if __name__ == '__main__':
    main()
