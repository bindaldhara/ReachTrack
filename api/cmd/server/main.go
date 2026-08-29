package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"reachtrack/internal/auth"
	"reachtrack/internal/config"
	"reachtrack/internal/gmail"
	"reachtrack/internal/handler"
	"reachtrack/internal/store"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		log.Error("config", "err", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := store.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("database", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	verifier, err := auth.NewVerifier(cfg.JWKSURL())
	if err != nil {
		log.Error("jwks", "err", err)
		os.Exit(1)
	}

	var gmailSvc *gmail.Service
	if cfg.Gmail.ClientID != "" {
		gmailSvc, err = gmail.New(
			cfg.Gmail.ClientID,
			cfg.Gmail.ClientSecret,
			cfg.Gmail.RedirectURI,
			cfg.Gmail.WebAppURL,
			cfg.Gmail.StateSecret,
		)
		if err != nil && !errors.Is(err, gmail.ErrNotConfigured) {
			log.Error("gmail", "err", err)
			os.Exit(1)
		}
	} else {
		log.Info("gmail oauth disabled", "reason", "GOOGLE_CLIENT_ID not set")
	}

	api := &handler.API{
		Store:    store.New(pool),
		Verifier: verifier,
		Gmail:    gmailSvc,
	}

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      handler.NewRouter(api, cfg.CORSOrigin),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 5 * time.Minute,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Info("listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("server", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
