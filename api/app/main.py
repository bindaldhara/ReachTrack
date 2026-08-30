from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import (
    APIRouter,
    Body,
    Depends,
    FastAPI,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.auth import AuthError, UserIdentity, Verifier, get_bearer_token
from app.config import get_settings
from app.db import connect
from app.errors import NotFoundError, handle_store_error
from app.gmail.application_confirmations import parse_application_confirmation
from app.gmail.classify import ThreadContext, classify_message
from app.gmail.messages import (
    GmailService,
    day_bounds,
    fetch_threads,
    list_inbox_application_messages,
    list_sent_messages,
    yesterday_in,
)
from app.gmail.rejection import detect_rejection, latest_incoming_text
from app.gmail.oauth import GmailOAuth, NotConfiguredError
from app.schemas import (
    CompanyRequest,
    ContactRequest,
    ConversationRequest,
    GmailAuthorizeResponse,
    GmailConnection,
    GmailConnectionStatus,
    GmailScanRejectionsResult,
    GmailSyncRequest,
    GmailSyncResult,
    JobRequest,
    OutreachEvent,
    OutreachRequest,
    ProfileUpdateRequest,
    ReminderRequest,
    TodoCompanyRequest,
    TodoEmailRequest,
    TodoSummary,
)
from app.store import Store
from app.validators import (
    company_from_request,
    contact_from_request,
    conversation_from_request,
    job_from_request,
    outreach_from_request,
    reminder_from_request,
    todo_company_from_request,
    todo_email_from_request,
)

logger = logging.getLogger(__name__)


def gmail_sync_timeout() -> int:
    return max(60, get_settings().gmail_sync_timeout_seconds)


def query_limit(limit: int | None = None) -> int:
    if limit is None or limit <= 0:
        return 50
    if limit > 200:
        return 200
    return limit


def parse_path_id(raw: str) -> UUID:
    try:
        return UUID(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid id"
        ) from exc


def parse_sync_day(raw: str, loc: ZoneInfo) -> datetime:
    raw = raw.strip()
    if not raw or raw == "yesterday":
        return yesterday_in(loc)
    try:
        parsed = datetime.strptime(raw, "%Y-%m-%d")
        return parsed.replace(tzinfo=loc)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="date must be YYYY-MM-DD or yesterday",
        ) from exc


def _error_response(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": message})


async def require_user(request: Request) -> UserIdentity:
    token = get_bearer_token(request.headers.get("Authorization"))
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="missing bearer token"
        )
    verifier: Verifier = request.app.state.verifier
    try:
        return verifier.parse_token(token)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token"
        ) from exc


def get_store(request: Request) -> Store:
    return request.app.state.store


def get_gmail_oauth(request: Request) -> GmailOAuth | None:
    return request.app.state.gmail_oauth


def get_gmail_service(request: Request) -> GmailService | None:
    return request.app.state.gmail_service


def gmail_configured(
    gmail_oauth: Annotated[GmailOAuth | None, Depends(get_gmail_oauth)],
    gmail_service: Annotated[GmailService | None, Depends(get_gmail_service)],
) -> tuple[GmailOAuth, GmailService]:
    if gmail_oauth is None or gmail_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="gmail oauth is not configured on the server",
        )
    return gmail_oauth, gmail_service


