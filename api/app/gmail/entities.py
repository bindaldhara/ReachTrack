from __future__ import annotations

import re
from dataclasses import dataclass

GENERIC_EMAIL_DOMAINS = frozenset(
    {
        "gmail.com",
        "googlemail.com",
        "yahoo.com",
        "hotmail.com",
        "outlook.com",
        "live.com",
        "icloud.com",
        "proton.me",
        "protonmail.com",
    }
)


@dataclass
class ParsedRecipient:
    email: str = ""
    first_name: str = ""
    last_name: str = ""


@dataclass
class GmailCrmHints:
    recipient: ParsedRecipient
    company_name: str = ""
    company_domain: str = ""
    thread_subject: str = ""


def parse_gmail_crm_hints(to_header: str, subject: str) -> GmailCrmHints:
    recipient = _parse_recipient(to_header)
    company_domain = ""
    if recipient.email and "@" in recipient.email:
        company_domain = recipient.email.split("@", 1)[1].lower().strip()
        if company_domain in GENERIC_EMAIL_DOMAINS:
            company_domain = ""

    company_name = ""
    if company_domain:
        company_name = domain_to_company_name(company_domain)
    else:
        from_subject = company_from_subject(subject)
        if from_subject:
            company_name = from_subject

    return GmailCrmHints(
        recipient=recipient,
        company_name=company_name,
        company_domain=company_domain,
        thread_subject=normalize_thread_subject(subject),
    )


def normalize_thread_subject(subject: str) -> str:
    return re.sub(r"^(re:|fwd:|fw:)\s*", "", subject.strip(), flags=re.IGNORECASE)


def domain_to_company_name(domain: str) -> str:
    domain = domain.lower().removeprefix("www.")
    base = domain.split(".", 1)[0]
    return base.replace("-", " ").replace("_", " ").title()


def company_from_subject(subject: str) -> str | None:
    clean = normalize_thread_subject(subject)
    match = re.search(
        r"\bat\s+(.+?)(?:\s*[-–—|,.!?]|$)",
        clean,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    name = match.group(1).strip()
    if len(name) < 2:
        return None
    return name


def _parse_recipient(to_header: str) -> ParsedRecipient:
    raw = (to_header or "").strip()
    if not raw:
        return ParsedRecipient()

    first = raw.split(",")[0].strip()
    angle = re.match(r"^(?:(.+?)\s+)?<([^>]+)>$", first)
    if angle:
        name = angle.group(1) or ""
        email = angle.group(2).strip().lower()
        first_name, last_name = _split_name(name)
        return ParsedRecipient(email=email, first_name=first_name, last_name=last_name)

    if "@" in first:
        local, _domain = first.lower().split("@", 1)
        first_name, last_name = _split_name(local.replace(".", " ").replace("_", " "))
        return ParsedRecipient(email=first.lower(), first_name=first_name, last_name=last_name)

    first_name, last_name = _split_name(first.replace(".", " ").replace("_", " "))
    return ParsedRecipient(first_name=first_name, last_name=last_name)


def _split_name(name: str) -> tuple[str, str]:
    name = re.sub(r'^["\']|["\']$', "", name.strip())
    if not name:
        return "", ""
    parts = name.split()
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])
