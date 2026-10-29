// This notice uses the device clock only. It never requests match data.
for (const notice of document.querySelectorAll('[data-saved-kickoff]')) {
  const kickoff = Date.parse(notice.getAttribute('data-saved-kickoff'));
  if (Number.isFinite(kickoff) && Date.now() >= kickoff) {
    notice.textContent = notice.getAttribute('data-past-kickoff') || notice.textContent;
  }
}
