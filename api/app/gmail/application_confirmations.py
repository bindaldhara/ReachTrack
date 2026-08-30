from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlparse

from app.gmail.classify import SentMessage
from app.gmail.entities import company_from_subject, domain_to_company_name

ATS_SENDER_DOMAINS: dict[str, str] = {
    "greenhouse.io": "greenhouse",
    "greenhouse-mail.io": "greenhouse",
    "lever.co": "lever",
    "myworkday.com": "workday",
    "workday.com": "workday",
    "ashbyhq.com": "ashby",
    "icims.com": "icims",
    "smartrecruiters.com": "smartrecruiters",
    "jobvite.com": "jobvite",
    "bamboohr.com": "bamboohr",
    "recruitee.com": "recruitee",
    "jazz.co": "jazzhr",
    "breezy.hr": "breezy",
    "taleo.net": "taleo",
    "successfactors.com": "successfactors",
    "oraclecloud.com": "oracle",
}

JOB_BOARD_SENDER_DOMAINS: dict[str, str] = {
    "linkedin.com": "linkedin",
    "indeed.com": "indeed",
    "ziprecruiter.com": "ziprecruiter",
}

APPLICATION_SENDER_DOMAINS: dict[str, str] = {
    **ATS_SENDER_DOMAINS,
    **JOB_BOARD_SENDER_DOMAINS,
}

CONFIRMATION_PHRASES = (
    "thank you for applying",
    "thanks for applying",
    "application received",
    "received your application",
    "application submitted",
    "successfully applied",
    "your application for",
    "your application to",
    "your application was sent",
    "application was sent",
    "we received your application",
    "application has been received",
    "application confirmation",
)

JOB_URL_PATTERN = re.compile(
    r"https?://[^\s<>\"']+?(?:greenhouse\.io|lever\.co|myworkday\.com|workday\.com|"
    r"ashbyhq\.com|icims\.com|smartrecruiters\.com|jobvite\.com|bamboohr\.com|"
    r"recruitee\.com|jazz\.co|breezy\.hr)[^\s<>\"']*",
    re.IGNORECASE,
)

LOCATION_PATTERNS = (
    re.compile(r"location:\s*([^\n\r|]+)", re.IGNORECASE),
    re.compile(r"based in\s+([^\n\r,.]+)", re.IGNORECASE),
)


@dataclass
class ParsedApplicationConfirmation:
    company_name: str
    company_domain: str
    job_title: str
    location: str
    job_url: str
    ats_provider: str
    channel: str = "careers_page"


def channel_for_provider(provider: str) -> str:
    if provider == "linkedin":
        return "linkedin"
    return "careers_page"


def parse_application_confirmation(msg: SentMessage) -> ParsedApplicationConfirmation | None:
    text = f"{msg.subject}\n{msg.snippet}".strip()
    if not text:
        return None

    ats_provider = _provider_from_sender(msg.from_)
    lower = text.lower()
    if not ats_provider and not _looks_like_confirmation(lower):
        return None
    if ats_provider and not _looks_like_confirmation(lower):
        # Known sender with weak signal — still accept common auto-reply subjects.
        if not _contains_any(
            lower,
            "thank",
            "application",
            "applying",
            "received",
            "submitted",
            "sent",
        ):
            return None

    company_name, company_domain = _company_from_message(msg, text, ats_provider)
    job_title = _job_title_from_text(msg.subject, text, company_name, ats_provider)
    if not job_title and company_name:
        job_title = f"Application at {company_name}"
    if not job_title:
        job_title = _fallback_title(msg.subject)
    if not job_title:
        return None

    return ParsedApplicationConfirmation(
        company_name=company_name,
        company_domain=company_domain,
        job_title=job_title,
        location=_location_from_text(text, company_name),
        job_url=_job_url_from_text(text),
        ats_provider=ats_provider or "careers_page",
        channel=channel_for_provider(ats_provider),
    )


def _looks_like_confirmation(lower: str) -> bool:
    return _contains_any(lower, *CONFIRMATION_PHRASES)


def _provider_from_sender(from_header: str) -> str:
    email = _email_from_header(from_header)
    if not email or "@" not in email:
        return ""
    domain = email.split("@", 1)[1].lower()
    for suffix, provider in APPLICATION_SENDER_DOMAINS.items():
        if domain == suffix or domain.endswith("." + suffix):
            return provider
    return ""


_ats_provider_from_sender = _provider_from_sender


def _email_from_header(from_header: str) -> str:
    match = re.search(r"<([^>]+)>", from_header)
    if match:
        return match.group(1).strip().lower()
    raw = from_header.strip().lower()
    return raw if "@" in raw else ""


def _display_name_from_header(from_header: str) -> str:
    match = re.match(r"^(.+?)\s*<", from_header.strip())
    if not match:
        return ""
    name = re.sub(r'^["\']|["\']$', "", match.group(1).strip())
    if "@" in name or name.lower() in {"noreply", "no reply", "notifications"}:
        return ""
    return name


