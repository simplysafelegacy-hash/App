package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type Client struct {
	svc            *s3.Client
	presigner      *s3.PresignClient
	bucket         string
	publicEndpoint string
}

type Config struct {
	Region       string
	Bucket       string
	Endpoint     string // Optional — for MinIO/LocalStack
	AccessKey    string
	SecretKey    string
	UsePathStyle bool
}

// New configures an S3 client. When Endpoint is set (MinIO etc.) we use
// path-style addressing and static credentials; otherwise standard AWS
// credential discovery is used.
func New(ctx context.Context, c Config) (*Client, error) {
	opts := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(c.Region),
	}
	if c.AccessKey != "" && c.SecretKey != "" {
		opts = append(opts, awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(c.AccessKey, c.SecretKey, ""),
		))
	}
	cfg, err := awsconfig.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("aws config: %w", err)
	}

	s3opts := func(o *s3.Options) {
		if c.Endpoint != "" {
			o.BaseEndpoint = aws.String(c.Endpoint)
		}
		o.UsePathStyle = c.UsePathStyle
	}

	svc := s3.NewFromConfig(cfg, s3opts)
	return &Client{
		svc:            svc,
		presigner:      s3.NewPresignClient(svc),
		bucket:         c.Bucket,
		publicEndpoint: c.Endpoint,
	}, nil
}

// EnsureBucket creates the bucket if it does not already exist — useful when
// developing against MinIO where buckets are not auto-provisioned.
func (c *Client) EnsureBucket(ctx context.Context) error {
	_, err := c.svc.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: &c.bucket})
	if err == nil {
		return nil
	}
	_, err = c.svc.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: &c.bucket})
	return err
}

// PresignPut returns a URL the client can PUT the raw file bytes to directly.
// The document metadata row is created first so we know the key is unique.
func (c *Client) PresignPut(ctx context.Context, key, contentType string, ttl time.Duration) (string, error) {
	req, err := c.presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      &c.bucket,
		Key:         &key,
		ContentType: &contentType,
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", err
	}
	return req.URL, nil
}

// PresignGet returns a temporary download URL.
func (c *Client) PresignGet(ctx context.Context, key string, ttl time.Duration) (string, error) {
	req, err := c.presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: &c.bucket,
		Key:    &key,
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", err
	}
	return req.URL, nil
}

func (c *Client) Bucket() string { return c.bucket }