async def _store_call(coro):
    try:
        return await coro
    except Exception as exc:
        raise handle_store_error(exc) from exc


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    pool = await connect(settings.database_url)
    verifier = Verifier(settings.jwks_url)
    store = Store(pool)

    gmail_oauth: GmailOAuth | None = None
    gmail_service: GmailService | None = None
    if settings.gmail_configured:
        try:
            gmail_oauth = GmailOAuth(
                settings.google_client_id,
                settings.google_client_secret,
                settings.gmail_redirect_uri,
                settings.web_app_base,
                settings.state_secret,
            )
            gmail_service = GmailService(
                client_id=settings.google_client_id,
                client_secret=settings.google_client_secret,
                redirect_uri=settings.gmail_redirect_uri,
            )
        except NotConfiguredError:
            logger.info("gmail oauth disabled", extra={"reason": "not configured"})

    app.state.pool = pool
    app.state.store = store
    app.state.verifier = verifier
    app.state.gmail_oauth = gmail_oauth
    app.state.gmail_service = gmail_service

    yield

    if gmail_oauth is not None:
        await gmail_oauth.aclose()
    if gmail_service is not None:
        await gmail_service.aclose()
    await pool.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(lifespan=lifespan)

    origins = [o.strip() for o in settings.cors_origin.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Accept", "Authorization", "Content-Type"],
        max_age=300,
    )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(
        _request: Request, exc: HTTPException
    ) -> JSONResponse:
        detail = exc.detail
        if isinstance(detail, str):
            message = detail
        else:
            message = "invalid request"
        return _error_response(exc.status_code, message)

    @app.exception_handler(StarletteHTTPException)
    async def starlette_http_exception_handler(
        _request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        detail = exc.detail
        if isinstance(detail, str):
            message = detail
        else:
            message = "invalid request"
        return _error_response(exc.status_code, message)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        for err in exc.errors():
            if err.get("type") == "json_invalid":
                return _error_response(status.HTTP_400_BAD_REQUEST, "invalid json")
        return _error_response(status.HTTP_400_BAD_REQUEST, "invalid json")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/v1/integrations/gmail/callback")
    async def gmail_callback(
        request: Request,
        code: str = "",
        state: str = "",
        error: str = "",
    ) -> Response:
        gmail_oauth: GmailOAuth | None = request.app.state.gmail_oauth
        store: Store = request.app.state.store
        if gmail_oauth is None:
            return PlainTextResponse(
                "gmail oauth is not configured",
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        if error:
            return RedirectResponse(
                gmail_oauth.profile_redirect("?gmail=denied"),
                status_code=status.HTTP_302_FOUND,
            )
        code = code.strip()
        state = state.strip()
        if not code or not state:
            return RedirectResponse(
                gmail_oauth.profile_redirect("?gmail=error"),
                status_code=status.HTTP_302_FOUND,
            )
        try:
            user_id = gmail_oauth.parse_state(state)
        except ValueError:
            return RedirectResponse(
                gmail_oauth.profile_redirect("?gmail=error"),
                status_code=status.HTTP_302_FOUND,
            )
        try:
            tokens = await gmail_oauth.exchange(code)
            email = await gmail_oauth.fetch_email(tokens.access_token)
            await store.upsert_gmail_connection(
                user_id,
                email,
                tokens.access_token,
                tokens.refresh_token,
                tokens.scopes,
                tokens.expires_at,
            )
        except Exception:
            return RedirectResponse(
                gmail_oauth.profile_redirect("?gmail=error"),
                status_code=status.HTTP_302_FOUND,
            )
        return RedirectResponse(
            gmail_oauth.profile_redirect("?gmail=connected"),
            status_code=status.HTTP_302_FOUND,
        )

    router = APIRouter(prefix="/api/v1", dependencies=[Depends(require_user)])

    @router.get("/me")
    async def get_me(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
    ):
        return await _store_call(
            store.ensure_profile(user.user_id, user.email, "")
        )

    @router.patch("/me")
    async def patch_me(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        body: ProfileUpdateRequest,
    ):
        full_name = body.full_name.strip()
        tz = body.timezone.strip()
        full_name_ptr = full_name if full_name else None
        tz_ptr = tz if tz else None
        return await _store_call(
            store.update_profile(user.user_id, full_name_ptr, tz_ptr)
        )

    @router.get("/stats")
    async def get_stats(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
    ):
        return await _store_call(store.stats(user.user_id))

    @router.get("/integrations/gmail")
    async def get_gmail_connection(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        _gmail: Annotated[tuple[GmailOAuth, GmailService], Depends(gmail_configured)],
    ):
        try:
            conn = await store.get_active_gmail_connection(user.user_id)
        except NotFoundError:
            return GmailConnectionStatus(connected=False)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="failed to load gmail connection",
            ) from exc
        return GmailConnectionStatus(
            connected=True,
            email=conn.google_email,
            connected_at=conn.connected_at,
            scopes=conn.scopes,
        )

    @router.get("/integrations/gmail/authorize")
    async def gmail_authorize(
        user: Annotated[UserIdentity, Depends(require_user)],
        gmail: Annotated[tuple[GmailOAuth, GmailService], Depends(gmail_configured)],
    ):
        gmail_oauth, _ = gmail
        try:
            url = gmail_oauth.authorization_url(user.user_id)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="failed to build authorization url",
            ) from exc
        return GmailAuthorizeResponse(authorization_url=url)

    @router.post("/integrations/gmail/sync-sent")
    async def sync_gmail_sent(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        gmail: Annotated[tuple[GmailOAuth, GmailService], Depends(gmail_configured)],
        body: GmailSyncRequest = Body(default_factory=GmailSyncRequest),
    ):
        _, gmail_service = gmail
        try:
            return await asyncio.wait_for(
                _sync_gmail_sent(user.user_id, store, gmail_service, body.date),
                timeout=gmail_sync_timeout(),
            )
        except asyncio.TimeoutError as exc:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="gmail sync timed out",
            ) from exc

    @router.post("/integrations/gmail/scan-rejections")
    async def scan_gmail_rejections(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        gmail: Annotated[tuple[GmailOAuth, GmailService], Depends(gmail_configured)],
    ):
        _, gmail_service = gmail
        try:
            return await asyncio.wait_for(
                _scan_gmail_rejections(user.user_id, store, gmail_service),
                timeout=gmail_sync_timeout(),
            )
        except asyncio.TimeoutError as exc:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="rejection scan timed out",
            ) from exc

    @router.delete("/integrations/gmail", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_gmail_connection(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        gmail: Annotated[tuple[GmailOAuth, GmailService], Depends(gmail_configured)],
    ) -> Response:
        gmail_oauth, _ = gmail
        try:
            conn = await store.revoke_gmail_connection(user.user_id)
        except NotFoundError:
            return Response(status_code=status.HTTP_204_NO_CONTENT)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="failed to disconnect gmail",
            ) from exc
        try:
            await gmail_oauth.revoke(conn.refresh_token)
        except Exception:
            pass
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get("/companies")
    async def list_companies(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        q: str = "",
        limit: int | None = Query(None),
    ):
        return await _store_call(
            store.list_companies(user.user_id, q, query_limit(limit))
        )

    @router.post("/companies", status_code=status.HTTP_201_CREATED)
    async def create_company(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        body: CompanyRequest,
    ):
        try:
            company = company_from_request(user.user_id, body)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        return await _store_call(store.create_company(company))

    @router.get("/companies/{company_id}")
    async def get_company(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        company_id: str,
    ):
        return await _store_call(
            store.get_company(user.user_id, parse_path_id(company_id))
        )

    @router.put("/companies/{company_id}")
    async def update_company(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        company_id: str,
        body: CompanyRequest,
    ):
        try:
            company = company_from_request(user.user_id, body)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        company.id = parse_path_id(company_id)
        return await _store_call(store.update_company(company))

    @router.delete("/companies/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_company(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        company_id: str,
    ) -> Response:
        await _store_call(
            store.delete_company(user.user_id, parse_path_id(company_id))
        )
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get("/contacts")
    async def list_contacts(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        q: str = "",
        company_id: str = Query("", alias="companyId"),
        limit: int | None = Query(None),
    ):
        return await _store_call(
            store.list_contacts(user.user_id, q, company_id, query_limit(limit))
        )

    @router.post("/contacts", status_code=status.HTTP_201_CREATED)
    async def create_contact(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        body: ContactRequest,
    ):
        try:
            contact = contact_from_request(user.user_id, body)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        return await _store_call(store.create_contact(contact))

    @router.get("/contacts/{contact_id}")
    async def get_contact(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        contact_id: str,
    ):
        return await _store_call(
            store.get_contact(user.user_id, parse_path_id(contact_id))
        )

    @router.put("/contacts/{contact_id}")
    async def update_contact(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        contact_id: str,
        body: ContactRequest,
    ):
        try:
            contact = contact_from_request(user.user_id, body)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        contact.id = parse_path_id(contact_id)
        return await _store_call(store.update_contact(contact))

    @router.delete("/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_contact(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        contact_id: str,
    ) -> Response:
        await _store_call(
            store.delete_contact(user.user_id, parse_path_id(contact_id))
        )
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get("/jobs")
    async def list_jobs(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        status_filter: str = Query("", alias="status"),
        q: str = "",
        limit: int | None = Query(None),
    ):
        return await _store_call(
            store.list_jobs(user.user_id, status_filter, q, query_limit(limit))
        )

    @router.post("/jobs", status_code=status.HTTP_201_CREATED)
    async def create_job(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        body: JobRequest,
    ):
        try:
            job = job_from_request(user.user_id, body)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        return await _store_call(store.create_job(job))

    @router.get("/jobs/{job_id}")
    async def get_job(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        job_id: str,
    ):
        return await _store_call(store.get_job(user.user_id, parse_path_id(job_id)))

    @router.put("/jobs/{job_id}")
    async def update_job(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        job_id: str,
        body: JobRequest,
    ):
        try:
            job = job_from_request(user.user_id, body)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        job.id = parse_path_id(job_id)
        return await _store_call(store.update_job(job))

    @router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_job(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        job_id: str,
    ) -> Response:
        await _store_call(store.delete_job(user.user_id, parse_path_id(job_id)))
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get("/conversations")
    async def list_conversations(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        status_filter: str = Query("", alias="status"),
        q: str = "",
        limit: int | None = Query(None),
    ):
        return await _store_call(
            store.list_conversations(
                user.user_id, status_filter, q, query_limit(limit)
            )
        )

    @router.post("/conversations", status_code=status.HTTP_201_CREATED)
    async def create_conversation(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        body: ConversationRequest,
    ):
        try:
            conversation = conversation_from_request(user.user_id, body)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        return await _store_call(store.create_conversation(conversation))

    @router.get("/conversations/{conversation_id}")
    async def get_conversation(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        conversation_id: str,
    ):
        return await _store_call(
            store.get_conversation(user.user_id, parse_path_id(conversation_id))
        )

    @router.put("/conversations/{conversation_id}")
    async def update_conversation(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        conversation_id: str,
        body: ConversationRequest,
    ):
        try:
            conversation = conversation_from_request(user.user_id, body)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        conversation.id = parse_path_id(conversation_id)
        return await _store_call(store.update_conversation(conversation))

    @router.delete(
        "/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT
    )
    async def delete_conversation(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        conversation_id: str,
    ) -> Response:
        await _store_call(
            store.delete_conversation(user.user_id, parse_path_id(conversation_id))
        )
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get("/outreach-events")
    async def list_outreach(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        status_filter: str = Query("", alias="status"),
        status_suggestion: str = Query("", alias="statusSuggestion"),
        event_type: str = Query("", alias="type"),
        channel_filter: str = Query("", alias="channel"),
        channels_filter: str = Query("", alias="channels"),
        types_filter: str = Query("", alias="types"),
        q: str = "",
        limit: int | None = Query(None),
    ):
        types = [t.strip() for t in types_filter.split(",") if t.strip()]
        channels = [c.strip() for c in channels_filter.split(",") if c.strip()]
        return await _store_call(
            store.list_outreach(
                user.user_id,
                status_filter,
                event_type,
                types,
                q,
                query_limit(limit),
                status_suggestion,
                channel_filter,
                channels or None,
            )
        )

    @router.post("/outreach-events", status_code=status.HTTP_201_CREATED)
    async def create_outreach(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        body: OutreachRequest,
    ):
        try:
            event = outreach_from_request(user.user_id, body)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        return await _store_call(store.create_outreach(event))

    @router.get("/outreach-events/{outreach_id}")
    async def get_outreach(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        outreach_id: str,
    ):
        return await _store_call(
            store.get_outreach(user.user_id, parse_path_id(outreach_id))
        )

    @router.put("/outreach-events/{outreach_id}")
    async def update_outreach(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        outreach_id: str,
        body: OutreachRequest,
    ):
        try:
            event = outreach_from_request(user.user_id, body)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        event.id = parse_path_id(outreach_id)
        return await _store_call(store.update_outreach(event))

    @router.delete(
        "/outreach-events/{outreach_id}", status_code=status.HTTP_204_NO_CONTENT
    )
    async def delete_outreach(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        outreach_id: str,
    ) -> Response:
        await _store_call(
            store.delete_outreach(user.user_id, parse_path_id(outreach_id))
        )
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.post("/outreach-events/{outreach_id}/confirm-suggestion")
    async def confirm_outreach_suggestion(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        outreach_id: str,
    ):
        return await _store_call(
            store.confirm_status_suggestion(
                user.user_id, parse_path_id(outreach_id)
            )
        )

    @router.post("/outreach-events/{outreach_id}/dismiss-suggestion")
    async def dismiss_outreach_suggestion(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        outreach_id: str,
    ):
        return await _store_call(
            store.dismiss_status_suggestion(
                user.user_id, parse_path_id(outreach_id)
            )
        )

    @router.get("/reminders")
    async def list_reminders(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        open: str = "true",
        kind: str = "",
        q: str = "",
        limit: int | None = Query(None),
    ):
        open_only = open != "false"
        return await _store_call(
            store.list_reminders(user.user_id, open_only, kind, q, query_limit(limit))
        )

    @router.post("/reminders", status_code=status.HTTP_201_CREATED)
    async def create_reminder(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        body: ReminderRequest,
    ):
        try:
            reminder = reminder_from_request(user.user_id, body)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        return await _store_call(store.create_reminder(reminder))

    @router.get("/reminders/{reminder_id}")
    async def get_reminder(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        reminder_id: str,
    ):
        return await _store_call(
            store.get_reminder(user.user_id, parse_path_id(reminder_id))
        )

    @router.put("/reminders/{reminder_id}")
    async def update_reminder(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        reminder_id: str,
        body: ReminderRequest,
    ):
        try:
            reminder = reminder_from_request(user.user_id, body)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        reminder.id = parse_path_id(reminder_id)
        return await _store_call(store.update_reminder(reminder))

    @router.delete("/reminders/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_reminder(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        reminder_id: str,
    ) -> Response:
        await _store_call(
            store.delete_reminder(user.user_id, parse_path_id(reminder_id))
        )
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get("/todo/summary")
    async def get_todo_summary(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
    ) -> TodoSummary:
        return await _store_call(store.get_todo_summary(user.user_id))

    @router.get("/todo/emails")
    async def list_todo_emails(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        q: str = "",
        limit: int | None = Query(None),
    ):
        return await _store_call(
            store.list_todo_emails(user.user_id, q, query_limit(limit))
        )

    @router.post("/todo/emails", status_code=status.HTTP_201_CREATED)
    async def create_todo_email(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        body: TodoEmailRequest,
    ):
        try:
            item = todo_email_from_request(user.user_id, body)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        return await _store_call(store.create_todo_email(item))

    @router.put("/todo/emails/{item_id}")
    async def update_todo_email(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        item_id: str,
        body: TodoEmailRequest,
    ):
        try:
            item = todo_email_from_request(user.user_id, body)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        item.id = parse_path_id(item_id)
        return await _store_call(store.update_todo_email(item))

    @router.post("/todo/emails/{item_id}/complete", status_code=status.HTTP_204_NO_CONTENT)
    async def complete_todo_email(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        item_id: str,
    ) -> Response:
        await _store_call(
            store.delete_todo_email(user.user_id, parse_path_id(item_id))
        )
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.delete("/todo/emails/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_todo_email(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        item_id: str,
    ) -> Response:
        await _store_call(
            store.delete_todo_email(user.user_id, parse_path_id(item_id))
        )
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get("/todo/companies")
    async def list_todo_companies(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        q: str = "",
        limit: int | None = Query(None),
    ):
        return await _store_call(
            store.list_todo_companies(user.user_id, q, query_limit(limit))
        )

    @router.post("/todo/companies", status_code=status.HTTP_201_CREATED)
    async def create_todo_company(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        body: TodoCompanyRequest,
    ):
        try:
            item = todo_company_from_request(user.user_id, body)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        return await _store_call(store.create_todo_company(item))

    @router.put("/todo/companies/{item_id}")
    async def update_todo_company(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        item_id: str,
        body: TodoCompanyRequest,
    ):
        try:
            item = todo_company_from_request(user.user_id, body)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        item.id = parse_path_id(item_id)
        return await _store_call(store.update_todo_company(item))

    @router.post("/todo/companies/{item_id}/complete", status_code=status.HTTP_204_NO_CONTENT)
    async def complete_todo_company(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        item_id: str,
    ) -> Response:
        await _store_call(
            store.delete_todo_company(user.user_id, parse_path_id(item_id))
        )
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.delete("/todo/companies/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_todo_company(
        user: Annotated[UserIdentity, Depends(require_user)],
        store: Annotated[Store, Depends(get_store)],
        item_id: str,
    ) -> Response:
        await _store_call(
            store.delete_todo_company(user.user_id, parse_path_id(item_id))
        )
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    app.include_router(router)
    return app


