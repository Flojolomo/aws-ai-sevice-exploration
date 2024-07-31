import {
  GetObjectAttributesCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export const s3Client = new S3Client();

export async function getFileSize({
  bucketName,
  objectKey,
}: {
  bucketName: string;
  objectKey: string;
}): Promise<number | undefined> {
  console.info("Getting object size", { bucketName, objectKey });
  const response = await s3Client.send(
    new GetObjectAttributesCommand({
      Bucket: bucketName,
      Key: objectKey,
      ObjectAttributes: ["ObjectSize"],
    })
  );

  return response.ObjectSize;
}

export async function readFileFromS3({
  bucketName,
  objectKey,
}: {
  bucketName: string;
  objectKey: string;
}): Promise<string | undefined> {
  console.info(`Reading content from ${objectKey}`);
  const getObjectResponse = await s3Client.send(
    new GetObjectCommand({ Bucket: bucketName, Key: objectKey })
  );

  const transcriptionContent =
    await getObjectResponse.Body?.transformToString();
  console.debug("Got object response", { transcriptionContent });
  return transcriptionContent;
}

export async function writeFileToS3({
  bucketName,
  key,
  body,
}: {
  bucketName: string;
  body: string;
  key: string;
}): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
    })
  );
}
