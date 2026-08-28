package main

import (
	"context"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/simplysafelegacy/backend/internal/auth"
	"github.com/simplysafelegacy/backend/internal/config"
	"github.com/simplysafelegacy/backend/internal/db"
	"github.com/simplysafelegacy/backend/internal/handlers"
	"github.com/simplysafelegacy/backend/internal/router"
	"github.com/simplysafelegacy/backend/internal/storage"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	// Structured logger — text format for dev readability, JSON in production.
	var logger *slog.Logger
	if cfg.Env == "development" {
		logger = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}))
	} else {
		logger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelInfo,
		}))
	}
	slog.SetDefault(logger)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := db.Connect(ctx, cfg.DatabaseURL, cfg.RunMigrations)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	// Object storage. Required outside development — config.Load already
	// rejected an empty bucket there, so a nil client only ever reaches the
	// handlers in dev, where upload endpoints report a config error.
	var store *storage.Client
	if cfg.S3Bucket == "" {
		logger.Warn("S3_BUCKET not set — document upload and download are disabled")
	} else {
		store, err = storage.New(ctx, handlers.StorageConfigFrom(cfg))
		if err != nil {
			log.Fatalf("storage: %v", err)
		}
		// Fail fast on a bad bucket name or IAM role rather than on a
		// user's first upload.
		if err := store.CheckAccess(ctx); err != nil {
			if cfg.Env == "development" {
				logger.Warn("S3 bucket not reachable — uploads will fail", "err", err)
			} else {
				log.Fatalf("storage: %v", err)
			}
		} else {
			logger.Info("object storage ready",
				"bucket", cfg.S3Bucket,
				"region", cfg.AWSRegion,
				"sse_kms", cfg.S3KMSKeyID != "")
		}
	}

	authSvc := auth.New(cfg.JWTSecret, cfg.JWTExpiry)
	googleSvc := auth.NewGoogleService(cfg.GoogleClientID, cfg.GoogleClientSecret)
	deps := handlers.New(
		pool,
		authSvc,
		googleSvc,
		handlers.StripeConfigFrom(cfg),
		store,
		handlers.SupportConfigFrom(cfg),
		logger,
		cfg.Env == "development",
	)
	h := router.New(deps, authSvc, cfg.AllowedOrigins, logger)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           h,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		log.Printf("simplysafelegacy listening on :%s (env=%s)", cfg.Port, cfg.Env)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	// Graceful shutdown on SIGINT / SIGTERM.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutdown signal received")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
	log.Println("simplysafelegacy stopped")
}