def _company_from_message(msg: SentMessage, text: str, provider: str) -> tuple[str, str]:
    from_name = _display_name_from_header(msg.from_)
    from_email = _email_from_header(msg.from_)
    company_domain = ""
    if from_email and "@" in from_email:
        domain = from_email.split("@", 1)[1].lower()
        for suffix in APPLICATION_SENDER_DOMAINS:
            if domain == suffix or domain.endswith("." + suffix):
                company_domain = ""
                break
        else:
            company_domain = domain

    sent_to = re.search(
        r"your application was sent to\s+(.+?)(?:\s+has been|\s*[-–—|,.!?]|$)",
        f"{msg.subject}\n{text}",
        flags=re.IGNORECASE,
    )
    if sent_to:
        company = _normalize_company_name(sent_to.group(1).strip())
        if company:
            return company, _domain_from_company_token(company)

    subject_company = company_from_subject(msg.subject) or company_from_subject(text)
    if subject_company:
        return _normalize_company_name(subject_company), company_domain

    at_match = re.search(
        r"\bat\s+(.+?)(?:\s+has been|\s*[-–—|,.!?]|$)",
        f"{msg.subject}\n{text}",
        flags=re.IGNORECASE,
    )
    if at_match:
        return _normalize_company_name(at_match.group(1).strip()), company_domain

    if from_name:
        return from_name, company_domain
    if company_domain:
        return domain_to_company_name(company_domain), company_domain
    return "", company_domain


def _job_title_from_text(
    subject: str, text: str, company_name: str, provider: str
) -> str:
    if provider == "linkedin":
        linkedin = _linkedin_title_from_text(text, company_name)
        if linkedin:
            return linkedin
    for source in (subject, text):
        title = _title_from_source(source, company_name)
        if title:
            return title
    return ""


def _linkedin_title_from_text(text: str, company_name: str) -> str:
    if not company_name:
        return ""
    company_token = re.escape(company_name)
    patterns = (
        re.compile(
            rf"sent to\s+{company_token}\s+(.+?)\s+{company_token}\s*[-–—]",
            re.IGNORECASE,
        ),
        re.compile(
            rf"sent to\s+{company_token}\s+(.+?)(?:\s+{company_token}|$)",
            re.IGNORECASE,
        ),
    )
    for pattern in patterns:
        match = pattern.search(text)
        if not match:
            continue
        title = _clean_title(match.group(1), company_name)
        if title:
            return title
    return ""


def _title_from_source(source: str, company_name: str) -> str:
    clean = source.strip()
    if not clean:
        return ""

    patterns = (
        re.compile(
            r"thank you for (?:applying to|your application to)\s+(.+)$",
            re.IGNORECASE,
        ),
        re.compile(r"your application for\s+(.+)$", re.IGNORECASE),
        re.compile(r"your application was sent to\s+(.+)$", re.IGNORECASE),
        re.compile(r"(?:application|applied) (?:for|to)\s+(.+)$", re.IGNORECASE),
        re.compile(r"^(.+?)\s+[-–—|]\s+application", re.IGNORECASE),
    )
    for pattern in patterns:
        match = pattern.search(clean)
        if not match:
            continue
        title = _clean_title(match.group(1), company_name)
        if title:
            return title
    return ""


def _clean_title(raw: str, company_name: str) -> str:
    title = re.sub(r"\s+", " ", raw).strip(" -–—|,.")
    title = re.sub(
        r"\s+(?:has been received|was received|is received)\.?$",
        "",
        title,
        flags=re.IGNORECASE,
    ).strip()
    if company_name:
        title = re.sub(
            rf"\s+at\s+{re.escape(company_name)}\s*$",
            "",
            title,
            flags=re.IGNORECASE,
        ).strip()
    title = re.sub(r"\s+at\s+[^,|]+$", "", title, flags=re.IGNORECASE).strip()
    if company_name and title.lower() == company_name.lower():
        return ""
    if len(title) < 2 or len(title) > 120:
        return ""
    return title


def _fallback_title(subject: str) -> str:
    clean = re.sub(r"^(re:|fwd:|fw:)\s*", "", subject.strip(), flags=re.IGNORECASE)
    clean = re.sub(r"\s+", " ", clean).strip()
    if not clean or len(clean) > 120:
        return ""
    lower = clean.lower()
    if _contains_any(
        lower,
        "thank you",
        "application received",
        "application submitted",
        "confirmation",
    ):
        return ""
    return clean


def _location_from_text(text: str, company_name: str = "") -> str:
    if company_name:
        match = re.search(
            rf"{re.escape(company_name)}\s*[-–—]\s*([^\n|]+)",
            text,
            flags=re.IGNORECASE,
        )
        if match:
            loc = match.group(1).strip()
            if 2 <= len(loc) <= 80:
                return loc
    for pattern in LOCATION_PATTERNS:
        match = pattern.search(text)
        if match:
            loc = match.group(1).strip()
            if 2 <= len(loc) <= 80:
                return loc
    return ""


def _job_url_from_text(text: str) -> str:
    match = JOB_URL_PATTERN.search(text)
    if not match:
        return ""
    url = match.group(0).rstrip(").,;]")
    parsed = urlparse(url)
    if parsed.scheme in {"http", "https"} and parsed.netloc:
        return url
    return ""


def _normalize_company_name(name: str) -> str:
    name = re.sub(r"\s+has been received.*$", "", name, flags=re.IGNORECASE).strip()
    name = re.sub(r"\s+was received.*$", "", name, flags=re.IGNORECASE).strip()
    name = re.sub(r"^[^,]+,\s*", "", name).strip()
    return name


def _domain_from_company_token(token: str) -> str:
    token = token.strip().lower()
    if "." in token and " " not in token:
        return token
    return ""


def _contains_any(text: str, *phrases: str) -> bool:
    return any(p in text for p in phrases)
