package storage

// Integration tests for the S3 client.
//
// The round-trip tests need an S3-compatible endpoint and are skipped unless
// TEST_S3_ENDPOINT is set, so `go test ./...` stays hermetic. To run them
// against a local MinIO:
//
//	docker run -d --name minio -p 19000:9000 \
//	  -e MINIO_ROOT_USER=testkey -e MINIO_ROOT_PASSWORD=testsecret123 \
//	  minio/minio server /data
//	docker exec minio mc alias set local http://127.0.0.1:9000 testkey testsecret123
//	docker exec minio mc mb local/test-vault-docs
//
//	AWS_ACCESS_KEY_ID=testkey AWS_SECRET_ACCESS_KEY=testsecret123 \
//	TEST_S3_ENDPOINT=http://127.0.0.1:19000 TEST_S3_BUCKET=test-vault-docs \
//	go test ./internal/storage/ -v

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"strings"
	"testing"
)

func testClient(t *testing.T) *Client {
	t.Helper()
	ep := os.Getenv("TEST_S3_ENDPOINT")
	if ep == "" {
		t.Skip("TEST_S3_ENDPOINT not set")
	}
	c, err := New(context.Background(), Config{
		Bucket:       os.Getenv("TEST_S3_BUCKET"),
		Region:       "us-east-1",
		Endpoint:     ep,
		UsePathStyle: true,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return c
}

func TestRoundTrip(t *testing.T) {
	c := testClient(t)
	ctx := context.Background()

	if err := c.CheckAccess(ctx); err != nil {
		t.Fatalf("CheckAccess: %v", err)
	}

	key := BuildKey("vault-1", "attachments", "will", "abc-123", "my-will.pdf")
	if key != "vault-1/attachments/will/abc-123/my-will.pdf" {
		t.Fatalf("BuildKey = %q", key)
	}

	payload := []byte("%PDF-1.4 pretend will document")
	if err := c.Upload(ctx, key, "application/pdf", bytes.NewReader(payload), int64(len(payload))); err != nil {
		t.Fatalf("Upload: %v", err)
	}

	rc, err := c.Download(ctx, "", key)
	if err != nil {
		t.Fatalf("Download: %v", err)
	}
	got, _ := io.ReadAll(rc)
	rc.Close()
	if !bytes.Equal(got, payload) {
		t.Fatalf("round-trip mismatch: got %q", got)
	}

	// Deleting twice must be safe — cleanup paths rely on it.
	if err := c.Delete(ctx, "", key); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if err := c.Delete(ctx, "", key); err != nil {
		t.Fatalf("second Delete should be a no-op, got: %v", err)
	}

	// A missing object must surface as ErrNotFound so handlers 404.
	if _, err := c.Download(ctx, "", key); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Download after delete: want ErrNotFound, got %v", err)
	}
}

func TestMissingBucketIsConfigError(t *testing.T) {
	_, err := New(context.Background(), Config{Bucket: ""})
	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("want ErrNotConfigured, got %v", err)
	}
}

func TestBuildKeyRejectsTraversal(t *testing.T) {
	for _, tc := range []struct {
		in   []string
		want string
	}{
		{[]string{"v1", "..", "etc", "passwd"}, "v1/etc/passwd"},
		{[]string{"v1", "../../secret"}, "v1"},
		{[]string{"/v1/", "/attachments/"}, "v1/attachments"},
		{[]string{"v1", "", "file.pdf"}, "v1/file.pdf"},
	} {
		if got := BuildKey(tc.in...); got != tc.want {
			t.Errorf("BuildKey(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestDownloadUnknownBucket(t *testing.T) {
	c := testClient(t)
	_, err := c.Download(context.Background(), "no-such-bucket-xyz", "k")
	if err == nil {
		t.Fatal("want error for missing bucket")
	}
	if !strings.Contains(err.Error(), "download") && !errors.Is(err, ErrNotFound) {
		t.Fatalf("unexpected error shape: %v", err)
	}
}
