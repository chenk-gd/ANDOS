/**
 * Context Storage Service - AI-Native DevOps Platform
 * P1: Large context storage to external storage (S3)
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';

// S3 Client configuration
const s3Client = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT, // For MinIO or other S3-compatible storage
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  },
  forcePathStyle: !!process.env.S3_ENDPOINT, // Required for MinIO
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'andos-contexts';

// Threshold for storing context externally (100KB)
export const CONTEXT_SIZE_THRESHOLD = parseInt(
  process.env.CONTEXT_SIZE_THRESHOLD || '102400',
  10
);

export interface ContextStorageOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  ttl?: number; // Time to live in seconds
}

export interface StoredContext {
  ref: string;
  size: number;
  url?: string;
  expiresAt?: Date;
}

/**
 * Check if context should be stored externally
 */
export function shouldStoreExternally(contextSize: number): boolean {
  return contextSize > CONTEXT_SIZE_THRESHOLD;
}

/**
 * Generate S3 key for context
 */
function generateContextKey(executionId: string): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `contexts/${year}/${month}/${executionId}.json`;
}

/**
 * Store context in S3
 */
export async function storeContext(
  executionId: string,
  context: Record<string, any>,
  options: ContextStorageOptions = {}
): Promise<StoredContext> {
  const key = generateContextKey(executionId);
  const body = JSON.stringify(context);
  const size = Buffer.byteLength(body, 'utf8');

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: options.contentType || 'application/json',
      Metadata: {
        executionId,
        size: String(size),
        ...options.metadata,
      },
    },
  });

  await upload.done();

  return {
    ref: `s3://${BUCKET_NAME}/${key}`,
    size,
  };
}

/**
 * Retrieve context from S3
 */
export async function retrieveContext(ref: string): Promise<Record<string, any>> {
  // Parse s3://bucket/key format
  const match = ref.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid S3 reference format: ${ref}`);
  }

  const [, bucket, key] = match;

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error('Empty response body');
  }

  // Convert stream to string
  const stream = response.Body as Readable;
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(body);
}

/**
 * Delete context from S3
 */
export async function deleteContext(ref: string): Promise<void> {
  const match = ref.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid S3 reference format: ${ref}`);
  }

  const [, bucket, key] = match;

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Check if context exists in S3
 */
export async function contextExists(ref: string): Promise<boolean> {
  try {
    const match = ref.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      return false;
    }

    const [, bucket, key] = match;

    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get context size without retrieving full content
 */
export async function getContextSize(ref: string): Promise<number | null> {
  try {
    const match = ref.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      return null;
    }

    const [, bucket, key] = match;

    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await s3Client.send(command);
    return response.ContentLength || null;
  } catch (error) {
    return null;
  }
}

/**
 * Store or inline context based on size
 * P1: Automatic external storage for large contexts
 */
export async function storeContextAuto(
  executionId: string,
  context: Record<string, any>,
  options: ContextStorageOptions = {}
): Promise<{
  contextSnapshot: Record<string, any> | null;
  contextRef: string | null;
  contextSize: number;
}> {
  const contextSize = Buffer.byteLength(JSON.stringify(context), 'utf8');

  if (shouldStoreExternally(contextSize)) {
    // Store in S3
    const stored = await storeContext(executionId, context, options);
    return {
      contextSnapshot: null,
      contextRef: stored.ref,
      contextSize,
    };
  } else {
    // Store inline in database
    return {
      contextSnapshot: context,
      contextRef: null,
      contextSize,
    };
  }
}

/**
 * Retrieve context (from S3 or inline)
 */
export async function retrieveContextAuto(
  contextSnapshot: Record<string, any> | null,
  contextRef: string | null
): Promise<Record<string, any> | null> {
  if (contextRef) {
    return retrieveContext(contextRef);
  }
  return contextSnapshot;
}