async def _sync_gmail_sent(
    user_id: UUID,
    store: Store,
    gmail_service: GmailService,
    date_raw: str,
) -> GmailSyncResult:
    try:
        conn = await store.get_active_gmail_connection(user_id)
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="gmail is not connected",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="failed to load gmail connection",
        ) from exc

    try:
        profile = await store.get_profile(user_id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="failed to load profile",
        ) from exc

    loc: ZoneInfo = ZoneInfo("UTC")
    tz = profile.timezone.strip()
    if tz:
        try:
            loc = ZoneInfo(tz)
        except Exception:
            pass

    day = parse_sync_day(date_raw, loc)
    start, end = day_bounds(day, loc)
    logger.info(
        "gmail sync start",
        extra={"user": str(user_id), "date": day.strftime("%Y-%m-%d")},
    )

    access_token = conn.access_token
    refresh_token = conn.refresh_token
    expires_at = conn.token_expires_at
    if datetime.now(UTC) > expires_at - timedelta(minutes=2):
        logger.info("gmail sync refreshing token", extra={"user": str(user_id)})
        try:
            refreshed = await gmail_service.refresh(refresh_token)
        except Exception as exc:
            logger.error(
                "gmail sync refresh",
                extra={"user": str(user_id), "err": str(exc)},
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="failed to refresh gmail token; reconnect gmail",
            ) from exc
        access_token = refreshed.access_token
        refresh_token = refreshed.refresh_token
        expires_at = refreshed.expires_at
        try:
            await store.update_gmail_tokens(
                conn.id, access_token, refresh_token, expires_at
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="failed to save refreshed token",
            ) from exc

    try:
        messages = await list_sent_messages(
            gmail_service, access_token, refresh_token, expires_at, start, end
        )
    except Exception as exc:
        logger.error(
            "gmail sync fetch", extra={"user": str(user_id), "err": str(exc)}
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"failed to fetch gmail messages: {exc}",
        ) from exc

    thread_ids: list[str] = []
    seen_threads: set[str] = set()
    for msg in messages:
        if msg.thread_id and msg.thread_id not in seen_threads:
            seen_threads.add(msg.thread_id)
            thread_ids.append(msg.thread_id)

    scan_thread_ids = list(
        dict.fromkeys(
            thread_ids
            + await store.list_gmail_thread_ids_for_rejection_scan(user_id)
        )
    )

    try:
        threads = await fetch_threads(
            gmail_service, access_token, refresh_token, expires_at, scan_thread_ids
        )
    except Exception as exc:
        logger.error(
            "gmail sync threads", extra={"user": str(user_id), "err": str(exc)}
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"failed to load gmail threads: {exc}",
        ) from exc

    result = GmailSyncResult(
        date=day.strftime("%Y-%m-%d"),
        fetched=len(messages),
        imported=0,
        updated=0,
        by_type={},
    )
    for msg in messages:
        ext_id = msg.id
        body = msg.snippet.strip()
        if msg.to:
            body = f"To: {msg.to}\n\n{body}" if body else f"To: {msg.to}"
        class_ = classify_message(msg, threads.get(msg.thread_id), conn.google_email)
        try:
            company_id, contact_id, conversation_id = await store.upsert_gmail_crm_links(
                user_id,
                to_header=msg.to,
                subject=msg.subject,
                gmail_thread_id=msg.thread_id or None,
                status=class_.status,
                occurred_at=msg.internal_date,
            )
            inserted = await store.upsert_gmail_outreach(
                OutreachEvent(
                    user_id=user_id,
                    conversation_id=conversation_id,
                    contact_id=contact_id,
                    company_id=company_id,
                    type=class_.type,
                    channel="gmail",
                    source="gmail",
                    status=class_.status,
                    subject=msg.subject.strip(),
                    body=body,
                    external_id=ext_id,
                    gmail_thread_id=msg.thread_id or None,
                    occurred_at=msg.internal_date,
                )
            )
        except Exception as exc:
            logger.error(
                "gmail sync import", extra={"user": str(user_id), "err": str(exc)}
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="failed to import outreach",
            ) from exc
        result.by_type[class_.type] = result.by_type.get(class_.type, 0) + 1
        if inserted:
            result.imported += 1
        else:
            result.updated += 1

    try:
        app_messages = await list_inbox_application_messages(
            gmail_service, access_token, refresh_token, expires_at, start, end
        )
    except Exception as exc:
        logger.warning(
            "gmail sync application inbox",
            extra={"user": str(user_id), "err": str(exc)},
        )
        app_messages = []

    result.applications_fetched = len(app_messages)
    for msg in app_messages:
        parsed = parse_application_confirmation(msg)
        if parsed is None:
            continue
        body = msg.snippet.strip()
        if msg.from_:
            body = f"From: {msg.from_}\n\n{body}" if body else f"From: {msg.from_}"
        try:
            inserted = await store.import_careers_application(
                user_id,
                external_id=msg.id,
                subject=msg.subject.strip(),
                body=body,
                gmail_thread_id=msg.thread_id or None,
                occurred_at=msg.internal_date,
                company_name=parsed.company_name,
                company_domain=parsed.company_domain,
                job_title=parsed.job_title,
                job_url=parsed.job_url,
                location=parsed.location,
                ats_provider=parsed.ats_provider,
                channel=parsed.channel,
            )
        except Exception as exc:
            logger.warning(
                "gmail sync application import",
                extra={"user": str(user_id), "gmail_message_id": msg.id, "err": str(exc)},
            )
            continue
        result.by_type["application"] = result.by_type.get("application", 0) + 1
        if inserted:
            result.applications_imported += 1
            result.imported += 1
        else:
            result.updated += 1

    scanned, suggested = await _apply_rejection_suggestions(
        user_id,
        store,
        conn.google_email,
        threads,
        scan_thread_ids,
    )
    result.rejections_scanned = scanned
    result.rejections_suggested = suggested

    logger.info(
        "gmail sync done",
        extra={
            "user": str(user_id),
            "fetched": result.fetched,
            "imported": result.imported,
            "updated": result.updated,
        },
    )
    return result


