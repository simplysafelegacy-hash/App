// Package storage wraps object storage for vault documents.
//
// Backed by Amazon S3. Objects are private: the bucket blocks all public
// access and the application never mints a presigned or public URL. Every
// byte reaches a user through an authenticated, permission-checked handler
// that proxies the object — so read access is enforced by our own rules,
// not by possession of a link.
//
// Credentials come from the default AWS chain, which on the production EC2
// instance resolves to the instance profile: short-lived credentials that
// rotate automatically and are never written to disk. Static keys are still
// honoured for local development.
package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

// ErrNotFound is returned when an object is absent from the bucket.
var ErrNotFound = errors.New("storage: object not found")

// ErrNotConfigured is returned when no bucket is configured. Callers surface
// this as a clear operator error rather than a generic 500.
var ErrNotConfigured = errors.New("storage: S3_BUCKET is not configured")

// Client is the storage handle used by the handlers. Build one at boot with
// New and reuse it: the underlying S3 client is safe for concurrent use and
// pools connections, so per-request construction is pure overhead.
type Client struct {
	s3     *s3.Client
	bucket string

	// sseKMSKeyID, when set, encrypts new objects with that customer-managed
	// KMS key (SSE-KMS). Empty means the bucket's own default encryption
	// applies — S3 encrypts at rest either way, so this is about key
	// custody and per-key audit trails, not about whether encryption happens.
	sseKMSKeyID string
}

// Config describes how to reach the bucket.
type Config struct {
	Bucket      string
	Region      string
	SSEKMSKeyID string

	// Endpoint overrides the S3 endpoint for local testing against
	// MinIO/LocalStack. Empty in production, where the real AWS endpoint
	// is resolved from the region.
	Endpoint string

	// UsePathStyle is required by most S3-compatible local emulators.
	UsePathStyle bool
}

// New resolves AWS credentials and returns a ready client.
//
// A nil error with a nil Client is impossible: when Bucket is empty this
// returns ErrNotConfigured so a misconfigured deploy fails loudly at boot
// instead of on a user's first upload.
func New(ctx context.Context, cfg Config) (*Client, error) {
	if cfg.Bucket == "" {
		return nil, ErrNotConfigured
	}

	loadOpts := []func(*awsconfig.LoadOptions) error{}
	if cfg.Region != "" {
		loadOpts = append(loadOpts, awsconfig.WithRegion(cfg.Region))
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, loadOpts...)
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}
	if awsCfg.Region == "" {
		return nil, errors.New("storage: AWS region not set — set AWS_REGION")
	}

	s3Opts := []func(*s3.Options){}
	if cfg.Endpoint != "" {
		s3Opts = append(s3Opts, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
			o.UsePathStyle = cfg.UsePathStyle
		})
	}

	return &Client{
		s3:          s3.NewFromConfig(awsCfg, s3Opts...),
		bucket:      cfg.Bucket,
		sseKMSKeyID: cfg.SSEKMSKeyID,
	}, nil
}

// Bucket is the configured bucket name, recorded alongside each row so an
// object stays resolvable if the bucket is ever changed.
func (c *Client) Bucket() string { return c.bucket }

// Upload streams body to key.
//
// contentType is stored but deliberately never echoed back to a browser
// unfiltered — see the handlers, which force a safe Content-Type and an
// attachment disposition on download.
func (c *Client) Upload(ctx context.Context, key, contentType string, body io.Reader, size int64) error {
	in := &s3.PutObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
		Body:   body,
		// Block any inherited ACL grant; the bucket is private and owner-only.
		ACL: types.ObjectCannedACLPrivate,
	}
	if contentType != "" {
		in.ContentType = aws.String(contentType)
	}
	if size > 0 {
		in.ContentLength = aws.Int64(size)
	}
	if c.sseKMSKeyID != "" {
		in.ServerSideEncryption = types.ServerSideEncryptionAwsKms
		in.SSEKMSKeyId = aws.String(c.sseKMSKeyID)
	}

	if _, err := c.s3.PutObject(ctx, in); err != nil {
		return fmt.Errorf("upload %s: %w", key, err)
	}
	return nil
}

// Download opens the object for reading. The caller must close the returned
// ReadCloser. A missing object yields ErrNotFound so handlers can answer 404
// without leaking whether the key merely lacked permission.
func (c *Client) Download(ctx context.Context, bucket, key string) (io.ReadCloser, error) {
	if bucket == "" {
		bucket = c.bucket
	}
	out, err := c.s3.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		if isNotFound(err) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("download %s: %w", key, err)
	}
	return out.Body, nil
}

// Delete removes an object. Deleting an absent object is not an error, which
// keeps cleanup paths idempotent.
func (c *Client) Delete(ctx context.Context, bucket, key string) error {
	if bucket == "" {
		bucket = c.bucket
	}
	_, err := c.s3.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil && !isNotFound(err) {
		return fmt.Errorf("delete %s: %w", key, err)
	}
	return nil
}

// CheckAccess verifies at boot that the bucket exists and the current
// credentials can reach it, turning a misconfigured IAM role into a startup
// failure instead of a runtime surprise mid-upload.
func (c *Client) CheckAccess(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	if _, err := c.s3.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(c.bucket),
	}); err != nil {
		return fmt.Errorf("cannot access bucket %q: %w", c.bucket, err)
	}
	return nil
}

// isNotFound reports whether err means "no such object/bucket". The S3 API
// answers with NoSuchKey, NotFound, or a bare 404 depending on the operation
// and whether the caller holds ListBucket, so all three are checked.
func isNotFound(err error) bool {
	var nsk *types.NoSuchKey
	if errors.As(err, &nsk) {
		return true
	}
	var nf *types.NotFound
	if errors.As(err, &nf) {
		return true
	}
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		switch apiErr.ErrorCode() {
		case "NoSuchKey", "NotFound", "404":
			return true
		}
	}
	var respErr interface{ HTTPStatusCode() int }
	if errors.As(err, &respErr) && respErr.HTTPStatusCode() == http.StatusNotFound {
		return true
	}
	return false
}

// BuildKey assembles an object key from pre-sanitised parts, guarding against
// traversal and absolute paths sneaking in through a caller's mistake.
func BuildKey(parts ...string) string {
	clean := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.Trim(p, "/")
		if p == "" || p == "." || p == ".." || strings.Contains(p, "..") {
			continue
		}
		clean = append(clean, p)
	}
	return strings.Join(clean, "/")
}
