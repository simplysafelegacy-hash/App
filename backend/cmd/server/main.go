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

	"github.com/sealed/backend/internal/auth"
	"github.com/sealed/backend/internal/config"
	"github.com/sealed/backend/internal/db"
	"github.com/sealed/backend/internal/handlers"
	"github.com/sealed/backend/internal/router"
	"github.com/sealed/backend/internal/storage"
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

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	s3Client, err := storage.New(ctx, storage.Config{
		Region:       cfg.S3Region,
		Bucket:       cfg.S3Bucket,
		Endpoint:     cfg.S3Endpoint,
		AccessKey:    cfg.S3AccessKey,
		SecretKey:    cfg.S3SecretKey,
		UsePathStyle: cfg.S3UsePathStyle,
	})
	if err != nil {
		log.Fatalf("s3: %v", err)
	}
	if cfg.S3Endpoint != "" {
		// MinIO / LocalStack: auto-create the bucket so dev is one-command.
		if err := s3Client.EnsureBucket(ctx); err != nil {
			log.Printf("warn: could not ensure bucket: %v", err)
		}
	}

	authSvc := auth.New(cfg.JWTSecret, cfg.JWTExpiry)
	googleSvc := auth.NewGoogleService(cfg.GoogleClientID, cfg.GoogleClientSecret)
	deps := handlers.New(pool, authSvc, googleSvc, s3Client, logger, cfg.Env == "development")
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
		log.Printf("sealed listening on :%s (env=%s)", cfg.Port, cfg.Env)
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
	log.Println("sealed stopped")
}