async def _scan_gmail_rejections(
    user_id: UUID,
    store: Store,
    gmail_service: GmailService,
) -> GmailScanRejectionsResult:
    conn = await _load_active_gmail_connection(user_id, store)
    access_token, refresh_token, expires_at = await _refresh_gmail_tokens(
        user_id, store, gmail_service, conn
    )
    thread_ids = await store.list_gmail_thread_ids_for_rejection_scan(user_id)
    threads = await fetch_threads(
        gmail_service, access_token, refresh_token, expires_at, thread_ids
    )
    scanned, suggested = await _apply_rejection_suggestions(
        user_id,
        store,
        conn.google_email,
        threads,
        thread_ids,
    )
    logger.info(
        "gmail rejection scan done",
        extra={"user": str(user_id), "scanned": scanned, "suggested": suggested},
    )
    return GmailScanRejectionsResult(scanned=scanned, suggested=suggested)


async def _load_active_gmail_connection(user_id: UUID, store: Store) -> GmailConnection:
    try:
        return await store.get_active_gmail_connection(user_id)
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="gmail is not connected",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="failed to load gmail connection",
        ) from exc


async def _refresh_gmail_tokens(
    user_id: UUID,
    store: Store,
    gmail_service: GmailService,
    conn: GmailConnection,
) -> tuple[str, str, datetime]:
    access_token = conn.access_token
    refresh_token = conn.refresh_token
    expires_at = conn.token_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if datetime.now(UTC) > expires_at - timedelta(minutes=2):
        logger.info("gmail refreshing token", extra={"user": str(user_id)})
        try:
            refreshed = await gmail_service.refresh(refresh_token)
        except Exception as exc:
            logger.error(
                "gmail refresh",
                extra={"user": str(user_id), "err": str(exc)},
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="failed to refresh gmail token; reconnect gmail",
            ) from exc
        access_token = refreshed.access_token
        refresh_token = refreshed.refresh_token
        expires_at = refreshed.expires_at
        try:
            await store.update_gmail_tokens(
                conn.id, access_token, refresh_token, expires_at
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="failed to save refreshed token",
            ) from exc
    return access_token, refresh_token, expires_at


async def _apply_rejection_suggestions(
    user_id: UUID,
    store: Store,
    user_email: str,
    threads: dict[str, ThreadContext],
    thread_ids: list[str],
) -> tuple[int, int]:
    scanned = 0
    suggested = 0
    for thread_id in thread_ids:
        if not thread_id:
            continue
        thread = threads.get(thread_id)
        if thread is None:
            continue
        incoming = latest_incoming_text(thread, user_email)
        if not incoming:
            continue
        scanned += 1
        verdict = await detect_rejection(incoming)
        if not verdict.is_rejection:
            continue
        try:
            await store.suggest_rejection_for_thread(
                user_id,
                thread_id,
                verdict.reason,
                verdict.snippet,
            )
            suggested += 1
        except Exception as exc:
            logger.warning(
                "gmail rejection suggestion",
                extra={"user": str(user_id), "thread": thread_id, "err": str(exc)},
            )
    return scanned, suggested


app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(settings.port),
        reload=False,
    )
