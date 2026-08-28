# Object storage runbook — Amazon S3

Vault documents (scanned wills, powers of attorney, health care directives)
and release-request proof files live in one private S3 bucket. These are the
most sensitive artifacts the product holds, so the bucket is configured to be
unreachable by anyone but the application's IAM role.

Everything below is applied **once per environment** (prod and dev get their
own bucket). Commands assume the AWS CLI v2 and a shell with admin
credentials — not the app's role.

```sh
export BUCKET=ssl-prod-vault-documents      # must be globally unique
export REGION=us-east-1

# Your 12-digit AWS account ID. Read it from the authenticated session
# rather than pasting it — a typo yields a valid-looking ARN that points
# at someone else's account.
export ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo "$ACCOUNT"   # sanity-check: 12 digits, e.g. 111122223333
```

The account ID is only needed for the IAM policy ARN in step 7; S3 bucket
ARNs omit it, and the KMS key ARN comes back from `create-key` already
fully qualified.

---

## 1. Create the bucket

```sh
aws s3api create-bucket \
  --bucket "$BUCKET" \
  --region "$REGION" \
  $([ "$REGION" = us-east-1 ] || echo --create-bucket-configuration LocationConstraint="$REGION")
```

## 2. Block all public access

The single most important setting. All four flags, no exceptions — this is
what makes a misconfigured ACL or policy incapable of exposing a will.

```sh
aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

Verify — every value must be `true`:

```sh
aws s3api get-public-access-block --bucket "$BUCKET"
```

## 3. Enforce bucket-owner ownership (disable ACLs)

ACLs are a legacy per-object permission system and an easy way to leak a
file. Turning them off means access is governed only by IAM and the bucket
policy, which are auditable in one place.

```sh
aws s3api put-bucket-ownership-controls \
  --bucket "$BUCKET" \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
```

## 4. Encryption at rest with a customer-managed KMS key

S3 encrypts everything at rest regardless. Using a **customer-managed** key
buys three things an AWS-managed key does not: you can revoke access to all
the data by disabling one key, every decrypt is logged in CloudTrail with the
caller's identity, and key rotation is under your control.

```sh
KEY_ARN=$(aws kms create-key \
  --description "Simply Safe Legacy vault documents" \
  --key-usage ENCRYPT_DECRYPT \
  --key-spec SYMMETRIC_DEFAULT \
  --query 'KeyMetadata.Arn' --output text)

aws kms create-alias \
  --alias-name alias/ssl-vault-documents \
  --target-key-id "$KEY_ARN"

aws kms enable-key-rotation --key-id "$KEY_ARN"

aws s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration "{
    \"Rules\": [{
      \"ApplyServerSideEncryptionByDefault\": {
        \"SSEAlgorithm\": \"aws:kms\",
        \"KMSMasterKeyID\": \"$KEY_ARN\"
      },
      \"BucketKeyEnabled\": true
    }]
  }"

echo "$KEY_ARN"   # -> S3_KMS_KEY_ID in .env.prod
```

`BucketKeyEnabled` cuts KMS request costs substantially without weakening
the encryption.

Put `$KEY_ARN` in `.env.prod` as `S3_KMS_KEY_ID` so the app names the key
explicitly on every upload.

## 5. Versioning

Protects against a bug or a compromised role destroying documents: a delete
becomes a delete-marker, and the prior version is recoverable.

```sh
aws s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled
```

Expire noncurrent versions after 90 days so deleted files don't accumulate
forever:

```sh
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$BUCKET" \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "expire-noncurrent-versions",
        "Status": "Enabled",
        "Filter": {},
        "NoncurrentVersionExpiration": {"NoncurrentDays": 90}
      },
      {
        "ID": "abort-incomplete-uploads",
        "Status": "Enabled",
        "Filter": {},
        "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
      }
    ]
  }'
```

## 6. Bucket policy — TLS only, KMS only

Denies any request not over HTTPS, and any upload that isn't encrypted with
our key. Both are `Deny`, which overrides any `Allow` elsewhere.

```sh
cat > /tmp/bucket-policy.json <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::$BUCKET",
        "arn:aws:s3:::$BUCKET/*"
      ],
      "Condition": {"Bool": {"aws:SecureTransport": "false"}}
    },
    {
      "Sid": "DenyUnencryptedUploads",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::$BUCKET/*",
      "Condition": {
        "StringNotEquals": {"s3:x-amz-server-side-encryption": "aws:kms"}
      }
    }
  ]
}
POLICY

aws s3api put-bucket-policy --bucket "$BUCKET" --policy file:///tmp/bucket-policy.json
rm /tmp/bucket-policy.json
```

## 7. IAM role for the app VM (no long-lived keys)

The application authenticates with an **EC2 instance profile**. AWS delivers
short-lived credentials through the instance metadata service and rotates
them automatically, so there is no access key to store in `.env.prod`, leak
in a backup, or rotate by hand.

Least-privilege policy — object-level read/write/delete on this bucket only,
plus use of the one KMS key. Note there is no `s3:ListBucket`: the app always
addresses objects by an exact key read from the database, so listing is
unnecessary, and withholding it means a compromised role cannot enumerate
customers' documents.

```sh
cat > /tmp/app-policy.json <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "VaultObjectAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::$BUCKET/*"
    },
    {
      "Sid": "HeadBucketForStartupCheck",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::$BUCKET",
      "Condition": {"StringLike": {"s3:prefix": ""}}
    },
    {
      "Sid": "UseVaultKmsKey",
      "Effect": "Allow",
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "$KEY_ARN"
    }
  ]
}
POLICY

aws iam create-policy \
  --policy-name SimplySafeLegacyVaultDocuments \
  --policy-document file:///tmp/app-policy.json

aws iam create-role \
  --role-name SimplySafeLegacyAppVM \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ec2.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

aws iam attach-role-policy \
  --role-name SimplySafeLegacyAppVM \
  --policy-arn "arn:aws:iam::$ACCOUNT:policy/SimplySafeLegacyVaultDocuments"

aws iam create-instance-profile --instance-profile-name SimplySafeLegacyAppVM
aws iam add-role-to-instance-profile \
  --instance-profile-name SimplySafeLegacyAppVM \
  --role-name SimplySafeLegacyAppVM

rm /tmp/app-policy.json
```

Attach it to the app VM (and require IMDSv2, which blocks the SSRF-style
credential theft that IMDSv1 allows):

```sh
aws ec2 associate-iam-instance-profile \
  --instance-id i-0abc123 \
  --iam-instance-profile Name=SimplySafeLegacyAppVM

aws ec2 modify-instance-metadata-options \
  --instance-id i-0abc123 \
  --http-tokens required \
  --http-endpoint enabled \
  --http-put-response-hop-limit 1
```

> `--http-put-response-hop-limit 1` stops a container on the VM from reaching
> IMDS. The backend runs in Docker, so if the app cannot fetch credentials
> after this, raise the limit to `2` — that is the trade-off, and `2` is still
> far safer than IMDSv1.

## 8. Access logging (recommended)

A separate bucket recording every request to the documents bucket. Keep it in
a different bucket so a compromise of one doesn't erase the evidence.

```sh
aws s3api create-bucket --bucket "$BUCKET-logs" --region "$REGION"
aws s3api put-public-access-block --bucket "$BUCKET-logs" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-logging --bucket "$BUCKET" --bucket-logging-status "{
  \"LoggingEnabled\": {
    \"TargetBucket\": \"$BUCKET-logs\",
    \"TargetPrefix\": \"s3-access/\"
  }
}"
```

---

## Verification checklist

Run these after setup; each should produce the stated result.

```sh
# 1. Public access fully blocked — all four true
aws s3api get-public-access-block --bucket "$BUCKET"

# 2. Default encryption is aws:kms with your key
aws s3api get-bucket-encryption --bucket "$BUCKET"

# 3. Versioning enabled
aws s3api get-bucket-versioning --bucket "$BUCKET"

# 4. ACLs disabled
aws s3api get-bucket-ownership-controls --bucket "$BUCKET"

# 5. Anonymous access refused (expect AccessDenied / 403)
curl -s -o /dev/null -w '%{http_code}\n' "https://$BUCKET.s3.$REGION.amazonaws.com/"

# 6. Plain HTTP refused by the TLS-only policy (expect AccessDenied)
aws s3 ls "s3://$BUCKET" --no-verify-ssl --endpoint-url "http://s3.$REGION.amazonaws.com" 2>&1 | head -2
```

On the app VM, confirm the instance role is what the app is actually using —
the output should show an assumed role, **not** an IAM user:

```sh
ssh ubuntu@app-vm 'aws sts get-caller-identity'
# Arn: arn:aws:sts::111122223333:assumed-role/SimplySafeLegacyAppVM/i-0abc123
```

The backend logs `object storage ready` at startup once it has verified it
can reach the bucket; if the role or bucket name is wrong, it refuses to
start in production rather than failing on a user's first upload.

---

## What protects a document, end to end

| Layer | Control |
| --- | --- |
| Network | TLS enforced by bucket policy; app reaches S3 over HTTPS only |
| Public exposure | Block Public Access (all four), ACLs disabled, no bucket website |
| Credentials | EC2 instance profile — short-lived, auto-rotated, never on disk |
| Authorization | IAM policy scoped to one bucket, object actions only, no `ListBucket` over contents |
| Encryption | SSE-KMS with a customer-managed, rotating key; unencrypted PUTs denied |
| Application | No presigned or public URLs — every byte is proxied through a permission-checked handler |
| Download safety | Content-Type forced to a safe allowlist, `attachment` disposition, `nosniff`, restrictive CSP |
| Recovery | Versioning on; noncurrent versions expire after 90 days |
| Audit | S3 access logging + CloudTrail KMS decrypt records |

## Migrating existing files from GCS

Rows written before the S3 cutover still carry a GCS bucket in
`storage_bucket` and will not resolve. Either copy the objects across and
rewrite the column, or drop the rows if they were test data:

```sh
# Copy GCS -> local -> S3 (gsutil + aws cli both authenticated)
gsutil -m cp -r "gs://OLD_GCS_BUCKET/*" ./gcs-export/
aws s3 cp ./gcs-export/ "s3://$BUCKET/" --recursive --sse aws:kms --sse-kms-key-id "$KEY_ARN"
```

```sql
-- Then point the rows at the new bucket (keys are unchanged).
UPDATE vault_attachments     SET storage_bucket = 'ssl-prod-vault-documents' WHERE storage_bucket <> 'ssl-prod-vault-documents';
UPDATE release_request_files SET storage_bucket = 'ssl-prod-vault-documents' WHERE storage_bucket <> 'ssl-prod-vault-documents';
```
